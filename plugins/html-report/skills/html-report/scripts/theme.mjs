#!/usr/bin/env node
// theme.mjs — the theme toolkit for html-report. No dependencies, Node 18+.
//
//   node theme.mjs extract <report.html>        pull the theme block (light and dark) out of a report
//   node theme.mjs check   <report.html>        check every theme the block declares
//   node theme.mjs check   "#hex,#hex,…"        check a candidate series palette
//   node theme.mjs ramp    "#hex,#hex,…"        check a sequential ramp, report --on-flip
//   node theme.mjs derive  --brand #hex [--ink #hex] [--surface #fff] [--surface-dark #161615]
//                                               propose a full theme block, light and dark
//
// What it computes exactly: WCAG contrast, OKLab lightness and chroma, OKLab ΔE
// between adjacent slots, ramp monotonicity, and the ramp's text-flip index.
// What it does NOT compute: colour-vision-deficiency simulation. For that, and for
// chart-form guidance, use the `dataviz` skill. The checks here are the ones that
// catch the failures seen most often: unreadable text and a saturated ramp.

import fs from 'node:fs';

const A = process.argv.slice(2);
const cmd = A[0];

/* ---------- colour ---------- */
const hex2rgb = (h) => {
  const s = h.replace('#', '').trim();
  const f = s.length === 3 ? s.split('').map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
};
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

const relLum = (h) => {
  const [r, g, b] = hex2rgb(h).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Ottosson's OKLab. Perceptual lightness and chroma; ΔE here is plain OKLab distance.
const oklab = (h) => {
  const [r, g, b] = hex2rgb(h).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
};
const chroma = (h) => { const c = oklab(h); return Math.hypot(c.a, c.b); };
const deltaE = (p, q) => {
  const x = oklab(p), y = oklab(q);
  return Math.hypot(x.L - y.L, x.a - y.a, x.b - y.b) * 100;
};

const rgb2hex = (r, g, b) =>
  '#' + [r, g, b].map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255)
    .toString(16).padStart(2, '0')).join('');
const oklab2hex = ({ L, a, b }) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return rgb2hex(
    toSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s));
};

// A surface below this OKLab lightness is a dark theme's surface.
const ehEscura = (surface) => oklab(surface).L < 0.5;

// Move a colour along its own hue to the lightness closest to `surface` that still
// clears a contrast target. Contrast falls as lightness rises on a light surface and
// rises with it on a dark one, so the bisection follows the surface.
const ajustarPara = (h, alvo, surface = '#ffffff', escalaCroma = 1) => {
  const c = oklab(h);
  const a = c.a * escalaCroma, b = c.b * escalaCroma;
  const escura = ehEscura(surface);
  let lo = 0.02, hi = 0.99, vencedora = null;
  for (let i = 0; i < 40; i++) {
    const L = (lo + hi) / 2;
    const cor = oklab2hex({ L, a, b });
    const vence = contrast(cor, surface) >= alvo;
    if (vence) vencedora = cor;
    if (vence === escura) hi = L; else lo = L;
  }
  return vencedora ?? oklab2hex({ L: escura ? 0.99 : 0.02, a, b });
};

// Clamp a colour's lightness into a band, keeping its hue and chroma.
const naBanda = (cor, [minimo, maximo]) => {
  const c = oklab(cor);
  const L = Math.min(maximo, Math.max(minimo, c.L));
  return L === c.L ? cor : oklab2hex({ L, a: c.a, b: c.b });
};

// Same hue and chroma, lightness moved by `delta`.
const clarear = (cor, delta) => {
  const c = oklab(cor);
  return oklab2hex({ L: c.L + delta, a: c.a, b: c.b });
};

/* ---------- theme block I/O ---------- */
const RE = /\/\*\s*THEME\s*\*\/([\s\S]*?)\/\*\s*\/THEME\s*\*\//;
const MODOS = ['claro', 'escuro'];

/* ---------- checks ---------- */
const BANDAS = { claro: [0.43, 0.77], escuro: [0.48, 0.67] };   // categorical slots, per mode
const CROMA_MIN = 0.10;       // below this a "colour" reads gray
const DE_MIN = 15;            // adjacent slots, normal vision

