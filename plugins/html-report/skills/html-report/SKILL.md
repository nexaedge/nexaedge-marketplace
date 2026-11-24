---
name: html-report
description: >-
  Build a self-contained interactive HTML report from analysis results: charts, color grids, interactive tables, number cards, all inline in one file that opens by double-click with no network, on a desktop or a phone. Handles the visual layer only: you bring the numbers and the message, this decides the form, the theme and the markup. Use when turning a finished analysis into a deliverable someone else will open, or when asked for a report, dashboard, detalhamento, painel, one-pager or "manda em HTML". Carries no brand of its own: it derives a theme from a brand color, or lifts one verbatim out of a report it built earlier. Triggers "monta o relatório", "gera o HTML", "quero isso em relatório", "build a report", "make this a dashboard", "põe num HTML pra mandar".
---

# html-report: the deliverable, not the analysis

You are given numbers that are already correct and a message that is already decided. Your job is the artifact: one HTML file that a person opens and understands without you in the room.

**This skill does not fetch data, does not run queries and does not decide what is true.** If the numbers are not settled yet, stop and settle them first: a beautiful chart of a wrong number is worse than no chart. If publishing is the next step, that is the `artifact-publish` skill, not this one.

**In:** the numbers (already aggregated), what the report has to say, who reads it, and which organisation it belongs to, plus, if one exists, an earlier report whose theme should carry over. If you were not told who reads it or whose brand it wears, ask: the theme and the amount of explanation both depend on it.

**Out:** one `.html` file with its CSS, JS, fonts, images and data inline. It renders from a `file://` double-click and inside a sandboxed iframe, because that is how artifact hosts serve it, and it reads as well on a phone as on a desktop.

**The skill ships no brand.** Every report has the same layout, type and elements; only the theme block's colors change per client.

## Procedure

Paths are relative to this file. In Claude Code, `${CLAUDE_PLUGIN_ROOT}/skills/html-report/` reaches the same folder.

1. **Write the message before the markup.** One sentence per section, in order, that a reader could take away. If you cannot write that sentence, the section has no reason to exist. → `references/writing.md`
2. **Pick the element per section from what the reader needs.** `references/elements.md` lists every element with when to use it and when not; `assets/catalog.html` shows each one live. Sometimes the answer is a number card or a sentence, not a chart. Never a chart because the section looks empty. → `references/charts.md` for the chart's form
3. **Start the draft from `assets/skeleton.html`**, saved in the project's folder as a draft (`relatorio.draft.html`). It links the shared assets by their bare names (`fonts.css`, `theme-neutral.css`, `report.css`, `report.js`), which the build finds in this skill; leave those links as they are. → `references/structure.md`
4. **Copy the markup of each element the report uses from the catalog**, and its function call when it has one, as `elements.md` lists them. Everything they share is already in `report.css` and `report.js`. Nothing the report does not use.
5. **Aggregate, then embed.** The data goes into the draft's last `<script>` already reduced to what the elements read. → `references/structure.md`
6. **Settle the theme.** For a client's report, read the client's entry in `branding.yml` (below); when the file or the client's keys are missing, name the file and the keys and ask, never invent a value, and never print the file. Otherwise take the theme from an earlier report, or derive it from the brand color. Never change a color outside the theme block. → `references/themes.md`
7. **Build the report and check it.** `node scripts/build.mjs relatorio.draft.html relatorio.html --client <client>` (or `--theme <file>`, or neither for the neutral theme) writes one file with every asset inline. Then `node scripts/theme.mjs check relatorio.html`.
8. **Render the built file and look at it, in both modes, at desktop and phone width.** Open it, screenshot it, read the console, and press the theme button once to see the dark mode. At 360px wide, nothing may stick out of the page sideways. The checks below are the ones that have actually broken.

The preferences file is `branding.yml` in `${XDG_CONFIG_HOME:-$HOME/.config}/claude-skills-preferences/`: `clients.<client>.theme`, or `clients.<client>.brand` with the optional `clients.<client>.ink`, `clients.<client>.surface` and `clients.<client>.surface_dark`. With only a brand, the build derives the theme and checks it; when a check fails it stops with the failing pairs and the `derive` command to start from.

