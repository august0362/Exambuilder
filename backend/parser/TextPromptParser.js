import { IQuestionParser } from './IQuestionParser.js';
import { formatMathSymbols } from './mathFormat.js';

const TYPE_MAP = { TN: 'MCQ', DIEN_TU: 'FILL_BLANK', DUNG_SAI: 'TRUE_FALSE', TU_LUAN: 'ESSAY' };
const DIFFICULTY_MAP = { nhan_biet: 'NB', thong_hieu: 'TH', van_dung: 'VD', van_dung_cao: 'VDC' };
const FIELD_REGEX = /^(Loai|Muc_Do|De_Bai|Dap_An|Loi_Giai|So_Dong_Nhap)\s*:\s*(.*)$/i;
const OPTION_REGEX = /^([A-D])\.\s*(.*)$/;
const TITLE_MAP = { 'trac nghiem': 'Trắc nghiệm', 'tu luan': 'Tự luận' };

export class TextPromptParser extends IQuestionParser {
  parse(rawContent) {
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      throw new Error('Noi dung dan vao dang rong.');
    }

    const blocks = [];
    const sections = this._splitSections(rawContent);

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
        currentField = fieldMatch[1].toLowerCase();
        fields[currentField] = (fields[currentField] ? fields[currentField] + ' ' : '') + fieldMatch[2].trim();
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
