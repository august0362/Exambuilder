import { IQuestionParser } from './IQuestionParser.js';
import { TextPromptParser } from './TextPromptParser.js';
import { formatMathSymbols } from './mathFormat.js';

const TYPE_MAP = { TN: 'MCQ', DIEN_TU: 'FILL_BLANK', DUNG_SAI: 'TRUE_FALSE', TU_LUAN: 'ESSAY' };
const DIFFICULTY_MAP = { nhan_biet: 'NB', thong_hieu: 'TH', van_dung: 'VD', van_dung_cao: 'VDC' };

export class FileUploadParser extends IQuestionParser {
  /**
   * Diem vao chinh danh cho trinh duyet: nhan mot doi tuong File (tu
   * <input type="file">), tu quyet dinh doc dang text hay dang nhi phan
   * (.docx) roi tra ve mang blocks. Cung hoat dong duoc trong Node (Jest)
   * voi doi tuong File toan cuc co san tu Node 20+.
   */
  async parseFile(file) {
    const ext = (file.name || '').split('.').pop().toLowerCase();
    if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      return this._parseDocx(arrayBuffer);
    }
    const text = await file.text();
    return this.parse(text, file.name);
  }

  parse(rawContent, fileName = '') {
    const ext = fileName.split('.').pop().toLowerCase();
    if (ext === 'json') return this._parseJSON(rawContent);
    if (ext === 'csv') return this._parseCSV(rawContent);
    if (ext === 'txt') return new TextPromptParser().parse(rawContent);
    throw new Error(`Dinh dang tep khong duoc ho tro: .${ext}. Chi ho tro .json, .csv, .txt, .docx`);
  }

  _loadMammoth() {
    if (typeof window !== 'undefined' && window.mammoth) {
      return window.mammoth;
    }
    // Moi truong Node (chay duoi Jest) - nap goi mammoth cai qua npm.
    return require('mammoth');
  }

  async _parseDocx(arrayBuffer) {
    const mammoth = this._loadMammoth();
    const isBrowser = typeof window !== 'undefined' && window.mammoth;
    let result;
    try {
      result = await mammoth.extractRawText(
        isBrowser ? { arrayBuffer } : { buffer: Buffer.from(arrayBuffer) }
      );
    } catch (err) {
      throw new Error(`Khong the doc noi dung tep Word: ${err.message}`);
    }

    const text = result.value;
    if (!text || !text.trim()) {
      throw new Error('Tep Word khong co noi dung van ban (co the la tep rong hoac chi chua hinh anh/bang).');
    }
    // Van ban trich xuat tu Word phai tuan thu dung cau truc chuan (xem
    // Gemini_Prompt_Template.txt) de TextPromptParser boc tach duoc.
    return new TextPromptParser().parse(text);
  }

  _parseJSON(rawContent) {
    let data;
    try {
      data = JSON.parse(rawContent);
    } catch (err) {
      throw new Error(`Tep JSON khong hop le: ${err.message}`);
    }
    const blocks = Array.isArray(data) ? data : data.blocks;
    if (!Array.isArray(blocks) || blocks.length === 0) {
      throw new Error('Tep JSON phai chua mang "blocks" gom cac khoi cau hoi.');
    }
    blocks.forEach((block, i) => {
      if (!block.block_type || !Array.isArray(block.questions)) {
        throw new Error(`[Khoi ${i + 1}] Thieu "block_type" hoac "questions".`);
      }
    });
    return blocks;
  }

  _parseCSV(rawContent) {
    const rows = this._splitCSVRows(rawContent);
    if (rows.length < 2) {
      throw new Error('Tep CSV can co dong tieu de va it nhat 1 dong du lieu.');
    }
    const header = rows[0].map(h => h.trim().toLowerCase());
    const required = ['section', 'loai', 'muc_do', 'de_bai'];
    for (const col of required) {
      if (!header.includes(col)) {
        throw new Error(`Tep CSV thieu cot bat buoc: "${col}". Cot yeu cau: section, loai, muc_do, de_bai, a, b, c, d, dap_an, loi_giai, so_dong_nhap`);
      }
    }

    const blockMap = new Map();

    rows.slice(1).forEach((row, rIndex) => {
      if (row.every(c => !c.trim())) return;
      const location = `Dong ${rIndex + 2}`;
      const record = {};
      header.forEach((key, i) => { record[key] = (row[i] || '').trim(); });

      const rawType = record['loai'].toUpperCase();
      const questionType = TYPE_MAP[rawType];
      if (!questionType) throw new Error(`[${location}] Cot "loai" khong hop le: "${record['loai']}"`);

      const difficulty = DIFFICULTY_MAP[record['muc_do'].toLowerCase()];
      if (!difficulty) throw new Error(`[${location}] Cot "muc_do" khong hop le: "${record['muc_do']}"`);

      if (!record['de_bai']) throw new Error(`[${location}] Thieu noi dung "de_bai".`);

      const question = {
        question_type: questionType,
        content: formatMathSymbols(record['de_bai']),
        difficulty_level: difficulty,
        explanation: formatMathSymbols(record['loi_giai']) || null,
        correct_answer: null,
        options: [],
        draft_lines_count: 0
      };

      if (questionType === 'MCQ') {
        const options = ['a', 'b', 'c', 'd']
          .filter(k => record[k])
          .map(k => ({ option_key: k.toUpperCase(), option_text: record[k] }));
        if (options.length < 2) throw new Error(`[${location}] Cau trac nghiem can it nhat 2 lua chon.`);
        const correctKey = record['dap_an'].toUpperCase();
        if (!options.some(o => o.option_key === correctKey)) {
          throw new Error(`[${location}] "dap_an" (${correctKey}) khong khop lua chon nao.`);
        }
        question.options = options.map(o => ({ ...o, option_text: formatMathSymbols(o.option_text), is_correct: o.option_key === correctKey }));
        question.correct_answer = correctKey;
      } else if (questionType === 'TRUE_FALSE') {
        if (!/^(Dung|Sai)$/i.test(record['dap_an'])) {
          throw new Error(`[${location}] "dap_an" phai la "Dung" hoac "Sai".`);
        }
        question.correct_answer = record['dap_an'];
      } else if (questionType === 'FILL_BLANK') {
        if (!record['dap_an']) throw new Error(`[${location}] Cau dien tu thieu "dap_an".`);
        question.correct_answer = formatMathSymbols(record['dap_an']);
      } else if (questionType === 'ESSAY') {
        const draftLines = parseInt(record['so_dong_nhap'], 10);
        question.draft_lines_count = Number.isFinite(draftLines) && draftLines > 0 ? draftLines : 5;
        question.correct_answer = formatMathSymbols(record['dap_an']) || null;
      }

      const sectionKey = record['section'] || 'Cau hoi';
      if (!blockMap.has(sectionKey)) {
        blockMap.set(sectionKey, { block_type: 'MULTIPLE_CHOICE', block_title: sectionKey, questions: [] });
      }
      const block = blockMap.get(sectionKey);
      if (questionType === 'ESSAY') block.block_type = 'ESSAY';
      block.questions.push(question);
    });

    return Array.from(blockMap.values());
  }

  _splitCSVRows(rawContent) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const text = rawContent.replace(/\r\n/g, '\n');

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
    return rows.filter(r => r.length > 0 && !(r.length === 1 && r[0] === ''));
  }
}
