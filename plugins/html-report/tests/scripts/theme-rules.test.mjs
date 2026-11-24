import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { neutralTheme } from '../../skills/html-report/scripts/skill-assets.mjs';
import {
  THEME_BLOCK, ThemeError, blocksByMode, checkRamp, checkSeries, checkTheme, completeSeries, contrast, deriveTheme, fillTheme,
  newFindings, oklab, themeBlock,
} from '../../skills/html-report/scripts/theme-rules.mjs';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const NEUTRAL = neutralTheme();
const NEUTRAL_BODY = fs.readFileSync(fileURLToPath(new URL('../../skills/html-report/assets/theme-neutral.css', import.meta.url)), 'utf8')
  .match(THEME_BLOCK)[1];

const hslToHex = (hue, saturation, lightness) => {
  const amplitude = saturation * Math.min(lightness, 1 - lightness);
  const channel = (offset) => {
    const position = (offset + hue / 30) % 12;
    return lightness - amplitude * Math.max(-1, Math.min(position - 3, 9 - position, 1));
  };
  return '#' + [channel(0), channel(8), channel(4)].map((value) => Math.round(value * 255).toString(16).padStart(2, '0')).join('');
};

// 24 hues x 4 lightnesses x 2 saturations, and named brands at the edges: yellows, neons,
// cyan, greys, black, white, and chosen inks and surfaces.
const SWEEP_BRANDS = [];
for (let hue = 0; hue < 360; hue += 15) {
  for (const lightness of [0.25, 0.4, 0.5, 0.6]) for (const saturation of [0.5, 0.9]) SWEEP_BRANDS.push({ brand: hslToHex(hue, saturation, lightness) });
}
const NAMED_BRANDS = [
  { brand: '#0B1F3A' }, { brand: '#F5C400' }, { brand: '#FFE600' }, { brand: '#ffd400' }, { brand: '#39ff14' }, { brand: '#00ffff' },
  { brand: '#808080' }, { brand: '#5A5A5A' }, { brand: '#c20a0a' }, { brand: '#993333' }, { brand: '#00A86B' }, { brand: '#E4572E' },
  { brand: '#6B2D8F' }, { brand: '#000000' }, { brand: '#FFFFFF' }, { brand: '#2B99E3', ink: '#0b2238', surfaceDark: '#071a29' },
  { brand: '#1B2A4A', surface: '#F7F3EA' }, { brand: '#2a78d6', surface: '#c4c4c4', surfaceDark: '#000000' },
  { brand: '#2a78d6', ink: '#4c4c4c', surface: '#f0f0f0' }, { brand: '#2a78d6', ink: '#545454' },
];

function completedThemeBody(options) {
  const derived = deriveTheme({ ...options, neutral: NEUTRAL });
  const block = themeBlock(completeSeries(derived.light, NEUTRAL.light[0]), completeSeries(derived.dark, NEUTRAL.dark[0]));
  return block.match(THEME_BLOCK)[1];
}

const failuresOf = (body) => {
  const findings = newFindings();
  const passes = checkTheme(findings, body);
  return { passes, failures: findings.failures().map((failure) => `${failure.label}: ${failure.detail}`) };
};

function assertFailsWith(body, label, detailPart = '') {
  const { passes, failures } = failuresOf(body);
  assert.equal(passes, false, `${label} should fail`);
  assert.ok(failures.some((failure) => failure.startsWith(`${label}: `) && failure.includes(detailPart)), `${label} not among\n${failures.join('\n')}`);
}

function assertFailsOnlyWith(body, label) {
  const { passes, failures } = failuresOf(body);
  assert.equal(passes, false, `${label} should fail`);
  assert.ok(failures.length && failures.every((failure) => failure.startsWith(`${label}: `)), `not only ${label}:\n${failures.join('\n')}`);
}
const RAMP_TOKENS = ['--h0', '--h1', '--h2', '--h3', '--h4', '--h5', '--h6'];

// The neutral theme's body with `token` set to `value` in the light rule, or in both dark rules.
function neutralWith(mode, token, value) {
  const darkStart = NEUTRAL_BODY.indexOf('@media');
  const [lightRule, darkRules] = [NEUTRAL_BODY.slice(0, darkStart), NEUTRAL_BODY.slice(darkStart)];
  const declaration = new RegExp(`${token}:[^;]+;`, 'g');
  const body = mode === 'light'
    ? lightRule.replace(declaration, `${token}:${value};`) + darkRules
    : lightRule + darkRules.replace(declaration, `${token}:${value};`);
  assert.notEqual(body, NEUTRAL_BODY, `${mode} ${token} unchanged`);
  return body;
}
const NEUTRAL_LIGHT = NEUTRAL.light[0];

