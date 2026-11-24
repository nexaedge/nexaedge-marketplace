# Charts: which form, the patterns, the traps

## Pick the form from the job

`assets/catalog.html` has a gallery of chart forms by the question each answers (`#e-galeria`), and `elements.md` the element for every other need. The common cases:

| The data's job | Form |
|---|---|
| One number that is the headline | The main number or number cards (`#e-principal`, `#e-cartoes`). Not a chart. |
| Compare magnitude across categories | Horizontal bars, sorted by value |
| Compare two or three measures in a few groups | Grouped columns (`groupedColumns`, `#e-moldura`) |
| Composition of a total over time | Stacked bars, one bar per period |
| Change over time, few series | Lines with markers |
| From one number to another, part by part | The waterfall (`waterfall`, `#e-cascata`) |
| Two dimensions, one value | The color grid, a table with the value in each cell (`heatGrid`, `#e-safras`); an SVG heatmap only when the matrix is too wide for a table |
| A list each reader reads their own way | The interactive table (`interactiveTable`, `#e-interativa`): search, filters, pages, sorting, Excel download |

Two rules that decide most cases:

- **A chart with three numbers is a sentence.** Write the sentence.
- **A table beats ten rows you picked.** If you find yourself choosing which rows to show, ship the table and let the reader choose.

Color comes last, and it comes from the theme tokens. If you are reaching for a hue that is not `--c1..--c6`, you are either drawing too many series (fold the tail into "Outros", painted `--other`) or you want a sequential ramp (`--h0..--h6`), not a categorical one.

## The shared functions

`assets/report.js` loads in every report's `<head>`, so these exist when the report's own script runs at the end of `<body>`:

| Function | What it does |
|---|---|
| `fmt.num(v, digits = 0)`, `fmt.pct(v, digits = 1)`, `fmt.money(v)` | Format in the language of `<html lang>` and the currency of `<html data-currency>`; a missing value prints "—" |
| `svgNode(tag, attrs, text)` | One SVG element |
| `token('--c1')` | A theme token's value in the mode on screen |
| `onTheme(draw)` | Runs `draw` now and on every mode change |
| `legend(selector, [{ name, color }])` | The boxed legend above a chart |
| `tooltip.follow(target, (ev) => html, hidden)` | A chart's own hover: follows a mouse, opens on a tap and closes on a tap elsewhere; `hidden()` runs when it closes |
| `tooltip.row(name, value, color)` | One line of a tooltip, with its color swatch |
| `groupedColumns(host, { labels, series: [{ name, token, values }], max, ticks, aria })` | Grouped columns with the value above each column |
| `waterfall(host, { steps: [[label, value, 'total'?]], max, aria, format })` | The waterfall |
| `valuesTable(host, { columns, rows: [[label, value, ...]] })` | The chart's values as a table only a screen reader sees; `groupedColumns` and `waterfall` call it |
| `heatGrid(table, { corner, group, columns, rows: [{ label, values }], cell, tip, range, base })` | The color grid; a `null` or missing value is a cell that does not exist yet |
| `interactiveTable(fig, rows, options)` | The interactive table and its Excel download |

A bar, a cell or any element with `data-tip="text"` shows its text on hover and on tap with no code. The grouped columns and the waterfall give each group or step one transparent hit area over its whole band, wired with `tooltip.follow`, so a finger finds it at 360px wide: the band of a five-group chart is about 117px there. A band under 44px at 360px is a chart with too many groups for a phone.

## The frame

Every chart sits in the figure frame of the catalog (`#e-moldura`): `figure` > `.fig-head` (`.k` "Gráfico 1", `.t` the title) > `ul.legend` > `.chart` > `figcaption.cap` (reading note, then `.cap-src` with the source and the "Detalhes da análise" button). The legend has at most six entries, "Outros" included, each name in one line.

Inside `.chart`, every chart drawn by hand starts the same way: a viewBox, four paddings, two scale functions, a grid.

