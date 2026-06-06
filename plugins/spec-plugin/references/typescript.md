# TypeScript / JavaScript (Node) toolkit

Tool versions resolve via asdf (`.tool-versions`) — call `node` / `npx` directly. **Never grep-spelunk**; use the tools below. With `typescript-lsp` installed, prefer the harness's **native go-to-definition / find-references** for `.ts/.tsx/.js/.jsx`.

## Navigate — verify a symbol, go-to-definition, find callers

Types are erased at runtime, so there's no introspection like Ruby/Python. Order: native LSP → TS LanguageService → ast-grep.

**TS LanguageService** (exact signature + DEF + REF in one call). Needs `typescript` in `node_modules` + a `tsconfig.json`. Point it at `file line col` of any *usage* of the symbol:
```bash
node ./_tsq.mjs src/order.ts 9 3
# SIG: (method) Order.total(items: Item[]): number   DEF src/order.ts:3:3   REF ...:9:3
```
`_tsq.mjs` (place inside the project so ESM resolves the project's `typescript`):
```js
import ts from "typescript"; import { readFileSync } from "fs"; import path from "path";
const [file,L,C]=process.argv.slice(2), abs=path.resolve(file);
const cfgP=ts.findConfigFile(path.dirname(abs),ts.sys.fileExists,"tsconfig.json");
const cfg=ts.parseJsonConfigFileContent(ts.readConfigFile(cfgP,ts.sys.readFile).config,ts.sys,path.dirname(cfgP));
const svc=ts.createLanguageService({getScriptFileNames:()=>cfg.fileNames,getScriptVersion:()=>"1",
  getScriptSnapshot:f=>ts.ScriptSnapshot.fromString(readFileSync(f,"utf8")),getCurrentDirectory:()=>process.cwd(),
  getCompilationSettings:()=>cfg.options,getDefaultLibFileName:o=>ts.getDefaultLibFilePath(o),
  fileExists:ts.sys.fileExists,readFile:ts.sys.readFile});
const src=readFileSync(abs,"utf8"); let pos=0,ln=1; for(const ch of src){if(ln===+L)break; if(ch==="\n")ln++; pos++;} pos+=(+C-1);
const qi=svc.getQuickInfoAtPosition(abs,pos); console.log("SIG:",qi?ts.displayPartsToString(qi.displayParts):"(none)");
for(const d of svc.getDefinitionAtPosition(abs,pos)||[]){const sf=svc.getProgram().getSourceFile(d.fileName);const lc=sf.getLineAndCharacterOfPosition(d.textSpan.start);console.log(`DEF ${d.fileName}:${lc.line+1}:${lc.character+1}`);}
for(const r of svc.getReferencesAtPosition(abs,pos)||[]){const sf=svc.getProgram().getSourceFile(r.fileName);const lc=sf.getLineAndCharacterOfPosition(r.textSpan.start);console.log(`REF ${r.fileName}:${lc.line+1}:${lc.character+1}`);}
```
Fallback (no `typescript` importable): a probe `.ts` that uses the symbol as expected, then `tsc --noEmit --strict probe.ts target.ts` → exit 0 = valid. Structural search:
```bash
ast-grep -p '$O.total($$$)' -l ts .      # call sites
ast-grep -p 'new Order($$$)' -l ts .
```

## Execute — observe real behavior (no staging)

Node 22+/25 strips TS types natively for `.ts` files and `-e`. `npx tsx` auto-installs and handles tsconfig path aliases / decorators / JSX.
```bash
npx tsx -e 'import {buildPayload} from "./src/api/payload"; import {schema} from "./src/api/schema";
  const p = buildPayload({userId:7, amount:1990});
  console.log(JSON.stringify(p,null,2)); console.log("valid:", schema.safeParse(p).success);'
node -e 'const {foo}=require("./dist/foo"); console.log(JSON.stringify(foo(1)))'
# stub the outermost call only: globalThis.fetch = async () => new Response(JSON.stringify({ok:true}))
```
Interactive REPL via tmux:
```bash
SOCK=/tmp/probe/js.sock
tmux -S "$SOCK" new-session -d -s js -x 200 -y 50
tmux -S "$SOCK" send-keys -t js 'npx tsx' Enter      # or: node
# poll capture-pane until ready, then use dynamic import:
tmux -S "$SOCK" send-keys -t js 'const m = await import("./src/foo.ts"); m.foo(1)' Enter
tmux -S "$SOCK" capture-pane -t js -p | tail -20
tmux -S "$SOCK" kill-server
```

## Debug — breakpoint, stack + scope (`node inspect`)

**The chrome-devtools MCP cannot attach to a Node `--inspect` target (browser-only).** Use `node inspect`, driven via tmux.
```bash
node inspect ./script.js            # or: node inspect --import tsx ./script.ts
# at the (debug) prompt: sb('script.js',42) → c → bt → exec(localVar) → repl → next/step/out
```
