// Chon ngu canh tai lieu cho prompt sinh de (RAG don gian, offline, khong embedding):
// - Tong tai lieu <= ngan sach: dua NGUYEN VAN toan bo (AI "doc het").
// - Vuot ngan sach: cat thanh doan ~1.200 ky tu, cham diem theo tu khoa cua chu de +
//   yeu cau (TF-IDF don gian, so khop ca co dau va bo dau), lay doan diem cao den khi
//   het ngan sach roi xep lai theo thu tu goc de AI doc mach lac.
// Ngan sach mac dinh ~60.000 ky tu (~15-20 nghin token tieng Viet) de vua context
// cua cac model pho bien va khong qua ton phi.
const DEFAULT_BUDGET_CHARS = 60000;
const CHUNK_CHARS = 1200;
const STOPWORDS = new Set(('va la cua cac nhung mot cho voi trong khi thi duoc co khong de bai cau hoi phan '
  + 'nay do the tu den ra theo vi ve hay hoac neu tren duoi sau truoc cung nhu da se dang rat').split(' '));

function fold(text) {
  return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}
function terms(text) {
  return fold(text).split(/[^a-z0-9]+/).filter(t => t.length > 1 && !STOPWORDS.has(t));
}

function chunkSection(section, sectionIndex) {
  const paragraphs = String(section.content || '').split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  const push = () => { if (current.trim()) chunks.push(current.trim()); current = ''; };
  for (const paragraph of paragraphs) {
    if (paragraph.length > CHUNK_CHARS) {
      push();
      for (let i = 0; i < paragraph.length; i += CHUNK_CHARS) chunks.push(paragraph.slice(i, i + CHUNK_CHARS));
    } else {
      if (current.length + paragraph.length + 2 > CHUNK_CHARS) push();
      current += (current ? '\n\n' : '') + paragraph;
    }
  }
  push();
  return chunks.map((text, chunkIndex) => ({ sectionIndex, chunkIndex, title: section.title, text }));
}

function formatSection(title, text) { return title ? `### ${title}\n${text}` : text; }

/**
 * sections: [{ title, content }] theo thu tu tai lieu.
 * query: chu de + yeu cau nguoi dung (dung de cham diem khi phai chon loc).
 * Tra { texts: string[], info: { mode, sections, total_chars, used_chars, total_chunks, used_chunks } }.
 */
function selectContext(sections, query = '', budgetChars = DEFAULT_BUDGET_CHARS) {
  const list = (Array.isArray(sections) ? sections : []).filter(s => s && String(s.content || '').trim());
  const totalChars = list.reduce((n, s) => n + String(s.content).length, 0);
  const base = { sections: list.length, total_chars: totalChars };
  if (!list.length) return { texts: [], info: { ...base, mode: 'none', used_chars: 0, total_chunks: 0, used_chunks: 0 } };
  if (totalChars <= budgetChars) {
    return { texts: list.map(s => formatSection(s.title, String(s.content).trim())), info: { ...base, mode: 'full', used_chars: totalChars, total_chunks: list.length, used_chunks: list.length } };
  }

  const chunks = list.flatMap(chunkSection);
  const queryTerms = [...new Set(terms(query))];
  const chunkTerms = chunks.map(c => terms(`${c.title} ${c.text}`));
  const df = new Map();
  for (const ts of chunkTerms) for (const t of new Set(ts)) df.set(t, (df.get(t) || 0) + 1);
  chunks.forEach((chunk, i) => {
    const tf = new Map();
    for (const t of chunkTerms[i]) tf.set(t, (tf.get(t) || 0) + 1);
    let score = 0;
    for (const q of queryTerms) {
      const f = tf.get(q);
      if (f) score += (1 + Math.log(f)) * Math.log(1 + chunks.length / (df.get(q) || 1));
    }
    // Khong co tu khoa (chua nhap chu de): uu tien phan dau moi chuong de phu rong.
    chunk.score = queryTerms.length ? score : 1 / (1 + chunk.chunkIndex);
  });
  const picked = [];
  let used = 0;
  for (const chunk of [...chunks].sort((a, b) => b.score - a.score || a.sectionIndex - b.sectionIndex || a.chunkIndex - b.chunkIndex)) {
    if (used + chunk.text.length > budgetChars) continue;
    picked.push(chunk);
    used += chunk.text.length;
  }
  picked.sort((a, b) => a.sectionIndex - b.sectionIndex || a.chunkIndex - b.chunkIndex);
  const texts = [];
  let lastSection = -1;
  for (const chunk of picked) {
    texts.push(chunk.sectionIndex !== lastSection ? formatSection(chunk.title, chunk.text) : chunk.text);
    lastSection = chunk.sectionIndex;
  }
  return { texts, info: { ...base, mode: 'retrieved', used_chars: used, total_chunks: chunks.length, used_chunks: picked.length } };
}

module.exports = { selectContext, DEFAULT_BUDGET_CHARS };
