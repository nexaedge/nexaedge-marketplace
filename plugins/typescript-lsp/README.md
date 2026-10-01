# typescript-lsp

TypeScript and JavaScript code intelligence for Claude Code: go to definition, find references, document and workspace symbols, hover, call hierarchy. It covers `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs` and `.cjs`.

TypeScript 7 carries its own language server and no longer ships the `tsserver.js` that typescript-language-server drives, so on a TypeScript 7 project that server fails to start. This plugin picks the server per project: when the project's `node_modules` holds TypeScript 7 or later, it runs that `tsc --lsp --stdio`; otherwise it runs typescript-language-server.

## Installation

```sh
claude plugin install typescript-lsp@nexaedge-marketplace
```

Projects on TypeScript 6 or earlier also need typescript-language-server on `PATH`:

```sh
npm install -g typescript-language-server typescript
```

Claude Code runs one language server per file extension, so disable any other TypeScript LSP plugin, such as `typescript-lsp@claude-plugins-official`, before enabling this one.
