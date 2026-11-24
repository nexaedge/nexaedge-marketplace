# Elements: what each one is for, and what to copy

`assets/catalog.html` shows every element of a report with its ficha and a live example, in pt-BR like the reports. This file is the same catalog for choosing and copying: find the need, check the "when not", then copy what the element lists.

Each entry below carries what the ficha carries: **For** ("Para quê"), **When** ("Quando usar") and **Not** ("Quando não usar"), plus **Copy**, which only this file has. The simulator's ficha adds a fourth heading, "Os campos" (**Fields** here, inside **When**), with one line per field type. The frame of charts, tables and figures and the column title, unit and alignment hold rules of their own, so their entries list **Rules** in place of **When**. Every other element states its rules inside **When**.

## How to copy an element

Every report starts as a draft copied from `assets/skeleton.html`, which links the four shared assets: `fonts.css`, `theme-neutral.css`, `report.css` and `report.js`. Every element's CSS is in `report.css` and every element's function in `report.js`, so copying an element means copying its markup and, when it has one, its function call. `scripts/build.mjs` inlines the shared assets into the final file (`structure.md`).

- **Anchor.** Each element has an id in the catalog (`#e-cartoes`). Open `assets/catalog.html#e-cartoes` to see it, and search the file for the id to find its markup.
- **Markup.** Copy what sits inside the example's `<div class="demo s">`, without that wrapper. Never copy the catalog's own frame: `.ficha`, `.demo`, `.variant`, `.type-hint`, `.un-demo`, `.delta-key`, `.guide`, `.st`, `.next-hint`, `.gallery`, and the drawn screen inside `.shot`. Its rules live only in the catalog's own `<style>`.
- **Function call.** The element's entry names the function. The catalog's last `<script>` holds the call for each example; copy the call into the report's script at the end of `<body>` and give it the report's data. The catalog's invented data (`clients`, `portfolioNeeded`) never goes into a report.
- **Numbers.** Every number in the catalog is invented. Never carry one into a report.

## Rules every element follows

- **Variation sits to the right of the number**, as an arrow and the size of the change (`.delta.up` with "14%", `.delta.down` with "0,5 ponto"; the arrow is drawn in CSS, and `report.js` writes "alta de" or "queda de" as hidden text before the size, from the `up` or `down` class, so a screen reader hears the direction; a flat tag already says "estável"), with the comparison period said once. The arrow gives the direction and the color says whether it is good (`.delta.good`) or bad (`.delta.bad`); a change under about 1% is `.delta.flat`, "estável". An amount, a count or a number of days changes in percent; a rate changes in points: from 3,3% to 3,8% is 0,5 ponto, not 15%.
- **A legend has at most six entries, "Outros" included**, in the fixed order of the series colors, each name up to three words (about 20 characters) in one line, in a box above the drawing. What passes six adds up in "Outros", painted `--other`, or the chart splits into smaller ones. One series needs no legend; the title names it.
- **Side notes** carry a short caveat, a supporting calculation or context that would interrupt the sentence. A source is a source badge, and a warning that changes the reading is the attention box.
- **Status colors are for status.** `--pos`, `--neg` and `--warn` mark good, bad and caution, always beside a word or an arrow. Categories such as channel or product take the series colors.
- **A detail shown on hover opens on a tap too**, and a tap elsewhere closes it. `data-tip`, `data-def` and the source badge get this from `report.js`; a chart's own hover gets it from `tooltip.follow` (`charts.md`). Esc closes it from the keyboard.

## Group 1. Opening and structure

### Title and executive summary (`#e-abertura`)
- **For:** saying on the first screen what the report is about and what its answer is.
- **When:** every report. The `<h1>` fills the column's width, and what it says depends on what the report does: a report that argues for a number or a finding states that conclusion in one sentence; a report that prepares a decision the reader has to take names the decision or the question, which gives the context for the rest, and leaves the answer to the summary. Under it come the dates and the classification, a rule closes the `<header>`, and the summary follows with no title, one to three short paragraphs from the goal to the conclusion, numbers in the text. Sections start after it. The catalog's example is this opening as a report draws it.
- **Not:** a summary that repeats the title, lists the order of the sections, points to them, or puts its numbers in cards.
- **Copy:** nothing: the skeleton's `<header>` (`.eyebrow`, `h1`, `.hdr-meta` with "Gerado em", "Dados até" and `.conf`) and its first `section.s` are already in the draft.