```js
const w = 900, h = 330, padL = 54, padR = 132, padT = 16, padB = 42;
const px = (v) => padL + ((v - x0) / (x1 - x0)) * (w - padL - padR);
const py = (v) => padT + (1 - v / maxY) * (h - padT - padB);
const svg = svgNode('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'o que o gráfico mostra' });

for (let i = 0; i <= 4; i++) {                       // 4 gridlines is plenty
  const v = maxY * (1 - i / 4), y = py(v);
  svg.append(
    svgNode('line', { x1: padL, x2: w - padR, y1: y, y2: y, class: i === 4 ? 'base' : 'grid' }),
    svgNode('text', { x: padL - 10, y: y + 4, 'text-anchor': 'end', class: 'tick' }, tickLabel(v)));
}
```

The classes come from `report.css`: `.grid` for gridlines, `.base` for the zero line, `.tick` for axis labels, `.lbl` for category labels, `.val` for values on the marks. `padR` is generous on purpose: it is where the direct labels live. The SVG is `width:100%;height:auto` with a 620px floor, so it scales on a wide screen and, on a phone, scrolls sideways inside `.chart`, under the same scroll bar as a wide table; never set a pixel width on the element.

**Text alternative.** The drawing is `role: 'img'` with an `aria-label` that says what it shows, and a screen reader cannot read its numbers from the SVG. `groupedColumns` and `waterfall` write the values as a table beside the drawing that only a screen reader sees, and a chart drawn by hand ends the same way: `valuesTable(mount, { columns, rows })` after `mount.replaceChildren(svg)`, with `rows` as `[[label, value, ...]]` and one text per column, written as the reader should hear it ("R$ 30 mil", not 30). A mark that carries its own text, such as the 100% bar, is a list whose items spell the name and the value.

**A chart that resolves a token in JavaScript redraws when the mode changes.** `token('--bg')`, a series color taken from `token('--c1')`, the heatmap's `--on-hi` all write a resolved color into the SVG or into an inline `style`, so a switch between light and dark leaves them stale. Put the whole chart, its legend included, in one function that clears its mount first, and hand it to `onTheme`:

```js
function drawCurve() {
  const mount = document.querySelector('#curve');
  const colors = [token('--c1'), token('--c2')];
  const svg = svgNode('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': '…' });
  // … frame, marks, labels, hover, as below …
  mount.replaceChildren(svg);
  legend('#curve-legend', [{ name: 'A', color: colors[0] }, { name: 'B', color: colors[1] }]);
}
onTheme(drawCurve);   // draws now, and again on every `themechange`
```

A chart painted only with `var(--token)` (in CSS or in a `style` attribute) follows the mode with no code. A color that is literal in the markup becomes a token with a light and a dark value, unless it is the same in both by design and says so in a comment.

**Axis tick labels: do not `Math.round`.** On a scale that is not a multiple of 4 it prints duplicates: a 0 to 2.5 axis becomes `3× 2× 1× 1× 0×` and looks broken. Format for the scale you have.

## Lines

```js
series.forEach((s) => {
  const points = rows.filter((r) => r[s.key] != null);
  svg.appendChild(svgNode('path', {
    d: points.map((r, i) => `${i ? 'L' : 'M'}${px(r.x).toFixed(1)},${py(r[s.key]).toFixed(1)}`).join(' '),
    fill: 'none', stroke: s.color, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    'stroke-dasharray': s.dashed ? '5 4' : 'none' }));
  // A 2px ring in the surface color so overlapping markers stay countable.
  points.forEach((r) => svg.appendChild(svgNode('circle', { cx: px(r.x), cy: py(r[s.key]), r: 4,
    fill: s.color, stroke: token('--bg'), 'stroke-width': 2 })));
});
```

**Direct labels at the line ends, and declutter them.** Two series that end close together overlap, because each label is two stacked lines:

