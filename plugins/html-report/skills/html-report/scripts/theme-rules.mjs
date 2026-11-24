// The rules of a theme: the token contract, and deriving, completing and checking a theme
// against it, both modes. No I/O: theme.mjs and build.mjs read the files and print.
//
// What it computes: WCAG contrast, OKLab lightness and chroma, OKLab ΔE between adjacent
// slots, ramp monotonicity and the ramp's text-flip index. What it does NOT compute:
// colour-vision-deficiency simulation.

/* ---------- colour ---------- */
const hexToRgb = (hex) => {
  const digits = hex.replace('#', '').trim();
  const full = digits.length === 3 ? digits.split('').map((digit) => digit + digit).join('') : digits;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
};
const toLinear = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const toSrgb = (channel) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);

const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
// WCAG 2 contrast ratio of two hex colours, from 1 to 21.
export const contrast = (first, second) => {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((p, q) => q - p);
  return (lighter + 0.05) / (darker + 0.05);
};

// Ottosson's OKLab. Perceptual lightness and chroma; ΔE here is plain OKLab distance.
export const oklab = (hex) => {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
};
const chroma = (hex) => { const lab = oklab(hex); return Math.hypot(lab.a, lab.b); };
const hueAngle = (hex) => { const lab = oklab(hex); return Math.atan2(lab.b, lab.a); };
const hueDistance = (p, q) => {
  const turn = Math.abs(hueAngle(p) - hueAngle(q)) % (2 * Math.PI);
  return Math.min(turn, 2 * Math.PI - turn);
};
const deltaE = (p, q) => {
  const x = oklab(p), y = oklab(q);
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b) * 100;
};

const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map((channel) => Math.round(Math.min(1, Math.max(0, channel)) * 255).toString(16).padStart(2, '0')).join('');
const oklabToHex = ({ L, a, b }) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return rgbToHex(
    toSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s));
};

// A surface below this OKLab lightness is a dark mode's surface.
const isDarkSurface = (surface) => oklab(surface).L < 0.5;

const FULL_RANGE = [0.02, 0.99];
const isWithin = (lightness, [lowest, highest]) => lightness >= lowest && lightness <= highest;
const clearsAll = (candidate, requirements) => requirements.every(([surface, target]) => contrast(candidate, surface) >= target);

// The step of a colour's hue, its chroma scaled by `chromaScale`, closest to the surfaces
// that clears every [surface, minimum contrast] requirement with its rounded hex lightness
// inside `band`; null when none does. The surfaces belong to one mode: contrast falls as
// lightness rises on light surfaces and rises with it on dark ones, so the bisection follows
// the mode.
function thresholdStep(hex, requirements, { band = FULL_RANGE, chromaScale = 1 } = {}) {
  const lab = oklab(hex);
  const a = lab.a * chromaScale, b = lab.b * chromaScale;
  const isDarkMode = isDarkSurface(requirements[0][0]);
  let darkerBound = band[0], lighterBound = band[1], winner = null;
  for (let i = 0; i < 40; i++) {
    const L = (darkerBound + lighterBound) / 2;
    const candidate = oklabToHex({ L, a, b });
    const passes = clearsAll(candidate, requirements) && isWithin(oklab(candidate).L, band);
    if (passes) winner = candidate;
    if (passes === isDarkMode) lighterBound = L; else darkerBound = L;
  }
  return winner;
}

// thresholdStep over every lightness, or the extreme of the range when nothing clears, for
// check to report.
const adjustTo = (hex, requirements, chromaScale = 1) =>
  thresholdStep(hex, requirements, { chromaScale })
    ?? oklabToHex({ ...oklab(hex), L: isDarkSurface(requirements[0][0]) ? FULL_RANGE[1] : FULL_RANGE[0] });

const BAND_STEP = 0.001;

// `hex` itself when it lies in `band`; otherwise its hue and chroma at the band's nearest edge,
// stepped inward until the hex it rounds to lies inside; null when no step does.
function stepIntoBand(hex, band) {
  const lab = oklab(hex);
  if (isWithin(lab.L, band)) return hex;
  const inward = lab.L > band[1] ? -BAND_STEP : BAND_STEP;
  for (let L = Math.min(band[1], Math.max(band[0], lab.L)); isWithin(L, band); L += inward) {
    const candidate = oklabToHex({ ...lab, L });
    if (isWithin(oklab(candidate).L, band)) return candidate;
  }
  return null;
}

// The step of a colour's hue nearest the colour itself that lies in `band` and clears every
// requirement: the colour when it does, measured as the hex it rounds to; null when none does.
function nearestStep(hex, requirements, band = FULL_RANGE) {
  const bandStep = stepIntoBand(hex, band);
  if (bandStep && clearsAll(bandStep, requirements)) return bandStep;
  return thresholdStep(hex, requirements, { band });
}

// Same hue and chroma, lightness moved by `delta`.
const lighten = (hex, delta) => {
  const lab = oklab(hex);
  return oklabToHex({ L: lab.L + delta, a: lab.a, b: lab.b });
};

// What CSS `color-mix(in oklab, a p, b)` paints, with `p` between 0 and 1.
const mix = (first, second, share) => {
  const x = oklab(first), y = oklab(second);
  return oklabToHex({ L: x.L * share + y.L * (1 - share), a: x.a * share + y.a * (1 - share), b: x.b * share + y.b * (1 - share) });
};

// A soft background in the hue of `hex`, at lightness `L` and at most `maxChroma` of chroma.
const tint = (hex, L, maxChroma) => {
  const lab = oklab(hex);
  const chromaScale = Math.min(1, maxChroma / Math.max(Math.hypot(lab.a, lab.b), 1e-6));
  return oklabToHex({ L, a: lab.a * chromaScale, b: lab.b * chromaScale });
};

export const isHex = (value) => typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim());