function ok(cond) { return cond ? 'PASS' : 'FAIL'; }
// An unfilled slot must FAIL loudly: `oklab('?')` yields NaN and every comparison
// against NaN is false, so without this a half-written theme reports OK.
const ehHex = (v) => typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
function invalidos(rot, cores) {
  const maus = cores.filter((c) => !ehHex(c));
  if (maus.length) linha(rot, 'FAIL', 'não é cor: ' + maus.join(', ') +
    ' — preencha o slot antes de conferir');
  return maus.length > 0;
}
function linha(rot, estado, detalhe) {
  console.log(`  [${estado}] ${rot.padEnd(22)} ${detalhe}`);
}

function checarSeries(cores, surface, modo = ehEscura(surface) ? 'escuro' : 'claro') {
  const banda = BANDAS[modo];
  console.log(`\nSéries (tema ${modo}, ${cores.length} slots, superfície ${surface})`);
  if (invalidos('Slots preenchidos', cores)) return false;
  let falhou = false;

  const fora = cores.filter((c) => { const L = oklab(c).L; return L < banda[0] || L > banda[1]; });
  falhou ||= fora.length > 0;
  linha('Banda de luminosidade', ok(!fora.length), fora.length
    ? `fora de L ${banda[0]}–${banda[1]}: ` + fora.map((c) => `${c} ${oklab(c).L.toFixed(3)}`).join(', ')
    : `todas dentro de L ${banda[0]}–${banda[1]}`);

  const cinza = cores.filter((c) => chroma(c) < CROMA_MIN);
  falhou ||= cinza.length > 0;
  linha('Piso de croma', ok(!cinza.length), cinza.length
    ? 'lê como cinza: ' + cinza.map((c) => `${c} ${chroma(c).toFixed(3)}`).join(', ')
    : `todas >= ${CROMA_MIN}`);

  let pior = { d: Infinity };
  for (let i = 1; i < cores.length; i++) {
    const d = deltaE(cores[i - 1], cores[i]);
    if (d < pior.d) pior = { d, par: `${cores[i - 1]}↔${cores[i]}` };
  }
  if (cores.length > 1) {
    falhou ||= pior.d < DE_MIN;
    linha('Separação adjacente', ok(pior.d >= DE_MIN),
      `pior par ${pior.par} ΔE ${pior.d.toFixed(1)}` + (pior.d < DE_MIN ? ` (piso ${DE_MIN})` : ''));
  }

  const fracas = cores.filter((c) => contrast(c, surface) < 3);
  linha('Contraste na superfície', fracas.length ? 'WARN' : 'PASS', fracas.length
    ? 'abaixo de 3:1, exige rótulo visível ou tabela: ' +
      fracas.map((c) => `${c} ${contrast(c, surface).toFixed(2)}`).join(', ')
    : 'todas >= 3:1');

  return !falhou;
}

// The first step where --on-hi beats --on-lo. The same rule serves a ramp that
// falls (light theme) and one that rises (dark theme).
function medirFlip(cores, onLo, onHi) {
  const indice = cores.findIndex((c) => contrast(c, onHi) > contrast(c, onLo));
  return indice === -1 ? cores.length : indice;
}

function checarRampa(cores, sobe, onLo, onHi) {
  console.log(`\nRampa sequencial (${cores.length} passos, ${sobe ? 'sobe' : 'desce'} em luminosidade)`);
  if (invalidos('Passos preenchidos', cores)) return false;
  let anterior = sobe ? -Infinity : Infinity, monotonica = true;
  cores.forEach((c) => {
    const L = oklab(c).L;
    if (sobe ? L <= anterior : L >= anterior) monotonica = false;
    anterior = L;
  });
  linha('Luminosidade monotônica', ok(monotonica), monotonica
    ? `${sobe ? 'cresce' : 'decresce'} em todos os passos`
    : `um passo não é ${sobe ? 'mais claro' : 'mais escuro'} que o anterior`);

  console.log(`  --on-flip: ${medirFlip(cores, onLo, onHi)}   (primeiro passo em que --on-hi vence)`);
  cores.forEach((c, i) => {
    const lo = contrast(c, onLo), hi = contrast(c, onHi);
    console.log(`    h${i} ${c}  L ${oklab(c).L.toFixed(3)}  --on-lo ${lo.toFixed(2)} | --on-hi ${hi.toFixed(2)}` +
      `  -> ${hi > lo ? '--on-hi' : '--on-lo'}`);
  });
  return monotonica;
}

