const {
  fisherYatesShuffle,
  allocateForCodes,
  generateExamCodes,
  shuffleAllMCQOptions
} = require('../../backend/parser/examCodeGenerator.js');

function makeMCQ(id, correctText, difficulty = 'NB') {
  return {
    id,
    question_type: 'MCQ',
    content: `Cau hoi ${id}`,
    difficulty_level: difficulty,
    explanation: null,
    correct_answer: 'A',
    options: [
      { option_key: 'A', option_text: correctText, is_correct: true },
      { option_key: 'B', option_text: 'sai 1', is_correct: false },
      { option_key: 'C', option_text: 'sai 2', is_correct: false },
      { option_key: 'D', option_text: 'sai 3', is_correct: false }
    ],
    draft_lines_count: 0
  };
}

function makeSimple(id, type) {
  return {
    id,
    question_type: type,
    content: `Cau hoi ${id}`,
    difficulty_level: 'TH',
    explanation: null,
    correct_answer: type === 'TRUE_FALSE' ? 'Dung' : 'dap an',
    options: [],
    draft_lines_count: type === 'ESSAY' ? 5 : 0
  };
}

describe('fisherYatesShuffle', () => {
  test('TC-01: khong lam mat hoac them phan tu, khong sua doi mang goc', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    const shuffled = fisherYatesShuffle(original);
    expect(original).toEqual(copy);
    expect(shuffled.slice().sort()).toEqual(original.slice().sort());
  });

  test('TC-02: mang rong tra ve mang rong', () => {
    expect(fisherYatesShuffle([])).toEqual([]);
  });
});

