const fs = require('fs');
const path = require('path');
const { promoteStructuralMath } = require('../../backend/parser/mathToLatex.js');

/**
 * "Hop dong" dung chung giua bo chuan hoa cong thuc toan tren WEB
 * (backend/parser/mathToLatex.js :: promoteStructuralMath) va ANDROID
 * (Exam builder for adr/.../math/MathPromote.kt :: MathConvert.promoteStructuralMath).
 *
 * Moi vector { id, input, expected } o day cung phai dung khi chay bang ban
 * Kotlin (xem app/src/test/.../MathPromoteTest.kt - port cung bang nay). Sua
 * vector -> sua ca 2 ben.
 */
const vectors = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'mathPromoteVectors.json'), 'utf8')
);

describe('mathPromoteVectors (hop dong JS <-> Kotlin)', () => {
  test('>= 20 vector, phu du cac nhom', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(20);
  });

  for (const { id, input, expected } of vectors) {
    test(`${id}: ${JSON.stringify(input)}`, () => {
      const once = promoteStructuralMath(input);
      expect(once).toBe(expected);
      // idempotent tuyet doi
      expect(promoteStructuralMath(once)).toBe(once);
    });
  }
});