### Section title (`#e-titulo`)
- **For:** telling where the reader is and what the section is about.
- **When:** every section after the summary: `h2` with `<span class="num">Seção 3</span>` above, then a title that names the subject or states the finding. The first paragraph explains, with no subtitle.
- **Not:** an inner title for one paragraph, or a subtitle that announces what the section will show.
- **Copy:** `section.s#…` > `h2#…`. An `h3` with an id and `data-toc="short name"` adds an entry under the section in the contents list.

### Table of contents (`#e-indice`)
- **For:** showing where the reader is and jumping to any section.
- **When:** every report with more than four sections. It sits in the left margin from 1416px of viewport up, with an icon button beside its title to collapse it (a panel with a bar on the left and an arrow pointing left, "Recolher o índice") and the "Índice" button to bring it back; below that width the "Índice" button sits in the bar at the top of the screen and opens it as a drawer that scrolls on its own, where the icon button becomes an × ("Fechar o índice"), and that closes on a link, on a tap outside it or on Esc. The page remembers the choice.
- **Not:** a one-screen report; delete the `nav.toc` and the `.toc-btn` from the draft.
- **Copy:** nothing: `report.js` builds the list from `main h2[id], main h3[id]`, draws the icons of the collapse button and the theme button (the markup carries both buttons empty), and removes the list and its button when no heading has an id.

### Appendix (`#e-apendice`)
- **For:** keeping what only some readers need: method, assumptions, full tables, sources.
- **When:** the body would grow with detail that does not change the conclusion. Appendix sections take letters ("Apêndice A"), and the body points to them with an in-text link.
- **Not:** anything the conclusion depends on.
- **Copy:** a `section.s` like any other.

### Block widths (`#e-largura`)
- **For:** giving each table, chart and image the width its content asks for.
- **When:**
  - text column, 680px: the default for every child of `section.s`;
  - wide, 880px: a table of many columns or a chart of many points, class `wide`;
  - beside the text: a small table, chart or narrow image, up to half the text column, `figure.float.left` or `figure.float.right`, next to the paragraph that discusses it, alternating sides; full width on a phone;
  - the content's own width: a block too wide to float and too narrow for `wide`, `figure.fit`, aligned to the text's left edge.
- **Not:** floating a block no nearby paragraph discusses, floating one wider than half the column, or stretching a two- or three-column table to the wide width.
- **Copy:** the classes. The horizontal bars of the right-floated example are `.hbars`.

## Group 2. Highlighted numbers

### Number cards (`#e-cartoes`)
- **For:** one to four numbers the reader compares at a glance.
- **When:** at the start of a section, when each number is understood by its name alone. Number up to 10 characters with its unit; name up to three words, one line. With a change, `.vd` holds the number and the `.delta` to its right, and `.cards-base` says the comparison period once, above the row. The row takes the table width, and the number keeps its size with one to four cards.
- **Not:** a number that needs explaining (text), more than four numbers (table), or numbers the passage does not use, added to fill the row.
- **Copy:** `.cards` with `style="--n:3"` (or `.cards.one`), `.card` > `.v` (unit in `<small>`) and `.l`; optional `.cards-base`.

### Main number (`#e-principal`)
- **For:** putting forward the one number the section rests on, with the sentence that interprets it.
- **When:** the section turns on one number the reader must keep. A change goes to the right of the number, and the comparison period on the line below.
- **Not:** beside number cards in the same passage, or for a number that only makes sense next to others.
- **Copy:** `.stat` > `.big` (number, optional `.delta`, `<small>` line) and a `<p>`.

