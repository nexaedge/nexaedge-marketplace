# Structure: the draft, the build, the data

## The draft and the shared assets

A report is written as a draft and built into one file. The draft starts as a copy of `assets/skeleton.html`, saved in the project's own folder, and holds only what is the report's own: the title, the sections with the elements' markup, the data and the calls that draw the elements. Everything every report shares lives in four files of `assets/`, which the draft links in its `<head>`, in this order:

| File | What it carries |
|---|---|
| `fonts.css` | The five font files as `@font-face` rules pointing at `assets/fonts/` |
| `theme-neutral.css` | The theme block, light and dark (`themes.md`); the build swaps it for the client's |
| `report.css` | The grid, the type and the CSS of every element in the catalog |
| `report.js` | The helpers, the function of every element and the page's controls: the theme button, the contents list, the hover details, the analysis dialogs, the scroll bars, the side notes |

```html
<link rel="stylesheet" href="fonts.css">
<link rel="stylesheet" href="theme-neutral.css">
<link rel="stylesheet" href="report.css">
<script src="report.js"></script>
```

**The reference form.** A draft names each shared asset by its bare file name, as above, wherever the draft sits. The build always takes a shared asset from the skill's `assets/` folder, so a draft in any project folder builds with nothing copied beside it, and it stops with both paths named when the draft's folder holds a file with a shared asset's name. A file of the report's own, such as an image, is named by its path from the draft's folder. A path to the skill's `assets/` folder works too, absolute or relative, and lets the draft open in a browser before it is built; otherwise, look at the built file. A path to any other file with a shared asset's name, such as `css/report.css`, stops the build, because it would be a copy that falls behind the skill's.

`report.js` runs in `<head>`, so its functions exist when the report's script at the end of `<body>` calls them, and the page's controls start once the document has loaded.

The skeleton itself holds:

- **The top bar.** Below 1416px of viewport, a bar at the top of the screen holds the "Índice" button and the theme button; it stays in view while the page scrolls. From 1416px up the contents list sits in the left margin and the two buttons sit in the corners.
- **The grid.** Text in a 680px column (`--measure`) centred in an 880px one (`--wide`), and the contents list in the margin or, below 1416px, in a drawer opened from the "Índice" button.
- **The header, the summary and the first section**, ready to fill.
- **The report's script** at the end of `<body>`, with `const DATA = {}`.

Every other element is copied from `assets/catalog.html`, as `elements.md` says: its markup and, when it has one, the call of its function. The functions are listed in `charts.md`.

It is deliberately not a chart library. A chart written for its data beats a generic one configured into shape, and the snippets in `charts.md` are shorter than the configuration would be.

## The build

```
node scripts/build.mjs relatorio.draft.html relatorio.html --client acme
node scripts/build.mjs relatorio.draft.html relatorio.html --theme caminho/tema.css
node scripts/build.mjs relatorio.draft.html relatorio.html
```

The script path is relative to this skill's folder; in Claude Code, `${CLAUDE_PLUGIN_ROOT}/skills/html-report/scripts/build.mjs` reaches the same file. It needs Node 18 or later and nothing else, and it:

- takes each shared asset from the skill's `assets/` and every other local name from the folder of the file that names it, and stops when the draft's folder holds a file with a shared asset's name or the draft names one by a path to another file;
- turns every `<link rel="stylesheet">` into a `<style>`, keeping its `media`, and every `<script src>` into an inline script, in the place the draft has them, so the fonts land as base64 `@font-face` rules in `<head>`. It escapes what would end the element early: `</style` in a stylesheet becomes `<\/style`, which reads the same to the CSS. In a script, `<!--`, `<script` and `</script` become `\x3C!--`, `\x3Cscript` and `\x3C/script` inside a string, a template, a regular expression or a comment, where `\x3C` reads as `<`; in the code itself the `<` gets a space after it, so `i<scripts.length` becomes `i< scripts.length`;
- writes a Content-Security-Policy `<meta>` right after `<meta charset>`, or first in `<head>` (`default-src 'none'`, with inline styles and scripts and `data:` images and fonts allowed), so a script that reaches for the network fails in the reader's browser as it would in a sandbox. A draft that already carries this policy, such as a built report, keeps it, so building a built report gives the same bytes; the build stops on any other policy, and on a draft with no `<head>`;
- turns every `url()` and every image named by a string in an `image-set()` of the CSS, every `<img src>`, every SVG `<image href>` and an icon's `<link href>` into a `data:` URI;
- reads tags only in the markup: the text of a script, a style or an HTML comment is never taken for a tag;
- swaps the theme block for the one in `--theme` (any `.css` or `.html` file that carries the theme markers) or for the client's theme in `branding.yml` (`--client`, `themes.md`); with neither, the draft's theme stays;
- keeps STIX Two Math only when the report has a `<math>` element or an element whose class list holds `formula`, or shows a character that one of the four text font files lacks, read from their character maps; otherwise it drops the math font's `@font-face` rule. The characters it reads are those of the markup, the scripts and the stylesheets, with character references and CSS escapes decoded and every HTML, CSS and JavaScript comment left out, so a `σ` in a comment does not cost a report 727 KB;
- refuses a remote URL (`http:`, `https:`, `//host`) in any attribute that loads a resource (`src`, `srcset`, `poster`, `data`, `ping`, `href` on anything but `<a>` and `<area>`, and the like) and in a CSS `url()` or `image-set()`, an `@import`, media other than an image, a `srcset` that names local files, a draft whose build carries other than one theme block, and an output path equal to the draft;
- warns about an embedded file over 1 MB, a report over 5 MB, and a character no embedded font has;
- writes one file, the same bytes for the same inputs.

Then check the theme of the built file: `node scripts/theme.mjs check relatorio.html`.

## Self-containment

The built file renders with no network, from `file://` and from inside `<iframe sandbox="allow-scripts">`.

- CSS, JS, fonts and images inline, all put there by the build. No CDN, no Google Fonts, no image by URL: the build refuses them.
- Fonts embedded as data, never remote. A remote font silently falls back in the sandbox and the layout shifts.
- No `fetch`, no `localStorage` reads you depend on. Sandboxed origins may deny storage, which is why every `localStorage` call in `report.js` sits in `try`/`catch`: when storage is denied the buttons still work, and the choice is just not remembered.

Test the real thing: open the built file, not the draft, and check the console.

## Fonts

| Font | Use | Files | Coverage, from the character maps |
|---|---|---|---|
| Instrument Sans | headings, numbers, tables, labels (`--f-ui`) | roman and italic, variable in width (75 to 100) and weight (400 to 700), 88,504 and 94,736 bytes | 343 characters each: Basic Latin, Latin-1 except `¤ ¦ ¬ ± ² ³ µ ¹ ¼ ½ ¾` and the soft hyphen (U+00AD), 99 of the 128 letters of Latin Extended-A, 9 of the 256 of Latin Extended Additional, punctuation, `€ −`, the arrows `← ↑ → ↓ ↔ ↕ ↖ ↗ ↘ ↙`, `‹ ›` |
| Newsreader | text (`--f-text`) | roman and italic, variable in weight (200 to 800) and optical size (6 to 72), 215,300 and 239,280 bytes | 564 characters each: Basic Latin, Latin-1, Latin Extended-A but `Ĳ ĳ ŉ ſ`, 97 of the 256 characters of Latin Extended Additional, punctuation, 16 of the 33 currency signs from U+20A0 to U+20C0 (`€ ₹ ₽ ₺` among them), `− ± ≈ ≠ ≤ ≥`, ligatures |
| STIX Two Math | formulas (`--f-math`), and the fallback of both text stacks | one file with an OpenType MATH table, 558,668 bytes | 4,605 characters: Latin with every Portuguese accent, Greek, every Mathematical Operator and Supplemental Mathematical Operator, Miscellaneous Technical, Geometric Shapes, 103 of the 112 arrows, 29 superscripts and subscripts, the mathematical italic and bold letters; not `ᵢ` (U+1D62) nor `✕` |