/* ---------- the contract ---------- */
export const THEME_BLOCK = /\/\*\s*THEME\s*\*\/([\s\S]*?)\/\*\s*\/THEME\s*\*\//;
const MODES = ['light', 'dark'];

// The three rules of a theme block: the light mode, then the dark mode twice, for the
// system setting and for the reader's explicit choice. Print stays light.
const THEME_RULES = [
  { mode: 'light', media: null, selector: ':root' },
  { mode: 'dark', media: 'screen and (prefers-color-scheme: dark)', selector: ':root:where(:not([data-theme="light"]))' },
  { mode: 'dark', media: 'screen', selector: ':root[data-theme="dark"]' },
];

const SERIES_TOKENS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6'];
const RAMP_TOKENS = ['--h0', '--h1', '--h2', '--h3', '--h4', '--h5', '--h6'];
// Every token a mode carries, in the order a theme block writes them.
const TOKEN_LINES = [
  ['--ink', '--muted', '--faint'],
  ['--bg', '--panel', '--recess', '--line', '--line-strong'],
  ['--accent', '--accent-soft', '--brand', '--mark'],
  ['--pos', '--pos-soft', '--neg', '--neg-soft', '--warn', '--warn-soft'],
  [...SERIES_TOKENS, '--other', '--heat-span'],
  RAMP_TOKENS,
  ['--on-lo', '--on-hi', '--on-flip'],
];
const NON_COLOR_TOKENS = new Set(['--heat-span', '--on-flip']);
// The tokens the contract line answers for; the series and the ramp report their own slots.
const SLOT_TOKENS = new Set([...SERIES_TOKENS, ...RAMP_TOKENS]);
const CONTRACT_TOKENS = TOKEN_LINES.flat().filter((name) => !SLOT_TOKENS.has(name));
const CONTRACT_COLOR_TOKENS = CONTRACT_TOKENS.filter((name) => !NON_COLOR_TOKENS.has(name));

const SERIES_BAND = { light: [0.43, 0.77], dark: [0.48, 0.67] };   // categorical slots, per mode
const CHROMA_FLOOR = 0.10;      // below this a "colour" reads grey
const ADJACENT_DE_MIN = 15;     // adjacent slots, normal vision
const LINE_STRONG_MIN = 1.6;    // the rule under a table head and around a field must show
const OTHER_MIN = 1.5;          // the "Outros" slot is a fill, not text
const MARKER_MIN = 3;           // a mark that carries meaning without text: --brand, --c1

// Text tokens measured on --bg.
const INK_TARGETS = { '--ink': 7, '--muted': 6, '--faint': 4.5, '--accent': 4.5, '--brand': MARKER_MIN };

// [text token, background token, minimum contrast]: every pair report.css draws.
const PAIRS = [
  ['--ink', '--panel', 7], ['--muted', '--panel', 4.5], ['--faint', '--panel', 4.5],   // cards, dialogs, fields
  ['--ink', '--recess', 7], ['--muted', '--recess', 4.5],                              // boxes, open notice, units of a field
  ['--ink', '--mark', 7], ['--muted', '--mark', 4.5],                                  // highlighted row, default callout
  ['--accent', '--accent-soft', 4.5],                                                  // source badge
  ['--ink', '--accent-soft', 7], ['--muted', '--accent-soft', 4.5],                    // targeted source in the list
  ['--pos', '--bg', 4.5], ['--neg', '--bg', 4.5],                                      // recommended option, pros and cons
  ['--pos', '--pos-soft', 4.5], ['--ink', '--pos-soft', 7], ['--muted', '--pos-soft', 4.5],   // status, variation, recommendation box and its meta line
  ['--neg', '--neg-soft', 4.5],                                                        // status, variation
  ['--warn', '--warn-soft', 4.5], ['--ink', '--warn-soft', 7],                         // status, attention box
];

// The color grid paints a cell with color-mix(in oklab, --c1 (HEAT_BASE + --heat-span × share), --panel).
const HEAT_BASE = 0.06;
const HEAT_SPAN_MAX = 72;
const strongestCell = (vars) => mix(vars['--c1'], vars['--panel'], HEAT_BASE + parseFloat(vars['--heat-span']) / 100);

/* ---------- findings ---------- */
// Checks write here; theme.mjs prints every section, build.mjs reports the failures.
export function newFindings() {
  const sections = [];
  const current = () => sections[sections.length - 1];
  return {
    sections,
    section(heading) { sections.push({ heading, items: [] }); },
    line(label, state, detail) { current().items.push({ label, state, detail }); },
    note(text) { current().items.push({ text }); },
    failures() {
      return sections.flatMap(({ heading, items }) => items.filter((item) => item.state === 'FAIL').map((item) => ({ heading, ...item })));
    },
  };
}

const verdict = (passes) => (passes ? 'PASS' : 'FAIL');

// An unfilled slot must FAIL loudly: `oklab('?')` yields NaN and every comparison against
// NaN is false, so without this a half-written theme reports OK.
function reportNonColors(findings, label, entries) {
  const notColors = entries.filter(([, value]) => !isHex(value ?? ''));
  if (notColors.length) findings.line(label, 'FAIL', 'not a colour: ' + notColors.map(([name, value]) => `${name} ${value ?? 'missing'}`).join(', '));
  return notColors.length > 0;
}