describe('allocateForCodes', () => {
  test('TC-03: chia het (total % q === 0) - moi ma de nhan dung total/q, khong trung lap', () => {
    const pool = Array.from({ length: 12 }, (_, i) => ({ id: i }));
    const result = allocateForCodes(pool, 4);
    expect(result).toHaveLength(4);
    result.forEach(part => expect(part).toHaveLength(3));

    const allIds = result.flat().map(x => x.id);
    expect(new Set(allIds).size).toBe(12);
    expect(allIds.slice().sort((a, b) => a - b)).toEqual(pool.map(x => x.id));
  });

  test('TC-04: co du (total % q !== 0) - phan du rai duy nhat, tong khop total, khong trung lap', () => {
    const pool = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    const result = allocateForCodes(pool, 4); // base=2, remainder=2
    const sizes = result.map(p => p.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(10);
    sizes.forEach(s => expect([2, 3]).toContain(s));
    expect(sizes.filter(s => s === 3)).toHaveLength(2);

    const allIds = result.flat().map(x => x.id);
    expect(new Set(allIds).size).toBe(10);
  });

  test('TC-05: q lon hon total - mot so ma de nhan 0 cau, khong ep lap lai', () => {
    const pool = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const result = allocateForCodes(pool, 5);
    const sizes = result.map(p => p.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(3);
    expect(sizes.filter(s => s === 1)).toHaveLength(3);
    expect(sizes.filter(s => s === 0)).toHaveLength(2);
  });

  test('TC-06: pool rong - tra ve q mang rong', () => {
    const result = allocateForCodes([], 3);
    expect(result).toEqual([[], [], []]);
  });
});

describe('generateExamCodes', () => {
  test('TC-07: bao loi khi de goc khong co cau hoi nao', () => {
    expect(() => generateExamCodes([], 3)).toThrow();
  });

  test('TC-08: sinh dung so ma de voi ten theo prefix/start', () => {
    const blocks = [{ block_type: 'MULTIPLE_CHOICE', questions: [makeMCQ('m1', 'dung')] }];
    const versions = generateExamCodes(blocks, 3, { prefix: 'Mã', start: 1 });
    expect(versions.map(v => v.code)).toEqual(['Mã 1', 'Mã 2', 'Mã 3']);
  });

  test('TC-09: giu dung dap an dung sau khi xao lua chon MCQ', () => {
    const blocks = [{
      block_type: 'MULTIPLE_CHOICE',
      questions: Array.from({ length: 8 }, (_, i) => makeMCQ(`m${i}`, `DAP_AN_DUNG_${i}`))
    }];
    const versions = generateExamCodes(blocks, 4);
    versions.forEach(v => {
      v.blocks.forEach(b => {
        b.questions.forEach(q => {
          if (q.question_type !== 'MCQ') return;
          const correctOpt = q.options.find(o => o.option_key === q.correct_answer);
          expect(correctOpt).toBeDefined();
          expect(correctOpt.is_correct).toBe(true);
          expect(correctOpt.option_text).toMatch(/^DAP_AN_DUNG_/);
          const correctCount = q.options.filter(o => o.is_correct).length;
          expect(correctCount).toBe(1);
        });
      });
    });
  });

  test('TC-10: tach dung 2 khoi (trac nghiem gop MCQ/TF/FILL_BLANK, va tu luan)', () => {
    const blocks = [{
      block_type: 'MULTIPLE_CHOICE',
      questions: [
        makeMCQ('m1', 'a'),
        makeSimple('tf1', 'TRUE_FALSE'),
        makeSimple('fb1', 'FILL_BLANK'),
        makeSimple('es1', 'ESSAY')
      ]
    }];
    const versions = generateExamCodes(blocks, 2);
    versions.forEach(v => {
      const objectiveBlock = v.blocks.find(b => b.block_type === 'MULTIPLE_CHOICE');
      const essayBlock = v.blocks.find(b => b.block_type === 'ESSAY');
      if (objectiveBlock) {
        expect(objectiveBlock.questions.every(q => q.question_type !== 'ESSAY')).toBe(true);
      }
      if (essayBlock) {
        expect(essayBlock.questions.every(q => q.question_type === 'ESSAY')).toBe(true);
      }
    });
  });

  test('TC-12: chia deu ti le muc do kho trong tung loai cau hoi giua cac ma de', () => {
    // 12 cau MCQ: 4 NB + 4 TH + 4 VD, chia cho 4 ma de => moi ma de phai
    // co dung 1 NB + 1 TH + 1 VD (khong phai chi "3 cau MCQ bat ky").
    const questions = [
      ...Array.from({ length: 4 }, (_, i) => makeMCQ(`nb${i}`, `NB_${i}`, 'NB')),
      ...Array.from({ length: 4 }, (_, i) => makeMCQ(`th${i}`, `TH_${i}`, 'TH')),
      ...Array.from({ length: 4 }, (_, i) => makeMCQ(`vd${i}`, `VD_${i}`, 'VD'))
    ];
    const blocks = [{ block_type: 'MULTIPLE_CHOICE', questions }];
    const versions = generateExamCodes(blocks, 4);

    versions.forEach(v => {
      const mcqQuestions = v.blocks[0].questions;
      const byDifficulty = { NB: 0, TH: 0, VD: 0 };
      mcqQuestions.forEach(q => { byDifficulty[q.difficulty_level]++; });
      expect(byDifficulty).toEqual({ NB: 1, TH: 1, VD: 1 });
    });
  });

  test('TC-13: khong co du lieu muc do nao van chia deu (khong loi, khong mat cau)', () => {
    const questions = [
      ...Array.from({ length: 3 }, (_, i) => makeMCQ(`a${i}`, `A_${i}`, 'NB')),
      ...Array.from({ length: 5 }, (_, i) => makeMCQ(`b${i}`, `B_${i}`, 'VDC'))
    ];
    const blocks = [{ block_type: 'MULTIPLE_CHOICE', questions }];
    const versions = generateExamCodes(blocks, 3);
    const totalMCQ = versions.reduce((sum, v) => sum + v.blocks[0].questions.length, 0);
    expect(totalMCQ).toBe(8);
  });

  test('TC-11: cac ma de khong dung chung tham chieu cau hoi (clone doc lap)', () => {
    const blocks = [{ block_type: 'MULTIPLE_CHOICE', questions: [makeMCQ('m1', 'a'), makeMCQ('m2', 'b')] }];
    const versions = generateExamCodes(blocks, 2);
    const q1 = versions[0].blocks[0].questions[0];
    q1.content = 'DA SUA';
    const otherVersionSameId = versions[1].blocks[0].questions.find(q => q.content === 'DA SUA');
    expect(otherVersionSameId).toBeUndefined();
  });
});

// Bug 1 [Da sua]: truoc day de goc (chua tron ma de) khong xao dap an, nen
// neu nguon (AI/nguoi nhap) co thoi quen dat dap an dung o vi tri A thi ca
// de xuat ra cung bi thien lech toan "A". shuffleAllMCQOptions xao ngay tai
// buoc sinh de goc (generateBtn trong script.js) de sua trung.
describe('shuffleAllMCQOptions (Bug 1 - thien lech dap an)', () => {
  test('TC-12: giu nguyen id cau hoi, chi doi thu tu options/correct_answer', () => {
    const blocks = [{ id: 'b1', questions: [makeMCQ('q1', 'dung')] }];
    const before = JSON.stringify(blocks[0].questions[0].options.map(o => o.option_text).sort());
    shuffleAllMCQOptions(blocks);
    expect(blocks[0].questions[0].id).toBe('q1');
    expect(JSON.stringify(blocks[0].questions[0].options.map(o => o.option_text).sort())).toBe(before);
  });

  test('TC-13: option dung (is_correct) luon khop voi correct_answer sau khi xao', () => {
    const blocks = [{ id: 'b1', questions: Array.from({ length: 10 }, (_, i) => makeMCQ(`q${i}`, 'dung')) }];
    shuffleAllMCQOptions(blocks);
    blocks[0].questions.forEach(q => {
      const correctOpt = q.options.find(o => o.is_correct);
      expect(correctOpt.option_key).toBe(q.correct_answer);
    });
  });

  test('TC-14: khong sua cau TRUE_FALSE/FILL_BLANK/ESSAY (khong co options de xao)', () => {
    const tf = makeSimple('t1', 'TRUE_FALSE');
    const blocks = [{ id: 'b1', questions: [tf] }];
    shuffleAllMCQOptions(blocks);
    expect(blocks[0].questions[0].correct_answer).toBe('Dung');
  });

  test('TC-15: phan bo vi tri dap an dung tren 20 cau la deu (khong con toan "A")', () => {
    // Voi du lieu nguon luon dat dap an dung o vi tri A (kieu du lieu de
    // gay ra bug), sau khi xao, vi tri dap an dung phai trai deu tren
    // nhieu ky tu chu khong con don A. Nguong ep xac dinh (khong flaky):
    // voi 20 cau random 4 lua chon, xac suat het 20 cau deu roi vao dung
    // 1 vi tri la (1/4)^19 ~ 0 - test on dinh tuyet doi.
    const blocks = [{ id: 'b1', questions: Array.from({ length: 20 }, (_, i) => makeMCQ(`q${i}`, 'dung')) }];
    shuffleAllMCQOptions(blocks);
    const keyDistribution = new Set(blocks[0].questions.map(q => q.correct_answer));
    expect(keyDistribution.size).toBeGreaterThan(1);
  });
});