// The grey on which `text` comes closest to `target` without reaching it.
function greyJustUnder(text, target) {
  const greys = Array.from({ length: 256 }, (_, level) => `#${level.toString(16).padStart(2, '0').repeat(3)}`);
  return greys.filter((grey) => contrast(text, grey) < target)
    .reduce((closest, grey) => (contrast(text, grey) > contrast(text, closest) ? grey : closest));
}
const deltaE = (first, second) => {
  const x = oklab(first), y = oklab(second);
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b) * 100;
};

describe('colour measures', () => {
  it('measures black on white at 21:1 and a colour on itself at 1:1', () => {
    assert.equal(contrast('#000000', '#ffffff'), 21);
    assert.equal(contrast('#2a78d6', '#2a78d6'), 1);
  });

  it('measures #777777 on white just under the 4.5:1 of body text', () => {
    assert.ok(Math.abs(contrast('#777777', '#ffffff') - 4.478) < 0.001);
  });

  it('gives the OKLab values of the reference sRGB colours', () => {
    const red = oklab('#ff0000');
    assert.ok(Math.abs(red.L - 0.627955) < 1e-5 && Math.abs(red.a - 0.224863) < 1e-5 && Math.abs(red.b - 0.125846) < 1e-5);
    const white = oklab('#ffffff');
    assert.ok(Math.abs(white.L - 1) < 1e-6 && Math.abs(white.a) < 1e-6 && Math.abs(white.b) < 1e-6);
    assert.equal(oklab('#000000').L, 0);
  });
});

