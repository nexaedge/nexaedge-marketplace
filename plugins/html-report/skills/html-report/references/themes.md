# Themes: one structure, any brand

A theme is **only what sits between the `/* THEME */` and `/* /THEME */` markers**, and it always has two modes: light and dark. In a draft the block comes from `assets/theme-neutral.css`, and the build swaps it for the client's; in a built report it sits in a `<style>` of the `<head>`. Layout, type scale, spacing and chart geometry are identical across every theme, so two reports for two different organisations are recognisably the same object wearing different colors.

The markers are a contract, not decoration. Keep them bare, with no text on the marker lines, because `theme.mjs` and `build.mjs` read the block back out of any report or theme file built this way, both modes included.

**Charts read tokens, never hexes.** `token('--c1')`, not `'#2a78d6'`. If swapping a theme requires touching chart code, the theme is broken. A chart that resolves a token in JavaScript redraws on the `themechange` event, which `onTheme(draw)` wires up (see `charts.md`).

## The two modes

The block holds three rules. The light values sit in `:root`. The dark values are written twice with identical content: once for the system setting (`@media screen and (prefers-color-scheme: dark)` on `:root:where(:not([data-theme="light"]))`) and once for the explicit choice (`@media screen` on `:root[data-theme="dark"]`). Both dark rules sit under `screen`, which keeps print light, and `:where()` keeps the system rule at the specificity of `:root`, so `data-theme` always wins over the system setting. `assets/theme-neutral.css` is the reference for the exact structure.

The report opens in the mode the operating system asks for. The theme button cycles system, light and dark, keeps the choice in `localStorage` and is hidden in print. Its markup is in the skeleton and its behaviour in `report.js`, so every report behaves the same.

Every token in the contract below needs a value in each mode, and each mode is validated against its own `--bg`.

## The token contract

| Token | Role | Constraint |
|---|---|---|
| `--ink` | body and headings | ≥ 7:1 on `--bg` |
| `--muted` | subtitles, secondary prose | ≥ 6:1 |
| `--faint` | meta lines, card captions, axis labels, a field's scale | ≥ 4.5:1 on `--bg` and on `--panel`: this is small text |
| `--bg` | the page | the base every other pair is measured on |
| `--panel` | raised surface: cards, boxes, dialogs, fields, the color grid's base | `--ink` ≥ 7:1, `--muted` and `--faint` ≥ 4.5:1 on it |
| `--recess` | sunken surface: table group header, input, track, empty cell | `--ink` ≥ 7:1 and `--muted` ≥ 4.5:1 on it |
| `--line` | hairline: table rows, box borders | only needs to be visible |
| `--line-strong` | the rule that separates: table header, total row, axis base | ≥ 1.6:1 on `--bg`, and stronger than `--line` |
| `--accent` | small bold text: eyebrow, section number, links, sort arrows, the source badge's number | **≥ 4.5:1** |
| `--accent-soft` | the tint of the accent: behind the source badge (`--accent` text), behind the targeted source in the list (`--ink` and `--muted` text), and the ring around a focused field | `--accent` ≥ 4.5:1, `--ink` ≥ 7:1 and `--muted` ≥ 4.5:1 on it |
| `--brand` | marks that carry meaning without text: list bullets, the index's current entry and progress bar, the selected tab, the side note's rule, the quote's rule; never small text | ≥ 3:1 on `--bg`. The brand color when it reaches 3:1, otherwise the step of its hue nearest it that does, so a yellow or a pale brand never marks in a color the reader cannot see |
| `--mark` | the highlighted row and the default callout background | `--ink` ≥ 7:1 and `--muted` ≥ 4.5:1 on it |
| `--pos` `--neg` `--warn` | status and variation text, never a series | each ≥ 4.5:1 on its tint; `--pos` and `--neg` also ≥ 4.5:1 on `--bg`; ship with a label or an arrow, never color alone |
| `--pos-soft` `--neg-soft` `--warn-soft` | the tint behind a status tag or a notice box | its status color ≥ 4.5:1 on it; `--ink` ≥ 7:1 on `--pos-soft` and `--warn-soft`, the two that hold body text, and `--muted` ≥ 4.5:1 on `--pos-soft`, behind the recommendation's meta line |
| `--c1`…`--c6` | categorical series, fixed order; `--c1` also paints the color grid, the progress bar and the notice box's edge | validated as a set |
| `--other` | the "Outros" series, always last | grey: chroma below 0.10, ≥ 1.5:1 on `--bg` |
| `--heat-span` | how far the color grid goes from `--panel` toward `--c1`, as a percentage | above 0%, and `--ink` ≥ 4.5:1 on the strongest cell, `mix(--c1, --panel, 6% + span)`, for the value and its unit alike |
| `--h0`…`--h6` | sequential ramp: low step `--h0` to high step `--h6` | lightness strictly monotonic: falls in the light mode, rises in the dark mode (`--h0` sits near the surface in both) |
| `--on-lo` `--on-hi` | text over the low / high end of the ramp | whichever wins contrast: in the light mode `--on-lo` is the ink and `--on-hi` is white, in the dark mode `--on-lo` is the light ink and `--on-hi` is the dark surface color |
| `--on-flip` | first ramp index that uses `--on-hi` | measured per ramp and per mode, never guessed |

