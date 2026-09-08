'use strict';
// Sinh bo icon Android (adaptive + legacy) tu resources/image/icon.png.
// icon.png la anh grayscale 640x640, net ve mau den (~0) tren nen xam (~245).
// -> tach nen, doi net ve thanh TRANG, dat tren nen xanh thuong hieu #2563EB.
//
// Chay:  node resources/image/gen-android-icons.js
// (khong can tham so - mac dinh lay goc repo la thu muc cha cua file nay 2 cap).
// Chi dung Node core (zlib) - khong can cai them thu vien.

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '..', '..');
const SRC = path.join(ROOT, 'resources', 'image', 'icon.png');
const RES = path.join(ROOT, 'Exam builder for adr', 'app', 'src', 'main', 'res');

const BRAND = [0x25, 0x63, 0xEB]; // #2563EB

// ---------- decode grayscale PNG ----------
function decodeGray(buf) {
  let o = 8;
  const idat = [];
  let W = 0, H = 0;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const start = o + 8;
    if (type === 'IHDR') {
      W = buf.readUInt32BE(start);
      H = buf.readUInt32BE(start + 4);
      if (buf[start + 8] !== 8 || buf[start + 9] !== 0) throw new Error('can grayscale 8-bit');
    } else if (type === 'IDAT') {
      idat.push(buf.slice(start, start + len));
    }
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const img = Buffer.alloc(W * H);
  let p = 0;
  for (let y = 0; y < H; y++) {
    const ft = raw[p++];
    for (let x = 0; x < W; x++) {
      const cur = raw[p++];
      const a = x >= 1 ? img[y * W + x - 1] : 0;
      const b = y > 0 ? img[(y - 1) * W + x] : 0;
      const c = (x >= 1 && y > 0) ? img[(y - 1) * W + x - 1] : 0;
      let v;
      switch (ft) {
        case 0: v = cur; break;
        case 1: v = cur + a; break;
        case 2: v = cur + b; break;
        case 3: v = cur + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: v = cur;
      }
      img[y * W + x] = v & 255;
    }
  }
  return { W, H, img };
}

// ---------- encode RGBA PNG ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodeRGBA(W, H, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = W * 4;
  const filtered = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    filtered[y * (stride + 1)] = 0;
    rgba.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(filtered, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- art sampling ----------
const { W: SW, H: SH, img } = decodeGray(fs.readFileSync(SRC));
// alpha net ve: gray 0 -> 255, gray >=218 -> 0 (bo nen 245 + watermark mo)
function alphaAt(ix, iy) {
  if (ix < 0 || iy < 0 || ix >= SW || iy >= SH) return 0;
  const g = img[iy * SW + ix];
  return g >= 218 ? 0 : Math.min(255, Math.round((218 - g) * 255 / 200));
}
function sampleAlpha(sx, sy) { // bilinear
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const fx = sx - x0, fy = sy - y0;
  const a00 = alphaAt(x0, y0), a10 = alphaAt(x0 + 1, y0);
  const a01 = alphaAt(x0, y0 + 1), a11 = alphaAt(x0 + 1, y0 + 1);
  return (a00 * (1 - fx) + a10 * fx) * (1 - fy) + (a01 * (1 - fx) + a11 * fx) * fy;
}

// tam & be rong bbox net ve (do o buoc kiem tra truoc)
const ART_CX = 319.5, ART_CY = 319.5, ART_W = 546;

// mode: 'fg' (nen trong suot, net trang) | 'square' (nen xanh day) | 'round' (dia xanh)
function render(N, frac, mode) {
  const rgba = Buffer.alloc(N * N * 4);
  const scale = frac * N / ART_W;
  const R = N / 2;
  for (let dy = 0; dy < N; dy++) {
    for (let dx = 0; dx < N; dx++) {
      const i = (dy * N + dx) * 4;
      const sx = ART_CX + (dx + 0.5 - N / 2) / scale;
      const sy = ART_CY + (dy + 0.5 - N / 2) / scale;
      const art = sampleAlpha(sx, sy) / 255; // 0..1 do phu net ve

      let br = 0, bg = 0, bb = 0, ba = 0; // nen
      if (mode === 'square') {
        br = BRAND[0]; bg = BRAND[1]; bb = BRAND[2]; ba = 255;
      } else if (mode === 'round') {
        const d = Math.hypot(dx + 0.5 - R, dy + 0.5 - R);
        const cov = Math.max(0, Math.min(1, R - d + 0.5)); // vien mem 1px
        br = BRAND[0]; bg = BRAND[1]; bb = BRAND[2]; ba = Math.round(cov * 255);
      }

      // ve net TRANG len tren nen
      const outA = ba + 255 * art * (1 - ba / 255);
      if (outA <= 0) { rgba[i + 3] = 0; continue; }
      const fgW = 255 * art;
      rgba[i] = Math.round((255 * fgW + br * ba * (1 - art)) / outA);
      rgba[i + 1] = Math.round((255 * fgW + bg * ba * (1 - art)) / outA);
      rgba[i + 2] = Math.round((255 * fgW + bb * ba * (1 - art)) / outA);
      rgba[i + 3] = Math.round(outA);
    }
  }
  return encodeRGBA(N, N, rgba);
}

// ---------- xuat ----------
const DENS = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432]
];

for (const [d, legacy, fg] of DENS) {
  const dir = path.join(RES, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), render(legacy, 0.64, 'square'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), render(legacy, 0.58, 'round'));
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), render(fg, 0.56, 'fg'));
  console.log(`mipmap-${d}: ${legacy}/${legacy}/${fg}`);
}

// adaptive xml + mau nen
const anydpi = path.join(RES, 'mipmap-anydpi-v26');
fs.mkdirSync(anydpi, { recursive: true });
const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`;
fs.writeFileSync(path.join(anydpi, 'ic_launcher.xml'), adaptiveXml);
fs.writeFileSync(path.join(anydpi, 'ic_launcher_round.xml'), adaptiveXml);

const valuesDir = path.join(RES, 'values');
fs.mkdirSync(valuesDir, { recursive: true });
fs.writeFileSync(path.join(valuesDir, 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#2563EB</color>
</resources>
`);
console.log('mipmap-anydpi-v26 + values/ic_launcher_background.xml');
console.log('DONE');
