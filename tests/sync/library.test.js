const {
  rowsToLibrary,
  libraryToRows,
  mergeLibraries,
  purgeOldTombstones,
  parseLibrary,
  sanitizeTheme,
  pickNewerTheme,
  emptyLibrary,
  summarize,
  LIBRARY_SCHEMA
} = require('../../backend/sync/library');

const BLOCKS = [
  { block_type: 'MULTIPLE_CHOICE', block_title: 'Phan I', questions: [
    { question_type: 'MCQ', content: '2+2=?', difficulty_level: 'NB', correct_answer: 'B',
      options: [{ option_key: 'A', option_text: '3', is_correct: false }, { option_key: 'B', option_text: '4', is_correct: true }] }
  ] }
];

function exam(id, over = {}) {
  return {
    exam_id: id,
    title: `De ${id}`,
    subject: 'Toan',
    duration_minutes: 45,
    school_header: 'THPT X',
    blocks: BLOCKS,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...over
  };
}

function lib(exams) {
  return { schema: LIBRARY_SCHEMA, updated_at: '2026-01-01T00:00:00Z', exams };
}

describe('parseLibrary', () => {
  test('chuoi JSON hop le -> library', () => {
    const out = parseLibrary(JSON.stringify(lib([exam('a')])));
    expect(out.exams).toHaveLength(1);
    expect(out.exams[0].exam_id).toBe('a');
  });

  test('JSON hong / cau truc sai -> library rong (khong nem)', () => {
    expect(parseLibrary('{khong-phai-json').exams).toEqual([]);
    expect(parseLibrary('{"foo":1}').exams).toEqual([]);
    expect(parseLibrary(null).exams).toEqual([]);
  });

  test('bo qua muc thieu exam_id', () => {
    const out = parseLibrary({ exams: [{ title: 'khong co id' }, exam('b')] });
    expect(out.exams.map(e => e.exam_id)).toEqual(['b']);
  });
});

describe('rowsToLibrary / libraryToRows (round-trip)', () => {
  test('template snapshot survives row, gist normalization and row conversion', () => {
    const binding = { schema_version: 1, template_id: 'builtin.t10', template_version: 1, template_snapshot: { sections: [{ stimulus: 'Read this text' }] } };
    const rows = [{ exam_id: 'bound', payload_json: JSON.stringify({ blocks: BLOCKS, template_binding: binding }) }];
    const cloud = parseLibrary(JSON.stringify(rowsToLibrary(rows)));
    expect(cloud.exams[0].template_binding).toEqual(binding);
    expect(JSON.parse(libraryToRows(cloud)[0].payload_json).template_binding).toEqual(binding);
    expect(mergeLibraries(cloud, emptyLibrary()).exams[0].template_binding).toEqual(binding);
  });
  test('row -> library -> row giu nguyen du lieu cot va blocks', () => {
    const rows = [{
      exam_id: 'x1', title: 'De x1', subject: 'Ly', duration_minutes: 30, school_header: 'H',
      payload_json: JSON.stringify({ title: 'De x1', subject: 'Ly', duration_minutes: 30, school_header: 'H', blocks: BLOCKS }),
      created_at: '2026-02-02 08:00:00', updated_at: '2026-02-03 09:00:00', deleted_at: null
    }];
    const library = rowsToLibrary(rows);
    expect(library.exams[0].blocks).toEqual(BLOCKS);
    // moc thoi gian SQLite (co dau cach) duoc chuan hoa ve ISO 8601 UTC
    expect(library.exams[0].updated_at).toBe('2026-02-03T09:00:00.000Z');

    const back = libraryToRows(library);
    expect(back[0].exam_id).toBe('x1');
    expect(JSON.parse(back[0].payload_json).blocks).toEqual(BLOCKS);
  });

  test('payload_json hong -> blocks rong, khong nem', () => {
    const library = rowsToLibrary([{ exam_id: 'bad', payload_json: '{oops' }]);
    expect(library.exams[0].blocks).toEqual([]);
  });
});

describe('mergeLibraries - "primary thang", union theo exam_id', () => {
  test('chi ben local', () => {
    const out = mergeLibraries(lib([exam('a')]), emptyLibrary());
    expect(out.exams.map(e => e.exam_id)).toEqual(['a']);
  });

  test('chi ben cloud', () => {
    const out = mergeLibraries(emptyLibrary(), lib([exam('c')]));
    expect(out.exams.map(e => e.exam_id)).toEqual(['c']);
  });

  test('union: id khac nhau o 2 ben deu duoc giu', () => {
    const out = mergeLibraries(lib([exam('a')]), lib([exam('b')]));
    expect(out.exams.map(e => e.exam_id).sort()).toEqual(['a', 'b']);
  });

  test('xung dot cung id: PRIMARY thang', () => {
    const primary = lib([exam('a', { title: 'BAN PRIMARY' })]);
    const secondary = lib([exam('a', { title: 'ban secondary' })]);
    expect(mergeLibraries(primary, secondary).exams[0].title).toBe('BAN PRIMARY');
  });

  test('Pull = merge(cloud, local): tombstone local bi de boi ban live tren cloud (khoi phuc)', () => {
    const cloud = lib([exam('a', { deleted_at: null, title: 'song lai' })]);
    const local = lib([exam('a', { deleted_at: '2026-03-01T00:00:00Z' })]);
    const out = mergeLibraries(cloud, local); // cloud = primary
    expect(out.exams[0].deleted_at).toBeNull();
    expect(out.exams[0].title).toBe('song lai');
  });

  test('Push = merge(local, cloud): tombstone local lan len (xoa vinh vien tren cloud)', () => {
    const local = lib([exam('a', { deleted_at: '2026-03-01T00:00:00Z' })]);
    const cloud = lib([exam('a', { deleted_at: null })]);
    const out = mergeLibraries(local, cloud); // local = primary
    expect(out.exams[0].deleted_at).toBe('2026-03-01T00:00:00.000Z');
  });

  test('nhan chuoi JSON tho o ca 2 tham so', () => {
    const out = mergeLibraries(JSON.stringify(lib([exam('a')])), JSON.stringify(lib([exam('b')])));
    expect(out.exams).toHaveLength(2);
  });
});