Two colors are computed outside the block from these tokens and need no value of their own: `--row-hover`, a little ink mixed into `--bg`, and `--flash`, the amber of a followed link, `--warn` mixed into `--bg`.

The color grid (`#e-safras` in the catalog) paints each cell with `color-mix(in oklab, var(--c1) calc(6% + var(--heat-span) * var(--share)), var(--panel))`, where `--share` runs from 0 to 1, and writes the value and its unit in `--ink`. The ramp `--h0`…`--h6` stays for a heatmap drawn in SVG.

## Getting a theme, in order of preference

The script paths below are relative to this skill's folder; in Claude Code, `${CLAUDE_PLUGIN_ROOT}/skills/html-report/scripts/` reaches the same files.

### 0. The client's colors from the preferences file

Reads `branding.yml` from the preferences directory (`${XDG_CONFIG_HOME:-$HOME/.config}/claude-skills-preferences/`): `clients.<client>.theme`, or `clients.<client>.brand` with the optional `clients.<client>.ink`, `clients.<client>.surface` and `clients.<client>.surface_dark`.

- `theme` is the path to a file that carries the theme markers, such as an earlier report or a `.css` file with the block; a relative path starts at the folder of `branding.yml`. `node scripts/build.mjs draft.html report.html --client <client>` builds with it directly.
- `brand` is a hex, and `ink`, `surface` and `surface_dark` are hexes. With a brand and no theme, `--client` builds with a derived theme: it derives both modes as `derive` does with `--brand`, `--ink`, `--surface` and `--surface-dark` (step 2), fills `--c2`…`--c6` of each mode with five of the neutral theme's six series colors, leaving out the one whose hue is closest to that mode's `--c1`, in the order of those five that keeps the closest adjacent pair furthest apart, and runs the checks of `check`. The build prints each note `derive` would print. When `derive` refuses the colors or a check fails, the build stops with the reason or the failing pairs and prints the `derive` command; choose the series by hand from there, save the block to a `.css` file and set `clients.<client>.theme` to it.

Read the file only when the report belongs to a client. When the file or the client's keys are missing, name the file and the keys above to the person and ask for the values; never invent one. Never print the file into a transcript or a commit.

### 1. Extract it from a report that already has it

If any report was built with this skill, its theme is reusable verbatim. This is the normal path once an organisation has one report.

```
node scripts/build.mjs draft.html report.html --theme caminho/relatorio-antigo.html
node scripts/theme.mjs extract caminho/relatorio-antigo.html > tema.css
```

The first builds with the old report's theme as it is; the second saves the block, light and dark rules together, to a file of its own. Nothing else changes.

This also works on a report someone sent you, on a published artifact you saved locally, and on a theme file kept in a project repo. If it has the markers, it is a theme source.

### 2. Derive it from the brand

For a new organisation, start from the brand's primary color:

```
node scripts/theme.mjs derive --brand "#E4572E"
node scripts/theme.mjs derive --brand "#E4572E" --ink "#101820" --surface "#ffffff" --surface-dark "#161615"
```

It prints both modes in the structure above. For each mode it proposes ink, greys, the surfaces (`--panel`, `--recess`, `--line`, `--line-strong`), accent and `--accent-soft`, `--mark`, the status colors and their tints, `--other`, `--heat-span` and the full sequential ramp, and it measures `--on-flip`. `--ink` and `--surface` set the light mode; `--surface-dark` sets the dark surface (default `#161615`). It leaves `--c2`…`--c6` as `?` in both modes on purpose: picking hues that separate is a judgement call, not arithmetic. Fill them in all three rules (the two dark rules stay identical), then validate.

Each mode takes the brand color wherever it passes the token's checks, and the nearest step of its hue otherwise:

- `--brand` is the brand color when it reaches 3:1 on the page, and otherwise the step of its hue nearest it that does: a yellow on white becomes an ochre, a navy on the dark page a lighter blue.
- `--accent` is the brand color when it reaches 4.5:1 on the page and on `--accent-soft`, and otherwise the step of its hue nearest it that does.
- `--c1` is the step of the brand hue nearest the brand that lies in the mode's series band (lightness 0.43 to 0.77 in the light mode, 0.48 to 0.67 in the dark) and reaches 3:1 on the page: a cyan on the dark page stays a cyan, darker. A brand whose chroma is under 0.10, a grey, black or white, reads as no color in a chart, so `--c1` is then the neutral theme's `--c1`; so is a brand none of whose in-band steps keeps that chroma.
- Each time `--brand`, `--accent` or `--c1` is not the brand color, `derive` says on the error output which token, which value it took and why.

The recess and the soft tints (`--recess`, `--accent-soft`, `--mark`, `--pos-soft`, `--neg-soft`, `--warn-soft`) start at their usual lightness and step toward the page until every text drawn on them reaches its minimum with the mode's ink, so a chosen `--ink` of lower contrast gets lighter tints rather than a theme that fails `check`.

`derive` refuses, with the reason, a light `--surface` under OKLab lightness 0.77 or a `--surface-dark` above 0.28: past those, no ink reaches 7:1 on every tint of the mode. It also refuses, naming the mode, colors for which no `--heat-span` lets the ink read on the strongest cell of the color grid, and a chosen `--ink` that stays under its minimum on some background however close to the page its tint steps, naming each failing pair. Both happen with a chosen `--ink` of low contrast.

**Finding the real hexes.** Brand documents rarely state them; the assets do. Read the `fill` in a logo SVG, sample a corner pixel of a dark-background logo PNG, or pull the CSS custom properties off the organisation's site. Do not eyedrop from a screenshot: compression shifts the value.

### 3. Complete a theme that lacks tokens

A theme made before a token entered the contract, or written by hand, can lack some of them. `fill` adds what is missing, in both modes, and leaves every value it has:

```
node scripts/theme.mjs fill caminho/tema-antigo.css > tema.css
```

It adds every missing token of the contract but the series and the ramp, which stay judgement: the surfaces and rules, `--muted` and `--faint`, `--accent` and `--accent-soft`, `--mark`, the status colors and their tints, `--other`, `--heat-span` and the ramp inks, each chosen so the pairs above pass with the values the theme already has. It needs `--bg`, `--ink` and `--brand` (or `--accent`) in each mode, and refuses a theme whose two dark rules differ, naming the tokens, since it could not tell which one to complete. It prints the completed block on the standard output and lists on the error output each token it added with its value. It changes no value the theme has: a value that fails, such as a status color that reaches 4.5:1 on no tint of its hue, stays as it is, and `check` reports it to the person who owns the theme. Point `clients.<client>.theme` at the completed file, then validate it.

### 4. Use the neutral default

`assets/theme-neutral.css` is an unbranded theme, light and dark, that passes every check, and the one a draft builds with when no theme is given. It is a legitimate answer for an internal report that belongs to no brand. It is not a fallback to leave in place for a client deliverable.

## Validating

```
node scripts/theme.mjs check relatorio.html                       # every mode of the theme, in place
node scripts/theme.mjs check tema.css                             # the same on a theme file
node scripts/theme.mjs check "#hex,#hex,#hex"                     # a candidate series palette on white
node scripts/theme.mjs check "#hex,#hex,#hex" --surface "#161615" # the same on a dark surface
node scripts/theme.mjs ramp  "#hex,…"                             # a ramp in either direction, and its measured --on-flip
node scripts/theme.mjs ramp  "#hex,…" --on-lo "#hex" --on-hi "#hex"   # the same with the text colors over it
```

`ramp` reads the direction from the first and last steps: a ramp that rises is a dark mode's, one that falls a light mode's. The text over it, `--on-lo` and `--on-hi`, defaults to the neutral theme's of that mode; pass the theme's own to measure its `--on-flip`.

`check` on a report or a theme file validates every mode the block declares, each against its own `--bg`, and names the mode on each line of its output:

