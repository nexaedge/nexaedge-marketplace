import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { BuildError, CONTENT_SECURITY_POLICY, buildReport, fontCoverage, settleMathFont } from '../../skills/html-report/scripts/build.mjs';
import { THEME_BLOCK, checkTheme, newFindings } from '../../skills/html-report/scripts/theme-rules.mjs';

const SKILL = fileURLToPath(new URL('../../skills/html-report/', import.meta.url));
const BUILD_COMMAND = path.join(SKILL, 'scripts/build.mjs');
const COVERAGE = fontCoverage();
const page = (body, head = '') => `<!DOCTYPE html><html><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
const needsMath = (html) => settleMathFont(html, COVERAGE).needsMath;
const MATH_FACE = /@font-face\{font-family:'STIX Two Math'/;
const NEUTRAL_CSS = fs.readFileSync(path.join(SKILL, 'assets/theme-neutral.css'), 'utf8');
// The neutral theme with one series colour changed, to tell a swapped theme from the draft's.
const OTHER_THEME_CSS = NEUTRAL_CSS.replace('--c2:#eb6834', '--c2:#eb6835');
const OTHER_THEME_BLOCK = OTHER_THEME_CSS.match(THEME_BLOCK)[0];
const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex');

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'html-report-build-'));
after(() => fs.rmSync(workspace, { recursive: true, force: true }));

// A draft in a folder of its own, with `files` beside it; returns the draft's path.
function draftWith(name, html, files = {}) {
  const folder = path.join(workspace, name);
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(folder, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(folder, relativePath), content);
  }
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, 'draft.html'), html);
  return path.join(folder, 'draft.html');
}
const themedDraft = (head = '', body = '<p>Texto.</p>') => page(body, `<link rel="stylesheet" href="theme-neutral.css">${head}`);
const assertRefuses = (draft, message) =>
  assert.throws(() => buildReport(draft), (error) => error instanceof BuildError && message.test(error.message));
const runBuild = (args, env = {}) => spawnSync(process.execPath, [BUILD_COMMAND, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

describe('deciding whether a report carries the math font', () => {
  it('keeps it for a formula block', () => {
    assert.equal(needsMath(page('<div class="box formula"><p>M = J − C</p></div>')), true);
  });

  it('keeps it for a <math> element', () => {
    assert.equal(needsMath(page('<p><math><mi>x</mi></math></p>')), true);
  });

  it('drops it for a class that only contains the word formula', () => {
    assert.equal(needsMath(page('<div class="no-formula"><p>Texto.</p></div>')), false);
  });

  it('keeps it for a Greek letter in the prose', () => {
    assert.equal(needsMath(page('<p>A volatilidade σ do ativo.</p>')), true);
  });

  it('keeps it for a Greek letter written as an entity', () => {
    assert.equal(needsMath(page('<p>O &beta; da ação.</p>')), true);
  });

  it('drops it for entities every text face draws', () => {
    assert.equal(needsMath(page('<p>De 1&ndash;2 dias &mdash; R$&nbsp;10</p>')), false);
  });

  it('keeps it for a character a CSS escape names', () => {
    assert.equal(needsMath(page('<p>Texto.</p>', '<style>.x::after{content:"\\3c3"}</style>')), true);
  });

  it('keeps it for a character in a script string next to a // that is not a comment', () => {
    assert.equal(needsMath(page('<p>Texto.</p><script>const url = "http://x"; const label = `σ ${"//"}`;</script>')), true);
  });

  it('drops it for a character only inside an HTML comment', () => {
    assert.equal(needsMath(page('<!-- σ --><p>Texto.</p>')), false);
  });

  it('drops it for a character only inside a CSS comment', () => {
    assert.equal(needsMath(page('<p>Texto.</p>', '<style>/* σ → */ p{color:red}</style>')), false);
  });

  it('drops it for a character only inside JavaScript comments', () => {
    const script = '<script>// σ\nconst a = 1; /* → */ const b = `${a ? `x` : \'y\'}`; const r = /"/g;\n// ≈\n</script>';
    assert.equal(needsMath(page(`<p>Texto.</p>${script}`)), false);
  });

  it('warns about a character no embedded font has', () => {
    const { warnings } = settleMathFont(page('<p>ᵢ</p>'), COVERAGE);
    assert.ok(warnings.some((warning) => warning.includes('U+1D62')));
  });

  it('drops it for a character in a comment after a postfix increment and a division', () => {
    assert.equal(needsMath(page('<p>Texto.</p><script>let a = 1; const b = a++ / 2 // σ\n;</script>')), false);
  });

  it('drops it for a character in a comment after a regular expression that follows a condition', () => {
    assert.equal(needsMath(page('<p>Texto.</p><script>let x, y; if (x) /"/.test(y) // σ\n;</script>')), false);
  });

  it('keeps it for a named character reference the build cannot read, and says so', () => {
    const { needsMath: keeps, warnings } = settleMathFont(page('<p>&frac58; do total</p>'), COVERAGE);
    assert.equal(keeps, true);
    assert.ok(warnings.some((warning) => warning.includes('&frac58;')), warnings.join('\n'));
  });
});

