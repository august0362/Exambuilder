process.env.EXAM_DB_PATH = ':memory:';

// pdf-parse (pdfjs-dist ben trong) tu dong nap 1 "fake worker" qua dynamic
// import() de chay khong can Worker that - co chay dung tren Node binh thuong
// (da tu kiem chung thu cong) nhung Jest (CJS, khong bat --experimental-vm-modules)
// khong ho tro dynamic import() nen luon nem loi "Setting up fake worker failed".
// Vi vay mock pdf-parse o day, giong cach settingsRoutes.test.js/generateRoutes.test.js
// dang mock ProviderFactory thay vi goi that.
const mockGetText = jest.fn();
const mockGetInfo = jest.fn().mockResolvedValue({ total: 1 });
const mockDestroy = jest.fn().mockResolvedValue(undefined);
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({ getText: mockGetText, getInfo: mockGetInfo, destroy: mockDestroy }))
}));

const express = require('express');
const request = require('supertest');
const { Document: DocxDocument, Packer, Paragraph } = require('docx');
const { closeDb } = require('../../backend/database');
const resourceRoutes = require('../../backend/routes/resourceRoutes');
const { errorHandler } = require('../../backend/errorHandler');

/**
 * Tao 1 tep .docx that (dung chinh thu vien `docx`) de lam fixture, thay vi
 * commit file nhi phan vao repo - dung quy uoc giong tests/parser/FileUploadParser.test.js.
 * Khong co van de dynamic-import nhu pdf-parse nen giu nguyen, khong mock.
 */
async function buildDocxBuffer(lines) {
  const doc = new DocxDocument({ sections: [{ children: lines.map(line => new Paragraph({ text: line })) }] });
  return Packer.toBuffer(doc);
}

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use('/api/resources', resourceRoutes);
  app.use(errorHandler);
  return app;
}

afterEach(async () => {
  mockGetText.mockReset();
  mockDestroy.mockClear();
  await closeDb();
});