### Variation (`#e-variacao`)
- **For:** saying how much a number changed, in which direction, and whether that is good.
- **When:** in a sentence, a table or a card, against the previous period or the target. Rules in "Rules every element follows".
- **Not:** when the reader does not know the comparison period, or between periods of different lengths.
- **Copy:** `<span class="delta good up">14%</span>`: `good` or `bad` for the color, `up` or `down` for the arrow; `<span class="delta flat">estável</span>` takes a dot. Never type the arrow or the direction's words: the class draws the arrow and `report.js` writes the words, once, when the page loads and for every tag that a table, a tab or a simulator writes later. Code that writes tags somewhere else calls `describeDeltas(root)`, which adds the words to the tags under `root` and skips the ones that have them.

### Progress against a target (`#e-progresso`)
- **For:** how much of a target is done and whether the pace is enough.
- **When:** a target with a deadline. The bar is what is done, the mark is where the expected pace stands today; axis labels of one or two words; how much is left and in how long goes in the sentence below.
- **Not:** without a target, or for more than three targets (bullet chart in the gallery).
- **Copy:** `.progress` > `.row`, `.track` (`.fill`, `.mark` with `data-tip`), `.axis`. `report.js` makes the mark reachable: the keyboard focuses it, which shows the `data-tip` text, and a screen reader reads that text as its name, so the pace is written once, in `data-tip`.

## Group 3. Text boxes

### Recommendation (`#e-recomendacao`)
- **For:** the action the report asks for, with who decides and by when.
- **When:** only when the report exists to ask for a decision. Once, at the end of the section that justifies it: bold action (`.head`), who decides and deadline (`.meta`), expected effect.
- **Not:** most of the time a recommendation is one sentence of text. Never without an owner and a deadline.
- **Copy:** `.callout.rec` > `.tag`, `.head`, `.meta`, `<p>`.

### Attention (`#e-atencao`)
- **For:** a caution without which the reader reads the number wrong.
- **When:** only when ignoring it leads to a wrong conclusion, such as comparing a cohort that has not matured. Right beside what it qualifies.
- **Not:** a caveat that fits in a sentence, an assumption of the calculation (sensitivity table), a pending decision ("Em aberto").
- **Copy:** `.callout.warn`.

### Open decision (`#e-aberto`)
- **For:** a decision not yet taken that changes the numbers.
- **When:** a number depends on a pending choice. Bold: what is to be decided and who decides; below: what the numbers assume meanwhile, and the alternative.
- **Not:** a pending item that fits in a sentence, a doubt about data, a task.
- **Copy:** `.callout.open`.

### Worked example (`#e-exemplo`)
- **For:** a rule applied to one case, with the case's numbers.
- **When:** right after a rule the reader understands better by seeing it work. One case, round values, ending in the result.
- **Not:** to prove the rule holds across the base, which needs a number from the whole base.
- **Copy:** `.example` > `.ex-head` and a `table` with `tr.res`.

### Quote (`#e-citacao`)
- **For:** a person's, a meeting's or a document's words, with who said them and when.
- **When:** the sentence is the evidence. Larger, in the text font, attribution below.
- **Not:** decoration, or a sentence the report could state with a number.
- **Copy:** `blockquote.quote` > `<p>`, `<footer>`.

### Step by step (`#e-passos`)
- **For:** how a calculation or a process reaches its result, in order.
- **When:** the reader must follow the calculation to trust it, three to five steps of one sentence each.
- **Not:** items without order, or a calculation the reader will redo with other values (formula).
- **Copy:** `.steps` > `.tag`, `ol`.

