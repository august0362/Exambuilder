import { IQuestionParser } from './IQuestionParser.js';
import { formatMathSymbols } from './mathFormat.js';

const TYPE_MAP = { TN: 'MCQ', DIEN_TU: 'FILL_BLANK', DUNG_SAI: 'TRUE_FALSE', TU_LUAN: 'ESSAY' };
const DIFFICULTY_MAP = { nhan_biet: 'NB', thong_hieu: 'TH', van_dung: 'VD', van_dung_cao: 'VDC' };
const FIELD_REGEX = /^(Loai|Muc_Do|De_Bai|Dap_An|Loi_Giai|So_Dong_Nhap)\s*:\s*(.*)$/i;
const OPTION_REGEX = /^([A-D])\.\s*(.*)$/;
const TITLE_MAP = { 'trac nghiem': 'Trắc nghiệm', 'tu luan': 'Tự luận' };
// Danh sach nhan truong dung de "va lai" xuong dong bi mat (xem
// _repairMissingNewlines) - phai trung khop chinh xac voi FIELD_REGEX o tren.
const FIELD_NAMES = 'Loai|Muc_Do|De_Bai|Dap_An|Loi_Giai|So_Dong_Nhap';

export class TextPromptParser extends IQuestionParser {
  parse(rawContent) {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      throw new Error('Noi dung dan vao dang rong.');
    }

    const blocks = [];
    const sections = this._splitSections(this._repairMissingNewlines(rawContent));

    sections.forEach((section, sIndex) => {
      const chunks = section.body.split(/\[CAU_HOI\]/i).map(s => s.trim()).filter(Boolean);
      if (chunks.length === 0) return;

      const questions = chunks.map((chunk, qIndex) =>
        this._parseQuestionChunk(chunk, sIndex + 1, qIndex + 1)
      );

      const blockType = questions.some(q => q.question_type === 'ESSAY') ? 'ESSAY' : 'MULTIPLE_CHOICE';
      blocks.push({ block_type: blockType, block_title: section.title, questions });
    });