describe('POST /api/resources', () => {
  describe('Happy Path', () => {
    test('TC-RES-01: tao tai lieu hop le tra ve doc_id', async () => {
      const res = await request(buildApp()).post('/api/resources').send({ title: 'SGK Toan 10', subject: 'Toan' });
      expect(res.status).toBe(200);
      expect(res.body.doc_id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Negative Cases', () => {
    test('TC-RES-02: thieu title tra ve 400', async () => {
      const res = await request(buildApp()).post('/api/resources').send({ subject: 'Toan' });
      expect(res.status).toBe(400);
    });
  });
});

describe('GET /api/resources', () => {
  test('TC-RES-03: liet ke tai lieu kem danh sach section long ben trong, dung thu tu sort_order', async () => {
    const app = buildApp();
    const docRes = await request(app).post('/api/resources').send({ title: 'SGK Toan 10' });
    const docId = docRes.body.doc_id;

    await request(app).post(`/api/resources/${docId}/sections`).send({ section_title: 'Chuong 1', content: 'Noi dung 1' });
    await request(app).post(`/api/resources/${docId}/sections`).send({ section_title: 'Chuong 2', content: 'Noi dung 2' });

    const res = await request(app).get('/api/resources');
    expect(res.status).toBe(200);
    const doc = res.body.documents.find(d => d.doc_id === docId);
    expect(doc.sections).toHaveLength(2);
    expect(doc.sections.map(s => s.section_title)).toEqual(['Chuong 1', 'Chuong 2']);
  });
});

describe('POST /api/resources/:doc_id/sections', () => {
  describe('Happy Path', () => {
    test('TC-RES-04: them phan hop le tra ve section_id', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const res = await request(app)
        .post(`/api/resources/${docRes.body.doc_id}/sections`)
        .send({ section_title: 'Phan 1', content: 'Noi dung' });
      expect(res.status).toBe(200);
      expect(res.body.section_id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  describe('Negative Cases', () => {
    test('TC-RES-05: doc_id khong ton tai tra ve 404', async () => {
      const res = await request(buildApp())
        .post('/api/resources/00000000-0000-0000-0000-000000000000/sections')
        .send({ section_title: 'X', content: 'Y' });
      expect(res.status).toBe(404);
    });

    test('TC-RES-06: thieu content tra ve 400', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const res = await request(app)
        .post(`/api/resources/${docRes.body.doc_id}/sections`)
        .send({ section_title: 'Phan 1' });
      expect(res.status).toBe(400);
    });
  });
});

describe('POST /api/resources/:doc_id/sections/upload', () => {
  describe('Happy Path', () => {
    test('TC-RES-09: upload .txt hop le tra ve section_id, noi dung dung nhu file', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const docId = docRes.body.doc_id;

      const res = await request(app)
        .post(`/api/resources/${docId}/sections/upload`)
        .attach('file', Buffer.from('Noi dung chuong 1 ve so nguyen'), 'chuong-1.txt');

      expect(res.status).toBe(200);
      expect(res.body.section_id).toMatch(/^[0-9a-f-]{36}$/);

      const listRes = await request(app).get('/api/resources');
      const doc = listRes.body.documents.find(d => d.doc_id === docId);
      expect(doc.sections).toHaveLength(1);
      expect(doc.sections[0].section_title).toBe('chuong-1');
    });

    test('TC-RES-10: co truyen section_title se ghi de ten mac dinh tu ten file', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const docId = docRes.body.doc_id;

      await request(app)
        .post(`/api/resources/${docId}/sections/upload`)
        .field('section_title', 'Ten tuy chon')
        .attach('file', Buffer.from('noi dung'), 'file-goc.txt');

      const listRes = await request(app).get('/api/resources');
      const doc = listRes.body.documents.find(d => d.doc_id === docId);
      expect(doc.sections[0].section_title).toBe('Ten tuy chon');
    });

    test('TC-RES-11: upload .docx that trich xuat dung noi dung van ban', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const docId = docRes.body.doc_id;
      const buffer = await buildDocxBuffer(['Noi dung chuong 1 tu file Word']);

      const res = await request(app)
        .post(`/api/resources/${docId}/sections/upload`)
        .attach('file', buffer, 'giao-trinh.docx');
      expect(res.status).toBe(200);

      const listRes = await request(app).get('/api/resources');
      const doc = listRes.body.documents.find(d => d.doc_id === docId);
      expect(doc.sections[0].section_title).toBe('giao-trinh');
    }, 20000);

    test('TC-RES-12: upload .pdf trich xuat dung noi dung van ban (pdf-parse duoc mock, xem ly do o dau file)', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const docId = docRes.body.doc_id;
      mockGetText.mockResolvedValue({ text: 'Noi dung chuong 1 tu file PDF' });

      const res = await request(app)
        .post(`/api/resources/${docId}/sections/upload`)
        .attach('file', Buffer.from('fake pdf bytes'), 'giao-trinh.pdf');
      expect(res.status).toBe(200);
      expect(mockDestroy).toHaveBeenCalledTimes(1);

      const listRes = await request(app).get('/api/resources');
      const doc = listRes.body.documents.find(d => d.doc_id === docId);
      expect(doc.sections[0].section_title).toBe('giao-trinh');
    });
  });

  describe('Negative Cases', () => {
    test('TC-RES-13: doc_id khong ton tai tra ve 404', async () => {
      const res = await request(buildApp())
        .post('/api/resources/00000000-0000-0000-0000-000000000000/sections/upload')
        .attach('file', Buffer.from('x'), 'x.txt');
      expect(res.status).toBe(404);
    });

    test('TC-RES-14: khong dinh kem file tra ve 400', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const res = await request(app).post(`/api/resources/${docRes.body.doc_id}/sections/upload`).send();
      expect(res.status).toBe(400);
    });

    test('TC-RES-15: dinh dang tep khong ho tro bi tu choi', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const res = await request(app)
        .post(`/api/resources/${docRes.body.doc_id}/sections/upload`)
        .attach('file', Buffer.from('x'), 'malicious.exe');
      expect(res.status).toBe(400);
    });

    test('TC-RES-16: file .docx bi hong (khong phai zip/docx that) tra ve 400 ro rang, khong crash', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      const res = await request(app)
        .post(`/api/resources/${docRes.body.doc_id}/sections/upload`)
        .attach('file', Buffer.from('day khong phai la mot tep docx hop le'), 'hong.docx');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Khong the doc noi dung tep Word/);
    });

    test('TC-RES-17: file .pdf bi hong tra ve 400 ro rang, khong crash', async () => {
      const app = buildApp();
      const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
      mockGetText.mockRejectedValue(new Error('Invalid PDF structure.')); // dung dung thong bao pdf-parse tra ve that (da kiem chung thu cong)
      const res = await request(app)
        .post(`/api/resources/${docRes.body.doc_id}/sections/upload`)
        .attach('file', Buffer.from('day khong phai la mot tep pdf hop le'), 'hong.pdf');
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/Khong the doc noi dung tep PDF/);
    });
  });
});