### Formula (`#e-formula`)
- **For:** the equation, every symbol defined, so the reader can redo it.
- **When:** the result appears for several values and the reader may want another. Symbols defined before the first equation; one sentence between equations; the last one applies the numbers.
- **Letters.** Every quantity takes a Latin letter, preferably the initial of its name in the report's language: J for juros, P for perda, C for custo de captação, M for margem. A Greek letter only for a concept the market already knows by it: β for beta, σ for volatility or standard deviation, Δ for a change, α for excess return. A letter the reader has never seen tied to a concept is one more thing to decode. An acronym the market already uses, such as PD, LGD and EAD, is kept and set upright.
- **Not:** a calculation the reader only needs to understand (step by step).
- **Copy:** `.formula` > `dl` of symbols, `.eq` with MathML `<math display="block">`, and a symbol in a sentence as `<math><mi>J</mi></math>`. Every `<math>`, in the formula or in any other text, sets in STIX Two Math, so Latin variables, Greek letters and operators share one design, and a one-letter `<mi>` turns italic by itself. A capital Greek letter and a multi-letter name stay upright, as in `<mi mathvariant="normal">Δ</mi>` and `<mi mathvariant="normal">PD</mi>`. The catalog's second example uses the structures a credit calculation needs: `mfrac` inside `mfrac`, `munderover` for a sum with limits, `msubsup` for an index and an exponent on one letter, `msqrt` over an expression, and `mo` fences (`(`, `[`) that stretch to their content. An equation wider than the formula's box grows past both sides of it, centred, up to the page's margins (or to the index, where the index sits in the left margin), and only an equation wider than that scrolls inside `.eq`, under the same scroll bar as a wide table. The box never widens because of its equation, the equation reads left to right even in a right-to-left page, and a formula starts below a floated figure or side note instead of beside it. Inside a column of `.side`, `.options` or `.sim` the equation keeps to its box and scrolls there, since a column is not centred on the page. On paper there is no scroll bar: an equation wider than the page shrinks to fit it, except inside such a column, where it stays cut at its box.

### Definitions (`#e-defs`)
- **For:** defining, before the numbers, the terms they depend on.
- **When:** once, right after the summary, with the terms more than one section uses.
- **Not:** a term one section uses (explain it in the sentence, or the term with definition).
- **Copy:** `.defs` > `.box-tag`, `dl`.

### Options with a recommendation (`#e-opcoes`)
- **For:** the paths of a decision side by side, with gains, losses and cost, the recommended one marked.
- **When:** two to four alternatives, each with name, gains (`li.pro`), losses (`li.con`) and cost, in the same order.
- **Not:** a single viable option, which is one sentence.
- **Copy:** `.options.wide` > `.opt` (`.opt.rec` with `.badge`), `h4`, `ul`, `.cost`.

### Questions and answers (`#e-faq`)
- **For:** answering the objections the reader will likely raise.
- **When:** at the end of a report for someone who will question it, such as an investor. The question is visible, the answer opens on click or tap.
- **Not:** content every reader needs.
- **Copy:** `.faq` > `details` > `summary`, `p`.

## Group 4. Lists and tags

### Items with a title (`#e-itens`)
- **For:** parallel items, each with a name the reader looks for.
- **When:** items of one kind, one to three sentences each; the title is the thing's name, ending in a period.
- **Not:** ordered steps, assumptions with scenarios (table), one-word items.
- **Copy:** `ul` > `li` > `<span class="lead-item">O prazo.</span>`.

### Checklist (`#e-check`)
- **For:** criterion by criterion, what meets a rule and what does not.
- **When:** fixed limits to check, such as a lender's covenants. Each line: criterion, measured value, limit.
- **Not:** criteria with no numeric limit or no yes-or-no answer.
- **Copy:** `ul.check` > `li` > `<span class="ic ok" role="img" aria-label="Atende"></span>` (or `ic no`, "Não atende"), label, `.val` with `<small>` limit. The mark is drawn in CSS.

### Next steps (`#e-passos-prox`)
- **For:** what each person does next, with deadline and state.
- **When:** at the end of a follow-up report. One row per action: owner, deadline, status tag.
- **Not:** an analysis report that asks for no action.
- **Copy:** a `.tbl.wide` table with `td.txt` and `.status`.

### Status tag (`#e-status`)
- **For:** an item's state in one or two words.
- **When:** lists of actions, targets or criteria. Four states, four colors, always with the word: `.status.ok`, `.status.risk`, `.status.late`, `.status.todo`.
- **Not:** categories that are not a state.
- **Copy:** `<span class="status ok">Feito</span>`.

