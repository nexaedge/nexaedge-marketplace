// The characters a font file maps to a glyph, read from its cmap table. Reads WOFF2, TTF and
// OTF with no dependencies: WOFF2's table data is one Brotli stream, which node:zlib opens.

import fs from 'node:fs';
import zlib from 'node:zlib';

// WOFF2's known-table index: a table directory entry names its tag by position in this list.
const WOFF2_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE',
  'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx',
  'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
const CUSTOM_TAG = 63;
const WOFF2_HEADER_SIZE = 48;

function readBase128(bytes, at) {
  let value = 0, offset = at;
  for (let i = 0; i < 5; i++) {
    const byte = bytes[offset++];
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return { value, offset };
  }
  throw new Error('WOFF2: a UIntBase128 longer than five bytes');
}

// The cmap table of a WOFF2 file: the tables sit in directory order in one Brotli stream.
function woff2Cmap(file) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const tableCount = view.getUint16(12);
  const compressedSize = view.getUint32(20);
  let at = WOFF2_HEADER_SIZE, streamOffset = 0, cmap = null;
  for (let i = 0; i < tableCount; i++) {
    const flags = file[at++];
    const tagIndex = flags & 0x3f;
    const tag = tagIndex === CUSTOM_TAG ? String.fromCharCode(...file.subarray(at, at + 4)) : WOFF2_TAGS[tagIndex];
    if (tagIndex === CUSTOM_TAG) at += 4;
    const transform = flags >> 6;
    const original = readBase128(file, at);
    at = original.offset;
    let length = original.value;
    const isTransformed = tag === 'glyf' || tag === 'loca' ? transform === 0 : transform !== 0;
    if (isTransformed) {
      const transformed = readBase128(file, at);
      at = transformed.offset;
      length = transformed.value;
    }
    if (tag === 'cmap') cmap = { offset: streamOffset, length };
    streamOffset += length;
  }
  if (!cmap) throw new Error('WOFF2: no cmap table');
  const stream = zlib.brotliDecompressSync(file.subarray(at, at + compressedSize));
  return stream.subarray(cmap.offset, cmap.offset + cmap.length);
}

function sfntCmap(file) {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const tableCount = view.getUint16(4);
  for (let i = 0; i < tableCount; i++) {
    const record = 12 + i * 16;
    if (String.fromCharCode(...file.subarray(record, record + 4)) === 'cmap') {
      const offset = view.getUint32(record + 8), length = view.getUint32(record + 12);
      return file.subarray(offset, offset + length);
    }
  }
  throw new Error('no cmap table');
}

function format4(view, at, codePoints) {
  const segments = view.getUint16(at + 6) / 2;
  const ends = at + 14, starts = ends + segments * 2 + 2, deltas = starts + segments * 2, rangeOffsets = deltas + segments * 2;
  for (let s = 0; s < segments; s++) {
    const end = view.getUint16(ends + s * 2), start = view.getUint16(starts + s * 2);
    const delta = view.getInt16(deltas + s * 2), rangeOffsetAt = rangeOffsets + s * 2, rangeOffset = view.getUint16(rangeOffsetAt);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      const glyph = rangeOffset === 0
        ? (c + delta) & 0xffff
        : view.getUint16(rangeOffsetAt + rangeOffset + (c - start) * 2);
      if (glyph !== 0) codePoints.add(c);
    }
  }
}

function format12(view, at, codePoints) {
  const groups = view.getUint32(at + 12);
  for (let g = 0; g < groups; g++) {
    const group = at + 16 + g * 12;
    const start = view.getUint32(group), end = view.getUint32(group + 4), firstGlyph = view.getUint32(group + 8);
    for (let c = start; c <= end; c++) if (firstGlyph + (c - start) !== 0) codePoints.add(c);
  }
}

// Every Unicode subtable (platform 0, or Windows encodings 1 and 10) of format 4 or 12.
function codePointsOfCmap(cmap) {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const codePoints = new Set();
  const subtableCount = view.getUint16(2);
  for (let i = 0; i < subtableCount; i++) {
    const platform = view.getUint16(4 + i * 8), encoding = view.getUint16(6 + i * 8), at = view.getUint32(8 + i * 8);
    if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue;
    const format = view.getUint16(at);
    if (format === 4) format4(view, at, codePoints);
    else if (format === 12) format12(view, at, codePoints);
  }
  return codePoints;
}

// The first four bytes of a TrueType or OpenType font file.
const SFNT_SIGNATURES = new Set(['\0\x01\0\0', 'OTTO', 'true']);

// The code points the font at `path` maps to a glyph. Throws on a file that is not a WOFF2,
// TrueType or OpenType font.
export function codePointsOf(path) {
  const file = fs.readFileSync(path);
  const signature = file.subarray(0, 4).toString('latin1');
  if (signature === 'wOF2') return codePointsOfCmap(woff2Cmap(file));
  if (SFNT_SIGNATURES.has(signature)) return codePointsOfCmap(sfntCmap(file));
  throw new Error(`${path} is not a WOFF2, TrueType or OpenType font.`);
}