- the three rules of "The two modes" above, each once and with no other rule in the block, each declaring its mode's `color-scheme`: a theme that lacks the explicit dark rule, or whose light values sit under another selector, would show the wrong colors when the reader picks a mode;
- the ink contrasts (`--ink` 7:1, `--muted` 6:1, `--faint` and `--accent` 4.5:1, `--brand` 3:1);
- the surfaces and tints: every pair in the contract table, `--line-strong`, `--other`, and the strongest color-grid cell, with a `--heat-span` above 0%;
- the series: lightness band (0.43 to 0.77 in the light mode, 0.48 to 0.67 in the dark mode), chroma floor, adjacent separation, surface contrast;
- the ramp's monotonicity in that mode's direction, and that a declared `--on-flip` matches the measured one;
- that the two dark rules have the same content.

It fails when a mode or a contract token is missing, naming each missing token or series slot, and it exits non-zero on any failure, so it fits a build step. A candidate palette is checked in the mode of its surface: pass `--surface` with the dark `--bg` to check a dark series.

It does **not** simulate colour-vision deficiency. For that, and for choosing a chart form, use the `dataviz` skill, whose validator adds CVD separation checks. Run it whenever you invent a new series palette; the checks here catch the failures that occur most often, not all of them.

## The three rules that generalise

**The brand color is usually not the text accent.** A hue tuned for a logo tends to land near 3:1 on white: fine for a filled mark, illegible for a 12px uppercase eyebrow. `--accent-soft` is a pale tint of the brand (in the dark mode, a dark step above the surface), and `--accent` is the brand itself when it reaches 4.5:1 on that tint, otherwise the nearest step of the brand hue that does: darker in the light mode, lighter in the dark mode. `derive` does this automatically, and `check` measures the accent on the page as well as on its tint.

**`--on-flip` is a property of the ramp, not a constant.** The step where `--on-hi` starts winning depends on where the ramp's lightness falls, and two ramps built the same way land on different numbers, the light and the dark ramp of one theme included. Measure it, put it in the theme, and read it in the chart:

```js
const flip = parseInt(token('--on-flip'), 10);
const textColor = (i) => i >= flip ? token('--on-hi') : token('--on-lo');
```

**Slot order is the mechanism, not decoration.** Separation is checked between *adjacent* slots, so the same six colors in a different order can pass or fail. When a palette fails, try reorderings before reaching for new hues.

## Dark mode

A theme always has both modes. The dark mode is a second set of values validated against a second surface, so it is chosen and measured, never an automatic inversion of the light one. Flipping a light palette reliably produces adjacent series that are indistinguishable: the failure looks fine to whoever built it and is invisible to everyone else until someone measures.

**Deriving the dark mode.** `derive` does this part of the work and `check` confirms it:

- **Surface.** A dark neutral, `#161615` by default. `--panel` is a step lighter, `--recess` half a step lighter, and `--line` and `--line-strong` a few steps lighter. In the light mode `--panel` is the surface itself, and `--recess`, `--line` and `--line-strong` are steps darker at low chroma of the brand hue.
- **Inks.** The brand hue at low chroma, found by contrast target against every surface each ink is checked on: the page (`--ink` 7:1 or more, `--muted` 6:1, `--faint` 4.5:1) and every pair of the contract table, so `--faint` also clears 4.5:1 on the lighter `--panel`. On a dark surface contrast rises with lightness, the opposite of the light mode, so the search runs the other way.
- **`--accent`, `--brand` and `--c1`.** The accent follows the rule above, against the dark tint. `--brand` and `--c1` follow the rules of "Derive it from the brand" against the dark page: `--brand` reaches 3:1 on it, and `--c1` also sits in the dark series band (lightness 0.48 to 0.67).
- **Series.** `--c2`…`--c6` are chosen by hand and validated with `check` on the dark surface. The dark band is narrower than the light one because a very light or very dark series loses against the surface or vibrates on it.
- **Ramp.** The same hue rises from a step near the surface (`--h0`) to the lightest step (`--h6`). `--on-lo` is the light ink, `--on-hi` is the dark surface color, and `--on-flip` is measured: the text over the light end of the ramp turns dark.
- **Status colors.** `--pos`, `--neg` and `--warn` take lighter values that clear the dark surface, and their tints are dark steps of the same hue, where the light mode's are pale ones.
- **Tints.** `derive` gives `--mark` the value of `--accent-soft`: pale in the light mode, a dark step above the surface in the dark mode.

**A color that is the same in both modes by design** (a shadow that is always black, for example) may stay a literal outside the theme block, with a comment saying so. Every other color outside the block is a token.

The two dark rules carry the same content because one answers the system setting and the other the explicit choice. `check` fails when they differ.