describe('building a draft', () => {
  it('builds the skeleton without the math font and the catalog with it', () => {
    const skeleton = buildReport(path.join(SKILL, 'assets/skeleton.html'));
    const catalog = buildReport(path.join(SKILL, 'assets/catalog.html'));
    assert.equal(skeleton.needsMath, false);
    assert.doesNotMatch(skeleton.html, MATH_FACE);
    assert.equal(catalog.needsMath, true);
    assert.match(catalog.html, MATH_FACE);
  });

  it('writes the same bytes for the same draft', () => {
    const draft = path.join(SKILL, 'assets/catalog.html');
    assert.equal(buildReport(draft).html, buildReport(draft).html);
  });

  it('builds a built report into the same bytes, keeping its own policy', () => {
    const built = buildReport(path.join(SKILL, 'assets/catalog.html')).html;
    const builtDraft = draftWith('rebuild', built);
    assert.equal(buildReport(builtDraft).html, built);
  });

  it('puts the Content-Security-Policy right after the charset', () => {
    const { html } = buildReport(draftWith('policy', themedDraft()));
    assert.ok(html.includes(`<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`));
  });

  it('puts the Content-Security-Policy after the real charset, never inside a comment that names one', () => {
    const draft = `<!DOCTYPE html>\n<!-- <meta charset="utf-8"> -->\n${themedDraft()}`;
    const { html } = buildReport(draftWith('policy-comment', draft));
    assert.ok(html.startsWith('<!DOCTYPE html>\n<!-- <meta charset="utf-8"> -->\n'), html.slice(0, 120));
    assert.ok(html.includes(`<head><meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy"`));
  });

  it('refuses a draft that carries a Content-Security-Policy other than its own', () => {
    const draft = draftWith('own-policy', themedDraft('<meta http-equiv="Content-Security-Policy" content="default-src *">'));
    assertRefuses(draft, /carries a Content-Security-Policy other than the build's/);
  });

  it('swaps the draft\'s theme for the one it is given', () => {
    const { html } = buildReport(draftWith('swap', themedDraft()), { theme: OTHER_THEME_BLOCK });
    assert.ok(html.includes('--c2:#eb6835') && !html.includes('--c2:#eb6834'));
  });

  it('refuses a shared asset linked by a path to a project file', () => {
    const draft = draftWith('by-path', themedDraft('<link rel="stylesheet" href="css/report.css">'), { 'css/report.css': 'p{color:red}' });
    assert.throws(() => buildReport(draft), (error) => error instanceof BuildError && /names the shared asset report\.css by the path/.test(error.message));
  });

  it('refuses a shared asset linked from the parent folder', () => {
    fs.writeFileSync(path.join(workspace, 'report.js'), 'window.x = 1;');
    const draft = draftWith('parent', themedDraft('<script src="../report.js"></script>'));
    assert.throws(() => buildReport(draft), (error) => error instanceof BuildError && /names the shared asset report\.js by the path/.test(error.message));
  });

  it('takes a shared asset linked by a path to the skill\'s own file', () => {
    const folder = path.join(workspace, 'skill-path');
    const relativePath = path.relative(folder, path.join(SKILL, 'assets/report.css'));
    const { html } = buildReport(draftWith('skill-path', themedDraft(`<link rel="stylesheet" href="${relativePath}">`)));
    assert.ok(html.includes(fs.readFileSync(path.join(SKILL, 'assets/report.css'), 'utf8').trim().slice(0, 200)));
  });

  it('keeps an inlined script from opening a comment or closing its element early', () => {
    const code = 'const a = "<!--<script>"; const b = "</script>";';
    const { html } = buildReport(draftWith('script-escape', themedDraft('<script src="app.js"></script>'), { 'app.js': code }));
    const body = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
    assert.equal(body, 'const a = "\\x3C!--\\x3Cscript>"; const b = "\\x3C/script>";');
  });

  it('escapes a script break inside a regular expression, a template and a comment, and spaces one in code', () => {
    const code = 'const scripts = [1, 2]; let i = 0;\nwhile (i<scripts.length) i++;\nconst pattern = /<script/; const text = `</script ${i}`; // </script>\n' +
      'return [i, pattern.test("<script"), text];';
    const { html } = buildReport(draftWith('script-code', themedDraft('<script src="app.js"></script>'), { 'app.js': code }));
    const body = html.match(/<script>\n([\s\S]*?)\n<\/script>/)[1];
    assert.doesNotMatch(body, /<(!--|\/?script)/i);
    assert.ok(body.includes('while (i< scripts.length)'), body);
    assert.deepEqual(new Function(body)(), [2, true, '</script 2']);
  });

  it('keeps an inlined stylesheet from closing its element early', () => {
    const { html } = buildReport(draftWith('style-escape', themedDraft('<link rel="stylesheet" href="extra.css">'),
      { 'extra.css': 'p::after{content:"</style>"}' }));
    assert.ok(html.includes('p::after{content:"<\\/style>"}'));
  });

  it('reads a character reference in an attribute once, so &amp;quot; names a file with &quot; in its name', () => {
    const { html } = buildReport(draftWith('attribute-reference', themedDraft('', '<img src="x&amp;quot;y.png" alt="">'), { 'x&quot;y.png': PNG_BYTES }));
    assert.ok(html.includes(`<img src="data:image/png;base64,${PNG_BYTES.toString('base64')}"`));
  });

  it('embeds every image an image-set() names, and leaves its type() as it is', () => {
    const css = '.a{background:image-set("a.png" 1x, url(b.png) 2x, \'c.png\' type("image/png"))}';
    const { html } = buildReport(draftWith('image-set', themedDraft('<link rel="stylesheet" href="extra.css">'),
      { 'extra.css': css, 'a.png': PNG_BYTES, 'b.png': PNG_BYTES, 'c.png': PNG_BYTES }));
    const data = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;
    assert.ok(html.includes(`.a{background:image-set("${data}" 1x, url(${data}) 2x, '${data}' type("image/png"))}`), html.match(/\.a\{[^}]*\}/)?.[0]);
  });
});