function checarTintas(vars, surface, modo) {
  console.log(`\nTintas de texto (tema ${modo}, superfície ${surface})`);
  const alvos = { '--ink': 7, '--muted': 6, '--faint': 4.5, '--accent': 4.5, '--brand': 3 };
  let falhou = false;
  for (const [nome, alvo] of Object.entries(alvos)) {
    const cor = vars[nome];
    if (!cor) continue;
    if (!ehHex(cor)) { linha(nome, 'FAIL', `${cor} — não é cor`); falhou = true; continue; }
    const c = contrast(cor, surface);
    const passou = c >= alvo;
    falhou ||= !passou;
    linha(nome, ok(passou), `${cor}  ${c.toFixed(2)}:1  (mínimo ${alvo})`);
  }
  if (vars['--brand'] && vars['--accent'] && vars['--brand'] === vars['--accent']
      && contrast(vars['--brand'], surface) < 4.5) {
    console.log('  [WARN] --accent  a cor da marca está servindo de texto pequeno abaixo de 4,5:1;' +
      ' ajuste o accent para um passo do mesmo hue que passe e mantenha a original em --brand');
  }
  return !falhou;
}

function checarRampaDoTema(vars, surface, modo) {
  const onLo = vars['--on-lo'] || vars['--ink'], onHi = vars['--on-hi'] || surface;
  if (invalidos('Tintas da rampa', [onLo, onHi])) return false;
  const rampa = listaRampa(vars);
  let bom = checarRampa(rampa, modo === 'escuro', onLo, onHi);
  const declarado = vars['--on-flip'];
  if (declarado !== undefined) {
    const medido = medirFlip(rampa, onLo, onHi);
    if (+declarado !== medido) {
      linha('--on-flip', 'FAIL', `declarado ${declarado}, medido ${medido}`);
      bom = false;
    }
  }
  return bom;
}

function checarModo(modo, vars) {
  console.log(`\n=== Tema ${modo} ===`);
  const surface = vars['--bg'];
  if (!ehHex(surface)) { linha('--bg', 'FAIL', 'ausente ou não é cor'); return false; }
  let bom = true;
  if ((modo === 'escuro') !== ehEscura(surface)) {
    linha('--bg', 'FAIL', `${surface} não é uma superfície ${modo}`);
    bom = false;
  }
  bom = checarTintas(vars, surface, modo) && bom;
  const series = listaSeries(vars);
  if (series.length) bom = checarSeries(series, surface, modo) && bom;
  if (listaRampa(vars).length) bom = checarRampaDoTema(vars, surface, modo) && bom;
  return bom;
}

/* ---------- parsing ---------- */
function varsDoBloco(bloco) {
  const out = {};
  for (const m of bloco.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) out[m[1]] = m[2].trim();
  return out;
}
const listaSeries = (v) => Object.keys(v).filter((k) => /^--c\d+$/.test(k))
  .sort((a, b) => +a.slice(3) - +b.slice(3)).map((k) => v[k]);
const listaRampa = (v) => Object.keys(v).filter((k) => /^--h\d+$/.test(k))
  .sort((a, b) => +a.slice(3) - +b.slice(3)).map((k) => v[k]);

// Every innermost declaration block of the theme, grouped by the mode its
// `color-scheme` names. A dark theme is written twice (system setting and explicit
// choice), so a mode holds a list of blocks.
function blocosPorModo(bloco) {
  const porModo = { claro: [], escuro: [] };
  const semComentarios = bloco.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, corpo] of semComentarios.matchAll(/\{([^{}]*)\}/g)) {
    const esquema = corpo.match(/color-scheme\s*:\s*(light|dark)\s*;/);
    if (esquema) porModo[esquema[1] === 'dark' ? 'escuro' : 'claro'].push(varsDoBloco(corpo));
  }
  return porModo;
}

function divergencias(blocos) {
  const [primeiro, ...demais] = blocos;
  const nomes = new Set(blocos.flatMap((b) => Object.keys(b)));
  return [...nomes].filter((nome) => demais.some((b) => b[nome] !== primeiro[nome]));
}

/* ---------- commands ---------- */
function lerArquivo(p) { return fs.readFileSync(p, 'utf8'); }

function cmdExtract(caminho) {
  const m = lerArquivo(caminho).match(RE);
  if (!m) {
    console.error(`Nenhum bloco /* THEME */ … /* /THEME */ em ${caminho}.\n` +
      'O arquivo não foi escrito por esta skill, ou os delimitadores sumiram.');
    process.exit(1);
  }
  console.log('/* THEME */' + m[1] + '/* /THEME */');
}

