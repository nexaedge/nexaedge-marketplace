# Work Modes

Reusable, **model-tiered work primitives** for any workflow. Each is a *segregated agent* — its own model tier and tight, tool-specific instructions — so a piece of cognition runs at the right cost/speed and **does the work the short way** (LSP, debuggers, REPLs) instead of grep-spelunking the long way around.

These were extracted from the recurring cognitive moves that showed up across many real orchestration runs — the things *multiple* roles re-derived every time.

## The primitives

| Agent | Tier | Answers / does | Backed by |
|-------|------|----------------|-----------|
| **verify-symbol** | haiku | Does this method/field/endpoint/flag exist, what's its real signature, where's it defined — or the nearest match? | LSP → runtime introspection → ast-grep → ctags |
| **trace-flow** | opus | Walk one value/action end-to-end across layers; report the real transformations and where the contract diverges | go-to-definition + find-references + debugger breakpoints |
| **probe-contract** | sonnet | How does this actually behave / what's the real request-response shape — without a live staging env? | REPL eval (`rails runner`/`tsx`/`python -c`), tmux console, debuggers |
| **explore-conventions** | sonnet | How does this codebase already do X (registration, errors, serializers, factories, tests) so new code matches? | built-in `Explore` + ast-grep + LSP find-references |
| **setup-env** | haiku | Bring a fresh worktree to a runnable state (HEAD, `.env`, per-agent DB, deps, smoke gate) | deterministic checklist + the project's setup-playbook |

## Why segregated agents (not one big agent)

A single agent runs on one model for its whole invocation — you can't switch mid-run. So routing a cheap sub-step (find a symbol) to haiku and a hard one (trace a flow) to opus means **spawning a child agent at that tier**. These primitives are exactly those children: dispatch one when you hit its kind of work.

```
Agent({ subagent_type: "verify-symbol", prompt: "Does Partner#kyc_pending? exist in <repo>? real signature + location." })
Agent({ subagent_type: "trace-flow",    prompt: "Trace the emitted :customer_kyc_updated event to the OpenAPI `type` field." })
```

A caller can also override the tier per-spawn (`Agent({ subagent_type, model })`) — e.g. bump `verify-symbol` to sonnet when reconciling the right replacement is non-trivial.

## The toolkit

Each language has its **own self-contained card** — a primitive detects the project language and reads **only that one** (no cross-language bloat):
- [`references/ruby.md`](references/ruby.md), [`references/typescript.md`](references/typescript.md), [`references/python.md`](references/python.md) — navigation (LSP / introspection / TS LanguageService / ast-grep / ctags), execution (one-shot REPL + tmux), and debugging (`rdbg` / `node inspect` / `pdb`) for that language.
- [`references/toolkit.md`](references/toolkit.md) — the index + language-agnostic tools.

Two facts baked in: the connected **chrome-devtools MCP can't attach to a Node `--inspect` target** (use `node inspect`), and **tool versions resolve automatically via asdf** (the shell env prepends the shims) — call `ruby`/`node`/`python` directly, no `asdf exec`.

## Installation

```
/plugin install work-modes@nexaedge-marketplace
```

For native LSP navigation, also install `typescript-lsp` / `pyright-lsp` / `rust-analyzer-lsp` (and the matching language servers). Optional CLI tools: `brew install ast-grep universal-ctags`.
