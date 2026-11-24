# html-report

Turns finished analysis results into one self-contained HTML file: charts, color grids, interactive tables and number cards, with the CSS, the JavaScript, the fonts and the data inline. It opens by double-click, works with no network, reads on a phone as well as on a desktop, and survives being served from a sandboxed iframe, which is how most artifact hosts serve it.

It handles the **visual layer only**. You bring numbers that are already correct and a message that is already decided; the skill decides the form, the theme and the markup. It does not query anything and it does not decide what is true.

Every report shares one layout and one set of elements, so two reports for two organisations are the same object in different colors. **`assets/catalog.html` is the reference**: it shows every element (title and summary, number cards, notice boxes, breakdowns, waterfall, funnel, timeline, the figure frame, tables with their unit and alignment rules, the color grid, the interactive table with Excel download, tabs, simulator, side notes, sources) with what each one is for, when to use it, when not to, and a live example. Open it in a browser to see them; `references/elements.md` says what to copy from each.

## Install

```
/plugin marketplace add nexaedge-marketplace --source github --repo nexaedge/nexaedge-marketplace
/plugin install html-report@nexaedge-marketplace
```

## Use

Ask for a report and hand over the material:

> Monta o relatório disso. Os números estão em `resultado.json`, a mensagem é que a base instalada carrega o volume, e é para o time de crédito.

The skill asks for whatever it still needs (who reads it, whose brand it wears), then writes the file.

## How a report is made

The skill writes a draft in your project's folder, starting from `assets/skeleton.html`. The draft holds only the report's own content: its sections, the markup of the elements it uses, its data and the calls that draw them. It links four shared assets by their bare names, `fonts.css`, `theme-neutral.css`, `report.css` and `report.js`, which hold the layout, the type, the CSS and the behaviour of every element.

The build turns the draft into the report:

```
node scripts/build.mjs relatorio.draft.html relatorio.html --client acme
```

It always takes the four shared assets from the skill's `assets/`, so nothing is copied into the project. It stops when the draft's folder holds a file with one of their names, and when the draft names one of them by a path to any file but the skill's own, so a stale copy never wins without notice. Any other local name is a path from the file that names it. It inlines every stylesheet, script, font and image (the fonts as base64 in `<head>`), puts in the client's theme, and refuses every remote URL in an attribute that loads something (`src`, `srcset`, `poster`, `data`, `href` on anything but a link, `url()` and `image-set()` in CSS, among others); a link the reader follows, `<a href>`, stays. It writes a Content-Security-Policy into the report that lets it load only its own inline styles and scripts and `data:` images and fonts, so a script that reaches for the network fails in the reader's browser too. It embeds the math font only when the report needs it (see Fonts below), warns about an embedded file over 1 MB and a report over 5 MB, and writes one file. Two builds of the same draft are byte-identical, and building a built report gives it back unchanged. `--theme <file>` takes the theme from any file that carries it; with neither option the report keeps the neutral theme.

## Themes

The plugin ships **no brand**. A theme is only what sits between the `/* THEME */` and `/* /THEME */` markers, and it always has a light and a dark mode. A report opens in the mode the operating system asks for; a button cycles system, light and dark and remembers the choice, and print is always light.

A client's colors can live in your preferences, outside the plugin: the skill reads `branding.yml` from `${XDG_CONFIG_HOME:-$HOME/.config}/claude-skills-preferences/`, with per client either `clients.<client>.theme` (a path to a report or a `.css` file that carries the theme markers) or `clients.<client>.brand` plus the optional `ink`, `surface` and `surface_dark` hexes. With a brand and no theme, `--client` derives the theme as `derive` does and then, where `derive` stops, completes it: it fills `--c2`…`--c6` with five of the neutral theme's six series colors, without the one whose hue is closest to `--c1`, in the order that keeps adjacent colors furthest apart, and runs `check` on it. When `derive` refuses the colors or a check fails, the build stops with the reason or the failing pairs and the `derive` command to start from. When the file or a key is missing, the skill names it and asks. Otherwise there are four ways to get a theme:

**Lift it from an earlier report.** Any report built with this skill carries its theme in a machine-readable block:

```
node scripts/theme.mjs extract relatorio-anterior.html > tema.css
```

Point the skill at a previous file and the new report matches it exactly, light and dark. This is the normal path once an organisation has one report.

**Derive it from a brand color.** For a new organisation:

```
node scripts/theme.mjs derive --brand "#E4572E"
```

For each mode it proposes the ink, the greys, the surfaces and rules, the text accent and its tint, the status colors and their tints, the grey of "Outros", the strength of the color grid and the full sequential ramp, and it measures where the text over the ramp has to flip. It deliberately leaves the categorical series slots after the first empty: picking hues that stay apart is judgement, not arithmetic.

It keeps the brand color wherever the color passes: `--brand`, the marks without text, is the brand when it reaches 3:1 on the page and otherwise the nearest step of its hue that does, `--accent`, the text accent, is the brand when it reaches 4.5:1 and otherwise the nearest step that does, and `--c1`, the first series color, is the nearest step inside the series' lightness band. A grey, black or white brand gets the neutral theme's `--c1`. Each of the three that is not the brand color is named on the error output with the reason. It refuses a light surface darker than OKLab lightness 0.77 and a dark one lighter than 0.28, where no ink reaches its contrast on every tint, and a chosen ink that fails on some background whatever its tint. `references/themes.md` has the rules.

**Complete an older theme.** A theme that lacks some tokens of the current contract gets them, in both modes, each chosen to pass the checks it takes part in:

```
node scripts/theme.mjs fill tema-antigo.css > tema.css
```

It adds only the tokens that are missing, lists each on the error output, and changes no value the theme has. A value that fails a check stays as it is, and `check` reports it.

**Use the neutral default.** `assets/theme-neutral.css` is an unbranded theme, light and dark, that passes every check. It is fine for an internal report that belongs to no brand.

Either way, check it:

```
node scripts/theme.mjs check relatorio.html        # both modes of the theme, in place
node scripts/theme.mjs check tema.css              # a theme file
node scripts/theme.mjs check "#hex,#hex,#hex"      # a candidate series palette
node scripts/theme.mjs ramp "#hex,…" [--on-lo "#hex"] [--on-hi "#hex"]   # a ramp and its text-flip index
```