## Group 5. Composition, process and time

### Breakdown (`#e-partes`)
- **For:** the parts a total is made of.
- **When:** a number is the sum of groups with different causes. Each part a series color, in order; the number over its piece of the bar and the description below, aligned to the piece's start; parts add up to the total.
- **Not:** overlapping groups, more than four parts, or a part under 15% with no room for its description (sorted bars).
- **Copy:** `figure.wide` > `.parts` > `.part` with `style="--w:50"`, its share in percent, > `.pv`, `.pb`, `.pl`. `--w` is the part's flex grow on a wide screen and the bar's width on a narrow one.

### Waterfall (`#e-cascata`)
- **For:** going from one number to another, adding and subtracting one part at a time.
- **When:** the reader must see where each part of a result goes, or why a total changed. The legend says which color is a total and which an exit.
- **Not:** parts that do not add in sequence (breakdown).
- **Copy:** `figure.wide` > `.chart#…`, and the call `waterfall(host, { steps, max, aria, format })`, with `steps` as `[label, value, 'total'?]` and `format(value)` writing a value for its detail on hover or tap.

### Funnel (`#e-funil`)
- **For:** how much remains at each stage of a process, and where most is lost.
- **When:** sequential stages, each receiving only who passed the previous one; between stages, the share that passes.
- **Not:** stages that are not a sequence, or cases that can skip a stage.
- **Copy:** `.funnel` > `.f-row` (`.lab`, `.barw > i` with width, `.num`) alternating with `.f-row` holding `.conv`.

### Timeline (`#e-timeline`)
- **For:** the order and dates of the events of a case or a project.
- **When:** the reader must know what happened before what. The hollow dot (`li.next`) marks what has not happened yet.
- **Not:** undated events, or a series of numbers over time (line chart).
- **Copy:** `ol.timeline` > `li` > `time`, `.dot`, `div` with `b` and `.d`.

### Flow (`#e-fluxo`)
- **For:** where money, a document or information passes, between whom.
- **When:** the reader must understand who takes part and what goes from one to another. Boxes for participants, arrows for what passes.
- **Not:** quantities, or more than six participants in one drawing.
- **Copy:** `figure.wide.flow` > `.chart` > inline `svg` with `rect.box`, `text.bt`, `text.bs`, `text.lbl`, `marker` arrows painted `var(--c1)` and `var(--c3)`. On a phone the drawing scrolls sideways inside `.chart`.

## Group 6. Comparison

### Side by side (`#e-lado`)
- **For:** two versions of the same object, line by line.
- **When:** before and after, current and proposed rule, actual and simulated. Same lines in the same order; what changes is marked `dd.chg`.
- **Not:** more than three versions (table).
- **Copy:** `.side.wide` > two `div` > `h4`, `dl`.

### Sensitivity table (`#e-sensibilidade`)
- **For:** how a result moves with two assumptions at once.
- **When:** the result depends on two uncertain assumptions. One in rows, one in columns, color from lowest to highest, base case outlined. On hover or tap the cell gets an outline and shows its value; the row does not change color.
- **Not:** one assumption (plain table), or three (simulator).
- **Copy:** `figure.wide` > `.tbl.heat > table#…`, and the call `heatGrid(table, { corner, group, columns, rows, cell, tip, base })`, with `rows` as `[{ label, values }]` and `base` as `[row, column]` of the base case.

## Group 7. Charts and images

### Frame and caption of a chart, table or figure (`#e-moldura`)
- **For:** the same frame for every chart, table and figure, so the reader knows what they look at and where it comes from.
- **Rules:**
  - above: the number in the report's sequence, each kind its own (Gráfico 1, Tabela 1, Figura 1 for diagrams and images), and a one-line title of what it shows;
  - the legend in a box above the drawing whenever it uses more than one color, under the legend limits above;
  - below: the reading note, when the drawing has a convention the reader would not guess, one or two lines starting "Como ler." or "Nota."; the finding goes in the text;
  - the source: "Fonte: dados internos/2026" for the organisation's own data, never a database table name, and the source's name with its badge for outside data;
  - "Detalhes da análise", when the reader may want to check the calculation: a dialog with the period, the data's origin, the filters and the method.
