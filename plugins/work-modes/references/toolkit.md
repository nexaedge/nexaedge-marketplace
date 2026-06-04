# Work-Modes Toolkit — index

**Rule:** never grep-spelunk to answer "does X exist / what's its signature / who calls it / how does it behave." Use the language's own runtime/compiler, an LSP, or a structural tool — they give ground truth.

**Tool versions resolve automatically via asdf** (the env prepends the shims), so call `ruby` / `bin/rails` / `node` / `python` directly — no `asdf exec`. Run a global-default outside a project; the project's `.tool-versions` wins inside it. Interactive REPL/debugger sessions need a PTY → drive via tmux.

## Per-language cards (load ONLY the one you need)

Each card is self-contained — navigation, execution, and debugging for that language:
- [ruby.md](ruby.md) — Ruby / Rails
- [typescript.md](typescript.md) — TypeScript / JavaScript (Node)
- [python.md](python.md) — Python

A primitive agent detects the project language and reads the matching card (it doesn't load the others). To locate the card from an agent:
```bash
WM=$(find ~/.claude/plugins -type f -path '*work-modes/references/<lang>.md' 2>/dev/null | head -1)
```
then read `$WM`. (`${CLAUDE_PLUGIN_ROOT}` is reliable in hooks but not in agent bodies, so locate via `find`.)

## Language-agnostic tools

**ast-grep** — structural search (invoke `ast-grep`, never `sg`). `$VAR` = one node, `$$$` = zero-or-more. Run `--debug-query` whenever a pattern matches nothing.
```bash
ast-grep -p 'def total($$$)' -l <lang> .          # definitions
ast-grep -p '$RECV.total($$$)' -l <lang> .         # call sites
ast-grep -p 'def total($$$)' -l <lang> --json=compact
```
Setup: `brew install ast-grep`.

**universal-ctags** — fast fuzzy go-to-def index (cross-language). Use the full path (`/usr/bin/ctags` is BSD and shadows it); always `--exclude` vendored dirs.
```bash
/opt/homebrew/bin/ctags -R --fields=+nKsS --extras=+q --exclude=node_modules --exclude=.git --exclude=vendor -f tags .
readtags -t tags -e total          # exact name
readtags -t tags 'Order.total'     # qualified (disambiguates overloads)
```

## Baked-in facts
- The connected **chrome-devtools MCP is browser-only — it cannot attach to a Node `--inspect` target.** Use `node inspect` (see typescript.md).
- LSP plugins (`typescript-lsp`, `pyright-lsp`, `rust-analyzer-lsp`) enable native go-to-definition/find-references; Ruby has none (use introspection).
- Hand-rolling LSP-over-stdio JSON-RPC for one-off lookups isn't worth it — the per-language introspection commands are simpler and exact.
