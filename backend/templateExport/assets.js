const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createCanvas, Image } = require('@napi-rs/canvas');

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ID = /^image-[0-9a-f]{64}$/;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

function imageDir() { return path.resolve(process.env.EXAM_BACKGROUNDS_DIR || path.join(__dirname, '..', '..', 'resources', 'backgrounds')); }
function signature(buffer, extension) {
  if (extension === 'png') return buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString('ascii', 12, 16) === 'IHDR' && buffer.readUInt32BE(16) > 0 && buffer.readUInt32BE(20) > 0 && buffer.readUInt32BE(16) <= 10000 && buffer.readUInt32BE(20) <= 10000;
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
}

// Anh raster (WebP...) cua @napi-rs/canvas giai ma bat dong bo: gan src roi ve
// ngay se ra PNG trong suot, nen phai cho decode() truoc khi drawImage.
async function decodeImage(data) {
  const image = new Image();
  image.src = data;
  if (typeof image.decode === 'function') await image.decode();
  return image;
}

async function rasterize(data, extension) {
  if (extension === 'png' || extension === 'jpg' || extension === 'jpeg') return { data, type: extension === 'png' ? 'png' : 'jpg' };
  assertConvertible(data, extension);
  const image = await decodeImage(data);
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 10000 || image.height > 10000 || image.width * image.height > 20000000) throw new Error('Kích thước ảnh vượt giới hạn DOCX.');
  const scale = Math.min(1, 2400 / Math.max(image.width, image.height));
  const canvas = createCanvas(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const png = canvas.toBuffer('image/png');
  if (png.length > MAX_IMAGE_BYTES) throw new Error('Ảnh PNG chuyển đổi vượt giới hạn DOCX.');
  return { data: png, type: 'png' };
}

function assertConvertible(data, extension) {
  if (extension === 'webp' && !(data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP')) throw new Error('Chữ ký WebP không hợp lệ.');
  if (extension === 'svg') {
    const xml = data.toString('utf8').trim();
    if (data.length > 256 * 1024 || !/^<svg\s/i.test(xml) || /<!|<\?|\b(?:script|foreignObject|image|use|animate|set|style|filter|pattern|mask|clipPath|iframe|object|embed)\b|\bon[a-z]+\s*=|\b(?:href|src|style)\s*=|url\s*\(|javascript\s*:/i.test(xml)) throw new Error('SVG không an toàn để chuyển đổi.');
  }
}

// Doc + kiem tra dong bo (checksum, chu ky, SVG an toan) - dung cho uoc luong
// truoc khi xuat; chua raster hoa nen `data` la byte goc.
function readImageAsset(assetId) {
  if (typeof assetId !== 'string' || !ID.test(assetId)) throw new Error('Mã ảnh không hợp lệ.');
  const directory = imageDir();
  const metadataPath = path.join(directory, `${assetId}.json`);
  if (fs.lstatSync(metadataPath).isSymbolicLink()) throw new Error('Metadata ảnh không hợp lệ.');
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const filename = metadata.filename;
  if (metadata.asset_id !== assetId || typeof filename !== 'string' || !new RegExp(`^${assetId}\\.(png|jpg|jpeg|webp|svg)$`).test(filename)) throw new Error('Metadata ảnh không hợp lệ hoặc định dạng chưa hỗ trợ trong DOCX.');
  const extension = path.extname(filename).slice(1).toLowerCase();
  if (metadata.mime !== MIME[extension] || (extension === 'svg' && statSize(metadata.size) > 256 * 1024)) throw new Error('MIME ảnh không khớp định dạng hoặc SVG quá lớn.');
  const filepath = path.join(directory, filename);
  if (fs.lstatSync(filepath).isSymbolicLink()) throw new Error('Ảnh liên kết không được hỗ trợ.');
  const stat = fs.statSync(filepath);
  if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES || stat.size !== metadata.size) throw new Error('Ảnh quá lớn hoặc kích thước không khớp metadata.');
  const data = fs.readFileSync(filepath);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  if (hash !== assetId.slice(6) || metadata.sha256 !== hash || (['png', 'jpg', 'jpeg'].includes(extension) ? !signature(data, extension) : extension === 'svg' ? !/^<svg\s/i.test(data.toString('utf8').trim()) : !(data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'))) throw new Error('Ảnh không vượt qua kiểm tra chữ ký/checksum.');
  if (!['png', 'jpg', 'jpeg'].includes(extension)) assertConvertible(data, extension);
  return { data, extension, metadata };
}

async function loadImageAsset(assetId) {
  const { data, extension, metadata } = readImageAsset(assetId);
  return { ...(await rasterize(data, extension)), metadata };
}

function statSize(size) { return Number.isFinite(size) ? size : Infinity; }

module.exports = { readImageAsset, loadImageAsset, decodeImage, MAX_IMAGE_BYTES };