```js
const LABEL_HEIGHT = 34;
ends.sort((a, b) => a.y - b.y);
for (let i = 1; i < ends.length; i++) {
  if (ends[i].y - ends[i - 1].y < LABEL_HEIGHT) ends[i].y = ends[i - 1].y + LABEL_HEIGHT;
}
ends.forEach((end) => svg.append(
  // style, NOT a fill attribute: `.chart .val{fill:var(--ink)}` outranks the attribute.
  svgNode('text', { x: end.x, y: end.y + 4, class: 'val', style: `fill:${end.color}` }, end.text),
  svgNode('text', { x: end.x, y: end.y + 19, class: 'tick' }, end.caption)));
```

**Crosshair and tooltip**, one transparent hit rect over the plot area. `tooltip.follow` makes it work with a mouse and with a finger alike:

```js
const cross = svgNode('line', { y1: padT, y2: h - padB, class: 'grid',
  'stroke-width': 1.5, opacity: 0, 'stroke-dasharray': '3 3' });
svg.appendChild(cross);
const hit = svgNode('rect', { x: padL, y: padT, width: w - padL - padR, height: h - padT - padB, fill: 'transparent' });
tooltip.follow(hit, (ev) => {
  const box = svg.getBoundingClientRect();
  const rel = (ev.clientX - box.left) / box.width * w;      // viewBox units, not pixels
  const x = Math.round(x0 + (rel - padL) / (w - padL - padR) * (x1 - x0));
  const r = rows.find((d) => d.x === x);
  if (!r) return null;
  cross.setAttribute('x1', px(x)); cross.setAttribute('x2', px(x)); cross.setAttribute('opacity', 1);
  return `<b>${xLabel(x)}</b>` + series.map((s) => tooltip.row(s.name, fmt.num(r[s.key], 1), s.color)).join('');
}, () => cross.setAttribute('opacity', 0));
svg.appendChild(hit);
```

The tooltip is where the supporting numbers go: the base the percentage came from, how many cohorts are in the point, the absolute value behind the ratio. That is how the chart stays clean and still answers "out of how many?".

**A numeric x axis must be numeric.** Sorting period labels as text turns 2, 3, 10, 11, 12 into 10, 11, 12, 2, 3. Keep the number, format at draw time.

## Stacked bars

```js
rows.forEach((r, i) => {
  const x = padL + i * bandWidth + bandWidth * 0.16, barWidth = bandWidth * 0.68;
  let total = 0;
  keys.forEach((k, j) => {
    const v = r[k] || 0; if (v <= 0) { total += v; return; }
    const y0 = py(total), y1 = py(total + v);
    // 2px surface gap between segments; only the top one gets rounded ends.
    const isTop = j === keys.length - 1;
    const height = Math.max(1, y0 - y1 - (isTop ? 0 : 2));
    svg.appendChild(svgNode('rect', { x, y: y1, width: barWidth, height, rx: isTop ? 4 : 0, fill: colors[j] }));
    total += v;
  });
  // One hit area per period, full height: hovering or tapping a thin segment must not be a game.
  const hit = svgNode('rect', { x: padL + i * bandWidth, y: padT, width: bandWidth, height: h - padT - padB, fill: 'transparent' });
  tooltip.follow(hit, () => periodTooltip(r));
  svg.appendChild(hit);
});
```

Stack order carries meaning: put the series whose *change* is the story on top, against the free edge, where its movement is readable. Buried in the middle, a shrinking band is invisible.

Label every other x tick when they crowd, and always the last one.

## Heatmap in SVG

The default for two dimensions and one value is the color grid (`#e-safras`): an HTML table built by `heatGrid`, whose cells take their color from `--share` and `--heat-span`, with the value written in each cell. Draw an SVG heatmap only when the matrix is too wide for a table. The two things that decide whether it is readable:

