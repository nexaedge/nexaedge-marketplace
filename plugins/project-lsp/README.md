# project-lsp

Code intelligence for Claude Code in Go, Python, Rust, TypeScript and JavaScript (go to definition, find references, document and workspace symbols, hover, call hierarchy, diagnostics after each edit) that stays right when a session works on files of several repositories or git worktrees.

Claude Code starts one language server per language for the whole session, rooted at the folder the session started in. A file of another repository, or of a worktree under `.claude/worktrees/`, then reads as outside that server's project: its imports fail to resolve and every edit comes back with diagnostics that are not true. `project-lsp` stands in front of the real server and runs one per project instead.

## How it routes

- **The project of a file** is the git worktree that holds it, the folder `git rev-parse --show-toplevel` names from the file's directory. A file outside git belongs to its own directory.
- **Each project gets its own server**, started the first time one of its files is opened, through `mise exec -C <project> -- <server>` when `mise` is on `PATH`. The server then sees the project's own tool versions, environment and virtualenv, as a shell opened in that folder would.
- **A message about a file** (open, change, definition, references, hover, call hierarchy) goes to the server of the file's project, and the diagnostics of that server come back as they are.
- **A workspace symbol search** goes to every server running, and the answer joins theirs.
- **Anything else** goes to the server of the project the session started in, whose answer to `initialize` is the one Claude Code sees.

| Language | Server | Extensions |
| --- | --- | --- |
| Go | `gopls` | `.go` |
| Python | `pyright-langserver --stdio` | `.py`, `.pyi` |
| Rust | `rust-analyzer` | `.rs` |
| TypeScript, JavaScript | `tsc --lsp --stdio` from the project's `node_modules` on TypeScript 7 or later, `typescript-language-server --stdio` before that | `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, `.cjs` |

TypeScript 7 carries its own language server and no longer ships the `tsserver.js` that typescript-language-server drives, which is why the TypeScript server is picked per project.

## Installation

```sh
claude plugin install project-lsp@nexaedge-marketplace
```

Each server has to be on `PATH`, or installed by mise. `bin/project-lsp` runs through `uv run --script`, so `uv` has to be on `PATH` too.

Claude Code runs one language server per file extension, so disable the plugins this one replaces before enabling it: `gopls-lsp`, `pyright-lsp`, `rust-analyzer-lsp` and `typescript-lsp` from `claude-plugins-official`.

## Tests

```sh
uv run --no-project --python 3.12 --with pytest pytest plugins/project-lsp/tests
```

They drive `bin/project-lsp` over stdio against `tests/fake_server.py`, a server whose answers say which folder it runs in.
