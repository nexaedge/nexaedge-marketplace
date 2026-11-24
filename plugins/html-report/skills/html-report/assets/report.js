/* The shared behaviour of every html-report report: the helpers, the page's controls and the
   function of every element. It loads in <head>, so the helpers exist when the report's own
   script runs at the end of <body>; the page's controls start once the document has loaded. */

/* The reader's stored choices apply before the first paint. */
try {
  const storedTheme = localStorage.getItem('theme');
  if (storedTheme === 'light' || storedTheme === 'dark') document.documentElement.dataset.theme = storedTheme;
  if (localStorage.getItem('toc') === 'off') document.documentElement.classList.add('toc-off');
} catch (e) {}

/* ---------- helpers ---------- */

/* Number formatting in the language of <html lang> and the currency of <html data-currency>. */
const fmt = (() => {
  const locale = () => document.documentElement.lang || 'pt-BR';
  const currency = () => document.documentElement.dataset.currency || 'BRL';
  const isMissing = (v) => v === null || v === undefined || Number.isNaN(v);
  const fixed = (v, digits) => new Intl.NumberFormat(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  return {
    money: (v) => isMissing(v) ? '—' : new Intl.NumberFormat(locale(), { style: 'currency', currency: currency(), maximumFractionDigits: 0 }).format(v),
    num: (v, digits = 0) => isMissing(v) ? '—' : fixed(v, digits),
    pct: (v, digits = 1) => isMissing(v) ? '—' : fixed(v, digits) + '%',
  };
})();

const escapeHtml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgNode(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

/* Read a theme token. A chart never writes a hex of its own. */
const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* Draw now and again on every `themechange`, for a chart that resolves tokens in JavaScript. */
function onTheme(draw) { draw(); document.addEventListener('themechange', draw); }

/* The boxed legend above a chart: at most six entries, "Outros" included. */
function legend(selector, items) {
  const mount = document.querySelector(selector);
  if (mount) mount.innerHTML = items.map((item) => `<li><i style="background:${item.color}"></i>${escapeHtml(item.name)}</li>`).join('');
}

/* The one hover layer. `show(html, ev)` for a chart's own hover; any element with `data-tip`,
   `data-def` or a source badge's `data-title` shows its text with no code. */
const tooltip = (() => {
  const layer = document.createElement('div');
  layer.className = 'tip';
  layer.setAttribute('role', 'tooltip');
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(layer));
  const place = (x, y) => {
    const box = layer.getBoundingClientRect();
    const left = Math.min(x + 14, innerWidth - box.width - 8);
    const above = y - box.height - 12;
    layer.style.left = Math.max(8, left) + 'px';
    layer.style.top = (above >= 8 ? above : y + 18) + 'px';
  };
  const open = (owner, anchor) => { layer.style.opacity = 1; state.owner = owner; state.anchor = anchor; };
  let onHide = null;
  const state = {
    owner: null,
    anchor: null,
    show(html, ev) { layer.innerHTML = html; open('chart', null); place(ev.clientX, ev.clientY); },
    /* A chart's own hover on `target`: html(ev) gives the content at the pointer, or nothing.
       A mouse follows the pointer; a tap shows it and a tap elsewhere closes it. hidden() runs
       when it closes, to clear a crosshair or an outline. */
    follow(target, html, hidden) {
      target.classList.add('has-tip');
      const showAt = (ev) => {
        const content = html(ev);
        if (!content) return;
        if (onHide && onHide !== hidden) { const previousHide = onHide; onHide = null; previousHide(); }
        state.show(content, ev);
        onHide = hidden ?? null;
      };
      target.addEventListener('pointermove', (ev) => { if (ev.pointerType === 'mouse') showAt(ev); });
      target.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') state.hide(); });
      target.addEventListener('click', (ev) => { ev.stopPropagation(); showAt(ev); });
    },
    say(text, ev, anchor = null) { layer.textContent = text; open('text', anchor); place(ev.clientX, ev.clientY); },
    sayAt(text, anchor) {
      layer.textContent = text;
      open('text', anchor);
      const box = anchor.getBoundingClientRect();
      place(box.left + box.width / 2 - 14, box.top);
    },
    hide() {
      layer.style.opacity = 0; state.owner = null; state.anchor = null;
      const hideCallback = onHide;
      onHide = null;
      hideCallback?.();
    },
    row: (name, value, color) =>
      `<div class="r"><span>${color ? `<i style="background:${color}"></i>` : ''}${name}</span><span>${value}</span></div>`,
  };
  return state;
})();

/* ---------- element functions ---------- */

/* A bar with rounded top corners only. */
function topRounded(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/* The values of a chart as a table that only a screen reader sees, beside the drawing: the
   drawing is an image whose accessible name says what it shows but gives no numbers.
   rows: [[label, value, ...]], one text per column. */
function valuesTable(host, { columns, rows }) {
  const cell = (tag, text) => `<${tag}>${escapeHtml(text)}</${tag}>`;
  const table = document.createElement('table');
  table.innerHTML = `<caption>Valores do gráfico</caption><thead><tr><td></td>${columns.map((name) => cell('th', name)).join('')}</tr></thead>` +
    `<tbody>${rows.map(([label, ...values]) => `<tr><th scope="row">${escapeHtml(label)}</th>${values.map((value) => cell('td', value)).join('')}</tr>`).join('')}</tbody>`;
  const wrapper = document.createElement('div');
  wrapper.className = 'visually-hidden';
  wrapper.append(table);
  host.append(wrapper);
}

/* Grouped columns: one group per label, one column per series, the value above each column.
   series: [{ name, token: '--c1', values: [...] }] */
function groupedColumns(host, { labels, series, max, ticks, aria }) {
  const width = 880, height = 300, leftMargin = 48, bottomMargin = 44, topMargin = 24;
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': aria });
  const y = (v) => height - bottomMargin - (height - bottomMargin - topMargin) * v / max;
  ticks.forEach((tick) => {
    svg.appendChild(svgNode('line', { class: tick ? 'grid' : 'base', x1: leftMargin, x2: width, y1: y(tick), y2: y(tick) }));
    svg.appendChild(svgNode('text', { class: 'tick', x: leftMargin - 10, y: y(tick) + 4, 'text-anchor': 'end' }, fmt.num(tick)));
  });
  const groupWidth = (width - leftMargin) / labels.length, barWidth = Math.min(34, (groupWidth * 0.6) / series.length);
  labels.forEach((label, group) => {
    const x0 = leftMargin + group * groupWidth + (groupWidth - barWidth * series.length) / 2;
    svg.appendChild(svgNode('text', { class: 'tick', x: leftMargin + group * groupWidth + groupWidth / 2, y: height - 16, 'text-anchor': 'middle' }, label));
    series.forEach((s, index) => {
      const value = s.values[group], x = x0 + index * barWidth, top = y(value);
      svg.appendChild(svgNode('path', { d: topRounded(x + 1, top, barWidth - 2, height - bottomMargin - top, 4), fill: `var(${s.token})` }));
      svg.appendChild(svgNode('text', { class: 'val', x: x + barWidth / 2, y: top - 6, 'text-anchor': 'middle' }, fmt.num(value)));
    });
    const band = svgNode('rect', { x: leftMargin + group * groupWidth, y: topMargin, width: groupWidth, height: height - bottomMargin - topMargin, fill: 'transparent' });
    svg.appendChild(band);
    tooltip.follow(band, () => `<b>${escapeHtml(label)}</b>` + series.map((s) => tooltip.row(escapeHtml(s.name), fmt.num(s.values[group]), `var(${s.token})`)).join(''));
  });
  host.replaceChildren(svg);
  valuesTable(host, { columns: series.map((s) => s.name), rows: labels.map((label, group) => [label, ...series.map((s) => fmt.num(s.values[group]))]) });
}

/* Waterfall: a total starts at zero, each exit hangs from the level the step before left.
   steps: [[label, value, 'total'?]]; format(value) writes a value for the hover. */
function waterfall(host, { steps, max, aria, format = (v) => fmt.num(v) }) {
  const width = 880, height = 300, leftMargin = 20, bottomMargin = 44, topMargin = 30;
  const y = (v) => height - bottomMargin - (height - bottomMargin - topMargin) * v / max;
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': aria });
  svg.appendChild(svgNode('line', { class: 'base', x1: leftMargin, x2: width - leftMargin, y1: y(0), y2: y(0) }));
  const stepWidth = (width - 2 * leftMargin) / steps.length, barWidth = stepWidth * 0.56;
  const signOf = (value) => (value < 0 ? '− ' : '');
  let level = 0;
  steps.forEach(([label, value, kind], index) => {
    const x = leftMargin + index * stepWidth + (stepWidth - barWidth) / 2;
    const from = kind === 'total' ? 0 : level, to = kind === 'total' ? value : level + value;
    const top = y(Math.max(from, to)), bottom = y(Math.min(from, to));
    const sign = signOf(value);
    svg.appendChild(svgNode('rect', { x, y: top, width: barWidth, height: bottom - top, rx: 3, fill: kind === 'total' ? 'var(--c1)' : 'var(--c2)' }));
    svg.appendChild(svgNode('text', { class: 'val', x: x + barWidth / 2, y: top - 8, 'text-anchor': 'middle' }, sign + fmt.num(Math.abs(value))));
    svg.appendChild(svgNode('text', { class: 'tick', x: x + barWidth / 2, y: height - 16, 'text-anchor': 'middle' }, label));
    const band = svgNode('rect', { x: leftMargin + index * stepWidth, y: topMargin, width: stepWidth, height: height - bottomMargin - topMargin, fill: 'transparent' });
    svg.appendChild(band);
    tooltip.follow(band, () => escapeHtml(`${label}: ${sign}${format(Math.abs(value))}`));
    if (index < steps.length - 1) svg.appendChild(svgNode('line', { x1: x + barWidth, x2: x + stepWidth, y1: y(to), y2: y(to), stroke: 'var(--line-strong)', 'stroke-dasharray': '3 3' }));
    level = to;
  });
  host.replaceChildren(svg);
  valuesTable(host, {
    columns: ['Valor', 'Tipo'],
    rows: steps.map(([label, value, kind]) => [label, signOf(value) + format(Math.abs(value)), kind === 'total' ? 'total' : 'variação']),
  });
}

/* One cell of the colour grid: the colour grows with `share`, from 0 to 1. */
function heatCell(td, share, tipText) {
  td.classList.add('shade');
  td.style.setProperty('--share', share.toFixed(3));
  td.dataset.tip = tipText;
}

/* The colour grid: one dimension in the rows, the other in the columns, the value in each cell.
   rows: [{ label, values }], where a missing value (null, or a short list) is a cell that does not exist yet.
   range: the values the colour runs over, by default the lowest to the highest; base: [row, column] outlined. */
function heatGrid(table, { corner, group, columns, rows, cell, tip, range, base }) {
  const values = rows.flatMap((row) => row.values).filter((v) => v !== null && v !== undefined);
  const [low, high] = range ?? [Math.min(...values), Math.max(...values)];
  table.innerHTML = `<thead><tr class="group"><th rowspan="2">${corner}</th><th colspan="${columns.length}">${group}</th></tr>` +
    `<tr class="sub">${columns.map((c) => `<th>${c}</th>`).join('')}</tr></thead>`;
  const body = table.createTBody();
  rows.forEach((row, r) => {
    const tr = body.insertRow();
    tr.insertCell().textContent = row.label;
    columns.forEach((column, c) => {
      const value = row.values[c], td = tr.insertCell();
      if (value === null || value === undefined) { td.className = 'na'; return; }
      td.className = 'c';
      td.innerHTML = cell(value);
      heatCell(td, high > low ? (value - low) / (high - low) : 0, tip(row.label, column, value));
      if (base && base[0] === r && base[1] === c) td.classList.add('base');
    });
  });
}

/* An Excel file (.xlsx) built in the browser with no library: a stored zip of five XML parts. */
function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) {
    let c = (crc ^ byte) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function zipStored(files) {
  const encoder = new TextEncoder(), chunks = [], central = [];
  const today = new Date();
  const dosDate = ((today.getFullYear() - 1980) << 9) | ((today.getMonth() + 1) << 5) | today.getDate();
  const write = (view, fields) => fields.forEach(([at, value, size]) => size === 4 ? view.setUint32(at, value, true) : view.setUint16(at, value, true));
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), data = encoder.encode(file.text), crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    write(local, [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, dosDate, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, name.length, 2], [28, 0, 2]]);
    chunks.push(new Uint8Array(local.buffer), name, data);
    const entry = new DataView(new ArrayBuffer(46));
    write(entry, [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, dosDate, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, offset, 4]]);
    central.push(new Uint8Array(entry.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  write(end, [[0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2], [12, centralSize, 4], [16, offset, 4], [20, 0, 2]]);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
/* Excel takes a sheet name of 1 to 31 characters with none of [ ] : * ? / \ and no apostrophe at either end. */
function validSheetName(name) {
  const cleaned = String(name ?? '').replace(/[\[\]:*?/\\\s]+/g, ' ').trim().slice(0, 31).replace(/^'+|'+$/g, '').trim();
  return cleaned || 'Dados';
}
/* rows: the first one is the header; a number becomes a numeric cell, anything else text. */
function rowsToXlsx(rows, sheetName) {
  const escapeXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const columnName = (i) => (i >= 26 ? columnName(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
  const sheetRows = rows.map((cells, r) => {
    const xml = cells.map((value, c) => {
      const ref = columnName(c) + (r + 1);
      return typeof value === 'number' ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
    });
    return `<row r="${r + 1}">${xml.join('')}</row>`;
  });
  const ns = 'http://schemas.openxmlformats.org';
  return zipStored([
    { name: '[Content_Types].xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
    { name: '_rels/.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(validSheetName(sheetName))}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
    { name: 'xl/worksheets/sheet1.xml', text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${ns}/spreadsheetml/2006/main"><sheetData>${sheetRows.join('')}</sheetData></worksheet>` },
  ]);
}
function downloadBlob(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

/* The interactive table: the whole list stays in memory, the screen shows one page, the Excel
   file takes every row in the screen's order. The columns are the `th[data-k]` of the markup;
   every `select[data-f]` but the page size filters on the row field it names.
   options: { noun, file, sheet, search: 'field', sort: { key, asc }, cell: { key: (row) => html },
              exportValue: { key: (row) => value }, header: [...], empty: 'text' } */
function interactiveTable(fig, rows, options) {
  const { noun, file, sheet, search, cell = {}, exportValue = {}, empty = 'Nenhuma linha com esses filtros.' } = options;
  const table = fig.querySelector('table.itable'), body = table.tBodies[0];
  const columns = [...table.querySelectorAll('th[data-k]')];
  const control = (name) => fig.querySelector(`[data-f="${name}"]`);
  const filters = [...fig.querySelectorAll('.tbl-tools select[data-f]')].map((select) => select.dataset.f);
  const foldAccents = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const state = { key: options.sort?.key ?? columns[0].dataset.k, asc: options.sort?.asc ?? true, page: 1, pageSize: Number(control('per')?.value ?? 10) };

  filters.forEach((name) => {
    const select = control(name);
    if (select.options.length <= 1) [...new Set(rows.map((r) => r[name]))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')).forEach((v) => select.add(new Option(v, v)));
  });
  fig.querySelector('[data-xlsx] .n').textContent = ` · ${fmt.num(rows.length)} linhas`;

  const sortedRows = () => {
    const th = table.querySelector(`th[data-k="${state.key}"]`);
    const compare = th.dataset.sort === 'num' ? (a, b) => a[state.key] - b[state.key] : (a, b) => String(a[state.key]).localeCompare(String(b[state.key]), 'pt-BR');
    return [...rows].sort((a, b) => state.asc ? compare(a, b) : -compare(a, b));
  };
  const filteredRows = () => {
    const query = foldAccents(control('q')?.value.trim() ?? '');
    return sortedRows().filter((r) => (!query || foldAccents(r[search]).includes(query)) && filters.every((name) => !control(name).value || String(r[name]) === control(name).value));
  };
  const pageButton = (label, page, { isCurrent = false, isDisabled = false, aria } = {}) => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = label; button.disabled = isDisabled;
    if (aria) button.setAttribute('aria-label', aria);
    if (isCurrent) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => { state.page = page; render(); });
    return button;
  };
  /* A narrow screen shows the first, the current and the last page; a wide one their neighbours too. */
  const isNarrow = () => fig.clientWidth < 480;
  const pageNumbers = (page, pages) => {
    if (pages <= (isNarrow() ? 4 : 7)) return Array.from({ length: pages }, (_, i) => i + 1);
    const shownPages = (isNarrow() ? [1, page, pages] : [1, page - 1, page, page + 1, pages]).filter((p) => p >= 1 && p <= pages);
    return [...new Set(shownPages)].sort((a, b) => a - b).flatMap((p, i, all) => i && p - all[i - 1] > 1 ? ['…', p] : [p]);
  };
  const hasFilters = () => Boolean(control('q')?.value) || filters.some((name) => control(name).value);

  function render() {
    const shownRows = filteredRows(), pages = Math.max(1, Math.ceil(shownRows.length / state.pageSize));
    state.page = Math.min(state.page, pages);
    const first = (state.page - 1) * state.pageSize;
    const page = shownRows.slice(first, first + state.pageSize);
    body.innerHTML = page.length ? '' : `<tr><td class="empty" colspan="${columns.length}">${escapeHtml(empty)}</td></tr>`;
    page.forEach((row) => {
      const tr = body.insertRow();
      columns.forEach((th) => {
        const td = tr.insertCell(), key = th.dataset.k;
        td.className = [...th.classList].filter((c) => c === 'tl' || c === 'tc').join(' ');
        if (cell[key]) td.innerHTML = cell[key](row); else td.textContent = row[key];
      });
    });
    columns.forEach((th) => th.dataset.k === state.key ? th.setAttribute('aria-sort', state.asc ? 'ascending' : 'descending') : th.removeAttribute('aria-sort'));
    const isFiltered = shownRows.length < rows.length;
    fig.querySelector('.pg-count').textContent = shownRows.length
      ? `${first + 1} a ${first + page.length} de ${shownRows.length} ${noun}${isFiltered ? `, filtrados de ${rows.length}` : ''}`
      : `0 de ${rows.length} ${noun}`;
    const clear = fig.querySelector('[data-clear]');
    if (clear) clear.hidden = !hasFilters();
    fig.querySelector('.pg-nav').replaceChildren(
      pageButton('‹', state.page - 1, { isDisabled: state.page === 1, aria: 'Página anterior' }),
      ...pageNumbers(state.page, pages).map((p) => p === '…' ? Object.assign(document.createElement('span'), { className: 'gap', textContent: '…' }) : pageButton(String(p), p, { isCurrent: p === state.page, aria: `Página ${p}` })),
      pageButton('›', state.page + 1, { isDisabled: state.page === pages, aria: 'Próxima página' }),
    );
    fig.querySelector('.tbl').dispatchEvent(new Event('scroll'));
  }

  /* A sortable header holds its content in a button, so the keyboard sorts too; the th keeps aria-sort. */
  columns.filter((th) => th.dataset.sort).forEach((th) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.append(...th.childNodes);
    th.append(button);
    button.addEventListener('click', () => {
      state.asc = state.key === th.dataset.k ? !state.asc : th.dataset.sort === 'text';
      state.key = th.dataset.k; state.page = 1; render();
    });
  });
  ['q', ...filters].forEach((name) => control(name)?.addEventListener('input', () => { state.page = 1; render(); }));
  control('per')?.addEventListener('change', (e) => { state.pageSize = Number(e.target.value); state.page = 1; render(); });
  fig.querySelector('[data-clear]')?.addEventListener('click', () => {
    ['q', ...filters].forEach((name) => { if (control(name)) control(name).value = ''; });
    state.page = 1; render();
  });
  fig.querySelector('[data-xlsx]').addEventListener('click', () => {
    const header = options.header ?? columns.map((th) => {
      const unit = th.querySelector('.u')?.textContent;
      return (th.querySelector('.h') ?? th).textContent.trim() + (unit ? ` (${unit})` : '');
    });
    const exported = sortedRows().map((row) => columns.map((th) => exportValue[th.dataset.k] ? exportValue[th.dataset.k](row) : row[th.dataset.k]));
    downloadBlob(rowsToXlsx([header, ...exported], sheet), file);
  });
  let wasNarrow = isNarrow();
  new ResizeObserver(() => {
    if (isNarrow() === wasNarrow) return;
    wasNarrow = !wasNarrow;
    render();
  }).observe(fig);
  render();
}

/* Tabs: show(key) fills the content for the tab's data-k; the tab marked selected opens on load. */
function tabs(root, show) {
  const buttons = [...root.querySelectorAll('[role="tab"]')];
  const select = (button) => {
    buttons.forEach((b) => b.setAttribute('aria-selected', b === button));
    show(button.dataset.k);
  };
  buttons.forEach((b) => b.addEventListener('click', () => select(b)));
  select(buttons.find((b) => b.getAttribute('aria-selected') === 'true') ?? buttons[0]);
}

/* Simulator: compute(form) writes the result now and after every change of a field. */
function simulator(form, compute) {
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => compute(form));
  form.addEventListener('change', () => compute(form));
  compute(form);
}

/* The arrow of a variation tag is drawn in CSS, so the direction is written here for a screen reader:
   a hidden "alta de" or "queda de" ahead of the size. A tag that has it already is left alone. */
function describeDeltas(root = document) {
  root.querySelectorAll('.delta.up, .delta.down').forEach((tag) => {
    if (tag.querySelector(':scope > .delta-direction')) return;
    const direction = Object.assign(document.createElement('span'), {
      className: 'visually-hidden delta-direction',
      textContent: tag.classList.contains('up') ? 'alta de ' : 'queda de ',
    });
    tag.prepend(direction);
  });
}

/* ---------- the page's controls ---------- */

/* The icons of the page's controls, drawn here so the markup carries empty buttons. CSS shows the
   one that matches the button's data-state. */
const pageIcon = (name, shapes) => `<svg class="i-${name}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
const THEME_ICONS = pageIcon('light', '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')
  + pageIcon('dark', '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>')
  + pageIcon('system', '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>');
const TOC_HIDE_ICONS = pageIcon('collapse', '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="M16 9l-3 3 3 3"/>')
  + pageIcon('close', '<path d="M6 6l12 12M18 6L6 18"/>');

document.addEventListener('DOMContentLoaded', () => {
  const root = document.documentElement;

  /* Theme button: system → the opposite of what shows → back to system. */
  (() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const button = document.querySelector('.theme-toggle');
    if (!button) return;
    button.innerHTML = THEME_ICONS;
    const LABEL = { system: 'sistema', light: 'claro', dark: 'escuro' };
    const currentTheme = () => root.dataset.theme || 'system';
    const stateAfter = (state) => {
      const shownTheme = media.matches ? 'dark' : 'light';
      const oppositeTheme = shownTheme === 'dark' ? 'light' : 'dark';
      return state === 'system' ? oppositeTheme : state === oppositeTheme ? shownTheme : 'system';
    };
    const paint = () => {
      const state = currentTheme();
      button.dataset.state = state;
      const label = `Tema: ${LABEL[state]}. Mudar para ${LABEL[stateAfter(state)]}`;
      button.setAttribute('aria-label', label);
      button.title = label;
    };
    const announce = () => document.dispatchEvent(new CustomEvent('themechange'));
    button.addEventListener('click', () => {
      const state = stateAfter(currentTheme());
      if (state === 'system') { delete root.dataset.theme; try { localStorage.removeItem('theme'); } catch (e) {} }
      else { root.dataset.theme = state; try { localStorage.setItem('theme', state); } catch (e) {} }
      paint(); announce();
    });
    media.addEventListener('change', () => { paint(); if (currentTheme() === 'system') announce(); });
    paint();
  })();

  /* Index: built from every h2[id] and h3[id] in <main>; it follows the scroll. In the margin it
     hides and comes back; as a drawer it closes on a link, on a tap outside it and on Esc. */
  (() => {
    const toc = document.getElementById('toc'), button = document.querySelector('.toc-btn');
    if (!toc || !button) return;
    const heads = [...document.querySelectorAll('main h2[id], main h3[id]')];
    if (!heads.length) { toc.remove(); button.remove(); return; }
    const titleOf = (h) => {
      if (h.dataset.toc) return h.dataset.toc;
      const copy = h.cloneNode(true);
      copy.querySelectorAll('.num').forEach((e) => e.remove());
      return copy.textContent.trim();
    };
    const list = toc.querySelector('.toc-list'), links = new Map();
    let section = null;
    heads.forEach((h) => {
      const link = Object.assign(document.createElement('a'), { href: '#' + h.id, textContent: titleOf(h) });
      const item = document.createElement('li');
      item.appendChild(link);
      if (h.tagName === 'H2' || !section) {
        item.appendChild(document.createElement('ol'));
        list.appendChild(item);
        section = item;
      } else section.querySelector('ol').appendChild(item);
      links.set(h, link);
    });
    const progress = toc.querySelector('.bar i');
    const spy = () => {
      const line = innerHeight * 0.4;
      let active = heads[0];
      for (const h of heads) { if (h.getBoundingClientRect().top <= line) active = h; else break; }
      links.forEach((a) => a.classList.remove('on'));
      toc.querySelectorAll('li.open').forEach((li) => li.classList.remove('open'));
      const link = links.get(active), top = link.closest('.toc-list > li');
      link.classList.add('on');
      top.classList.add('open');
      top.firstElementChild.classList.add('on');
      progress.style.width = Math.min(100, 100 * scrollY / Math.max(1, root.scrollHeight - innerHeight)) + '%';
    };
    document.addEventListener('scroll', spy, { passive: true });
    spy();
    const fitsMargin = matchMedia('(min-width: 1416px)');
    const hideButton = toc.querySelector('.toc-hide');
    hideButton.innerHTML = TOC_HIDE_ICONS;
    const setOff = (off) => {
      root.classList.toggle('toc-off', off);
      try { localStorage.setItem('toc', off ? 'off' : 'on'); } catch (e) {}
    };
    /* The index's own button collapses it in the margin and closes it as a drawer. */
    const setDrawer = (open) => {
      toc.classList.toggle('drawer', open);
      button.setAttribute('aria-expanded', open);
      const label = open ? 'Fechar o índice' : 'Recolher o índice';
      hideButton.dataset.state = open ? 'drawer' : 'margin';
      hideButton.setAttribute('aria-label', label);
      hideButton.title = label;
    };
    setDrawer(false);
    /* The index hides what holds the keyboard focus, so the focus moves to the button that brings it back,
       and to the index's own button when it opens. */
    const hideIndex = (change) => {
      const hadFocus = toc.contains(document.activeElement);
      change();
      if (hadFocus) button.focus();
    };
    const closeDrawer = () => hideIndex(() => setDrawer(false));
    button.addEventListener('click', () => {
      if (toc.classList.contains('drawer')) { closeDrawer(); return; }
      if (fitsMargin.matches && root.classList.contains('toc-off')) setOff(false);
      else setDrawer(true);
      hideButton.focus();
    });
    hideButton.addEventListener('click', () => {
      if (toc.classList.contains('drawer')) closeDrawer();
      else hideIndex(() => setOff(true));
    });
    toc.addEventListener('click', (e) => { if (e.target.closest('a')) closeDrawer(); });
    document.addEventListener('pointerdown', (e) => {
      if (toc.classList.contains('drawer') && !toc.contains(e.target) && !button.contains(e.target)) closeDrawer();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && toc.classList.contains('drawer')) closeDrawer();
    });
    fitsMargin.addEventListener('change', closeDrawer);
  })();

  /* Hover details: a mouse shows them on hover, a tap opens them and a tap elsewhere closes them,
     the keyboard shows them on focus, Enter and Space show a term's definition again, and Esc
     closes them. A source badge's second tap follows its link. */
  (() => {
    const SELECTOR = '[data-tip],[data-def],.ref[data-title]';
    const textOf = (el) => el.dataset.tip ?? el.dataset.def ?? el.dataset.title;
    let pointerKind = 'mouse';
    let followUntil = 0, followDeadline = 0;
    const isTouch = () => pointerKind === 'touch' || pointerKind === 'pen';
    document.addEventListener('pointerdown', (e) => { pointerKind = e.pointerType; }, true);
    document.addEventListener('keydown', () => { pointerKind = 'keyboard'; }, true);

    /* A definition and a source's title reach a screen reader as the description of their element. */
    const holder = document.createElement('div');
    holder.className = 'visually-hidden';
    document.querySelectorAll('[data-def],.ref[data-title]').forEach((el, index) => {
      const note = Object.assign(document.createElement('span'), { id: `hint-${index}`, textContent: textOf(el) });
      holder.append(note);
      el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), note.id].filter(Boolean).join(' '));
    });
    document.body.append(holder);

    document.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const target = e.target.closest?.(SELECTOR);
      if (target) tooltip.say(textOf(target), e, target);
      else if (tooltip.owner === 'text') tooltip.hide();
    });
    document.addEventListener('click', (e) => {
      if (!isTouch()) return;
      const target = e.target.closest?.(SELECTOR);
      if (!target) { if (tooltip.owner) tooltip.hide(); return; }
      if (tooltip.anchor === target) { tooltip.hide(); return; }
      if (target.matches('a[href]')) e.preventDefault();
      tooltip.sayAt(textOf(target), target);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && tooltip.owner) { tooltip.hide(); return; }
      const term = e.target.closest?.('.term-def');
      if (term && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tooltip.sayAt(textOf(term), term); }
    });
    /* The scroll that brings a focused element into view moves its detail along instead of closing it:
       it must start within 500ms of the focus, and it lasts until the scroll ends or 1.5s pass. */
    const followsFocusScroll = () => tooltip.anchor && performance.now() < followUntil;
    document.addEventListener('focusin', (e) => {
      const target = e.target.closest?.(SELECTOR);
      if (!target || isTouch() || !e.target.matches(':focus-visible')) return;
      followUntil = performance.now() + 500;
      followDeadline = performance.now() + 1500;
      tooltip.sayAt(textOf(target), target);
    });
    document.addEventListener('focusout', () => { if (tooltip.owner === 'text' && !isTouch()) tooltip.hide(); });
    document.addEventListener('scroll', () => {
      if (!followsFocusScroll()) { tooltip.hide(); return; }
      followUntil = followDeadline;
      tooltip.sayAt(textOf(tooltip.anchor), tooltip.anchor);
    }, { passive: true });
    document.addEventListener('scrollend', () => {
      followUntil = 0;
      if (tooltip.anchor) tooltip.sayAt(textOf(tooltip.anchor), tooltip.anchor);
    });
  })();

  /* A variation tag written after the load, by a table, a tab or a simulator, gets its direction too. */
  describeDeltas();
  new MutationObserver(() => describeDeltas()).observe(document.querySelector('main') ?? document.body, { childList: true, subtree: true });

  /* The pace marker of a progress bar is an empty box: the keyboard reaches it, which shows its
     detail, and a screen reader reads the pace as its name. */
  document.querySelectorAll('.progress .mark[data-tip]').forEach((mark) => {
    mark.tabIndex = 0;
    mark.setAttribute('role', 'img');
    mark.setAttribute('aria-label', mark.dataset.tip);
  });

  /* "Detalhes da análise": a button with data-modal opens the dialog of that id. */
  document.querySelectorAll('[data-modal]').forEach((b) => b.addEventListener('click', () => document.getElementById(b.dataset.modal).showModal()));
  document.querySelectorAll('dialog.analysis').forEach((dialog) => {
    dialog.querySelector('.m-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  });

  /* Link in the text: scrolls to the target and marks it for a moment. */
  const fragmentOf = (link) => {
    const raw = link.hash.slice(1);
    try { return decodeURIComponent(raw); } catch (e) { return raw; }
  };
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a.xref');
    const target = link && document.getElementById(fragmentOf(link));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const flash = target.tagName === 'SPAN' ? 'flash-text' : 'flash-box';
    target.classList.remove('flash-text', 'flash-box');
    setTimeout(() => {
      void target.offsetWidth;
      target.classList.add(flash);
      setTimeout(() => target.classList.remove(flash), 2500);
    }, 450);
  });

  /* Anything wider than its column scrolls inside its own box, with a visible bar below it
     that drags, arrows at its ends, and the right edge faded while there is more to see. */
  document.querySelectorAll('.tbl, .chart, .formula .eq, pre').forEach((box) => {
    const bar = document.createElement('div');
    bar.className = 'hs-bar';
    bar.innerHTML = '<button type="button" class="hs-btn" data-dir="-1" aria-label="Rolar para a esquerda">‹</button><div class="hs-track"><div class="hs-thumb"></div></div><button type="button" class="hs-btn" data-dir="1" aria-label="Rolar para a direita">›</button>';
    box.after(bar);
    const track = bar.querySelector('.hs-track'), thumb = bar.querySelector('.hs-thumb');
    const [backButton, forwardButton] = bar.querySelectorAll('.hs-btn');
    const maxScroll = () => box.scrollWidth - box.clientWidth;
    const sync = () => {
      const max = maxScroll();
      box.classList.toggle('scrolls', max > 4);
      bar.hidden = max <= 4;
      box.classList.toggle('at-start', box.scrollLeft <= 1);
      box.classList.toggle('at-end', box.scrollLeft >= max - 1);
      backButton.disabled = box.scrollLeft <= 1;
      forwardButton.disabled = box.scrollLeft >= max - 1;
      const thumbWidth = Math.max(24, track.clientWidth * box.clientWidth / box.scrollWidth);
      thumb.style.width = thumbWidth + 'px';
      thumb.style.transform = `translateX(${max > 0 ? box.scrollLeft / max * (track.clientWidth - thumbWidth) : 0}px)`;
    };
    box.addEventListener('scroll', sync, { passive: true });
    new ResizeObserver(sync).observe(box);
    sync();
    document.fonts.ready.then(sync);
    let dragStart = null;
    thumb.addEventListener('pointerdown', (e) => { dragStart = { x: e.clientX, left: box.scrollLeft }; thumb.setPointerCapture(e.pointerId); thumb.classList.add('drag'); e.preventDefault(); });
    thumb.addEventListener('pointermove', (e) => {
      if (!dragStart) return;
      box.scrollLeft = dragStart.left + (e.clientX - dragStart.x) * maxScroll() / (track.clientWidth - thumb.offsetWidth);
    });
    const endDrag = () => { dragStart = null; thumb.classList.remove('drag'); };
    thumb.addEventListener('pointerup', endDrag);
    thumb.addEventListener('pointercancel', endDrag);
    track.addEventListener('pointerdown', (e) => {
      if (e.target !== track) return;
      const trackBox = track.getBoundingClientRect();
      box.scrollTo({ left: (e.clientX - trackBox.left - thumb.offsetWidth / 2) / (trackBox.width - thumb.offsetWidth) * maxScroll(), behavior: 'smooth' });
    });
    [backButton, forwardButton].forEach((b) => b.addEventListener('click', () => box.scrollBy({ left: Number(b.dataset.dir) * box.clientWidth * 0.6, behavior: 'smooth' })));
  });

  /* The width of each equation in ems of its font size: print shrinks one that is wider than the paper. */
  const measureEquations = () => document.querySelectorAll('.formula .eq math').forEach((math) => {
    const contents = document.createRange();
    contents.selectNodeContents(math);
    const ems = contents.getBoundingClientRect().width / parseFloat(getComputedStyle(math).fontSize);
    math.closest('.eq').style.setProperty('--eq-ems', ems.toFixed(2));
  });
  measureEquations();
  document.fonts.ready.then(measureEquations);

  /* Side note: hung in the margin on a wide screen, right below its paragraph on a narrow one. */
  (() => {
    const narrowScreen = matchMedia('(max-width: 760px)');
    const notes = [...document.querySelectorAll('.sidenote')].map((note) => ({ note, mark: note.previousElementSibling, host: note.closest('p') }));
    const place = () => notes.forEach(({ note, mark, host }) => narrowScreen.matches ? host.after(note) : mark.after(note));
    narrowScreen.addEventListener('change', place);
    place();
  })();
});