`check` first confirms the block holds exactly the three rules a theme is made of (light, dark by the system setting, dark by the reader's choice), each once and with nothing else beside them. Then it validates each mode against its own background: text contrast, text on every surface and tint, the color grid, the series (lightness band of that mode, chroma floor, adjacent separation), ramp monotonicity in that mode's direction, and that the declared text-flip index matches the measured one. It fails when a mode or a contract token is missing, names each missing one, and exits non-zero on any failure, so it fits a build step. It does not simulate colour-vision deficiency; for that, and for choosing a chart form, use the `dataviz` skill.

## What is inside

```
skills/html-report/
  SKILL.md                  the procedure and the non-negotiables
  references/
    elements.md             each element: what it is for, when, when not, what to copy
    structure.md            the draft, the shared assets, the build, the fonts, embedding data
    charts.md               which form to pick, the shared functions, the SVG patterns, the traps
    themes.md               the token contract, light and dark modes, extracting, deriving, completing, validating
    writing.md              section order, headline first, explaining terms, honesty rules
  assets/
    skeleton.html           the draft to start from: links the shared assets, holds the page's frame
    catalog.html            every element with its ficha (what for, when, when not) and a live example (pt-BR)
    report.css              the layout, the type and the CSS of every element
    report.js               the helpers, every element's function and the page's controls
    theme-neutral.css       the neutral theme, light and dark
    fonts.css               the @font-face rules of the five font files
    fonts/                  the font files, WOFF2, each family with its OFL.txt
  scripts/
    build.mjs               draft to one self-contained file, with the client's theme; no dependencies, Node 18+
    theme.mjs               extract / derive / fill / check / ramp; no dependencies, Node 18+
    theme-rules.mjs         the token contract, derive, fill and check, which both commands use
    skill-assets.mjs        where the shared assets are, and the neutral theme, which both commands read
    font-coverage.mjs       the characters a font file has, read from its character map
tests/                      the scripts' tests, `node --test`; `mise run test` at the repository root runs them
```

There is no chart library and no generator. The shared assets carry the layout and every element; the draft carries the markup and the calls for the elements a report uses. The references carry short snippets for the drawing that stays per report (lines, stacked bars, an SVG heatmap), and the skill writes the rest for the data at hand.

## Fonts

Reports use Instrument Sans for headings, numbers and tables, Newsreader for the text and STIX Two Math for formulas, all under the SIL Open Font License (the `OFL.txt` beside each file). Each is the whole family as published on Google Fonts, italics included, converted losslessly to WOFF2 with every axis kept:

| File | Axes | Characters | Bytes |
|---|---|---|---|
| `fonts/instrument-sans/InstrumentSans.woff2` | width 75 to 100, weight 400 to 700 | 343 | 88,504 |
| `fonts/instrument-sans/InstrumentSans-Italic.woff2` | width 75 to 100, weight 400 to 700 | 343 | 94,736 |
| `fonts/newsreader/Newsreader.woff2` | weight 200 to 800, optical size 6 to 72 | 564 | 215,300 |
| `fonts/newsreader/Newsreader-Italic.woff2` | weight 200 to 800, optical size 6 to 72 | 564 | 239,280 |
| `fonts/stix-two-math/STIXTwoMath.woff2` | none; it carries an OpenType MATH table | 4,605 | 558,668 |

Every report embeds the four text files: 637,820 bytes, about 830 KB once in base64. The build embeds STIX Two Math, another 727 KB in base64, only when the report has a formula (a `<math>` element, or an element whose class list holds `formula`) or shows a character that one of the four text files lacks, which it decides from the fonts' character maps. It reads the characters of the markup, of the scripts and of the stylesheets, with CSS escapes and character references decoded, and leaves out what sits in an HTML, CSS or JavaScript comment. The skeleton built as it is weighs 921 KB and carries no math font; the catalog, which has formulas, weighs 1,760 KB. Nothing is loaded from the network.

STIX Two Math sits second in both text stacks, so a character the text font lacks renders from it rather than from the reader's system:

- **Instrument Sans** has Basic Latin, Latin-1 except `¤ ¦ ¬ ± ² ³ µ ¹ ¼ ½ ¾` and the soft hyphen (U+00AD), 99 of the 128 letters of Latin Extended-A, 9 of the 256 of Latin Extended Additional, `€ −` and the arrows `← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙`. In a heading, a number or a table, a Greek letter, `± ² ½ µ ≈ ≠ ≤ ≥` and every other math sign come from STIX Two Math.
- **Newsreader** has all of Latin-1, Latin Extended-A but `Ĳ ĳ ŉ ſ`, 97 of the 256 characters of Latin Extended Additional, 16 of the 33 currency signs from U+20A0 to U+20C0 (`₡ ₣ ₤ ₦ ₧ ₩ ₫ € ₭ ₱ ₲ ₵ ₹ ₺ ₼ ₽`) and `− ± ≈ ≠ ≤ ≥`. In the text, a Greek letter, an arrow and every other math sign come from STIX Two Math.
- **STIX Two Math** has Latin with every Portuguese accent, Greek, the whole Mathematical Operators, Supplemental Mathematical Operators, Miscellaneous Technical and Geometric Shapes blocks, 103 of the 112 arrows, 29 superscripts and subscripts, and the mathematical italic and bold letters MathML draws variables with. It lacks `ᵢ` (U+1D62) and `✕`.

A character none of the five has, such as `ᵢ`, `✕` or an emoji, renders in the reader's system font, and the build names it in a warning. The variation arrows, the dots, the checklist marks and the sort arrows are drawn in CSS, so they need no font.

## Composes with

- **`dataviz`** for chart-form guidance and a palette validator that also simulates colour-vision deficiency.
- **`artifact-publish`** for turning the file into a shareable link.