```js
// 1. Map the ramp over the range the data OCCUPIES, not 0–100. Values that live
//    between 40% and 110% mapped over 0–100 land in the top three steps and the
//    map reads as a wall of one color.
const LOW = 20, HIGH = 110;
const step = (v) => Math.min(6, Math.max(0, Math.floor((v - LOW) / (HIGH - LOW) * 7)));

// 2. Flip the text color by STEP INDEX, not by value: the crossover is a property
//    of the ramp, and it differs between two ramps built the same way.
const flip = parseInt(token('--on-flip'), 10);
const textColor = (i) => i >= flip ? token('--on-hi') : token('--on-lo');
```

```js
svg.appendChild(svgNode('rect', { x: cx + 1, y: cy + 1, width: cw - 2, height: ch - 2, rx: 3,
  fill: ramp[i], opacity: isThin ? 0.5 : 1, 'data-tip': `${rowLabel}, ${columnLabel}: ${fmt.pct(v, 0)}` }));   // 2px gap: cells must not bleed
svg.appendChild(svgNode('text', { x: cx + cw / 2, y: cy + ch / 2 + 4, 'text-anchor': 'middle',
  'font-size': 10, 'font-weight': 600, style: `fill:${textColor(i)}` }, Math.round(v) + '%'));
```

Put the number in the cell. A heatmap without values is a mood, and it also serves as the contrast relief when a ramp step is light.

**Row labels carry the base**: `mai/25 (96)` tells the reader instantly how much to trust the row. Mark the thin ones with an asterisk and fade them, and explain the mark in a note right below.

## Interactive table

Copy the markup of the catalog's interactive table (`#e-interativa`): `figure` with `.tbl-tools`, the table with `th[data-k][data-sort]`, and `.pager`. Then call `interactiveTable(fig, rows, options)` with the report's rows, one object per row whose keys are the `data-k` of the columns:

```js
interactiveTable(document.getElementById('clients'), DATA.clients, {
  noun: 'clientes', file: 'clientes.xlsx', sheet: 'Clientes', search: 'name',
  sort: { key: 'balance', asc: false },
  cell: { balance: (r) => fmt.num(r.balance, 1) },          // how a cell shows, when not as is
  exportValue: { since: (r) => r.sinceText },                 // what the Excel cell holds, when not the row's value
});
```

Every `select[data-f]` in `.tbl-tools` other than the page size filters on the row field it names, and fills its options from the rows when the markup lists none. The function keeps the whole list in memory, shows one page, and downloads every row in the screen's order as a real `.xlsx`, with no library. On a narrow screen the page buttons condense to the first, the current and the last.

Numbers right-aligned with tabular figures, nulls visibly empty rather than zero. **The counter is the honesty**: "11 a 20 de 48 clientes, filtrados de 312" so nobody reads a filtered or paged table as the whole thing. A list of more than 1.000 rows goes as a separate file, and the report shows its summary.

## Traps that cost a rebuild

- **The stylesheet beats the SVG attribute.** `.chart .val{fill:var(--ink)}` overrides `fill="…"` on a `<text class="val">`, and the same holds for `.tick` and `.lbl`. Colored labels need inline `style`. Rects are unaffected: only text has a matching CSS rule.
- **`mousemove` leaves a phone out.** A hover wired to `mousemove` and `mouseleave` never opens under a finger. Use `tooltip.follow` or `data-tip`.
- **`Math.round` on axis ticks** prints duplicate labels on non-integer scales.
- **End labels collide** when two series finish within ~30px.
- **A ramp mapped over the wrong domain** saturates and hides all the variation.
- **A thin tail turns upward.** When later periods rest on few cohorts, survivorship bends the aggregate up and it reads as recovery. Cut the aggregate where the base thins, keep the detail in the per-cohort view, and say where you cut and why.
- **Emoji and ASCII art are not charts.** No `████` bars, no ⬆️ in a cell.
- **Do not repaint on filter.** A series keeps its color when its neighbours disappear; color follows the entity, never its position in the surviving list.