/* ---------- checks ---------- */
export function checkSeries(findings, colors, surface, mode = isDarkSurface(surface) ? 'dark' : 'light') {
  const band = SERIES_BAND[mode];
  findings.section(`Series (${mode} mode, ${colors.length} slots, surface ${surface})`);
  if (reportNonColors(findings, 'Slots filled', colors.map((color, i) => [`--c${i + 1}`, color]))) return false;
  let passes = true;

  const outsideBand = colors.filter((color) => !isWithin(oklab(color).L, band));
  passes &&= !outsideBand.length;
  findings.line('Lightness band', verdict(!outsideBand.length), outsideBand.length
    ? `outside L ${band[0]}–${band[1]}: ` + outsideBand.map((color) => `${color} ${oklab(color).L.toFixed(3)}`).join(', ')
    : `all within L ${band[0]}–${band[1]}`);

  const greyColors = colors.filter((color) => chroma(color) < CHROMA_FLOOR);
  passes &&= !greyColors.length;
  findings.line('Chroma floor', verdict(!greyColors.length), greyColors.length
    ? 'reads as grey: ' + greyColors.map((color) => `${color} ${chroma(color).toFixed(3)}`).join(', ')
    : `all >= ${CHROMA_FLOOR}`);

  if (colors.length > 1) {
    const worst = closestAdjacentPair(colors);
    passes &&= worst.distance >= ADJACENT_DE_MIN;
    findings.line('Adjacent separation', verdict(worst.distance >= ADJACENT_DE_MIN),
      `worst pair ${worst.pair} ΔE ${worst.distance.toFixed(1)}` + (worst.distance < ADJACENT_DE_MIN ? ` (floor ${ADJACENT_DE_MIN})` : ''));
  }

  const lowContrastColors = colors.filter((color) => contrast(color, surface) < MARKER_MIN);
  findings.line('Contrast on the surface', lowContrastColors.length ? 'WARN' : 'PASS', lowContrastColors.length
    ? 'below 3:1, needs a visible label or a table: ' + lowContrastColors.map((color) => `${color} ${contrast(color, surface).toFixed(2)}`).join(', ')
    : 'all >= 3:1');

  return passes;
}

function closestAdjacentPair(colors) {
  let worst = { distance: Infinity, pair: '' };
  for (let i = 1; i < colors.length; i++) {
    const distance = deltaE(colors[i - 1], colors[i]);
    if (distance < worst.distance) worst = { distance, pair: `${colors[i - 1]}↔${colors[i]}` };
  }
  return worst;
}

// The first step where --on-hi beats --on-lo. The same rule serves a ramp that falls
// (light mode) and one that rises (dark mode).
function measureFlip(colors, onLo, onHi) {
  const index = colors.findIndex((color) => contrast(color, onHi) > contrast(color, onLo));
  return index === -1 ? colors.length : index;
}

export function checkRamp(findings, colors, rises, onLo, onHi) {
  findings.section(`Sequential ramp (${colors.length} steps, lightness ${rises ? 'rising' : 'falling'})`);
  if (reportNonColors(findings, 'Steps filled', colors.map((color, i) => [`--h${i}`, color]))) return false;
  let previousL = rises ? -Infinity : Infinity, isMonotonic = true;
  colors.forEach((color) => {
    const L = oklab(color).L;
    if (rises ? L <= previousL : L >= previousL) isMonotonic = false;
    previousL = L;
  });
  findings.line('Monotonic lightness', verdict(isMonotonic), isMonotonic
    ? `${rises ? 'rises' : 'falls'} at every step`
    : `a step is not ${rises ? 'lighter' : 'darker'} than the one before`);

  findings.note(`--on-flip: ${measureFlip(colors, onLo, onHi)}   (first step where --on-hi wins)`);
  colors.forEach((color, i) => {
    const onLoRatio = contrast(color, onLo), onHiRatio = contrast(color, onHi);
    findings.note(`  h${i} ${color}  L ${oklab(color).L.toFixed(3)}  --on-lo ${onLoRatio.toFixed(2)} | --on-hi ${onHiRatio.toFixed(2)}` +
      `  -> ${onHiRatio > onLoRatio ? '--on-hi' : '--on-lo'}`);
  });
  return isMonotonic;
}

function checkContract(findings, vars) {
  const missing = CONTRACT_TOKENS.filter((name) => !(name in vars));
  const notColors = CONTRACT_COLOR_TOKENS.filter((name) => name in vars && !isHex(vars[name]));
  const isComplete = !missing.length && !notColors.length;
  findings.line('Contract tokens', verdict(isComplete), isComplete ? 'every token present'
    : [missing.length && `missing ${missing.join(', ')}`, notColors.length && `not a colour ${notColors.map((name) => `${name} ${vars[name]}`).join(', ')}`]
      .filter(Boolean).join('; ') + ' (theme.mjs fill adds each of them but --bg and --ink)');
  return isComplete;
}

const hasColors = (vars, names) => names.every((name) => isHex(vars[name] ?? ''));

function checkInks(findings, vars, surface, mode) {
  findings.section(`Text on the page (${mode} mode, surface ${surface})`);
  let passes = checkContract(findings, vars);
  for (const [name, target] of Object.entries(INK_TARGETS)) {
    if (!hasColors(vars, [name])) continue;
    const ratio = contrast(vars[name], surface);
    passes &&= ratio >= target;
    findings.line(name, verdict(ratio >= target), `${vars[name]}  ${ratio.toFixed(2)}:1  (minimum ${target})`);
  }
  return passes;
}