function cmdCheck(alvo) {
  if (alvo.includes('#') && !fs.existsSync(alvo)) {
    const cores = alvo.split(',').map((s) => s.trim()).filter(Boolean);
    const i = A.indexOf('--surface');
    process.exit(checarSeries(cores, i > -1 ? A[i + 1] : '#ffffff') ? 0 : 1);
  }
  const m = lerArquivo(alvo).match(RE);
  if (!m) { console.error(`Sem bloco de tema em ${alvo}.`); process.exit(1); }
  const porModo = blocosPorModo(m[1]);
  console.log(`Tema de ${alvo}`);
  let bom = true;
  for (const modo of MODOS) {
    const blocos = porModo[modo];
    if (!blocos.length) {
      console.log(`\n=== Tema ${modo} ===`);
      linha(`Tema ${modo}`, 'FAIL', `o tema ${modo} está ausente: todo relatório carrega os dois temas` +
        ' (veja references/themes.md)');
      bom = false;
      continue;
    }
    const diferentes = divergencias(blocos);
    bom = checarModo(modo, blocos[0]) && bom;
    if (diferentes.length) {
      linha('Blocos do tema', 'FAIL', `os blocos do tema ${modo} divergem em: ${diferentes.join(', ')}`);
      bom = false;
    }
  }
  console.log(bom ? '\n→ temas OK' : '\n→ corrija o que está marcado');
  process.exit(bom ? 0 : 1);
}

function cmdRamp(lista) {
  const cores = lista.split(',').map((s) => s.trim()).filter(Boolean);
  const sobe = oklab(cores[0]).L < oklab(cores[cores.length - 1]).L;
  const i = A.indexOf('--on-lo'), j = A.indexOf('--on-hi');
  const onLo = i > -1 ? A[i + 1] : sobe ? '#f0efec' : '#111111';
  const onHi = j > -1 ? A[j + 1] : sobe ? '#161615' : '#ffffff';
  process.exit(checarRampa(cores, sobe, onLo, onHi) ? 0 : 1);
}

/* ---------- derive ---------- */
const SUPERFICIE_ESCURA = '#161615';
const PASSOS_DA_RAMPA = 7;
const STATUS = {
  claro: { pos: '#0ca30c', neg: '#d03b3b', warn: '#b26a00' },
  escuro: { pos: '#3fb950', neg: '#f07272', warn: '#e3a33a' },
};

// Ink and the greys are the brand hue held at low chroma, so the page feels like the
// brand without any of them competing with a data series for attention.
function tintasDe(brand, surface, inkEscolhida) {
  const ink = inkEscolhida || ajustarPara(brand, 13, surface, 0.18);
  return { ink, muted: ajustarPara(ink, 6.5, surface, 1), faint: ajustarPara(ink, 5.0, surface, 1) };
}

// The brand hex stays for fills; small text takes the brand when it clears 4.5:1 on
// the surface, and otherwise the nearest step of the same hue that does.
const accentDe = (brand, surface) =>
  contrast(brand, surface) >= 4.5 ? brand : ajustarPara(brand, 4.6, surface, 1);

function derivarClaro(brand, surface, inkEscolhida) {
  const { ink, muted, faint } = tintasDe(brand, surface, inkEscolhida);
  const accent = accentDe(brand, surface);

  // Sequential ramp: one hue, near-surface to the ink, chroma rising then settling.
  const bl = oklab(brand), il = oklab(ink);
  const rampa = Array.from({ length: PASSOS_DA_RAMPA }, (_, i) => {
    if (i === PASSOS_DA_RAMPA - 1) return ink;
    const t = i / (PASSOS_DA_RAMPA - 1);
    const L = 0.94 - t * (0.94 - il.L);
    const k = Math.sin(Math.PI * t * 0.75) * 0.9 + 0.15;   // fade the chroma toward the ink
    return oklab2hex({ L, a: bl.a * k, b: bl.b * k });
  });
  const onHi = '#ffffff';
  return {
    ink, muted, faint, bg: surface, panel: '#f5f6f8', line: '#e3e6ea',
    accent, brand, ...STATUS.claro, c1: accent, rampa,
    onLo: ink, onHi, onFlip: medirFlip(rampa, ink, onHi),
  };
}