describe('purgeOldTombstones', () => {
  test('bo tombstone cu hon nguong, giu tombstone moi va de con song', () => {
    const old = new Date(Date.now() - 200 * 86400000).toISOString();
    const recent = new Date(Date.now() - 5 * 86400000).toISOString();
    const out = purgeOldTombstones(lib([
      exam('live'),
      exam('old-del', { deleted_at: old }),
      exam('new-del', { deleted_at: recent })
    ]), 90);
    expect(out.exams.map(e => e.exam_id).sort()).toEqual(['live', 'new-del']);
  });
});

describe('summarize', () => {
  test('dem tong / dang luu / da xoa', () => {
    const s = summarize(lib([exam('a'), exam('b', { deleted_at: '2026-01-01T00:00:00Z' })]));
    expect(s).toEqual({ total: 2, active: 1, tombstones: 1 });
  });
});

describe('theme - "lan doi gan nhat thang"', () => {
  const T1 = '2026-05-01T00:00:00.000Z';
  const T2 = '2026-06-01T00:00:00.000Z';
  const withTheme = (theme) => ({ ...lib([exam('a')]), theme });

  describe('sanitizeTheme', () => {
    test('id hop le -> chuan hoa updated_at ve ISO', () => {
      expect(sanitizeTheme({ id: 'midnight', updated_at: T1 })).toEqual({ id: 'midnight', updated_at: T1 });
    });
    test('id sai / rong / khong phai object -> null', () => {
      expect(sanitizeTheme({ id: 'Bad Id!' })).toBeNull();
      expect(sanitizeTheme({ id: '' })).toBeNull();
      expect(sanitizeTheme(null)).toBeNull();
      expect(sanitizeTheme('midnight')).toBeNull();
    });
    test('thieu updated_at -> null (coi nhu epoch)', () => {
      expect(sanitizeTheme({ id: 'cold' })).toEqual({ id: 'cold', updated_at: null });
    });
  });

  describe('pickNewerTheme', () => {
    test('chi 1 ben co theme -> ben do', () => {
      expect(pickNewerTheme({ id: 'ocean', updated_at: T1 }, null)).toEqual({ id: 'ocean', updated_at: T1 });
      expect(pickNewerTheme(null, { id: 'pine', updated_at: T1 })).toEqual({ id: 'pine', updated_at: T1 });
    });
    test('secondary moi hon -> secondary', () => {
      const out = pickNewerTheme({ id: 'cold', updated_at: T1 }, { id: 'peach', updated_at: T2 });
      expect(out).toEqual({ id: 'peach', updated_at: T2 });
    });
    test('primary moi hon -> primary', () => {
      const out = pickNewerTheme({ id: 'peach', updated_at: T2 }, { id: 'cold', updated_at: T1 });
      expect(out).toEqual({ id: 'peach', updated_at: T2 });
    });
    test('bang moc thoi gian -> giu primary (tat dinh)', () => {
      const out = pickNewerTheme({ id: 'grape', updated_at: T1 }, { id: 'plum', updated_at: T1 });
      expect(out.id).toBe('grape');
    });
    test('ben chua tung doi (khong co moc) thua ben da doi', () => {
      const out = pickNewerTheme({ id: 'cold', updated_at: null }, { id: 'mocha', updated_at: T1 });
      expect(out.id).toBe('mocha');
    });
  });

  test('parseLibrary giu theme hop le, bo theme id rong', () => {
    expect(parseLibrary(JSON.stringify(withTheme({ id: 'winter', updated_at: T1 }))).theme)
      .toEqual({ id: 'winter', updated_at: T1 });
    expect(parseLibrary(JSON.stringify(withTheme({ id: '' }))).theme).toBeUndefined();
  });

  test('mergeLibraries dua theme moi hon vao ket qua', () => {
    const primary = { ...lib([exam('a')]), theme: { id: 'cold', updated_at: T1 } };
    const secondary = { ...lib([exam('b')]), theme: { id: 'honey', updated_at: T2 } };
    expect(mergeLibraries(primary, secondary).theme).toEqual({ id: 'honey', updated_at: T2 });
  });

  test('purgeOldTombstones giu theme', () => {
    const out = purgeOldTombstones(withTheme({ id: 'rose', updated_at: T1 }), 90);
    expect(out.theme).toEqual({ id: 'rose', updated_at: T1 });
  });
});