function checkSurfaces(findings, vars, mode) {
  const surface = vars['--bg'];
  findings.section(`Surfaces, rules and tints (${mode} mode)`);
  let passes = true;
  for (const [text, background, target] of PAIRS) {
    if (!hasColors(vars, [text, background])) continue;
    const ratio = contrast(vars[text], vars[background]);
    passes &&= ratio >= target;
    findings.line(`${text} on ${background}`, verdict(ratio >= target), `${ratio.toFixed(2)}:1  (minimum ${target})`);
  }

  if (hasColors(vars, ['--line', '--line-strong'])) {
    const strongRule = contrast(vars['--line-strong'], surface), hairline = contrast(vars['--line'], surface);
    const linesPass = strongRule >= LINE_STRONG_MIN && strongRule > hairline;
    passes &&= linesPass;
    findings.line('--line-strong', verdict(linesPass), `${strongRule.toFixed(2)}:1 on the page, --line ${hairline.toFixed(2)}:1` +
      `  (minimum ${LINE_STRONG_MIN} and above --line)`);
  }

  if (hasColors(vars, ['--other'])) {
    const other = vars['--other'];
    const otherPasses = chroma(other) < CHROMA_FLOOR && contrast(other, surface) >= OTHER_MIN;
    passes &&= otherPasses;
    findings.line('--other', verdict(otherPasses), `${other} chroma ${chroma(other).toFixed(3)} (below ${CHROMA_FLOOR}),` +
      ` ${contrast(other, surface).toFixed(2)}:1 on the page (minimum ${OTHER_MIN})`);
  }

  const span = parseFloat(vars['--heat-span']);
  if (Number.isNaN(span) || span <= 0) {
    findings.line('--heat-span', 'FAIL', `${vars['--heat-span'] ?? 'missing'}: needs a percentage above 0%, or the colour grid shows no colour`);
    return false;
  }
  if (hasColors(vars, ['--c1', '--panel', '--ink'])) {
    const cell = strongestCell(vars), ratio = contrast(vars['--ink'], cell);
    passes &&= ratio >= 4.5;
    findings.line('--heat-span', verdict(ratio >= 4.5), `${span}%: --ink (value and unit) on the strongest cell ${cell} ${ratio.toFixed(2)}:1 (minimum 4.5)`);
  }
  return passes;
}

function checkThemeRamp(findings, vars, mode) {
  const ramp = RAMP_TOKENS.map((name) => vars[name]);
  const onLo = vars['--on-lo'], onHi = vars['--on-hi'];
  let passes = checkRamp(findings, ramp, mode === 'dark', onLo, onHi);
  if (!passes || !hasColors(vars, ['--on-lo', '--on-hi'])) return false;
  const measured = measureFlip(ramp, onLo, onHi);
  const declared = vars['--on-flip'];
  if (+declared !== measured) {
    findings.line('--on-flip', 'FAIL', `declared ${declared ?? 'nothing'}, measured ${measured}`);
    passes = false;
  }
  return passes;
}

function checkMode(findings, mode, vars) {
  findings.section(`=== ${mode} mode ===`);
  const surface = vars['--bg'];
  if (!isHex(surface ?? '')) { findings.line('--bg', 'FAIL', 'missing or not a colour'); return false; }
  let passes = true;
  if ((mode === 'dark') !== isDarkSurface(surface)) {
    findings.line('--bg', 'FAIL', `${surface} is not a ${mode} surface`);
    passes = false;
  }
  passes = checkInks(findings, vars, surface, mode) && passes;
  passes = checkSurfaces(findings, vars, mode) && passes;
  passes = checkSeries(findings, SERIES_TOKENS.map((name) => vars[name]), surface, mode) && passes;
  passes = checkThemeRamp(findings, vars, mode) && passes;
  return passes;
}

function divergences(blocks) {
  const [first, ...rest] = blocks;
  const names = new Set(blocks.flatMap((block) => Object.keys(block)));
  return [...names].filter((name) => rest.some((block) => block[name] !== first[name]));
}

/* ---------- reading and writing a theme block ---------- */
export const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;

function declarationsOf(css) {
  const declarations = {};
  for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) declarations[name] = value.trim();
  return declarations;
}

function matchingBrace(css, open) {
  let depth = 0;
  for (let at = open; at < css.length; at++) {
    if (css[at] === '{') depth++;
    else if (css[at] === '}' && --depth === 0) return at;
  }
  return css.length;
}

// Every style rule of a theme block's body, with the @media it sits in, the `color-scheme`
// it declares and its custom properties.
function themeRules(blockBody, media = null) {
  const css = blockBody.replace(CSS_COMMENT, '');
  const rules = [];
  let at = 0;
  for (let open = css.indexOf('{'); open !== -1; open = css.indexOf('{', at)) {
    const prelude = css.slice(at, open).trim();
    const close = matchingBrace(css, open);
    const body = css.slice(open + 1, close);
    if (prelude.startsWith('@media')) rules.push(...themeRules(body, prelude.slice('@media'.length).trim()));
    else rules.push({ media, selector: prelude, scheme: body.match(/color-scheme\s*:\s*(light|dark)\s*;/)?.[1], vars: declarationsOf(body) });
    at = close + 1;
  }
  return rules;
}

// The custom properties of each mode, read from every rule that declares the mode's
// `color-scheme`, whatever its selector: what fill reads a theme from.
export function blocksByMode(blockBody) {
  const rules = themeRules(blockBody);
  return Object.fromEntries(MODES.map((mode) => [mode, rules.filter((rule) => rule.scheme === mode).map((rule) => rule.vars)]));
}