function derivarEscuro(brand, surface) {
  const { ink, muted, faint } = tintasDe(brand, surface);
  const accent = accentDe(brand, surface);
  const marca = naBanda(brand, BANDAS.escuro);

  // Sequential ramp: one hue rising from just above the surface to near white, with
  // the chroma fading toward both ends.
  const bl = oklab(brand);
  const base = oklab(surface).L + 0.07, topo = 0.90;
  const rampa = Array.from({ length: PASSOS_DA_RAMPA }, (_, i) => {
    const t = i / (PASSOS_DA_RAMPA - 1);
    const k = Math.sin(Math.PI * t) * 0.8 + 0.15;
    return oklab2hex({ L: base + t * (topo - base), a: bl.a * k, b: bl.b * k });
  });
  return {
    ink, muted, faint, bg: surface, panel: clarear(surface, 0.05), line: clarear(surface, 0.13),
    accent, brand: marca, ...STATUS.escuro, c1: marca, rampa,
    onLo: ink, onHi: surface, onFlip: medirFlip(rampa, ink, surface),
  };
}

const linhasDoTema = (t, recuo) => [
  `--ink:${t.ink}; --muted:${t.muted}; --faint:${t.faint};`,
  `--bg:${t.bg}; --panel:${t.panel}; --line:${t.line};`,
  `--accent:${t.accent}; --brand:${t.brand};`,
  `--pos:${t.pos}; --neg:${t.neg}; --warn:${t.warn};`,
  `--c1:${t.c1}; --c2:?; --c3:?; --c4:?; --c5:?; --c6:?;`,
  t.rampa.map((c, i) => `--h${i}:${c};`).join(' '),
  `--on-lo:${t.onLo}; --on-hi:${t.onHi}; --on-flip:${t.onFlip};`,
].map((l) => recuo + l).join('\n');

const blocoDoTema = (claro, escuro) => `/* THEME */
:root{
  color-scheme: light;
${linhasDoTema(claro, '  ')}
}
@media screen and (prefers-color-scheme: dark){
  :root:where(:not([data-theme="light"])){
    color-scheme: dark;
${linhasDoTema(escuro, '    ')}
  }
}
@media screen{
  :root[data-theme="dark"]{
    color-scheme: dark;
${linhasDoTema(escuro, '    ')}
  }
}
/* /THEME */`;

function cmdDerive() {
  const arg = (n, d) => { const i = A.indexOf(n); return i > -1 ? A[i + 1] : d; };
  const brand = arg('--brand');
  if (!brand) {
    console.error('uso: derive --brand #hex [--ink #hex] [--surface #ffffff] [--surface-dark #161615]');
    process.exit(1);
  }
  const surface = arg('--surface', '#ffffff');
  const surfaceDark = arg('--surface-dark', SUPERFICIE_ESCURA);
  const claro = derivarClaro(brand, surface, arg('--ink'));
  const escuro = derivarEscuro(brand, surfaceDark);

  console.log(blocoDoTema(claro, escuro));
  console.log(`
Falta escolher --c2..--c6 nos dois temas: hues que se separem de --c1, cada tema
validado contra o próprio fundo. Proponha e rode
  node theme.mjs check "${claro.c1},#hex,#hex,…" --surface ${surface}
  node theme.mjs check "${escuro.c1},#hex,#hex,…" --surface ${surfaceDark}
até passar, e note que a ordem dos slots é o mecanismo: as mesmas cores em outra
ordem podem reprovar. Depois cole os valores nos três blocos (o escuro vale nos dois
blocos escuros, com o mesmo conteúdo) e rode
  node theme.mjs check <relatorio.html>`);
}

switch (cmd) {
  case 'extract': cmdExtract(A[1]); break;
  case 'check':   cmdCheck(A[1]); break;
  case 'ramp':    cmdRamp(A[1]); break;
  case 'derive':  cmdDerive(); break;
  default:
    console.log(`theme.mjs — ferramenta de tema do html-report

  extract <report.html>              extrai o bloco /* THEME */ (claro e escuro) de um relatório
  check   <report.html>              confere o tema claro e o escuro de um relatório inteiro
  check   "#hex,#hex,…" [--surface]  confere uma paleta de séries candidata (claro ou escuro, pela superfície)
  ramp    "#hex,…" [--on-lo] [--on-hi]  confere uma rampa, nos dois sentidos, e mede o --on-flip
  derive  --brand #hex [--ink] [--surface] [--surface-dark]   propõe os dois temas a partir da marca

Não simula daltonismo: para isso, e para escolha de forma de gráfico, use a skill dataviz.`);
}