- **Not:** a chart for two or three numbers.
- **Copy:** `figure` > `.fig-head` (`.k`, `.t`), `ul.legend` (or the call `legend(selector, [{ name, color }])`), `.chart`, `figcaption.cap` with `.cap-src` and `button.details[data-modal="id"]`; the `dialog.analysis#id` goes at the end of `<body>`. The grouped columns: the call `groupedColumns(host, { labels, series: [{ name, token, values }], max, ticks, aria })`. Both functions also write the chart's values as a table that only a screen reader sees, beside the drawing (`charts.md`, "Text alternative"). The 100% stacked bar: `.stack` with `role="list"`, and each segment a `div[role="listitem"]` whose `<span>` holds a `<span class="visually-hidden">` with the part's name before its percentage, so a screen reader reads each pair.

### Which chart for which question (`#e-galeria`)
- **For:** choosing the chart's form from the question it answers.
- **When:** before drawing: find the question in the gallery and use the form beside it. Waterfall, funnel and color grid have their own elements.
- **Not:** pie, 3D, or two vertical axes in one chart: all three distort the comparison.
- **Copy:** nothing; the gallery is a guide. The patterns to draw lines, stacked bars and SVG heatmaps are in `charts.md`.

### Image with markers (`#e-imagem`)
- **For:** a screen, a document or a photo, pointing at what matters in it.
- **When:** the reader must recognise something they will see elsewhere. The numbers on the image match the list below it.
- **Not:** numbers that are in the image (table), or a decorative image.
- **Copy:** `figure.wide` > `.shot` with an `<img>` and `span.pin` children of the `.shot`, each placed by the centre of the pin in percent of the image (`style="left:36%;top:30%"`), then `ol.pins`. The catalog's drawn screen stands in for the `<img>`. The build turns the image file into a `data:` URI.

## Group 8. Tables

### Table (`#e-tabela`)
- **For:** the exact numbers, by group.
- **When:** the reader will look up a value or compare rows. The total row closes with a rule (`tr.total`); the highlighted row (`tr.mark`), with the highlight background and a bar on the left, is the one the next paragraph discusses, at most two per table.
- **Not:** a table that only repeats a chart's numbers (put it in a collapsed block).
- **Copy:** `figure.wide` > `.fig-head`, `.tbl > table`, `figcaption.cap`.

### Column title, unit and alignment (`#e-colunas`)
- **For:** finding the column and reading the number without effort, in any table.
- **Rules:**
  - **Title length.** It says what the column measures in at most two lines, and shortens as the table grows: up to 4 words in a table of up to 4 columns, 3 words with 5 to 7 columns, 2 words from 8 columns. What holds for every column, such as the month, goes up to the table title; what holds for some becomes a group title above them.
  - **Unit, symbol in the cell.** Smaller, lighter and muted, so the eye reads the number first: R$ before the number and % after it, `<span class="un">R$</span>&nbsp;8,7` and `89<span class="un">%</span>`.
  - **Unit, scale at the end of the table title**, in parentheses, when it is the same across the table: "(R$ mil)", "(R$ mi)", "(% do desembolso)". When the scale changes from one row or column to another, it goes in the cell, such as "R$ 1,4 bi" beside "40 mil".
  - **Unit, word units** such as "dias" or "ao mês", which would repeat in every cell: in a small muted line above the column title, `<th><span class="u">dias</span>Atraso</th>`, once above a group title when they hold for the whole group, and in the table title when they hold for the whole table, such as "(contratos)". They go in the cell only when the unit changes from one row to another.
  - **Alignment.** Text left: the row name, a category, a description; the first column is always left (`.tl` for another text column). Short fixed-width values that are neither summed nor compared by size, such as a date, a code, a status or a yes/no, centered (`.tc`). Numbers right, with the same number of decimals down the whole column so the commas line up. The title follows its column, and a group title is centered over its columns. The color grid centers its values, because each cell is read alone.