## Non-negotiables

- **The `<title>` is the artifact's name**, not the file name. Write what the report answers, with its scope. A report called "report" cannot be found a month later.
- **The `<h1>` is the answer in one sentence, and the summary under it has one to three paragraphs of at most four lines each**, in a 1280px-wide viewport, as does every other `<p>`. Check each on the rendered page: `el.getBoundingClientRect().height <= lines * parseFloat(getComputedStyle(el).lineHeight)`. A paragraph over four lines splits where its topic changes, or its parallel items become a list.
- **Tables follow the column rules** of `elements.md` (`#e-colunas`): short column titles, the unit symbol in the cell, the scale in the table title, word units above the column title, text left, short fixed values centered, numbers right with the same decimals down the column.
- **Variation goes to the right of the number**, arrow and size of the change, colored by good or bad; a rate changes in points.
- **Charts read theme tokens, never a hex.** `token('--c1')`, not `'#2a78d6'`. A theme swap that requires touching chart code is a broken theme. A chart that resolves a token in JavaScript is drawn by a function passed to `onTheme(draw)`, so it repaints when the reader switches mode; a color outside the theme block is a token too.
- **Every report ships light and dark.** It opens in the mode the system asks for, the theme button cycles system, light and dark, and print is always light. Text over a ramp step takes `--on-lo` or `--on-hi` by `--on-flip`, never a fixed white.
- **One axis.** Two measures of different scale become two charts or get indexed to a common base. Never a second y-scale.
- **Colored SVG text needs `style="fill:…"`.** The stylesheet's `.chart .val`, `.tick` and `.lbl` rules outrank a `fill` attribute, so an end label set by attribute renders in ink. This one is silent and it will happen to you.
- **A legend for two or more series, at most six entries with "Outros"**, plus direct labels at the line ends. One series needs no legend: the title names it.
- **Every mark answers the pointer and the finger.** A detail opens on hover and on tap: `data-tip` on the mark, or `tooltip.follow` for a chart's own hover. A chart that answers only `mousemove` is a picture on a phone.
- **Never publish a number whose base is too thin without marking it.** Fade it, asterisk it, or cut the series where the base thins out, and say which in a note. A 100% built on three clients gets quoted back at you.
- **Say the scope in every section.** "45%" is not a finding; "45% do volume, nas safras de 2025, no 12º mês" is.

## References

Load the one you need, when you need it.

| File | What it answers |
|---|---|
| `references/elements.md` | Every element: what it is for, when, when not, its anchor in the catalog, what to copy |
| `references/structure.md` | The draft, the shared assets, the build, the fonts, embedding data, size limits |
| `references/charts.md` | Which form, the shared functions, the SVG patterns, the gotchas that cost a rebuild |
| `references/themes.md` | The token contract, the light and dark modes, the client's colors, extracting, deriving and completing a theme, validating |
| `references/writing.md` | Section order, headline first, explaining terms, the two closing sections |
| `assets/skeleton.html` | The draft to start from |
| `assets/catalog.html` | Every element live, in pt-BR, with its ficha; the source of the markup and calls to copy |
| `assets/report.css`, `assets/report.js`, `assets/fonts.css`, `assets/theme-neutral.css`, `assets/fonts/` | The shared assets every draft links and every build inlines |
| `scripts/build.mjs` | Builds a draft into one self-contained file, with the client's theme |
| `scripts/theme.mjs` | Extract, derive, fill and check a theme, both modes, and measure a ramp's `--on-flip`. Run it; do not eyeball colors. |

## Composing with other skills

- **Choosing a chart form, or inventing a series palette:** the `dataviz` skill carries the method and a validator that also simulates colour-vision deficiency, which `theme.mjs` deliberately does not.
- **Publishing and sharing a link:** the `artifact-publish` skill. Getting the account wrong produces a link the reader cannot open, and it raises no error.
- **The report's prose reads badly after several passes:** the `doc-coherence` skill.
