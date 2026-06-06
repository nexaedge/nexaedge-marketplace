---
name: verify-symbol
description: "Confirm whether a code symbol (method/class/field/endpoint/flag) actually exists and return its REAL signature + definition location — or the nearest match. Uses LSP/introspection, never grep-spelunking. Cheap and fast."
argument-hint: "[symbol + repo, e.g. 'Partner#kyc_pending? in <repo>']"
allowed-tools: Read, Glob, Grep, Bash
---

Run this when you need to answer one question precisely and cheaply: **does this symbol exist, what is its real signature, and where is it defined?** (Or, if it doesn't: what's the nearest real thing?) This is the antidote to code that assumes `partner.slug` or `CreditOffer.find_by_offer` and turns out to be wrong.

This is a cheap, mechanical move — dispatch it to the **intern** (a haiku worker) when you want it cheap, or run it inline when you're already mid-task.

**Never grep-spelunk to answer this.** Use the language's own runtime/compiler, an LSP, or a structural tool — they give ground truth.

## Procedure

1. **Detect the project language** of the target symbol (file extension / project markers).
2. **Load only that language's toolkit card** — locate and read it (don't load other languages):
   ```bash
   find ~/.claude/plugins -type f -path '*spec-plugin/references/<lang>.md' 2>/dev/null | head -1
   ```
   Read that file (`ruby.md` / `typescript.md` / `python.md`). It has the exact verify/navigate commands for the language. If no card matches, fall back to `ast-grep`/`ctags` from `references/toolkit.md`.
3. **Run the card's "Navigate — verify a symbol" commands** for the target. Prefer native LSP (if the language has an LSP plugin) → runtime/compiler introspection → ast-grep → ctags.
4. If it doesn't exist, find the **nearest real match** (closest method/field/endpoint that probably was meant) and its location.

Tool versions resolve via asdf automatically — call `ruby`/`node`/`python` directly.

## Output

```
SYMBOL: <name>
EXISTS: yes | no
SIGNATURE: <real signature>
DEFINED AT: <file:line>   (or "—")
NEAREST MATCH: <only if EXISTS=no — the real thing probably meant, with location>
HOW CHECKED: <one line: LSP / ruby source_location / TS LanguageService / ast-grep / …>
```

Do not modify code. Do not over-explain. If you can't resolve it (missing deps, won't boot), say exactly what's blocking so the caller can fix it.