describe('refusing what a report cannot carry', () => {
  const REFUSALS = [
    ['an image from the network', themedDraft('', '<img src="https://example.com/a.png">'), {}, /loads https:\/\/example\.com\/a\.png from the network/],
    ['a CSS url() from the network', themedDraft('<style>p{background:url(//cdn.example.com/a.png)}</style>'), {}, /loads \/\/cdn\.example\.com\/a\.png from the network/],
    ['an image-set() from the network', themedDraft('<style>p{background:image-set("https://cdn.example.com/a.png" 1x)}</style>'), {}, /from the network/],
    ['an @import', themedDraft('<style>@import "extra.css";</style>'), {}, /uses @import/],
    ['a srcset of local files', themedDraft('', '<img srcset="a.png 2x">'), { 'a.png': PNG_BYTES }, /names local files; give one src/],
    ['a srcset from the network', themedDraft('', '<img srcset="https://example.com/a.png 2x">'), {}, /srcset=.* loads from the network/],
    ['media other than an image', themedDraft('', '<video src="a.mp4"></video>'), { 'a.mp4': 'x' }, /the build embeds images only/],
    ['a link that is neither a stylesheet nor an icon', themedDraft('<link rel="preload" href="a.png">'), { 'a.png': PNG_BYTES }, /embeds a stylesheet or an icon only/],
    ['an icon from the network', themedDraft('<link rel="icon" href="https://example.com/i.png">'), {}, /reaches the network/],
    ['a file of no known type', themedDraft('', '<img src="a.bmp">'), { 'a.bmp': 'x' }, /no known type for/],
    ['a missing file', themedDraft('', '<img src="none.png">'), {}, /names none\.png, which is no file/],
    ['a copy of a shared asset beside the draft', themedDraft(), { 'report.css': 'p{color:red}' }, /has the name of the shared asset/],
    ['a draft with no theme', page('<p>Texto.</p>'), {}, /has 0 theme blocks; it needs exactly one/],
    ['a draft with two themes', themedDraft('<link rel="stylesheet" href="theme-neutral.css">'), {}, /has 2 theme blocks; it needs exactly one/],
    ['a draft with no head', '<link rel="stylesheet" href="theme-neutral.css"><p>Texto.</p>', {}, /has no <head>/],
  ];
  for (const [what, html, files, message] of REFUSALS) {
    it(`refuses ${what}`, () => {
      assertRefuses(draftWith(`refuse-${what.replace(/\W+/g, '-')}`, html, files), message);
    });
  }
});

