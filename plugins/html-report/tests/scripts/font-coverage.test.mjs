import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { codePointsOf } from '../../skills/html-report/scripts/font-coverage.mjs';

const fontFile = (relativePath) => fileURLToPath(new URL(`../../skills/html-report/assets/fonts/${relativePath}`, import.meta.url));
const has = (codePoints, text) => [...text].every((character) => codePoints.has(character.codePointAt(0)));

describe('reading the character map of the plugin\'s WOFF2 files', () => {
  it('reads 343 characters from each Instrument Sans file, with the euro and the minus but not ± nor the soft hyphen', () => {
    for (const file of ['instrument-sans/InstrumentSans.woff2', 'instrument-sans/InstrumentSans-Italic.woff2']) {
      const codePoints = codePointsOf(fontFile(file));
      assert.equal(codePoints.size, 343, file);
      assert.ok(has(codePoints, 'Aaçãõé€−←↙'), file);
      assert.ok(!codePoints.has(0xb1) && !codePoints.has(0xad), file);
    }
  });

  it('reads 564 characters from each Newsreader file, with ≥ and ≈ but no Greek', () => {
    for (const file of ['newsreader/Newsreader.woff2', 'newsreader/Newsreader-Italic.woff2']) {
      const codePoints = codePointsOf(fontFile(file));
      assert.equal(codePoints.size, 564, file);
      assert.ok(has(codePoints, '≥≈≠≤−±₹€'), file);
      assert.ok(!codePoints.has(0x3c3), file);
    }
  });

  it('reads 4,605 characters from STIX Two Math, with Greek and the operators but not ᵢ nor ✕', () => {
    const codePoints = codePointsOf(fontFile('stix-two-math/STIXTwoMath.woff2'));
    assert.equal(codePoints.size, 4605);
    assert.ok(has(codePoints, 'σρβΔΣ∑√≤≥≈×·−⟹'));
    assert.ok(!codePoints.has(0x1d62) && !codePoints.has(0x2715));
  });

  it('refuses a file that is not a font', () => {
    assert.throws(() => codePointsOf(fileURLToPath(import.meta.url)), /font-coverage\.test\.mjs is not a WOFF2, TrueType or OpenType font\./);
  });
});