Each file is WOFF2, under the SIL Open Font License, with its family's `OFL.txt` beside it in `assets/fonts/`. The four text files add 637,820 bytes, about 830 KB once in base64, to every report; STIX Two Math adds 727 KB more to a report that needs it, as the build decides.

STIX Two Math sits second in `--f-text` and `--f-ui`, with no `unicode-range`, so any character the text font lacks renders from it: in the text, a Greek letter, an arrow and every math sign Newsreader lacks; in a heading, a number or a table, also `± ² ³ ½ µ ≈ ≠ ≤ ≥`. A character none of the five has, such as `ᵢ`, `✕` or an emoji, renders in the reader's system font, and the build warns about it. The variation arrows, the dots, the checklist marks and the sort arrows are drawn in CSS and need no font. `--mono` is the system's monospace font: a report that shows code gets the reader's own.

## Embedding the data

```js
const DATA = { curve: [...], cohorts: [...] };
```

Three things break here, all quiet:

- **`NaN` is not JSON.** `json.dumps` writes it as the bare literal `NaN`, which is a syntax error in a `<script>` and, when it survives a different serializer, renders as the string "NaN" in a cell. Convert to `null` before serializing.
- **`</` closes the tag.** Any string in your data containing `</` (a stray `</div>`, a regex) ends the script block. Replace `</` with `<\/` in the serialized JSON; it is identical to the JS parser.
- **Dates and Decimals are not JSON either.** Emit ISO strings and floats.

Python side, the whole of it:

```python
import json, math

def records(df):
    """Real nulls, not NaN, and no numpy scalars."""
    return [{k: (None if isinstance(v, float) and math.isnan(v) else v)
             for k, v in row.items()} for row in df.to_dict(orient="records")]

payload = json.dumps({"curve": records(df)}, default=str, ensure_ascii=False,
                     separators=(",", ":")).replace("</", "<\\/")
```

## How much data

**Aggregate before embedding.** The reader needs the series the charts draw and the rows the table shows, not the row-level detail behind them.

Past roughly **5 MB of JSON** the browser stalls on parse and the file stops being pleasant to open. If you are near it, aggregate harder, cut the table to the rows that matter with a note saying what was cut, or accept that this is a local app and not a report.

A useful check: if the table would have more than a few thousand rows, nobody is reading it; they want a filter, a different grain, or a query.

## Head matter

- **`<title>`**: what the report answers plus the scope. `Retenção por safra · out/2023 a jul/2026`. Never "report", never "index", never the file name. It becomes the tab, the listing entry and how the link is referred to.
- **`<html lang>` and `data-currency`**: the language and the currency `fmt` formats in, `pt-BR` and `BRL` in the skeleton.
- **Eyebrow**: organisation and subject, e.g. `Acme · Carteira de crédito`.
- **`<h1>`**: the conclusion in one sentence when the report argues for a number or a finding, or the decision or question when the report prepares a decision the reader has to take (`references/writing.md`, The headline). It starts right of the contents list and runs wider than the text column.
- **`.hdr-meta` line**: when it was generated, the data's own as-of date ("Dados até"), and the confidentiality label (`.conf`). The two dates differ, and the reader needs the second one more.
- **The summary**: the first `section.s`, with no title of its own, from one to three short paragraphs that go from the goal to the conclusion with the numbers in the text (`#e-abertura` in the catalog).

The report has no footer: the sources go in their own section at the end (`#e-fontes`), and the method of a number in its "Detalhes da análise" dialog.

## Parameterizing

If the report is generated from a script, keep the HTML as one template string and the numbers as variables. Do not build prose by concatenating fragments in a loop: the prose is the part a human rereads, and it should be legible in the source.

Compute every number that appears in prose, never type it:

```python
f"No MOB 12 sobram {num(share(12, 'logo'), 0)}% dos clientes"
```

A hardcoded number in prose rots on the next run and nothing warns you. This is the single most common way a report ends up self-contradicting: the chart updates, the sentence does not.