describe('deriving a theme from a brand colour', () => {
  for (const options of [...SWEEP_BRANDS, ...NAMED_BRANDS]) {
    it(`derives a theme that passes check once its series is completed, for ${JSON.stringify(options)}`, () => {
      const { passes, failures } = failuresOf(completedThemeBody(options));
      assert.ok(passes, failures.join('\n'));
    });
  }

  it('moves a brand under 3:1 on the page to the step of its hue that reaches it, and says so', () => {
    const { light, notes } = deriveTheme({ brand: '#F5C400', neutral: NEUTRAL });
    assert.notEqual(light['--brand'], '#F5C400');
    assert.ok(contrast(light['--brand'], '#ffffff') >= 3);
    assert.ok(notes.some((note) => note.startsWith('light: --brand is') && note.includes('1.64:1')));
  });

  it('keeps a brand that reaches 3:1 as --brand', () => {
    assert.equal(deriveTheme({ brand: '#c20a0a', neutral: NEUTRAL }).light['--brand'], '#c20a0a');
  });

  it("takes the neutral theme's --c1 for a brand that reads grey, and says why", () => {
    const { light, dark, notes } = deriveTheme({ brand: '#808080', neutral: NEUTRAL });
    assert.equal(light['--c1'], NEUTRAL.light[0]['--c1']);
    assert.equal(dark['--c1'], NEUTRAL.dark[0]['--c1']);
    assert.ok(notes.some((note) => note.includes('chroma 0.000')));
  });

  it('refuses a light page darker than OKLab lightness 0.77', () => {
    assert.throws(() => deriveTheme({ brand: '#2a78d6', surface: '#9a9a9a', neutral: NEUTRAL }),
      (error) => error instanceof ThemeError && /derive makes the light mode on a page of 0\.77 or more/.test(error.message));
  });

  it('refuses a dark page lighter than OKLab lightness 0.28', () => {
    assert.throws(() => deriveTheme({ brand: '#2a78d6', surfaceDark: '#404040', neutral: NEUTRAL }),
      (error) => error instanceof ThemeError && /derive makes the dark mode on a page of 0\.28 or less/.test(error.message));
  });

  it('refuses an ink that no colour-grid strength lets read on the strongest cell', () => {
    assert.throws(() => deriveTheme({ brand: '#2a78d6', ink: '#777777', neutral: NEUTRAL }),
      (error) => error instanceof ThemeError && /No --heat-span lets --ink read/.test(error.message));
  });

  it('refuses a chosen ink under 7:1 on the page, naming the pair', () => {
    assert.throws(() => deriveTheme({ brand: '#2a78d6', ink: '#5a5a5a', neutral: NEUTRAL }),
      (error) => error instanceof ThemeError && /light mode.*--ink on --bg 6\.90:1 \(minimum 7\)/.test(error.message));
  });

  it('steps the recess and the tints toward the page until a chosen ink of lower contrast reads on them', () => {
    for (const options of [{ ink: '#4c4c4c', surface: '#f0f0f0' }, { ink: '#545454' }]) {
      const { light } = deriveTheme({ brand: '#2a78d6', ...options, neutral: NEUTRAL });
      for (const background of ['--recess', '--mark', '--accent-soft', '--pos-soft', '--warn-soft']) {
        assert.ok(contrast(light['--ink'], light[background]) >= 7, `${options.ink} on ${background} ${light[background]}`);
      }
    }
  });

  it('keeps the dark --c1 of a bright cyan a cyan, inside the series band', () => {
    const { dark, notes } = deriveTheme({ brand: '#00ffff', neutral: NEUTRAL });
    const { L, a, b } = oklab(dark['--c1']);
    const hueDegrees = (Math.atan2(b, a) * 180) / Math.PI, cyanDegrees = (Math.atan2(oklab('#00ffff').b, oklab('#00ffff').a) * 180) / Math.PI;
    assert.ok(Math.abs(hueDegrees - cyanDegrees) < 5, `${dark['--c1']} hue ${hueDegrees} vs ${cyanDegrees}`);
    assert.ok(Math.hypot(a, b) >= 0.10 && L >= 0.48 && L <= 0.67, `${dark['--c1']} L ${L}`);
    assert.ok(!notes.some((note) => note.includes("neutral theme's")), notes.join('\n'));
  });

  it('takes for the dark --c1 of a bright yellow the in-band step nearest it, at the top of the band', () => {
    const { dark } = deriveTheme({ brand: '#ffd400', neutral: NEUTRAL });
    assert.ok(oklab(dark['--c1']).L > 0.66 && oklab(dark['--c1']).L <= 0.67, `${dark['--c1']} L ${oklab(dark['--c1']).L}`);
  });

  it('names each of --brand, --accent and --c1 that is not the brand colour', () => {
    const { notes } = deriveTheme({ brand: '#ffd400', neutral: NEUTRAL });
    for (const start of ['light: --brand is', 'light: --accent is', 'light: --c1 is', 'dark: --c1 is']) {
      assert.ok(notes.some((note) => note.startsWith(start)), `${start} missing from\n${notes.join('\n')}`);
    }
  });

  it('names nothing in the light mode for a brand that passes there as it is', () => {
    const { light, notes } = deriveTheme({ brand: '#c20a0a', neutral: NEUTRAL });
    assert.deepEqual([light['--brand'], light['--accent'], light['--c1']], ['#c20a0a', '#c20a0a', '#c20a0a']);
    assert.deepEqual(notes.filter((note) => note.startsWith('light:')), []);
  });
});

