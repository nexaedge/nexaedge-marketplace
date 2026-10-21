# Themes: one structure, any brand

A theme is **only what sits between the `/* THEME */` and `/* /THEME */` markers** in the report's `<style>`, and it always has two modes: light and dark. Layout, type scale, spacing and chart geometry are identical across every theme, so two reports for two different organisations are recognisably the same object wearing different colors.

The markers are a contract, not decoration. Keep them bare, with no text on the marker lines, because `theme.mjs` reads the block back out of any report built this way, both modes included.

**Charts read tokens, never hexes.** `token('--c1')`, not `'#2a78d6'`. If swapping a theme requires touching chart code, the theme is broken. A chart that resolves a token in JavaScript redraws on the `themechange` event, which the skeleton's `onTheme(draw)` wires up (see `charts.md`).

## The two modes

The block holds three rules. The light values sit in `:root`. The dark values are written twice with identical content: once for the system setting (`@media screen and (prefers-color-scheme: dark)` on `:root:where(:not([data-theme="light"]))`) and once for the explicit choice (`@media screen` on `:root[data-theme="dark"]`). Both dark rules sit under `screen`, which keeps print light, and `:where()` keeps the system rule at the specificity of `:root`, so `data-theme` always wins over the system setting. `assets/skeleton.html` is the reference for the exact structure.

The report opens in the mode the operating system asks for. A button in the header cycles system, light and dark, keeps the choice in `localStorage` and is hidden in print. The skeleton carries the button and its script: copy them unchanged, so every report behaves the same.

Every token in the contract below needs a value in each mode, and each mode is validated against its own `--bg`.

## The token contract

| Token | Role | Constraint |
|---|---|---|
| `--ink` | body and headings | ≥ 7:1 on `--bg` |
| `--muted` | subtitles, secondary prose | ≥ 6:1 |
| `--faint` | meta lines, tile captions, axis labels | ≥ 4.5:1 — this is small text |
| `--bg` `--panel` `--line` | surface, raised block, hairline | panel and line only need to be visible |
| `--accent` | small bold text: eyebrow, links, sort arrows | **≥ 4.5:1** |
| `--brand` | brand fills, rules, marks — never small text | ≥ 3:1 |
| `--pos` `--neg` `--warn` | status only, never a series | ship with a label, never color alone |
| `--c1`…`--c6` | categorical series, fixed order | validated as a set |
| `--h0`…`--h6` | sequential ramp: low step `--h0` to high step `--h6` | lightness strictly monotonic: falls in the light mode, rises in the dark mode (`--h0` sits near the surface in both) |
| `--on-lo` `--on-hi` | text over the low / high end of the ramp | whichever wins contrast: in the light mode `--on-lo` is the ink and `--on-hi` is white, in the dark mode `--on-lo` is the light ink and `--on-hi` is the dark surface color |
| `--on-flip` | first ramp index that uses `--on-hi` | measured per ramp and per mode, never guessed |

## Getting a theme, in order of preference

### 1. Extract it from a report that already has it

If any report was built with this skill, its theme is reusable verbatim. This is the normal path once an organisation has one report.

```
node ${CLAUDE_PLUGIN_ROOT}/skills/html-report/scripts/theme.mjs extract caminho/relatorio-antigo.html
```

Paste the printed block, light and dark rules together, between the markers in the new report. Nothing else changes.

This also works on a report someone sent you, on a published artifact you saved locally, and on a themed shell kept in a project repo. If it has the markers, it is a theme source.

### 2. Derive it from the brand

For a new organisation, start from the brand's primary color:

```
node .../theme.mjs derive --brand "#E4572E"
node .../theme.mjs derive --brand "#E4572E" --ink "#101820" --surface "#ffffff" --surface-dark "#161615"
```

It prints both modes in the structure above. For each mode it proposes ink, greys, accent and the full sequential ramp, and it measures `--on-flip`. `--ink` and `--surface` set the light mode; `--surface-dark` sets the dark surface (default `#161615`). It leaves `--c2`…`--c6` as `?` in both modes on purpose: picking hues that separate is a judgement call, not arithmetic. Fill them in all three rules (the two dark rules stay identical), then validate.

**Finding the real hexes.** Brand documents rarely state them; the assets do. Read the `fill` in a logo SVG, sample a corner pixel of a dark-background logo PNG, or pull the CSS custom properties off the organisation's site. Do not eyedrop from a screenshot — compression shifts the value.