- **Not:** a word unit repeated in every cell of a number column.
- **Copy:** the classes `.un`, `.u`, `.tl`, `.tc`.

### Two-level header (`#e-tabela-grupos`)
- **For:** grouping columns that measure the same thing in different scenarios.
- **When:** columns repeat by scenario. The group name centered over its columns; a common scale in the table title, the cell carrying only R$ and the number.
- **Not:** a group of one column.
- **Copy:** `thead` > `tr.group` (first `th rowspan="2"`, then `th colspan`) and `tr.sub`.

### Wide table (`#e-tabela-larga`)
- **For:** more columns than fit the page.
- **When:** the reader needs every column side by side. The table scrolls sideways: the first column stays, the right edge fades while columns are hidden, and a visible bar below it drags, with arrows at the ends. Column titles of up to two words; what repeats between columns becomes a group title, such as "Atraso acima de".
- **Not:** when it splits into two tables, each answering one question.
- **Copy:** `figure.wide` > `.tbl > table.dense`. `report.js` adds the scroll bar (`.hs-bar`) to every `.tbl`, `.chart`, `.formula .eq` and `pre` that is wider than its column.

### Table with a text column (`#e-tabela-texto`)
- **For:** putting beside each number where it comes from.
- **When:** each row is a step of a calculation with its own source, such as a market size. The text column is left-aligned (`td.txt`) and carries the source badge.
- **Not:** a comment on the whole table (reading note).
- **Copy:** `td.txt` with `a.ref`.

### Bar in the cell (`#e-barra-celula`)
- **For:** the exact value and the relative size in the same row.
- **When:** one column the reader compares top to bottom, when the table has other columns a chart would not show. Number right-aligned, the bar right after it, starting at the same position in every row. A small table like this takes the content's width (`figure.fit`).
- **Not:** more than one column of a table, or percentages that do not add to a whole.
- **Copy:** `td.bar-cell > .cb > i` with `width` in percent of the largest.

### Color grid (`#e-safras`)
- **For:** a value at each crossing of two dimensions, colored from lowest to highest.
- **When:** cohorts by month of life, or weekday by hour. One color, stronger as the value grows, value written in the cell; a cell that does not exist yet stays empty. On hover or tap the cell gets an outline and shows its value; the row does not change color, so the scale stays readable. This is the default form for two dimensions; an SVG heatmap (`charts.md`) only for a matrix too wide for a table.
- **Not:** signed values, positive and negative, which need two colors and a neutral middle.
- **Copy:** `.tbl.heat > table#…`, and the call `heatGrid(table, { corner, group, columns, rows, cell, tip, range, base })`, with `rows` as `[{ label, values }]` and a `null` or missing value for a cell that does not exist yet; `range` fixes the values the color runs over, and `base` as `[row, column]` outlines the base case's cell. The color comes from `--c1`, `--panel` and `--heat-span` (`themes.md`).

### Interactive table (`#e-interativa`)
- **For:** letting the reader search, filter and sort a long list, and take the whole list to Excel.
- **When:**
  - a list each reader reads their own way, with more rows than fit one screen;
  - rows at a time: 10 by default, the reader picks 10, 25 or 50; below, which rows show ("11 a 20 de 48") and the page buttons;
  - controls, above the table: search by name, up to two category filters, the download button; header arrows sort; searching, filtering or sorting goes back to page one;
  - download: an Excel file with the whole table, every row and column, in the screen's order, whatever the page or filter; the button says how many rows go in the file.
