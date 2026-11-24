#!/usr/bin/env node
// build.mjs: turns a report draft into one self-contained HTML file. No dependencies, Node 18+.
// references/structure.md ("The build") says what it inlines, decides and refuses.
//
//   node build.mjs <draft.html> <report.html> [--theme <file> | --client <name>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codePointsOf } from './font-coverage.mjs';
import { SKILL_ASSETS, neutralTheme } from './skill-assets.mjs';
import { CSS_COMMENT, THEME_BLOCK, ThemeError, checkTheme, completeSeries, deriveTheme, isHex, newFindings, themeBlock } from './theme-rules.mjs';

// A draft names these by their bare name, and they always come from the skill.
const SHARED_ASSETS = ['fonts.css', 'theme-neutral.css', 'report.css', 'report.js'];
const MATH_FAMILY = 'STIX Two Math';
const THEME_BLOCKS = new RegExp(THEME_BLOCK.source, 'g');
const LARGE_FILE_BYTES = 1024 * 1024;
const LARGE_REPORT_BYTES = 5 * 1024 * 1024;
const MIME = {
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
// What the built report may load: its own inline styles, scripts, and data: images and fonts.
export const CONTENT_SECURITY_POLICY = "default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'";

// A draft the build refuses; the message says what to change.
export class BuildError extends Error {}
const fail = (message) => { throw new BuildError(message); };
const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const isRemote = (ref) => /^(https?:)?\/\//i.test(ref.trim());
const isInline = (ref) => ref.trim() === '' || /^(data:|#|blob:)/i.test(ref.trim());
const ATTRIBUTE_REFERENCES = { '&amp;': '&', '&quot;': '"', '&#39;': "'" };
const decodeAttribute = (value) => value.replace(/&(?:amp|quot|#39);/g, (reference) => ATTRIBUTE_REFERENCES[reference]);

/* ---------- local files ---------- */
const isFile = (file) => fs.existsSync(file) && fs.statSync(file).isFile();
const sameFile = (first, second) => fs.realpathSync(first) === fs.realpathSync(second);

// A file of the draft's folder with a shared asset's name would read as the one the build
// uses; it never is, so the build refuses it.
function refuseSharedAssetCopies(draftDir) {
  for (const name of SHARED_ASSETS) {
    const projectFile = path.join(draftDir, name), skillFile = path.join(SKILL_ASSETS, name);
    if (isFile(projectFile) && !sameFile(projectFile, skillFile)) {
      fail(`${projectFile} has the name of the shared asset ${skillFile}, and the build always uses the skill's. ` +
        'Rename the project\'s file, or delete it if it is a copy of the skill\'s.');
    }
  }
}

// A shared asset is the skill's file, named by its bare name or by a path to the skill's own
// file; any other path ending in its name is refused.
function sharedAsset(relativePath, fromDir, context) {
  const name = path.basename(relativePath), skillFile = path.join(SKILL_ASSETS, name);
  if (relativePath === name) return skillFile;
  const file = path.resolve(fromDir, relativePath);
  if (isFile(file) && sameFile(file, skillFile)) return skillFile;
  return fail(`${context} names the shared asset ${name} by the path ${relativePath}, which is not the skill's ${skillFile}. ` +
    `Name it ${name}, and the build takes the skill's; give a file of the report's own another name.`);
}

// A local reference: a shared asset is the skill's file, anything else a path from the folder
// of the file that names it.
function resolveLocal(ref, fromDir, context) {
  if (isRemote(ref)) fail(`${context} loads ${ref} from the network; a report embeds everything it shows.`);
  const relativePath = path.normalize(decodeURIComponent(ref.split(/[?#]/)[0]));
  if (SHARED_ASSETS.includes(path.basename(relativePath))) return sharedAsset(relativePath, fromDir, context);
  const file = path.resolve(fromDir, relativePath);
  if (!isFile(file)) fail(`${context} names ${ref}, which is no file at ${file}.`);
  return file;
}

function dataUri(file, warnings) {
  const type = MIME[path.extname(file).toLowerCase()];
  if (!type) fail(`no known type for ${file}; embed ${Object.keys(MIME).join(', ')} files.`);
  const bytes = fs.readFileSync(file);
  if (bytes.length > LARGE_FILE_BYTES) warnings.push(`embeds ${file}, ${megabytes(bytes.length)}, which every reader downloads with the report.`);
  return `data:${type};base64,${bytes.toString('base64')}`;
}

/* ---------- CSS ---------- */
// Applies `transform` to the CSS between comments and keeps the comments as they are.
const outsideCssComments = (css, transform) =>
  css.split(new RegExp(`(${CSS_COMMENT.source})`)).map((piece, i) => (i % 2 ? piece : transform(piece))).join('');
const URL_FUNCTION = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const IMAGE_SET = /(?:-webkit-)?image-set\(/gi;

// Where the parenthesis that closes the one open before `start` is.
function closingParenthesis(css, start) {
  let depth = 1;
  for (let at = start; at < css.length; at++) {
    if (css[at] === '(') depth++;
    else if (css[at] === ')' && --depth === 0) return at;
  }
  return css.length;
}

// The CSS with `embed` applied to each image named by a string in an image-set(); the string
// of a type() is a MIME type and stays.
function withImageSetsEmbedded(css, embed) {
  let embedded = '', last = 0;
  for (const match of css.matchAll(IMAGE_SET)) {
    const open = match.index + match[0].length;
    if (open < last) continue;
    const close = closingParenthesis(css, open);
    const options = css.slice(open, close).replace(/(type\(\s*)?(['"])([^'"]*)\2/gi,
      (whole, typeStart, quote, ref) => (typeStart ? whole : `${quote}${embed(ref)}${quote}`));
    embedded += css.slice(last, open) + options;
    last = close;
  }
  return embedded + css.slice(last);
}

// Every image a stylesheet names, in url() or image-set(), becomes a data URI; @import is refused.
function inlineCss(css, fromDir, context, warnings) {
  const embed = (ref) => (isInline(ref) ? ref : dataUri(resolveLocal(ref, fromDir, context), warnings));
  return outsideCssComments(css, (code) => {
    if (/@import\b/i.test(code)) fail(`${context} uses @import; link each stylesheet from the draft instead.`);
    const withUrlsEmbedded = code.replace(URL_FUNCTION, (whole, quote, ref) => (isInline(ref) ? whole : `url(${embed(ref)})`));
    return withImageSetsEmbedded(withUrlsEmbedded, embed);
  });
}

/* ---------- JavaScript ---------- */
const KEYWORDS_BEFORE_EXPRESSION = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'yield', 'await', 'instanceof']);
const KEYWORDS_BEFORE_CONDITION = new Set(['if', 'while', 'for', 'with']);
// The token before an expression that opens the code or follows a statement's condition.
const EXPRESSION_START = '';
const TOKEN = /[\w$]+|\+\+|--/y;

// Where a string literal that opens at `start` ends; a line break ends one left open.
function endOfString(code, start) {
  const quote = code[start];
  for (let at = start + 1; at < code.length; at++) {
    if (code[at] === '\\') at++;
    else if (code[at] === quote) return at + 1;
    else if (code[at] === '\n') return at;
  }
  return code.length;
}

// Where a regular expression literal that opens at `start` ends, or -1 when the slash is a
// division that a line break shows.
function endOfRegex(code, start) {
  let isInClass = false;
  for (let at = start + 1; at < code.length; at++) {
    const character = code[at];
    if (character === '\n') return -1;
    if (character === '\\') at++;
    else if (character === '[') isInClass = true;
    else if (character === ']') isInClass = false;
    else if (character === '/' && !isInClass) {
      let end = at + 1;
      while (/[a-z]/i.test(code[end] ?? '')) end++;
      return end;
    }
  }
  return -1;
}

function endOfComment(code, start) {
  const isLineComment = code[start + 1] === '/';
  const end = code.indexOf(isLineComment ? '\n' : '*/', start + 2);
  if (end === -1) return code.length;
  return isLineComment ? end : end + 2;
}

// A slash opens a regular expression where an expression may start: after an operator other
// than a postfix `++` or `--`, an opening bracket, a statement's condition, the start, or a
// keyword such as `return`.
const opensRegex = (previousToken) => previousToken === EXPRESSION_START || KEYWORDS_BEFORE_EXPRESSION.has(previousToken) ||
  (previousToken !== '++' && previousToken !== '--' && /[(,=:[!&|?{};+\-*%<>~^]$/.test(previousToken));

function addSegment(segments, kind, text) {
  const last = segments[segments.length - 1];
  if (last?.kind === kind) last.text += text;
  else if (text) segments.push({ kind, text });
}

// The token a slash after `token` is read against; tracks the braces and the parentheses of
// statement conditions in `nesting`.
function tokenBeforeNext(token, previousToken, nesting) {
  if (token === '{') nesting.braceDepth++;
  else if (token === '}') nesting.braceDepth--;
  else if (token === '(') nesting.conditionParentheses.push(KEYWORDS_BEFORE_CONDITION.has(previousToken));
  else if (token === ')' && nesting.conditionParentheses.pop()) return EXPRESSION_START;
  return /\s/.test(token) ? previousToken : token;
}

// Adds the template literal that opens at `start` to `segments`, its text as a literal and its
// `${…}` as code; returns where it ends.
function scanTemplate(code, start, segments) {
  let at = start + 1, pieceStart = start;
  while (at < code.length) {
    if (code[at] === '\\') at += 2;
    else if (code[at] === '`') { addSegment(segments, 'literal', code.slice(pieceStart, at + 1)); return at + 1; }
    else if (code[at] === '$' && code[at + 1] === '{') {
      addSegment(segments, 'literal', code.slice(pieceStart, at + 2));
      pieceStart = scanCode(code, at + 2, segments, true);
      at = pieceStart + 1;
    } else at++;
  }
  addSegment(segments, 'literal', code.slice(pieceStart));
  return code.length;
}

// Adds the code from `start` to `segments`; returns where it ends. With `endsAtBrace`, it ends
// at the `}` that closes a template's `${`.
function scanCode(code, start, segments, endsAtBrace = false) {
  const nesting = { braceDepth: 0, conditionParentheses: [] };
  let previousToken = EXPRESSION_START, at = start;
  while (at < code.length) {
    const character = code[at], nextCharacter = code[at + 1];
    if (endsAtBrace && character === '}' && nesting.braceDepth === 0) return at;
    let end;
    if (character === '/' && (nextCharacter === '/' || nextCharacter === '*')) {
      end = endOfComment(code, at);
      addSegment(segments, 'comment', code.slice(at, end));
    } else if (character === '"' || character === "'" || character === '`') {
      end = character === '`' ? scanTemplate(code, at, segments) : endOfString(code, at);
      if (character !== '`') addSegment(segments, 'literal', code.slice(at, end));
      previousToken = character;
    } else if (character === '/' && opensRegex(previousToken) && endOfRegex(code, at) !== -1) {
      end = endOfRegex(code, at);
      addSegment(segments, 'literal', code.slice(at, end));
      previousToken = '/';
    } else {
      TOKEN.lastIndex = at;
      const token = TOKEN.exec(code)?.[0] ?? character;
      end = at + token.length;
      addSegment(segments, 'code', token);
      previousToken = tokenBeforeNext(token, previousToken, nesting);
    }
    at = end;
  }
  return code.length;
}

// JavaScript source as segments of code, comments and literals (strings, template text and
// regular expressions); joined, they give the source back.
function scriptSegments(code) {
  const segments = [];
  scanCode(code, 0, segments);
  return segments;
}

const withoutScriptComments = (code) => scriptSegments(code).map(({ kind, text }) => (kind === 'comment' ? ' ' : text)).join('');

/* ---------- markup ---------- */
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g;

function attributesOf(text) {
  return [...text.matchAll(ATTRIBUTE)].map(([raw, name, doubleQuoted, singleQuoted, unquoted]) =>
    ({ name: name.toLowerCase(), raw, value: decodeAttribute(doubleQuoted ?? singleQuoted ?? unquoted ?? '') }));
}
const valueOf = (attributes, name) => attributes.find((attribute) => attribute.name === name)?.value;
const writeTag = (name, attributes, selfClosing = '') =>
  `<${name}${attributes.map((attribute) => ' ' + (attribute.replacement === undefined ? attribute.raw
    : `${attribute.raw.split('=')[0].trim()}="${attribute.replacement}"`)).join('')}${selfClosing}>`;

// Attributes through which a page loads a resource. `href` loads one on every element but
// a link to follow (`<a>`, `<area>`).
const LOADING_ATTRIBUTES = new Set(['src', 'srcset', 'imagesrcset', 'poster', 'data', 'href', 'xlink:href', 'background',
  'ping', 'manifest', 'lowsrc', 'dynsrc', 'longdesc', 'codebase', 'archive', 'profile']);
const LINK_TAGS = new Set(['a', 'area']);
// [tag, attribute] pairs whose local file the build embeds as a data URI.
const EMBEDDED = new Set(['img src', 'input src', 'image href', 'image xlink:href', 'feimage href', 'feimage xlink:href']);

function isLoadingAttribute(tag, attribute) {
  if (!LOADING_ATTRIBUTES.has(attribute)) return false;
  return !(LINK_TAGS.has(tag) && (attribute === 'href' || attribute === 'xlink:href'));
}

function inlineResource(tag, attribute, value, session) {
  const context = `<${tag} ${attribute}="${value}">`;
  if (attribute === 'srcset' || attribute === 'imagesrcset') {
    if (/(^|[\s,])(https?:)?\/\//i.test(value)) fail(`${context} loads from the network; a report embeds everything it shows.`);
    if (!/^\s*data:/i.test(value)) fail(`${context} names local files; give one src, which the build embeds.`);
    return undefined;
  }
  if (isInline(value)) return undefined;
  if (isRemote(value)) fail(`${context} loads ${value} from the network; a report embeds everything it shows.`);
  if (!EMBEDDED.has(`${tag} ${attribute}`)) fail(`${context}: the build embeds images only; draw it as an image or leave it out.`);
  return dataUri(resolveLocal(value, session.draftDir, context), session.warnings);
}

// Inlined CSS and JavaScript cannot end the element that holds them, nor, for a script, turn
// the parser's script-data state into the escaped one where `</script>` no longer closes it.
// Inside a literal or a comment `\x3C` reads as `<`; in code a space keeps the operator.
const SCRIPT_BREAK = /<(?=!--|\/?script)/gi;
const escapeInlineCss = (css) => css.replace(/<\/(style)/gi, '<\\/$1');
const escapeInlineScript = (code) => scriptSegments(code)
  .map(({ kind, text }) => text.replace(SCRIPT_BREAK, kind === 'code' ? '< ' : '\\x3C')).join('');

function stylesheetLink(attributes, session) {
  const href = valueOf(attributes, 'href');
  const file = resolveLocal(href, session.draftDir, `<link href="${href}">`);
  const css = inlineCss(fs.readFileSync(file, 'utf8'), path.dirname(file), href, session.warnings).trim();
  const media = valueOf(attributes, 'media');
  return `<style${media ? ` media="${media}"` : ''}>\n${escapeInlineCss(css)}\n</style>`;
}

function linkTag(attributes, session) {
  const rel = (valueOf(attributes, 'rel') ?? '').toLowerCase().split(/\s+/);
  const href = valueOf(attributes, 'href') ?? '';
  if (rel.includes('stylesheet')) return stylesheetLink(attributes, session);
  if (isInline(href)) return null;
  const context = `<link rel="${rel.join(' ')}" href="${href}">`;
  if (isRemote(href)) fail(`${context} reaches the network; remove it.`);
  if (!rel.includes('icon')) fail(`${context}: the build embeds a stylesheet or an icon only; remove it.`);
  attributes.find((attribute) => attribute.name === 'href').replacement = dataUri(resolveLocal(href, session.draftDir, context), session.warnings);
  return null;
}

// One tag of the markup with its resources embedded, or refused.
function markupTag(whole, tagName, attributeText, selfClosing, session) {
  const tag = tagName.toLowerCase();
  const attributes = attributesOf(attributeText);
  if (tag === 'link') {
    const style = linkTag(attributes, session);
    if (style) return style;
  }
  for (const attribute of attributes) {
    if (attribute.name === 'style') {
      const css = inlineCss(attribute.value, session.draftDir, 'style=""', session.warnings);
      if (css !== attribute.value) attribute.replacement = css.replace(/"/g, '&quot;');
    } else if (attribute.replacement === undefined && isLoadingAttribute(tag, attribute.name)) {
      attribute.replacement = inlineResource(tag, attribute.name, attribute.value, session);
    }
  }
  return attributes.some((attribute) => attribute.replacement !== undefined) ? writeTag(tagName, attributes, selfClosing) : whole;
}

function scriptElement({ open, body, close }, session) {
  const attributes = attributesOf(open.slice('<script'.length, -1));
  const src = valueOf(attributes, 'src');
  if (src === undefined) return open + body + close;
  const file = resolveLocal(src, session.draftDir, `<script src="${src}">`);
  const code = escapeInlineScript(fs.readFileSync(file, 'utf8')).trim();
  return writeTag('script', attributes.filter((attribute) => attribute.name !== 'src')) + `\n${code}\n</script>`;
}

// The page in pieces: markup, and the comments and the bodies of scripts and styles, which are
// never read as markup. `start` is where each piece starts in the page.
const PIECES = /(<!--[\s\S]*?-->)|(<script\b[^>]*>)([\s\S]*?)(<\/script\s*>)|(<style\b[^>]*>)([\s\S]*?)(<\/style\s*>)/gi;

function* piecesOf(html) {
  let last = 0;
  for (const match of html.matchAll(PIECES)) {
    const [whole, comment, scriptOpen, scriptBody, scriptClose, styleOpen, styleBody, styleClose] = match;
    yield { kind: 'markup', text: html.slice(last, match.index), start: last };
    if (comment) yield { kind: 'comment', text: whole, start: match.index };
    else if (scriptOpen) yield { kind: 'script', text: whole, start: match.index, open: scriptOpen, body: scriptBody, close: scriptClose };
    else yield { kind: 'style', text: whole, start: match.index, open: styleOpen, body: styleBody, close: styleClose };
    last = match.index + whole.length;
  }
  yield { kind: 'markup', text: html.slice(last), start: last };
}

function inlineAssets(html, session) {
  const piecesInlined = [...piecesOf(html)].map((piece) => {
    if (piece.kind === 'markup') return piece.text.replace(TAG, (whole, name, attributes, selfClosing) => markupTag(whole, name, attributes, selfClosing, session));
    if (piece.kind === 'script') return scriptElement(piece, session);
    if (piece.kind === 'style') return piece.open + inlineCss(piece.body, session.draftDir, '<style>', session.warnings) + piece.close;
    return piece.text;
  });
  return piecesInlined.join('');
}

const CHARSET_META = /<meta\b[^>]*\bcharset\b[^>]*>/i;
const HEAD_START = /<head\b[^>]*>/i;

// The content of every Content-Security-Policy <meta> of the markup.
function policiesOf(markupPieces) {
  return markupPieces.flatMap((piece) => [...piece.text.matchAll(TAG)])
    .filter(([, name]) => name.toLowerCase() === 'meta')
    .map(([, , attributeText]) => attributesOf(attributeText))
    .filter((attributes) => (valueOf(attributes, 'http-equiv') ?? '').toLowerCase() === 'content-security-policy')
    .map((attributes) => valueOf(attributes, 'content') ?? '');
}

// The report's Content-Security-Policy, right after its <meta charset>, or first in <head>. A
// page that already carries the build's own policy, such as a built report, keeps it.
function withContentSecurityPolicy(html) {
  const markupPieces = [...piecesOf(html)].filter((piece) => piece.kind === 'markup');
  const policies = policiesOf(markupPieces);
  if (policies.some((policy) => policy !== CONTENT_SECURITY_POLICY)) {
    fail('the draft carries a Content-Security-Policy other than the build\'s; remove it, the build writes the report\'s own.');
  }
  if (policies.length) return html;
  const anchorEnd = (pattern) => {
    for (const piece of markupPieces) {
      const found = piece.text.match(pattern);
      if (found) return piece.start + found.index + found[0].length;
    }
    return undefined;
  };
  const at = anchorEnd(CHARSET_META) ?? anchorEnd(HEAD_START) ?? fail('the draft has no <head>; start it from assets/skeleton.html.');
  return `${html.slice(0, at)}\n<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">${html.slice(at)}`;
}

/* ---------- the math font ---------- */
const GREEK_NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu',
  'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'];
// Named character references a report is likely to write; the build keeps the math font
// for any other name, whose character it cannot tell.
const NAMED_CHARACTERS = {
  nbsp: 0xa0, amp: 0x26, lt: 0x3c, gt: 0x3e, quot: 0x22, apos: 0x27, shy: 0xad, thinsp: 0x2009, ensp: 0x2002, emsp: 0x2003,
  mdash: 0x2014, ndash: 0x2013, hellip: 0x2026, middot: 0xb7, bull: 0x2022, times: 0xd7, divide: 0xf7, minus: 0x2212,
  plusmn: 0xb1, deg: 0xb0, euro: 0x20ac, laquo: 0xab, raquo: 0xbb, lsquo: 0x2018, rsquo: 0x2019, ldquo: 0x201c,
  rdquo: 0x201d, larr: 0x2190, uarr: 0x2191, rarr: 0x2192, darr: 0x2193, harr: 0x2194, le: 0x2264, ge: 0x2265,
  ne: 0x2260, asymp: 0x2248, sup1: 0xb9, sup2: 0xb2, sup3: 0xb3, frac12: 0xbd, frac14: 0xbc, frac34: 0xbe, micro: 0xb5,
  copy: 0xa9, reg: 0xae, trade: 0x2122, sect: 0xa7, para: 0xb6, zwj: 0x200d, zwnj: 0x200c, sigmaf: 0x3c2,
  ...Object.fromEntries(GREEK_NAMES.flatMap((name, i) => [
    [name, 0x3b1 + i + (i >= 17 ? 1 : 0)],
    [name[0].toUpperCase() + name.slice(1), 0x391 + i + (i >= 17 ? 1 : 0)]])),
};
// Characters that draw nothing: controls, the soft hyphen, joiners, separators, selectors.
const isInvisible = (codePoint) => codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f) || codePoint === 0xad ||
  (codePoint >= 0x200b && codePoint <= 0x200f) || [0x2028, 0x2029, 0x2060, 0xfeff].includes(codePoint) ||
  (codePoint >= 0xfe00 && codePoint <= 0xfe0f);
const characterOf = (codePoint) => String.fromCodePoint(codePoint > 0 && codePoint <= 0x10ffff ? codePoint : 0xfffd);

const withoutCssComments = (css) => css.replace(CSS_COMMENT, ' ');
// `\2265 ` and `\0003c3` are the characters they name; a backslash before any other character is that character.
const decodeCssEscapes = (css) =>
  css.replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?|\\([\s\S])/gi, (whole, hex, literal) => (hex ? characterOf(parseInt(hex, 16)) : literal));


// Every text the built report can put on screen: its markup, its scripts and its stylesheets,
// with comments left out.
function shownText(html) {
  return [...piecesOf(html)].map((piece) => {
    if (piece.kind === 'markup') return piece.text;
    if (piece.kind === 'script') return piece.open + withoutScriptComments(piece.body);
    if (piece.kind === 'style') return decodeCssEscapes(withoutCssComments(piece.body));
    return '';
  }).join('');
}

// Every character the built report can show, with character references resolved.
function shownCharacters(text) {
  const unknownReferences = new Set();
  const resolved = text
    .replace(/&#x([0-9a-f]+);/gi, (whole, hex) => characterOf(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (whole, decimal) => characterOf(Number(decimal)))
    .replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})/gi, (whole, braced, plain) => characterOf(parseInt(braced ?? plain, 16)))
    .replace(/&([a-z][a-z0-9]*);/gi, (whole, name) => {
      if (name in NAMED_CHARACTERS) return characterOf(NAMED_CHARACTERS[name]);
      unknownReferences.add(whole);
      return '';
    });
  const codePoints = new Set([...resolved].map((character) => character.codePointAt(0)).filter((codePoint) => !isInvisible(codePoint)));
  return { codePoints, unknownReferences };
}

// Whether the report has a formula: a <math> element, in the markup or written by a script,
// or an element whose class list holds `formula`.
function hasFormula(html) {
  return [...piecesOf(html)].some((piece) => {
    if (piece.kind === 'script') return /<math[\s>]/i.test(withoutScriptComments(piece.body));
    if (piece.kind !== 'markup') return false;
    return [...piece.text.matchAll(TAG)].some(([, name, attributeText]) =>
      name.toLowerCase() === 'math' || (valueOf(attributesOf(attributeText), 'class') ?? '').split(/\s+/).includes('formula'));
  });
}

// The skill's font faces from fonts.css: the characters every text face has, and the math
// face's.
export function fontCoverage() {
  const css = fs.readFileSync(path.join(SKILL_ASSETS, 'fonts.css'), 'utf8');
  const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => ({
    family: body.match(/font-family\s*:\s*['"]?([^'";]+)/)[1].trim(),
    codePoints: codePointsOf(path.join(SKILL_ASSETS, body.match(/url\(\s*['"]?([^'")]+)/)[1])),
  }));
  const textFaces = faces.filter((face) => face.family !== MATH_FAMILY);
  const text = new Set([...textFaces[0].codePoints].filter((codePoint) => textFaces.every((face) => face.codePoints.has(codePoint))));
  const math = faces.find((face) => face.family === MATH_FAMILY).codePoints;
  return { text, math };
}

const MATH_FACE = new RegExp(`@font-face\\s*\\{[^{}]*font-family\\s*:\\s*(['"]?)${MATH_FAMILY}\\1[^{}]*\\}`, 'g');
const describe = (codePoint) => `${String.fromCodePoint(codePoint)} (U+${codePoint.toString(16).toUpperCase().padStart(4, '0')})`;

// The report keeps the math font when it has a formula, a character that not every text
// face has, or a named character reference the build does not know; it loses it otherwise.
// `warnings` names the characters no embedded font has.
export function settleMathFont(html, coverage = fontCoverage()) {
  const warnings = [];
  const { codePoints, unknownReferences } = shownCharacters(shownText(html));
  const codePointsOutsideText = [...codePoints].filter((codePoint) => !coverage.text.has(codePoint));
  const needsMath = hasFormula(html) || codePointsOutsideText.length > 0 || unknownReferences.size > 0;
  const codePointsInNoFont = codePointsOutsideText.filter((codePoint) => !(needsMath && coverage.math.has(codePoint)));
  if (codePointsInNoFont.length) warnings.push(`no embedded font has ${codePointsInNoFont.map(describe).join(', ')}; the reader's system font draws them.`);
  if (unknownReferences.size) warnings.push(`kept the math font for ${[...unknownReferences].join(', ')}, which the build cannot read; write the character itself.`);
  return { html: needsMath ? html : html.replace(MATH_FACE, ''), needsMath, warnings };
}

/* ---------- theme ---------- */
function themeFromFile(file) {
  if (!isFile(file)) fail(`no theme file at ${file}.`);
  const blocks = fs.readFileSync(file, 'utf8').match(THEME_BLOCKS);
  if (!blocks) fail(`${file} carries no /* THEME */ … /* /THEME */ block.`);
  return blocks[0];
}

const unquote = (text) => text.trim().replace(/^(["'])(.*)\1$/, '$2');

// The entry of clients.<name> in branding.yml: a minimal reader of nested "key: value"
// lines, enough for the file the preferences skill writes.
function clientEntry(file, name) {
  const stack = [];
  let entry = null;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const text = raw.replace(/\s+#.*$/, '');
    const match = text.match(/^(\s*)("[^"]*"|'[^']*'|[^:#'"]+?)\s*:\s*(.*)$/);
    if (!match) continue;
    const depth = match[1].length;
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    stack.push({ depth, key: unquote(match[2]) });
    const keys = stack.map((level) => level.key);
    if (keys.length === 3 && keys[0] === 'clients' && keys[1] === name) {
      entry ??= {};
      entry[keys[2]] = unquote(match[3]);
    }
  }
  return entry;
}

const THEME_COMMAND = fileURLToPath(new URL('./theme.mjs', import.meta.url));

function deriveCommand(entry) {
  return `node "${THEME_COMMAND}" derive --brand "${entry.brand}"` +
    `${entry.ink ? ` --ink "${entry.ink}"` : ''}${entry.surface ? ` --surface "${entry.surface}"` : ''}` +
    `${entry.surface_dark ? ` --surface-dark "${entry.surface_dark}"` : ''}`;
}

// A theme from the client's brand colour: derived, its series completed from the neutral
// theme, and checked as `theme.mjs check` checks it. `notes` says each token derive did not
// take from the brand colour.
function derivedTheme(entry, name, file) {
  const colors = { brand: entry.brand, ink: entry.ink, surface: entry.surface, surface_dark: entry.surface_dark };
  const notHex = Object.entries(colors).filter(([, value]) => value !== undefined && !isHex(value));
  if (notHex.length) fail(`clients.${name} in ${file} has ${notHex.map(([key, value]) => `${key}: ${value}`).join(', ')}, which is not a hex colour.`);
  const neutral = neutralTheme();
  let derived;
  try {
    derived = deriveTheme({ brand: entry.brand, ink: entry.ink, surface: entry.surface, surfaceDark: entry.surface_dark, neutral });
  } catch (error) {
    if (!(error instanceof ThemeError)) throw error;
    return fail(`no theme derives from clients.${name} in ${file}: ${error.message}`);
  }
  const block = themeBlock(completeSeries(derived.light, neutral.light[0]), completeSeries(derived.dark, neutral.dark[0]));
  const findings = newFindings();
  if (!checkTheme(findings, block.match(THEME_BLOCK)[1])) {
    fail(`the theme derived from clients.${name}.brand fails these checks:\n` +
      findings.failures().map((failure) => `  ${failure.heading}: ${failure.label} ${failure.detail}`).join('\n') +
      `\nDerive it with\n  ${deriveCommand(entry)}\n` +
      'choose --c2..--c6 as references/themes.md says, save the block to a .css file and set\n' +
      `clients.${name}.theme to that file in ${file}.`);
  }
  return { block, notes: derived.notes };
}

// The client's theme block from branding.yml, and the notes of a derived one.
function clientTheme(name, configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')) {
  const file = path.join(configHome, 'claude-skills-preferences', 'branding.yml');
  if (!isFile(file)) fail(`no ${file}; give the theme with --theme <file> instead.`);
  const entry = clientEntry(file, name);
  if (!entry) fail(`${file} has no clients.${name}; add clients.${name}.theme or clients.${name}.brand, or pass --theme <file>.`);
  if (entry.theme) return { block: themeFromFile(path.resolve(path.dirname(file), entry.theme.replace(/^~(?=\/|$)/, os.homedir()))), notes: [] };
  if (entry.brand) return derivedTheme(entry, name, file);
  return fail(`clients.${name} in ${file} has neither theme nor brand.`);
}

/* ---------- the build ---------- */
// The draft at `draftPath` as one self-contained report, with `theme` (a theme block) in
// place of the draft's when given. Throws BuildError for a draft it refuses.
export function buildReport(draftPath, { theme } = {}) {
  if (!isFile(draftPath)) fail(`no draft at ${draftPath}.`);
  const session = { draftDir: path.dirname(path.resolve(draftPath)), warnings: [] };
  refuseSharedAssetCopies(session.draftDir);
  const assembledHtml = inlineAssets(fs.readFileSync(draftPath, 'utf8'), session);
  const themeCount = (assembledHtml.match(THEME_BLOCKS) ?? []).length;
  if (themeCount !== 1) fail(`the built report has ${themeCount} theme blocks; it needs exactly one (link theme-neutral.css once).`);
  const themedHtml = theme ? assembledHtml.replace(THEME_BLOCKS, () => theme) : assembledHtml;
  const mathFont = settleMathFont(withContentSecurityPolicy(themedHtml));
  const warnings = [...session.warnings, ...mathFont.warnings];
  const reportBytes = Buffer.byteLength(mathFont.html);
  if (reportBytes > LARGE_REPORT_BYTES) warnings.push(`the report weighs ${megabytes(reportBytes)}; past about 5 MB it opens slowly (references/structure.md, "How much data").`);
  return { html: mathFont.html, needsMath: mathFont.needsMath, warnings };
}

function main(args) {
  const takeOption = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const [, value] = args.splice(i, 2);
    return value ?? fail(`${name} needs a value.`);
  };
  const themeFile = takeOption('--theme'), client = takeOption('--client');
  const [draftPath, reportPath] = args;
  if (!draftPath || !reportPath || args.length !== 2) fail('usage: node build.mjs <draft.html> <report.html> [--theme <file> | --client <name>]');
  if (themeFile && client) fail('give --theme or --client, not both.');
  if (path.resolve(draftPath) === path.resolve(reportPath)) fail('the report must be written to another file than the draft.');

  const { block: theme, notes } = themeFile ? { block: themeFromFile(themeFile), notes: [] } : client ? clientTheme(client) : { notes: [] };
  const { html, needsMath, warnings } = buildReport(draftPath, { theme });
  for (const note of notes) console.error(`build: theme: ${note}`);
  for (const warning of warnings) console.error(`build: warning: ${warning}`);
  fs.writeFileSync(reportPath, html);
  console.log(`build: wrote ${reportPath} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB, ${needsMath ? 'with' : 'without'} the math font` +
    `${theme ? `, theme from ${themeFile ?? `client ${client}`}` : ''})`);
}

const isRunAsCommand = process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (isRunAsCommand) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof BuildError)) throw error;
    console.error(`build: ${error.message}`);
    process.exit(1);
  }
}
