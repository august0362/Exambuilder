'use strict';

/**
 * Client toi thieu cho GitHub Gist API, dung `fetch` toan cuc (Node >= 18;
 * du an chay Node 24). Chi 3 thao tac: doc file thu vien, tao gist moi,
 * ghi de file thu vien. Token luu plaintext trong SYNC_SETTINGS - nen dung
 * fine-grained PAT chi co quyen `gist`.
 */

// Ghi de duoc qua env var chi de test (tro toi mock server cuc bo) - giong
// EXAM_DB_PATH trong backend/database.js.
const GITHUB_API = process.env.GITHUB_API_BASE || 'https://api.github.com';
const LIBRARY_FILENAME = 'exambuilder-library.json';
const GIST_DESCRIPTION = 'ExamBuilder - thu vien de kiem tra (dong bo PC <-> Android)';

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ExamBuilder'
  };
}

async function readError(res) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body && body.message ? ` - ${body.message}` : '';
  } catch {
    /* body khong phai JSON */
  }
  if (res.status === 401) return new Error(`GitHub tu choi token (HTTP 401${detail}). Kiem tra lai Personal Access Token.`);
  if (res.status === 403) return new Error(`GitHub chan yeu cau (HTTP 403${detail}). Token co thieu quyen "gist" hoac dang bi gioi han tan suat.`);
  if (res.status === 404) return new Error(`Khong tim thay Gist (HTTP 404${detail}). Kiem tra lai Gist ID.`);
  if (res.status === 429) return new Error(`GitHub gioi han tan suat (HTTP 429${detail}). Thu lai sau it phut.`);
  return new Error(`Loi GitHub API (HTTP ${res.status}${detail}).`);
}

/**
 * Tra ve noi dung file thu vien (chuoi JSON) hoac null neu gist chua co file
 * do. Xu ly ca truong hop GitHub cat bot file lon (> 1MB) qua `truncated`.
 */
async function getLibrary(token, gistId) {
  if (!token) throw new Error('Chua cau hinh GitHub token.');
  if (!gistId) throw new Error('Chua cau hinh Gist ID.');

  const res = await fetch(`${GITHUB_API}/gists/${encodeURIComponent(gistId)}`, { headers: authHeaders(token) });
  if (!res.ok) throw await readError(res);

  const gist = await res.json();
  const file = gist.files && gist.files[LIBRARY_FILENAME];
  if (!file) return null;
  if (file.truncated && file.raw_url) {
    const rawRes = await fetch(file.raw_url, { headers: authHeaders(token) });
    if (!rawRes.ok) throw await readError(rawRes);
    return await rawRes.text();
  }
  return file.content != null ? file.content : null;
}

/**
 * Tao gist secret moi chua file thu vien. Tra ve { id, html_url }.
 */
async function createGist(token, content) {
  if (!token) throw new Error('Chua cau hinh GitHub token.');

  const res = await fetch(`${GITHUB_API}/gists`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [LIBRARY_FILENAME]: { content } }
    })
  });
  if (!res.ok) throw await readError(res);

  const gist = await res.json();
  return { id: gist.id, html_url: gist.html_url };
}

/**
 * Ghi de file thu vien trong gist da co. Tra ve { id, html_url }.
 */
async function updateGist(token, gistId, content) {
  if (!token) throw new Error('Chua cau hinh GitHub token.');
  if (!gistId) throw new Error('Chua cau hinh Gist ID.');

  const res = await fetch(`${GITHUB_API}/gists/${encodeURIComponent(gistId)}`, {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [LIBRARY_FILENAME]: { content } } })
  });
  if (!res.ok) throw await readError(res);

  const gist = await res.json();
  return { id: gist.id, html_url: gist.html_url };
}

module.exports = { LIBRARY_FILENAME, GIST_DESCRIPTION, getLibrary, createGist, updateGist };