- **Not:** a table of up to 10 rows, or when the order is part of the argument. More than 1.000 rows go as a separate file, and the report shows their summary.
- **Copy:** `figure.wide#…` > `.tbl-tools` (`.search`, `.sel` with `select[data-f]`, `[data-clear]`, `[data-xlsx]`), `.tbl > table.itable` with `th[data-k][data-sort="text|num"]` (the function wraps each sortable header's content in a button, so the keyboard sorts too), `.pager` (`.pg-count`, an empty `aria-live` line the function fills with the count, `.pg-nav`, `[data-f="per"]`); and the call `interactiveTable(fig, rows, options)` with the report's rows (`charts.md`).

## Group 9. Interaction

### Collapsed block (`#e-recolhido`)
- **For:** keeping at hand the detail only some readers want, without lengthening the page.
- **When:** the method of a calculation, the table that repeats a chart's numbers, the full list behind a summary. The summary line says what is inside.
- **Not:** anything the conclusion depends on.
- **Copy:** `details.more` > `summary`, `div`.

### Tabs and scenario picker (`#e-abas`)
- **For:** switching between versions of the same content without repeating its structure.
- **When:** scenarios of the same shape, or the same data as chart or table. The tab open on load is the base case, marked `aria-selected="true"`.
- **Not:** when the reader must compare the versions (side by side, or one table with all of them).
- **Copy:** `.tabs.wide` > `[role="tablist"]` with `button[role="tab"][data-k]`, and the content mount; the call `tabs(root, (key) => …)`, whose function fills the mount for the tab's `data-k`.

### Simulator (`#e-simulador`)
- **For:** letting the reader change the assumptions and see the result at once.
- **When:** the reader will test values the report does not show. Every field starts at the base case; the field type follows the value type: number with unit for an exact value (`.affix`), slider for a continuous range, radio buttons for two to four fixed values (`.seg`), a select for five or more (`.select`), a toggle to include or drop part of the calculation (`.toggle`).
- **Not:** when three scenarios are enough (tabs), or when the calculation does not fit in the browser.
- **Copy:** `.sim.wide` > `form.sim-form` with `.field` blocks, and `.sim-out` > `.res`; the call `simulator(form, (form) => …)`, whose function reads the fields and writes the results, with the report's calculation.

## Group 10. Sources, links and notes

### In-text link (`#e-xref`)
- **For:** taking the reader from a claim to the passage, table or chart that supports it.
- **When:** the link sits on the words that say what the target shows, never on a "ver seção 3" after the sentence. On click the page scrolls to the target and marks it for a moment: amber background on a text passage, amber outline on a table or chart.
- **Not:** a source outside the report (source badge).
- **Copy:** `<a class="xref" href="#id">…</a>`; the target is any element with an `id`.

### Term with a definition (`#e-termo`)
- **For:** explaining a term without taking the reader out of the sentence.
- **When:** a term only one section uses, or a reminder of a defined term far from the definitions. The dotted underline signals a definition, shown on hover or tap, on focus, and again with Enter or Space; Esc closes it. A screen reader reads the definition as the term's description.
- **Not:** a term the sentence needs to make sense, which is explained in the sentence itself, since printed the definition disappears.
- **Copy:** `<span class="term-def" tabindex="0" data-def="…">termo</span>`.

### Side note (`#e-lateral`)
- **For:** putting in the margin a detail that would interrupt the sentence.
- **When:** a short caveat, a supporting calculation, context some readers want. The note hangs in the margin, right or left, mostly outside the text column with part of it inside, and the text runs around it. It starts on the line of the letter that calls it, and nearby notes alternate sides. On a narrow screen it goes right below the paragraph.
- **Not:** the source of a number (source badge), or a warning that changes the reading (attention box).
- **Copy:** inside the paragraph, `<span class="sn-mark">a</span><span class="sidenote right"><b>a</b><span>…</span></span>`.

### Source badge and list of sources (`#e-fontes`)
- **For:** where each outside number comes from, and a way to the source.
- **When:** after the sentence or cell that uses the source. With a mouse, hovering the badge shows the source and a click goes to the list; on a touch screen the first tap shows the source and the second goes to the list. The list sits in its own section at the end of the report. A screen reader reads the source's title as the badge's description.
- **Not:** a number computed in the report itself (in-text link).
- **Copy:** `<a class="ref" href="#f1" data-title="…">1</a>` and `ol.sources` > `li#f1`.
