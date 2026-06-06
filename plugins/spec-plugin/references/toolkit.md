# Toolkit — index

Shared reference for the primitive code-exploration skills (`verify-symbol`, `trace-flow`, `probe-contract`, `explore-conventions`, `setup-env`). Each skill loads the per-language card it needs and falls back here for the language-agnostic tools and facts.

**Rule:** never grep-spelunk to answer "does X exist / what's its signature / who calls it / how does it behave." Use the language's own runtime/compiler, an LSP, or a structural tool — they give ground truth.

**Tool versions resolve automatically via asdf** (the env prepends the shims), so call `ruby` / `bin/rails` / `node` / `python` directly — no `asdf exec`. Run a global-default outside a project; the project's `.tool-versions` wins inside it. Interactive REPL/debugger sessions need a PTY → drive via tmux.

## Per-language cards (load ONLY the one you need)

Each card is self-contained — navigation, execution, and debugging for that language:
- [ruby.md](ruby.md) — Ruby / Rails
- [typescript.md](typescript.md) — TypeScript / JavaScript (Node)
- [python.md](python.md) — Python

A primitive skill detects the project language and reads the matching card (it doesn't load the others). To locate the card:
```bash
CARD=$(find ~/.claude/plugins -type f -path '*spec-plugin/references/<lang>.md' 2>/dev/null | head -1)
```
then read `$CARD`. (`${CLAUDE_PLUGIN_ROOT}` is reliable in hooks but not in skill bodies, so locate via `find`.)

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

## Code-workspace facts
When your CWD is a different workspace than the code worktree (e.g. a spec workspace), these apply to every command you run against the code:
- **Shell CWD resets between Bash calls.** It does not carry over from a previous `cd`. Prefix every code-workspace command with `cd <worktree> && …` (or use `git -C <worktree> …` for git). A missed prefix silently runs in the wrong repo — no error, wrong result.
- **`git pull` works only if a remote exists.** A LOCAL integration checkout (no `origin`) has nothing to pull. Don't `git pull` it — instead fetch/merge per the setup-playbook, or `git log` to confirm the expected commit is present. The merging engineer updates the checkout; you verify, not pull.