### 3. Use the neutral default

`assets/skeleton.html` ships with an unbranded theme, light and dark, that passes every check. It is a legitimate answer for an internal report that belongs to no brand. It is not a fallback to leave in place for a client deliverable.

## Validating

```
node .../theme.mjs check relatorio.html                       # every mode of the theme, in place
node .../theme.mjs check "#hex,#hex,#hex"                     # a candidate series palette on white
node .../theme.mjs check "#hex,#hex,#hex" --surface "#161615" # the same on a dark surface
node .../theme.mjs ramp  "#hex,…"                             # a ramp in either direction, and its measured --on-flip
```

`check` on a report validates every mode the block declares, each against its own `--bg`, and names the mode on each line of its output:

- the ink contrasts (`--ink` 7:1, `--muted` 6:1, `--faint` and `--accent` 4.5:1, `--brand` 3:1);
- the series: lightness band (0.43 to 0.77 in the light mode, 0.48 to 0.67 in the dark mode), chroma floor, adjacent separation, surface contrast;
- the ramp's monotonicity in that mode's direction, and that a declared `--on-flip` matches the measured one;
- that the two dark rules have the same content.

It fails when a mode is missing, and it exits non-zero on any failure, so it fits a build step. A candidate palette is checked in the mode of its surface: pass `--surface` with the dark `--bg` to check a dark series.

It does **not** simulate colour-vision deficiency. For that, and for choosing a chart form, use the `dataviz` skill, whose validator adds CVD separation checks. Run it whenever you invent a new series palette; the checks here catch the failures that occur most often, not all of them.

## The three rules that generalise

**The brand color is usually not the text accent.** A hue tuned for a logo tends to land near 3:1 on white: fine for a filled mark, illegible for a 12px uppercase eyebrow. The pattern that works is `--brand` holding the brand hex and `--accent` holding a darker step of the same hue that clears 4.5:1 (in the dark mode, a lighter step). `derive` does this automatically.

**`--on-flip` is a property of the ramp, not a constant.** The step where `--on-hi` starts winning depends on where the ramp's lightness falls, and two ramps built the same way land on different numbers, the light and the dark ramp of one theme included. Measure it, put it in the theme, and read it in the chart:

```js
const flip = parseInt(token('--on-flip'), 10);
const tinta = (i) => i >= flip ? token('--on-hi') : token('--on-lo');
```

**Slot order is the mechanism, not decoration.** Separation is checked between *adjacent* slots, so the same six colors in a different order can pass or fail. When a palette fails, try reorderings before reaching for new hues.

## Dark mode

A theme always has both modes. The dark mode is a second set of values validated against a second surface, so it is chosen and measured, never an automatic inversion of the light one. Flipping a light palette reliably produces adjacent series that are indistinguishable: the failure looks fine to whoever built it and is invisible to everyone else until someone measures.

**Deriving the dark mode.** `derive` does this part of the work and `check` confirms it:

- **Surface.** A dark neutral, `#161615` by default, with `--panel` and `--line` a step and a few steps lighter than it.
- **Inks.** The brand hue at low chroma, found by contrast target against the dark surface (`--ink` 7:1 or more, `--muted` 6:1, `--faint` 4.5:1). On a dark surface contrast rises with lightness, the opposite of the light mode, so the search runs the other way.
- **`--accent` and `--brand`.** The accent is the brand when it clears 4.5:1 on the dark surface, and otherwise the nearest lighter step of the brand hue that does. `--brand`, which is also `--c1`, is stepped into the dark series band (lightness 0.48 to 0.67).
- **Series.** `--c2`…`--c6` are chosen by hand and validated with `check` on the dark surface. The dark band is narrower than the light one because a very light or very dark series loses against the surface or vibrates on it.
- **Ramp.** The same hue rises from a step near the surface (`--h0`) to the lightest step (`--h6`). `--on-lo` is the light ink, `--on-hi` is the dark surface color, and `--on-flip` is measured: the text over the light end of the ramp turns dark.
- **Status colors.** `--pos`, `--neg` and `--warn` take lighter values that clear the dark surface.

**A color that is the same in both modes by design** (a shadow that is always black, for example) may stay a literal outside the theme block, with a comment saying so. Every other color outside the block is a token.

The two dark rules carry the same content because one answers the system setting and the other the explicit choice. `check` fails when they differ.