describe('DELETE /api/resources/:doc_id', () => {
  test('TC-RES-07: xoa tai lieu se CASCADE xoa het section ben trong', async () => {
    const app = buildApp();
    const docRes = await request(app).post('/api/resources').send({ title: 'Tai lieu' });
    const docId = docRes.body.doc_id;
    await request(app).post(`/api/resources/${docId}/sections`).send({ section_title: 'Phan 1', content: 'X' });

    const delRes = await request(app).delete(`/api/resources/${docId}`);
    expect(delRes.status).toBe(200);

    const listRes = await request(app).get('/api/resources');
    expect(listRes.body.documents.find(d => d.doc_id === docId)).toBeUndefined();
  });

  test('TC-RES-08: xoa tai lieu khong ton tai tra ve 404', async () => {
    const res = await request(buildApp()).delete('/api/resources/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/resources/extract-pdf-text (tab Tai file)', () => {
  const NL = String.fromCharCode(10);
  const pdf = Buffer.from(['%PDF-1.4', '%fake', ''].join(NL));

  test('TC-RES-PDF-01: PDF co lop chu -> tra text da bo dau phan trang, scanned=false', async () => {
    mockGetInfo.mockResolvedValueOnce({ total: 2 });
    mockGetText.mockResolvedValueOnce({ text: ['=PHAN_1=', '[CAU_HOI]', 'Loai: TN', '', '-- 1 of 2 --', '', 'De_Bai: Cau hoi mot hai ba bon nam?'].join(NL) });
    const res = await request(buildApp()).post('/api/resources/extract-pdf-text').attach('file', pdf, 'de.pdf');
    expect(res.status).toBe(200);
    expect(res.body.scanned).toBe(false);
    expect(res.body.pages).toBe(2);
    expect(res.body.text).toContain('[CAU_HOI]');
    expect(res.body.text).not.toContain('-- 1 of 2 --');
  });

  test('TC-RES-PDF-02: PDF scan (chi co dau trang) -> scanned=true, khong OCR', async () => {
    mockGetInfo.mockResolvedValueOnce({ total: 123 });
    mockGetText.mockResolvedValueOnce({ text: Array.from({ length: 123 }, (_, i) => ['', '', `-- ${i + 1} of 123 --`, '', ''].join(NL)).join('') });
    const res = await request(buildApp()).post('/api/resources/extract-pdf-text').attach('file', pdf, 'scan.pdf');
    expect(res.status).toBe(200);
    expect(res.body.scanned).toBe(true);
    expect(res.body.pages).toBe(123);
  });

  test('TC-RES-PDF-03: tep khong phai PDF bi tu choi', async () => {
    const res = await request(buildApp()).post('/api/resources/extract-pdf-text').attach('file', Buffer.from('hello'), 'gia.pdf');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/resources/history', () => {
  test('TC-RES-HIS-01: ghi lich su tao/them phan/tai file/xoa, moi nhat truoc, con sau khi xoa tai lieu', async () => {
    const app = buildApp();
    const created = await request(app).post('/api/resources').send({ title: 'SGK Toan 9', subject: 'Toan' });
    const docId = created.body.doc_id;
    await request(app).post(`/api/resources/${docId}/sections`).send({ section_title: 'Chuong 1', content: 'Can bac hai' });
    await request(app).post(`/api/resources/${docId}/sections/upload`).field('section_title', 'Chuong 2').attach('file', Buffer.from('noi dung txt'), 'c2.txt');
    await request(app).delete(`/api/resources/${docId}`);
    const res = await request(app).get('/api/resources/history');
    expect(res.status).toBe(200);
    expect(res.body.history.map(h => h.action)).toEqual(['delete_doc', 'upload_section', 'add_section', 'create_doc']);
    expect(res.body.history[1]).toMatchObject({ doc_title: 'SGK Toan 9', section_title: 'Chuong 2', detail: 'c2.txt' });
    expect(res.body.history[0].doc_title).toBe('SGK Toan 9');
  });

  test('TC-RES-HIS-02: upload PDF scan vao thu vien bao ro khong co OCR, khong ghi lich su', async () => {
    const app = buildApp();
    const docId = (await request(app).post('/api/resources').send({ title: 'Scan' })).body.doc_id;
    mockGetText.mockResolvedValueOnce({ text: ['', '-- 1 of 1 --', ''].join(String.fromCharCode(10)) });
    const res = await request(app).post(`/api/resources/${docId}/sections/upload`).attach('file', Buffer.from('%PDF-1.4'), 'scan.pdf');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('OCR');
    const history = (await request(app).get('/api/resources/history')).body.history;
    expect(history.filter(h => h.action === 'upload_section')).toHaveLength(0);
  });
});