    if (blocks.length === 0) {
      throw new Error('Khong tim thay khoi cau hoi nao. Kiem tra dinh dang =...= va [CAU_HOI].');
    }
    return blocks;
  }

  // Mot so nguon dan (vd copy tu khung chat, PDF, Word) lam mat het ky tu
  // xuong dong that (\n), don toan bo noi dung ve 1 dong duy nhat. Vi toan
  // bo _splitSections/_parseQuestionChunk deu dua vao xuong dong de tach
  // "=PHAN_x=", "[CAU_HOI]" va tung truong (Loai:/Muc_Do:/...), mat xuong
  // dong se lam parser hieu sai hoan toan (vd noi dung mo dau bi tuong la
  // "Cau hoi 1"). Ham nay "va lai" xuong dong tai cac vi tri co cau truc da
  // biet TRUOC KHI parse - chi chen them, khong bao gio xoa noi dung, va an
  // toan voi input da dung dinh dang (dong trong du thua bi bo qua o buoc
  // parse sau, xem `if (!line) continue;`).
  _repairMissingNewlines(rawContent) {
    let text = rawContent;
    // 1) [CAU_HOI] va header "=PHAN...=" luon phai bat dau 1 dong moi, ke ca
    //    khi bi dinh lien vao cuoi dong truoc. Header chi xu ly rieng ten
    //    bat dau bang "PHAN" (dung quy uoc trong Gemini_Prompt_Unified.txt)
    //    de tranh nham voi bieu thuc toan co nhieu dau "=" (vd "x = 3 = y").
    text = text.replace(/\[CAU_HOI\]/gi, '\n[CAU_HOI]');
    // Bat toan bo chuoi dau "=" lien tiep o ca 2 dau (=+...=+, khong phai chi
    // 1 dau "=") - neu chi bat 1 dau se xe le cac header kieu "===TEN==="
    // (con 2 dau "=" dinh vao dong ben canh, hong ca header). Lookbehind
    // dam bao chi chen dong khi CHUA co dong moi (tranh tao section rong o
    // dau, lam lech so thu tu "Phan N" trong thong bao loi cho input da
    // dung dinh dang san).
    text = text.replace(/(?<=[^=\n])(=+\s*PHAN[A-Za-z0-9_]*\s*=+)/gi, '\n$1');
    // 2) Moi nhan truong (Loai:, Muc_Do:...) luon phai bat dau 1 dong moi.
    // Khong dung \b truoc ten truong: khi bi dinh lien hoan toan (vd
    // "TNMuc_Do:") thi 2 ky tu ke nhau ("N" va "M") deu la ky tu chu nen \b
    // khong nhan ra ranh gioi, bo sot mat xuong dong dung luc can vá nhat.
    text = text.replace(new RegExp(`(${FIELD_NAMES})\\s*:`, 'gi'), '\n$1:');
    // 3) Giua "De_Bai:" va "Dap_An:" (da chac chan xuong dong tu buoc 2), neu
    //    cac lua chon A./B./C./D. bi dinh lien khong xuong dong thi tach ra.
    text = text.replace(/(De_Bai\s*:)([\s\S]*?)(\n\s*Dap_An\s*:)/gi, (full, before, body, after) =>
      before + this._splitOptionsInPlace(body) + after
    );
    return text;
  }

  // Tim day du lua chon A./(B.)/(C.)/(D.) tu PHAI sang TRAI (gan "Dap_An:"
  // nhat) va chen xuong dong truoc moi lua chon. Tim tu phai sang trai (uu
  // tien 4 lua chon, giam dan con 2) de khong nham voi ten diem/tam giac
  // viet hoa lien nhau xuat hien som hon trong De_Bai (vd "tam giac ABC."
  // chi co "C." dung dinh dang cham cau, khong co "A."/"B." rieng nen se
  // khong khop du chuoi va bi bo qua an toan).
  _splitOptionsInPlace(body) {
    for (const letters of [['A', 'B', 'C', 'D'], ['A', 'B', 'C'], ['A', 'B']]) {
      const positions = [];
      let searchEnd = body.length;
      let matched = true;
      for (let i = letters.length - 1; i >= 0; i--) {
        const idx = body.lastIndexOf(letters[i] + '.', searchEnd - 1);
        if (idx === -1) { matched = false; break; }
        positions[i] = idx;
        searchEnd = idx;
      }
      if (matched) {
        let result = body;
        for (let i = positions.length - 1; i >= 0; i--) {
          result = result.slice(0, positions[i]) + '\n' + result.slice(positions[i]);
        }
        return result;
      }
    }
    return body;
  }

  _splitSections(rawContent) {
    const lines = rawContent.split(/\r?\n/);
    const sections = [];
    let current = null;

    for (const line of lines) {
      const headerMatch = line.trim().match(/^=+\s*(.+?)\s*=+$/);
      if (headerMatch) {
        if (current) sections.push(current);
        current = { title: this._formatTitle(headerMatch[1]), body: '' };
      } else if (current) {
        current.body += line + '\n';
      } else {
        current = { title: 'Cau hoi', body: line + '\n' };
      }
    }
    if (current) sections.push(current);
    return sections;
  }

  _formatTitle(rawTitle) {
    const cleaned = rawTitle.replace(/^PHAN_?\d*_?/i, '').replace(/_/g, ' ').trim();
    if (!cleaned) return rawTitle;
    const mapped = TITLE_MAP[cleaned.toLowerCase()];
    if (mapped) return mapped;
    return cleaned.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }

  _parseQuestionChunk(chunk, sectionIndex, questionIndex) {
    const location = `Phan ${sectionIndex} - Cau hoi ${questionIndex}`;
    const lines = chunk.split(/\r?\n/);

    const fields = {};
    const options = [];
    let currentField = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const fieldMatch = line.match(FIELD_REGEX);
      const optionMatch = line.match(OPTION_REGEX);

      if (fieldMatch) {
        // Ghi de (khong noi chuoi) khi mot nhan "Field:" xuat hien lai lan
        // thu 2 trong cung 1 [CAU_HOI]: truong hop nay thuong la AI tu sua
        // dap an (vd viet them "Dap_An:"/"Loi_Giai:" lan 2 sau khi da ket
        // luan lai) ma quen tach thanh cau hoi moi - gia tri sau cung moi
        // la dap an dung, khong phai ghep "Dung Sai" gay loi validate.
        currentField = fieldMatch[1].toLowerCase();
        fields[currentField] = fieldMatch[2].trim();
      } else if (optionMatch) {
        options.push({ option_key: optionMatch[1].toUpperCase(), option_text: optionMatch[2].trim() });
        currentField = null;
      } else if (currentField) {
        fields[currentField] += ' ' + line;
      }
    }

    const rawType = (fields['loai'] || '').trim().toUpperCase();
    const questionType = TYPE_MAP[rawType];
    if (!questionType) {
      throw new Error(`[${location}] Truong "Loai" khong hop le hoac bi thieu: "${fields['loai'] || ''}"`);
    }

    const rawDifficulty = (fields['muc_do'] || '').trim();
    const difficulty = DIFFICULTY_MAP[rawDifficulty.toLowerCase()];
    if (!difficulty) {
      throw new Error(`[${location}] Truong "Muc_Do" khong hop le hoac bi thieu: "${rawDifficulty}"`);
    }

    const content = (fields['de_bai'] || '').trim();
    if (!content) {
      throw new Error(`[${location}] Thieu noi dung "De_Bai".`);
    }

    const question = {
      question_type: questionType,
      content: formatMathSymbols(content),
      difficulty_level: difficulty,
      explanation: formatMathSymbols((fields['loi_giai'] || '').trim()) || null,
      correct_answer: null,
      options: [],
      draft_lines_count: 0
    };

    if (questionType === 'MCQ') {
      if (options.length < 2) {
        throw new Error(`[${location}] Cau trac nghiem can it nhat 2 lua chon (A, B, ...).`);
      }
      const correctKey = (fields['dap_an'] || '').trim().toUpperCase();
      if (!options.some(o => o.option_key === correctKey)) {
        throw new Error(`[${location}] "Dap_An" (${correctKey}) khong khop voi bat ky lua chon nao.`);
      }
      question.options = options.map(o => ({ ...o, option_text: formatMathSymbols(o.option_text), is_correct: o.option_key === correctKey }));
      question.correct_answer = correctKey;
    } else if (questionType === 'TRUE_FALSE') {
      const answer = (fields['dap_an'] || '').trim();
      if (!/^(Dung|Sai)$/i.test(answer)) {
        throw new Error(`[${location}] "Dap_An" cua cau Dung/Sai phai la "Dung" hoac "Sai".`);
      }
      question.correct_answer = answer;
    } else if (questionType === 'FILL_BLANK') {
      const answer = (fields['dap_an'] || '').trim();
      if (!answer) {
        throw new Error(`[${location}] Cau dien tu thieu "Dap_An".`);
      }
      question.correct_answer = formatMathSymbols(answer);
    } else if (questionType === 'ESSAY') {
      const draftLines = parseInt(fields['so_dong_nhap'], 10);
      question.draft_lines_count = Number.isFinite(draftLines) && draftLines > 0 ? draftLines : 5;
      question.correct_answer = formatMathSymbols((fields['dap_an'] || '').trim()) || null;
    }

    return question;
  }
}