const normalized = (text) => (text ?? '').replace(/\s+/g, '').replace(/'/g, '"');
const ruleName = ({ media, selector }) => (media ? `${selector} inside @media ${media}` : selector);

// Whether the block holds exactly the three rules themeBlock writes, each declaring its
// mode; the custom properties of each of them by mode, for the mode checks.
function checkThemeRules(findings, rules) {
  findings.section('=== theme rules ===');
  const keyOf = (rule) => `${normalized(rule.media)}|${normalized(rule.selector)}`;
  const problems = [];
  const byMode = { light: [], dark: [] };
  for (const expected of THEME_RULES) {
    const found = rules.filter((rule) => keyOf(rule) === keyOf(expected));
    if (!found.length) problems.push(`missing ${ruleName(expected)}`);
    else if (found.length > 1) problems.push(`${ruleName(expected)} appears ${found.length} times`);
    else if (found[0].scheme !== expected.mode) problems.push(`${ruleName(expected)} declares color-scheme: ${found[0].scheme ?? 'nothing'}, not ${expected.mode}`);
    else byMode[expected.mode].push(found[0].vars);
  }
  const expectedKeys = new Set(THEME_RULES.map(keyOf));
  for (const rule of rules.filter((candidate) => !expectedKeys.has(keyOf(candidate)))) problems.push(`stray rule ${ruleName(rule)}`);
  findings.line('Theme rules', verdict(!problems.length), problems.length
    ? `${problems.join('; ')} (a theme block holds exactly the three rules theme.mjs derive writes)`
    : 'the light rule and the two dark rules, each once');
  return { passes: !problems.length, byMode };
}

// Checks the three rules of a theme block and both of its modes; true when every check passes.
export function checkTheme(findings, blockBody) {
  const { passes: rulesPass, byMode } = checkThemeRules(findings, themeRules(blockBody));
  let passes = rulesPass;
  for (const mode of MODES) {
    const blocks = byMode[mode];
    if (!blocks.length) {
      findings.section(`=== ${mode} mode ===`);
      findings.line(`${mode} mode`, 'FAIL', `the ${mode} mode is missing: every report carries both modes (see references/themes.md)`);
      passes = false;
      continue;
    }
    passes = checkMode(findings, mode, blocks[0]) && passes;
    const differentTokens = divergences(blocks);
    if (differentTokens.length) {
      findings.line('Theme blocks', 'FAIL', `the ${mode} rules differ in: ${differentTokens.join(', ')}`);
      passes = false;
    }
  }
  return passes;
}

function declarationLines(vars, indent) {
  const known = new Set(TOKEN_LINES.flat());
  const lines = TOKEN_LINES.map((names) => names.filter((name) => name in vars).map((name) => `${name}:${vars[name]};`).join(' '));
  const extra = Object.keys(vars).filter((name) => !known.has(name)).map((name) => `${name}:${vars[name]};`).join(' ');
  return [...lines, extra].filter(Boolean).map((line) => indent + line).join('\n');
}

function ruleText({ mode, media, selector }, vars) {
  const indent = media ? '  ' : '';
  const rule = `${indent}${selector}{\n${indent}  color-scheme: ${mode};\n${declarationLines(vars, `${indent}  `)}\n${indent}}`;
  return media ? `@media ${media}{\n${rule}\n}` : rule;
}

export const themeBlock = (light, dark) =>
  ['/* THEME */', ...THEME_RULES.map((rule) => ruleText(rule, rule.mode === 'light' ? light : dark)), '/* /THEME */'].join('\n');

/* ---------- the tokens derive and fill share ---------- */
export const DARK_SURFACE = '#161615';
// The hue of each status; it moves along lightness until it reads on its own tint.
const STATUS_HUES = { '--pos': '#1f9d55', '--neg': '#d03b3b', '--warn': '#b26a00' };
// Where the soft tints sit: a fixed lightness in the light mode, a step above the surface in the dark.
const LIGHT_TINT = { L: 0.955, chroma: 0.035 };
const DARK_TINT = { step: 0.09, chroma: 0.045 };
const tintLightness = (surface) => (isDarkSurface(surface) ? oklab(surface).L + DARK_TINT.step : LIGHT_TINT.L);
const tintChroma = (surface) => (isDarkSurface(surface) ? DARK_TINT.chroma : LIGHT_TINT.chroma);
const usualTint = (hue, surface) => tint(hue, tintLightness(surface), tintChroma(surface));

const MARGIN = 0.1;

// The steps of the page: in the light mode the brand hue at near-grey chroma, below the
// surface; in the dark mode the surface itself, lightened. `share` scales the step.
const recessFor = (surface, brand, share = 1) =>
  (isDarkSurface(surface) ? lighten(surface, 0.025 * share) : tint(brand, oklab(surface).L - 0.035 * share, 0.006));
const hairlineFor = (surface, brand) =>
  (isDarkSurface(surface) ? lighten(surface, 0.13) : tint(brand, oklab(surface).L - 0.1, 0.008));
// `candidate` when it reaches `minimum` on the page, else the step of its hue that just does:
// near a black page a fixed lightness step shows too little.
const reaching = (candidate, surface, minimum) =>
  (contrast(candidate, surface) >= minimum ? candidate : adjustTo(candidate, [[surface, minimum + MARGIN]]));
// Stronger than `hairline` on the page and at least LINE_STRONG_MIN.
function strongRuleFor(surface, brand, hairline) {
  const isDarkMode = isDarkSurface(surface);
  const strongRule = isDarkMode ? lighten(surface, 0.22) : tint(brand, oklab(surface).L - 0.2, 0.012);
  const strongerRule = contrast(strongRule, surface) > contrast(hairline, surface) ? strongRule : lighten(hairline, isDarkMode ? 0.08 : -0.08);
  return reaching(strongerRule, surface, LINE_STRONG_MIN);
}
const otherFor = (surface, brand) => reaching(tint(brand, oklab(surface).L + (isDarkSurface(surface) ? 0.28 : -0.22), 0.01), surface, OTHER_MIN);
// The step of a status hue that clears 4.5:1 on its usual tint and on the page.
const statusFor = (hue, surface) => adjustTo(hue, [[usualTint(hue, surface), 4.5 + MARGIN], [surface, 4.5 + MARGIN]]);

// The largest share of --c1 the strongest grid cell can take with --ink still at 4.5:1 over
// it; 0 when no share clears it.
function heatSpanFor(c1, panel, ink) {
  for (let span = HEAT_SPAN_MAX; span > 0; span--) {
    if (contrast(ink, mix(c1, panel, HEAT_BASE + span / 100)) >= 4.5) return span;
  }
  return 0;
}

// The pairs a token has to satisfy as a background, with the theme's current values.
const passesAsBackground = (vars, background, candidate) =>
  PAIRS.filter(([text, bg]) => bg === background && isHex(vars[text] ?? ''))
    .every(([text, , target]) => contrast(vars[text], candidate) >= target);

// A soft background in the hue of `hue`, from its usual lightness toward the page until
// every text drawn on it passes; the usual tint when none does, for check to report.
function softTintFor(vars, token, hue) {
  const surface = vars['--bg'];
  const start = tintLightness(surface), end = oklab(surface).L, startChroma = tintChroma(surface);
  for (let i = 0; i <= 40; i++) {
    const candidate = tint(hue, start + (end - start) * i / 40, startChroma * (1 - i / 40));
    if (passesAsBackground(vars, token, candidate)) return candidate;
  }
  return usualTint(hue, surface);
}

// The recess, stepped back toward the page until every text drawn on it passes.
function fittedRecess(vars, brand) {
  for (let i = 0; i <= 20; i++) {
    const candidate = recessFor(vars['--bg'], brand, 1 - i / 20);
    if (passesAsBackground(vars, '--recess', candidate)) return candidate;
  }
  return vars['--bg'];
}

/* ---------- derive ---------- */
// The derived theme cannot be made for these inputs; the message says which and why.
export class ThemeError extends Error {}

// Contrast on the page that derive aims for, above the contract's minimum, so the ink
// reads as ink and not as a dark grey.
const INK_AIMS = { '--ink': 13, '--muted': 6.5, '--faint': 5.0 };

// Every [surface, minimum] a text token is checked on, with a small margin, from the
// theme's current backgrounds: the page with INK_AIMS or INK_TARGETS, and every pair.
function requirementsFor(token, vars) {
  const onPage = INK_AIMS[token] ?? INK_TARGETS[token];
  return [
    ...(onPage ? [[vars['--bg'], onPage + MARGIN]] : []),
    ...PAIRS.filter(([text, background]) => text === token && isHex(vars[background] ?? ''))
      .map(([, background, target]) => [vars[background], target + MARGIN]),
  ];
}

function statusColors(surface) {
  return Object.fromEntries(Object.entries(STATUS_HUES).flatMap(([name, hue]) =>
    [[name, statusFor(hue, surface)], [`${name}-soft`, usualTint(hue, surface)]]));
}

// Ink and the greys are the brand hue held at low chroma, so the page feels like the brand
// without any of them competing with a data series for attention. Each is fitted against
// every surface it is checked on, so the surfaces come first; then the recess and the tints
// step toward the page until the inks read on them.
function withInks(vars, brand, chosenInk) {
  const ink = chosenInk || adjustTo(brand, requirementsFor('--ink', vars), 0.18);
  const withInk = { ...vars, '--ink': ink };
  const inked = {
    ...withInk,
    '--muted': adjustTo(ink, requirementsFor('--muted', withInk)),
    '--faint': adjustTo(ink, requirementsFor('--faint', withInk)),
  };
  const fitted = { ...inked, '--recess': fittedRecess(inked, brand) };
  fitted['--accent-soft'] = softTintFor(fitted, '--accent-soft', brand);
  fitted['--mark'] = softTintFor(fitted, '--mark', brand);
  for (const [status, hue] of Object.entries(STATUS_HUES)) fitted[`${status}-soft`] = softTintFor(fitted, `${status}-soft`, hue);
  return fitted;
}

// Each text token under its minimum on the page or on a background it is drawn on.
function failingPairs(vars) {
  return [...Object.entries(INK_TARGETS).map(([text, target]) => [text, '--bg', target]), ...PAIRS]
    .map(([text, background, target]) => ({ text, background, target, ratio: contrast(vars[text], vars[background]) }))
    .filter(({ ratio, target }) => ratio < target)
    .map(({ text, background, target, ratio }) => `${text} on ${background} ${ratio.toFixed(2)}:1 (minimum ${target})`);
}

// --accent-soft is the soft tint of the brand hue, and --accent is the brand when it clears
// 4.5:1 on it and on the page, otherwise the step of the brand hue nearest the brand that does.
function accentPair(brand, surface, mode, notes) {
  const accentSoft = usualTint(brand, surface);
  const requirements = [[accentSoft, 4.5 + MARGIN], [surface, 4.5 + MARGIN]];
  const accent = clearsAll(brand, requirements) ? brand : adjustTo(brand, requirements);
  if (accent !== brand) {
    notes.push(`${mode}: --accent is ${accent}, the step of the brand hue nearest ${brand} that reaches 4.5:1 on the page and on --accent-soft; ${brand} gives ${ratioText(brand, surface)}.`);
  }
  return { accent, accentSoft };
}

const ratioText = (color, surface) => `${contrast(color, surface).toFixed(2)}:1 on ${surface}`;

// --brand marks without text (list bullets, the index's current entry, the selected tab), so
// it clears 3:1 on the page: the brand colour when it does, else the step of its hue nearest it.
function brandMark(brand, surface, mode, notes) {
  const mark = nearestStep(brand, [[surface, MARKER_MIN]]) ?? adjustTo(brand, [[surface, MARKER_MIN]]);
  if (mark !== brand) notes.push(`${mode}: --brand is ${mark}, the step of the brand hue nearest ${brand} that reaches ${MARKER_MIN}:1; ${brand} gives ${ratioText(brand, surface)}.`);
  return mark;
}

// --c1, the first series colour: the step of the brand hue nearest the brand inside the mode's
// series band that reaches 3:1 on the page, or the neutral theme's --c1 when the brand reads grey.
function firstSeriesColor(brand, surface, mode, neutralC1, notes) {
  if (chroma(brand) < CHROMA_FLOOR) {
    notes.push(`${mode}: --c1 is the neutral theme's ${neutralC1}: ${brand} has chroma ${chroma(brand).toFixed(3)}, under the ${CHROMA_FLOOR} a series colour needs to read as a colour.`);
    return neutralC1;
  }
  const band = SERIES_BAND[mode];
  const step = nearestStep(brand, [[surface, MARKER_MIN]], band);
  if (step && chroma(step) >= CHROMA_FLOOR) {
    if (step !== brand) {
      notes.push(`${mode}: --c1 is ${step}, the step of the brand hue nearest ${brand} inside the series band L ${band.join('–')} that reaches ${MARKER_MIN}:1; ` +
        `${brand} has L ${oklab(brand).L.toFixed(3)} and gives ${ratioText(brand, surface)}.`);
    }
    return step;
  }
  notes.push(`${mode}: --c1 is the neutral theme's ${neutralC1}: no step of ${brand}'s hue inside the series band L ${band.join('–')} reaches ${MARKER_MIN}:1 on ${surface} as a colour.`);
  return neutralC1;
}

const placeholderSeries = (c1) => Object.fromEntries(SERIES_TOKENS.map((name, i) => [name, i ? '?' : c1]));

function deriveLight(brand, surface, chosenInk, neutralC1, notes) {
  const { accent, accentSoft } = accentPair(brand, surface, 'light', notes);
  const hairline = hairlineFor(surface, brand);
  const vars = withInks({
    '--bg': surface, '--panel': surface, '--recess': recessFor(surface, brand),
    '--line': hairline, '--line-strong': strongRuleFor(surface, brand, hairline),
    '--accent': accent, '--accent-soft': accentSoft, '--brand': brandMark(brand, surface, 'light', notes), '--mark': accentSoft,
    ...statusColors(surface),
  }, brand, chosenInk);
  const ink = vars['--ink'];
  const c1 = firstSeriesColor(brand, surface, 'light', neutralC1, notes);

  // Sequential ramp: one hue, from near the surface to the ink, the chroma rising then settling.
  const brandLab = oklab(brand), inkLab = oklab(ink);
  const ramp = RAMP_TOKENS.map((_, i) => {
    if (i === RAMP_TOKENS.length - 1) return ink;
    const t = i / (RAMP_TOKENS.length - 1);
    const L = 0.94 - t * (0.94 - inkLab.L);
    const chromaScale = Math.sin(Math.PI * t * 0.75) * 0.9 + 0.15;   // fade the chroma toward the ink
    return oklabToHex({ L, a: brandLab.a * chromaScale, b: brandLab.b * chromaScale });
  });
  const onHi = '#ffffff';
  return {
    ...vars,
    ...placeholderSeries(c1),
    '--other': otherFor(surface, brand), '--heat-span': `${heatSpanFor(c1, surface, ink)}%`,
    ...Object.fromEntries(ramp.map((color, i) => [RAMP_TOKENS[i], color])),
    '--on-lo': ink, '--on-hi': onHi, '--on-flip': String(measureFlip(ramp, ink, onHi)),
  };
}

function deriveDark(brand, surface, neutralC1, notes) {
  const { accent, accentSoft } = accentPair(brand, surface, 'dark', notes);
  const panel = lighten(surface, 0.05);
  const hairline = hairlineFor(surface, brand);
  const vars = withInks({
    '--bg': surface, '--panel': panel, '--recess': recessFor(surface, brand),
    '--line': hairline, '--line-strong': strongRuleFor(surface, brand, hairline),
    '--accent': accent, '--accent-soft': accentSoft, '--brand': brandMark(brand, surface, 'dark', notes), '--mark': accentSoft,
    ...statusColors(surface),
  }, brand);
  const ink = vars['--ink'];
  const c1 = firstSeriesColor(brand, surface, 'dark', neutralC1, notes);

  // Sequential ramp: one hue rising from just above the surface to near white, the chroma
  // fading toward both ends.
  const brandLab = oklab(brand);
  const bottom = oklab(surface).L + 0.07, top = 0.90;
  const ramp = RAMP_TOKENS.map((_, i) => {
    const t = i / (RAMP_TOKENS.length - 1);
    const chromaScale = Math.sin(Math.PI * t) * 0.8 + 0.15;
    return oklabToHex({ L: bottom + t * (top - bottom), a: brandLab.a * chromaScale, b: brandLab.b * chromaScale });
  });
  return {
    ...vars,
    ...placeholderSeries(c1),
    '--other': otherFor(surface, brand), '--heat-span': `${heatSpanFor(c1, panel, ink)}%`,
    ...Object.fromEntries(ramp.map((color, i) => [RAMP_TOKENS[i], color])),
    '--on-lo': ink, '--on-hi': surface, '--on-flip': String(measureFlip(ramp, ink, surface)),
  };
}

// The pages derive makes a mode on: from these OKLab lightnesses the ink, the tints and the
// statuses all reach their contrast.
const LIGHT_PAGE_MIN = 0.77;
const DARK_PAGE_MAX = 0.28;

function refuseUnusablePages(surface, surfaceDark) {
  const surfaceLightness = oklab(surface).L, darkLightness = oklab(surfaceDark).L;
  if (surfaceLightness < LIGHT_PAGE_MIN) {
    throw new ThemeError(`--surface ${surface} has OKLab lightness ${surfaceLightness.toFixed(2)}; derive makes the light mode on a page of ${LIGHT_PAGE_MIN} or more.`);
  }
  if (darkLightness > DARK_PAGE_MAX) {
    throw new ThemeError(`--surface-dark ${surfaceDark} has OKLab lightness ${darkLightness.toFixed(2)}; derive makes the dark mode on a page of ${DARK_PAGE_MAX} or less.`);
  }
}

// Both modes from a brand colour, with --c2..--c6 left as '?'. `neutral` is the neutral
// theme by mode, as blocksByMode reads it: its --c1 stands in for a brand that reads grey.
// `notes` says each of --brand, --accent and --c1 that is not the brand colour, and why.
// Throws ThemeError for a page outside the lightness derive works on, when no --heat-span
// lets the ink read on the strongest grid cell, or when a text token fails on every step of
// a background it is drawn on, which a chosen --ink can cause.
export function deriveTheme({ brand, ink, surface = '#ffffff', surfaceDark = DARK_SURFACE, neutral }) {
  refuseUnusablePages(surface, surfaceDark);
  const notes = [];
  const light = deriveLight(brand, surface, ink, neutral.light[0]['--c1'], notes);
  const dark = deriveDark(brand, surfaceDark, neutral.dark[0]['--c1'], notes);
  const modesWithoutHeatSpan = MODES.filter((mode) => ({ light, dark })[mode]['--heat-span'] === '0%');
  if (modesWithoutHeatSpan.length) {
    throw new ThemeError(`No --heat-span lets --ink read on the strongest colour-grid cell in the ${modesWithoutHeatSpan.join(' and ')} mode. ` +
      'Choose another --ink or --surface, or a brand of another lightness.');
  }
  for (const [mode, vars] of Object.entries({ light, dark })) {
    const failures = failingPairs(vars);
    if (failures.length) {
      throw new ThemeError(`With --ink ${vars['--ink']}, these pairs of the ${mode} mode stay under their minimum: ${failures.join('; ')}. ` +
        'Choose another --ink or --surface.');
    }
  }
  return { light, dark, notes };
}

function* permutations(items) {
  if (items.length <= 1) { yield items; return; }
  for (let i = 0; i < items.length; i++) {
    for (const rest of permutations([...items.slice(0, i), ...items.slice(i + 1)])) yield [items[i], ...rest];
  }
}

// --c2..--c6 of a mode from the series of another theme's same mode (the neutral theme):
// every slot but the one whose hue is closest to this mode's --c1, in the order that keeps
// the closest adjacent pair furthest apart; the source order wins a tie.
export function completeSeries(vars, sourceVars) {
  const c1 = vars['--c1'];
  const source = SERIES_TOKENS.map((name) => sourceVars[name]);
  const closestHueIndex = source.reduce((best, color, i) => (hueDistance(color, c1) < hueDistance(source[best], c1) ? i : best), 0);
  const rest = source.filter((_, i) => i !== closestHueIndex);
  let bestOrder = rest, bestDistance = -Infinity;
  for (const order of permutations(rest)) {
    const { distance } = closestAdjacentPair([c1, ...order]);
    if (distance > bestDistance) { bestOrder = order; bestDistance = distance; }
  }
  return { ...vars, ...Object.fromEntries(SERIES_TOKENS.slice(1).map((name, i) => [name, bestOrder[i]])) };
}

/* ---------- fill ---------- */

// One mode with every missing token added and every existing value kept. Throws when the
// mode lacks what the rest is computed from. `added` lists each token added, with its value.
function fillMode(source, mode) {
  const vars = { ...source };
  const added = [];
  const surface = vars['--bg'];
  const brand = vars['--brand'] ?? vars['--accent'];
  if (!isHex(surface ?? '') || !isHex(brand ?? '') || !isHex(vars['--ink'] ?? '')) {
    throw new ThemeError(`The ${mode} mode needs --bg, --ink and --brand (or --accent) before the rest can be filled.`);
  }
  const isDarkMode = isDarkSurface(surface);
  const addMissing = (name, compute) => {
    if (name in vars) return;
    vars[name] = compute();
    added.push(`${mode}: added ${name}:${vars[name]}`);
  };

  addMissing('--brand', () => brand);
  addMissing('--panel', () => surface);
  addMissing('--line', () => hairlineFor(surface, brand));
  addMissing('--line-strong', () => strongRuleFor(surface, brand, vars['--line']));
  addMissing('--accent-soft', () => softTintFor(vars, '--accent-soft', brand));
  addMissing('--accent', () => adjustTo(brand, requirementsFor('--accent', vars)));
  addMissing('--mark', () => softTintFor(vars, '--mark', brand));
  addMissing('--muted', () => adjustTo(vars['--ink'], requirementsFor('--muted', vars)));
  addMissing('--faint', () => adjustTo(vars['--ink'], requirementsFor('--faint', vars)));
  addMissing('--recess', () => fittedRecess(vars, brand));
  for (const status of Object.keys(STATUS_HUES)) {
    const hue = vars[status] ?? STATUS_HUES[status];
    addMissing(status, () => statusFor(hue, surface));
    addMissing(`${status}-soft`, () => softTintFor(vars, `${status}-soft`, hue));
  }
  addMissing('--other', () => otherFor(surface, brand));
  addMissing('--heat-span', () => {
    const span = isHex(vars['--c1'] ?? '') ? heatSpanFor(vars['--c1'], vars['--panel'], vars['--ink']) : 0;
    if (!span) throw new ThemeError(`The ${mode} mode has no --heat-span at which --ink reads on the strongest grid cell; check --c1 and --panel.`);
    return `${span}%`;
  });
  addMissing('--on-lo', () => vars['--ink']);
  addMissing('--on-hi', () => (isDarkMode ? surface : '#ffffff'));
  const ramp = RAMP_TOKENS.map((name) => vars[name]);
  if (ramp.every((color) => isHex(color ?? ''))) addMissing('--on-flip', () => String(measureFlip(ramp, vars['--on-lo'], vars['--on-hi'])));
  return { vars, added };
}

// Both modes with every missing token added; the series and the ramp are judgement and stay
// as they are. Throws ThemeError when a mode is missing, when the rules of a mode differ, or
// when a mode lacks --bg, --ink and --brand (or --accent).
export function fillTheme(byMode) {
  const missingModes = MODES.filter((mode) => !byMode[mode].length);
  if (missingModes.length) throw new ThemeError(`The theme lacks the ${missingModes.join(' and ')} mode; fill completes a theme that has both.`);
  for (const mode of MODES) {
    const differentTokens = divergences(byMode[mode]);
    if (differentTokens.length) {
      throw new ThemeError(`The ${mode} rules differ in ${differentTokens.join(', ')}; make them identical, then fill.`);
    }
  }
  const lightFill = fillMode(byMode.light[0], 'light'), darkFill = fillMode(byMode.dark[0], 'dark');
  return { light: lightFill.vars, dark: darkFill.vars, added: [...lightFill.added, ...darkFill.added] };
}