describe('completing the series', () => {
  it('orders the remaining neutral colours of a green brand so adjacent slots stay 15 ΔE apart', () => {
    const { light } = deriveTheme({ brand: '#00A86B', neutral: NEUTRAL });
    const completed = completeSeries(light, NEUTRAL.light[0]);
    const findings = newFindings();
    assert.ok(checkSeries(findings, ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'].map((name) => completed[name]), '#ffffff'),
      findings.failures().map((failure) => failure.detail).join('\n'));
  });

  it('leaves out the neutral slot whose hue is closest to --c1', () => {
    const completed = completeSeries({ '--c1': '#d4622e' }, NEUTRAL.light[0]);
    const slots = ['--c2', '--c3', '--c4', '--c5', '--c6'].map((name) => completed[name]);
    assert.ok(!slots.includes(NEUTRAL.light[0]['--c2']), slots.join(' '));
    assert.equal(new Set(slots).size, 5);
  });
});

describe('filling an older theme', () => {
  const older = blocksByMode(fs.readFileSync(path.join(FIXTURES, 'older-theme.css'), 'utf8').match(THEME_BLOCK)[1]);

  it('never changes a value the theme already has, in either mode', () => {
    const filled = fillTheme(older);
    for (const mode of ['light', 'dark']) {
      for (const [name, value] of Object.entries(older[mode][0])) assert.equal(filled[mode][name], value, `${mode} ${name}`);
    }
  });

  it('adds every contract token the theme lacks', () => {
    const filled = fillTheme(older);
    const body = themeBlock(filled.light, filled.dark).match(THEME_BLOCK)[1];
    const { failures } = failuresOf(body);
    assert.ok(!failures.some((failure) => failure.startsWith('Contract tokens')), failures.join('\n'));
  });

  it('refuses a theme whose two dark rules differ, naming the tokens', () => {
    const differing = { ...older, dark: [older.dark[0], { ...older.dark[0], '--ink': '#ffffff' }] };
    assert.throws(() => fillTheme(differing), (error) => error instanceof ThemeError && /The dark rules differ in --ink/.test(error.message));
  });
});

describe('checking a theme block', () => {
  it('passes the neutral theme', () => {
    const { passes, failures } = failuresOf(NEUTRAL_BODY);
    assert.ok(passes, failures.join('\n'));
  });

  it('fails a theme without the rule of the explicit dark choice', () => {
    const body = NEUTRAL_BODY.replace(/@media screen\{\s*:root\[data-theme="dark"\]\{[^}]*\}\s*\}/, '');
    assert.notEqual(body, NEUTRAL_BODY);
    const { passes, failures } = failuresOf(body);
    assert.equal(passes, false);
    assert.ok(failures.some((failure) => failure.includes('missing :root[data-theme="dark"] inside @media screen')), failures.join('\n'));
  });

  it('fails a theme whose light mode sits under a stray selector', () => {
    const body = NEUTRAL_BODY.replace(/^:root\{/m, '.report{');
    assert.notEqual(body, NEUTRAL_BODY);
    const { passes, failures } = failuresOf(body);
    assert.equal(passes, false);
    assert.ok(failures.some((failure) => failure.includes('stray rule .report')), failures.join('\n'));
    assert.ok(failures.some((failure) => failure.includes('missing :root')), failures.join('\n'));
  });

  it('fails a dark rule that declares the light colour scheme', () => {
    const body = NEUTRAL_BODY.replace(/(:root\[data-theme="dark"\]\{\s*color-scheme: )dark/, '$1light');
    assert.notEqual(body, NEUTRAL_BODY);
    assertFailsWith(body, 'Theme rules', ':root[data-theme="dark"] inside @media screen declares color-scheme: light, not dark');
  });

  it('fails a theme whose two dark rules differ', () => {
    const lastC2 = NEUTRAL_BODY.lastIndexOf('--c2:');
    const body = `${NEUTRAL_BODY.slice(0, lastC2)}--c2:#d95927${NEUTRAL_BODY.slice(lastC2 + '--c2:#d95926'.length)}`;
    assertFailsWith(body, 'Theme blocks', 'the dark rules differ in: --c2');
  });

  it('fails a theme that lacks the dark mode', () => {
    assertFailsWith(NEUTRAL_BODY.slice(0, NEUTRAL_BODY.indexOf('@media')), 'dark mode', 'the dark mode is missing');
  });

  it('fails a light rule whose page is dark', () => {
    assertFailsWith(neutralWith('light', '--bg', '#161615'), '--bg', 'is not a light surface');
  });

  it('fails a light rule whose page is dark even when every pair in it passes', () => {
    const dark = NEUTRAL.dark[0];
    const ramp = RAMP_TOKENS.map((name) => dark[name]).reverse();
    const [onLo, onHi] = [dark['--on-hi'], dark['--on-lo']];
    const flip = ramp.findIndex((step) => contrast(step, onHi) > contrast(step, onLo));
    const light = { ...dark, ...Object.fromEntries(RAMP_TOKENS.map((name, i) => [name, ramp[i]])), '--on-lo': onLo, '--on-hi': onHi, '--on-flip': String(flip) };
    assertFailsOnlyWith(themeBlock(light, dark).match(THEME_BLOCK)[1], '--bg');
  });

  it('fails a mode that lacks a contract token, or holds one that is not a colour', () => {
    assertFailsWith(NEUTRAL_BODY.replace(/ --other:#b9b8b2;/, ''), 'Contract tokens', 'missing --other');
    assertFailsWith(neutralWith('light', '--accent', 'blue'), 'Contract tokens', 'not a colour --accent blue');
  });
});

describe('checking the contrast of a theme', () => {
  const INK_TARGETS = [['--ink', 7], ['--muted', 6], ['--faint', 4.5], ['--accent', 4.5], ['--brand', 3]];
  for (const [token, target] of INK_TARGETS) {
    it(`fails ${token} just under ${target}:1 on the page`, () => {
      const grey = greyJustUnder(NEUTRAL_LIGHT['--bg'], target);
      assertFailsWith(neutralWith('light', token, grey), token, `(minimum ${target})`);
    });
  }

  const PAIRS = [
    ['--ink', '--panel', 7], ['--muted', '--panel', 4.5], ['--faint', '--panel', 4.5], ['--ink', '--recess', 7], ['--muted', '--recess', 4.5],
    ['--ink', '--mark', 7], ['--muted', '--mark', 4.5], ['--accent', '--accent-soft', 4.5], ['--ink', '--accent-soft', 7],
    ['--muted', '--accent-soft', 4.5], ['--pos', '--bg', 4.5], ['--neg', '--bg', 4.5], ['--pos', '--pos-soft', 4.5], ['--ink', '--pos-soft', 7],
    ['--muted', '--pos-soft', 4.5], ['--neg', '--neg-soft', 4.5], ['--warn', '--warn-soft', 4.5], ['--ink', '--warn-soft', 7],
  ];
  for (const [text, background, target] of PAIRS) {
    it(`fails ${text} on ${background} just under ${target}:1`, () => {
      const grey = greyJustUnder(NEUTRAL_LIGHT[text], target);
      assertFailsWith(neutralWith('light', background, grey), `${text} on ${background}`, `(minimum ${target})`);
    });
  }

  it('fails a strong rule no stronger than the hairline', () => {
    assertFailsWith(neutralWith('light', '--line-strong', NEUTRAL_LIGHT['--line']), '--line-strong');
  });

  it('fails an "Outros" grey that reads as a colour, or vanishes on the page', () => {
    assertFailsWith(neutralWith('light', '--other', '#e03030'), '--other');
    assertFailsWith(neutralWith('light', '--other', '#f8f8f8'), '--other');
  });

  it('fails a colour grid with no strength, or one whose strongest cell hides the ink', () => {
    assertFailsWith(neutralWith('light', '--heat-span', '0%'), '--heat-span', 'needs a percentage above 0%');
    assertFailsWith(neutralWith('light', '--heat-span', '94%'), '--heat-span', '(minimum 4.5)');
  });
});

describe('checking the series and the ramp of a theme', () => {
  it('fails two adjacent series colours under 15 ΔE apart', () => {
    const c1 = NEUTRAL_LIGHT['--c1'];
    const candidates = Array.from({ length: 136 }, (_, i) => `#2a${(0x78 + i).toString(16)}d6`);
    const near = candidates.filter((candidate) => deltaE(c1, candidate) < 15).at(-1);
    assert.ok(deltaE(c1, near) > 13, `${near} ΔE ${deltaE(c1, near)}`);
    assertFailsWith(neutralWith('light', '--c2', near), 'Adjacent separation', '(floor 15)');
  });

  it('fails a series colour outside the lightness band, or one that reads grey', () => {
    assertFailsOnlyWith(neutralWith('light', '--c3', '#4b1580'), 'Lightness band');
    assertFailsWith(neutralWith('light', '--c3', '#777777'), 'Chroma floor', '#777777');
  });

  it('fails a ramp that turns back on its lightness', () => {
    const body = neutralWith('light', '--h3', NEUTRAL_LIGHT['--h2']);
    assertFailsWith(body, 'Monotonic lightness', 'a step is not darker than the one before');
  });

  it('fails a declared --on-flip other than the measured one', () => {
    assertFailsWith(neutralWith('light', '--on-flip', '3'), '--on-flip', 'declared 3, measured 4');
  });

  it('never flips a ramp whose two text colours read the same on every step', () => {
    const findings = newFindings();
    checkRamp(findings, ['#e8eef4', '#9db9d2', '#456f99', '#12263c'], false, '#000000', '#000000');
    assert.ok(findings.sections[0].items.some((item) => item.text?.startsWith('--on-flip: 4 ')));
  });
});