describe('build.mjs on the command line', () => {
  const draft = draftWith('command', themedDraft());
  const report = path.join(workspace, 'command', 'report.html');

  // A preferences folder whose branding.yml holds `yaml`, with `files` beside it; returns the folder.
  function preferencesWith(name, yaml, files = {}) {
    const configHome = path.join(workspace, `config-${name}`);
    const folder = path.join(configHome, 'claude-skills-preferences');
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'branding.yml'), yaml);
    for (const [relativePath, content] of Object.entries(files)) fs.writeFileSync(path.join(folder, relativePath), content);
    return configHome;
  }

  it('refuses to write the report over the draft', () => {
    const result = runBuild([draft, draft]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /must be written to another file than the draft/);
  });

  it('refuses --theme and --client together', () => {
    const result = runBuild([draft, report, '--theme', 'x.css', '--client', 'acme']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /give --theme or --client, not both/);
  });

  it('refuses a --theme file with no theme block', () => {
    const plain = path.join(workspace, 'plain.css');
    fs.writeFileSync(plain, 'p{color:red}');
    const result = runBuild([draft, report, '--theme', plain]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /carries no \/\* THEME \*\/ … \/\* \/THEME \*\/ block/);
  });

  it('takes the client\'s theme from the file branding.yml names, relative to it', () => {
    const configHome = preferencesWith('theme', 'clients:\n  acme:\n    theme: acme.css\n', { 'acme.css': OTHER_THEME_CSS });
    const result = runBuild([draft, report, '--client', 'acme'], { XDG_CONFIG_HOME: configHome });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(fs.readFileSync(report, 'utf8').includes(OTHER_THEME_BLOCK));
  });

  it('derives the client\'s theme from its brand alone, names what it moved, and the theme passes check', () => {
    const configHome = preferencesWith('brand', 'clients:\n  sol:\n    brand: "#F5C400"  # the logo\'s yellow\n');
    const result = runBuild([draft, report, '--client', 'sol'], { XDG_CONFIG_HOME: configHome });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /^build: theme: light: --brand is #[0-9a-f]{6}/m);
    const findings = newFindings();
    assert.ok(checkTheme(findings, fs.readFileSync(report, 'utf8').match(THEME_BLOCK)[1]), findings.failures().map((failure) => failure.label).join(', '));
  });

  it('stops with the reason when no theme derives from the client\'s colours', () => {
    const configHome = preferencesWith('grey-page', 'clients:\n  cinza:\n    brand: "#2a78d6"\n    surface: "#9a9a9a"\n');
    const result = runBuild([draft, report, '--client', 'cinza'], { XDG_CONFIG_HOME: configHome });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no theme derives from clients\.cinza in .*: --surface #9a9a9a has OKLab lightness/);
  });

  it('stops on a brand that is not a hex colour', () => {
    const configHome = preferencesWith('not-hex', 'clients:\n  acme:\n    brand: amarelo\n');
    const result = runBuild([draft, report, '--client', 'acme'], { XDG_CONFIG_HOME: configHome });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /has brand: amarelo, which is not a hex colour/);
  });

  it('stops on a client branding.yml does not have, naming the keys to add', () => {
    const configHome = preferencesWith('missing', 'clients:\n  acme:\n    brand: "#2a78d6"\n');
    const result = runBuild([draft, report, '--client', 'nobody'], { XDG_CONFIG_HOME: configHome });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /has no clients\.nobody; add clients\.nobody\.theme or clients\.nobody\.brand/);
  });

  it('stops when there is no branding.yml', () => {
    const result = runBuild([draft, report, '--client', 'acme'], { XDG_CONFIG_HOME: path.join(workspace, 'no-config') });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no .*branding\.yml; give the theme with --theme <file> instead/);
  });
});
