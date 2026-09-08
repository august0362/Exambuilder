// Vai tu noi (va, hoac...) hay bi nham thanh phan so vi cung co dang
// "chu/chu" (vi du "va/hoac"). Danh sach nay chi la giai phap thuc dung,
// khong bao phu het moi truong hop, nhung chan duoc truong hop pho bien
// nhat trong van ban de thi tieng Viet.
const FRACTION_BLOCKLIST = new Set([
  'va', 'hoac', 'hay', 'la', 'khong', 'co', 'du', 'neu', 'thi', 'cung', 'nhung', 'nen', 'do', 'vi', 'ma', 'nhu', 'tuy'
]);

function stripDiacritics(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Don vi do luong vat ly (km/h, m/s, kg/m3...) co dang giong het phan so
// "tu/mau" ve mat cu phap (chu/chu) nen bi regex phan so nhan nham. Chi
// chan khi CA hai ve deu la don vi da biet - de khong lam hong phan so bien
// toan hoc hop le dang "chu/chu" (vi du "m/n" - phan so toi gian kinh dien).
const UNIT_TOKENS = new Set([
  'km', 'hm', 'dam', 'm', 'dm', 'cm', 'mm',
  'kg', 'hg', 'dag', 'g', 'dg', 'cg', 'mg', 't',
  'kl', 'hl', 'dal', 'l', 'dl', 'cl', 'ml',
  'h', 's', 'ph', 'gio', 'phut', 'giay',
  'm2', 'cm2', 'mm2', 'km2', 'dm2', 'ha',
  'm3', 'cm3', 'mm3', 'km3', 'dm3',
  'mol', 'w', 'j', 'pa', 'v', 'a', 'hz', 'ohm'
]);

function normalizeUnitToken(s) {
  return stripDiacritics(s).replace(/[²]/g, '2').replace(/[³]/g, '3');
}

function isUnitPair(rawNum, rawDen) {
  return UNIT_TOKENS.has(normalizeUnitToken(rawNum)) && UNIT_TOKENS.has(normalizeUnitToken(rawDen));
}

// Mot "tu thuong" toan chu cai thuong, tu 3 ky tu tro len (vi du "hỏi",
// "trả") nhieu kha nang la van xuoi tieng Viet chu khong phai ten bien
// hinh hoc (ten bien hinh hoc thuong viet HOA nhu AC, BC, AH).
function isLikelyProseWord(s) {
  return /^\p{Ll}+$/u.test(s) && s.length >= 3;
}

// Dung boi mathToLatex.js khi quyet dinh co boc "a/b" thanh $\frac{a}{b}$
// LaTeX hay khong: chan tu noi tieng Viet ("va/hoac"), cap don vi do luong
// ("km/h"), tu xuoi thuong dai (khong phai ten bien hinh hoc).
export function isLikelyFraction(rawNum, rawDen) {
  const num = rawNum.trim();
  const den = rawDen.trim();
  if (!num || !den) return false;
  if (FRACTION_BLOCKLIST.has(stripDiacritics(num)) || FRACTION_BLOCKLIST.has(stripDiacritics(den))) return false;
  if (isLikelyProseWord(num) || isLikelyProseWord(den)) return false;
  if (isUnitPair(num, den)) return false;
  return true;
}
