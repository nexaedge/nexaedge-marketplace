---
name: trace-flow
description: "Walk one value or action end-to-end across every layer/hop — go-to-definition by go-to-definition, or with a debugger breakpoint — and report the real state transitions and where the contract/shape diverges. The workhorse for architecture sketches and cross-layer debugging."
argument-hint: "[value/action + start→end, e.g. 'emitted :customer_kyc_updated → OpenAPI type field']"
allowed-tools: Read, Glob, Grep, Bash, Agent
context: fork
agent: Explore
effort: low
---

Run this to follow one thing — a value, an event, a request — through **every hop of the real code** and report exactly what happens to it and where it breaks. This is the move that, done properly during architecture, eliminated fix cycles in past runs (an emit symbol silently `tr("_",".")`-converted before hitting a contract; a token field renamed mid-chain). Do it the way an engineer does at their desk: **click go-to-definition through each call, or set a breakpoint and read the real stack** — not by reading files and guessing.

This skill runs in an isolated forked Explore child and returns only its tight conclusion — so the caller's context stays clean.

## Procedure

1. **Detect the project language** and **load only that language's toolkit card**:
   ```bash
   find ~/.claude/plugins -type f -path '*spec-plugin/references/<lang>.md' 2>/dev/null | head -1
   ```
   Read the matching card (`ruby.md` / `typescript.md` / `python.md`) for the exact navigate + execute + debugger commands.
2. **Fix the start and the end** — the entry point (route, emitted event, function call) and the sink you care about (DB column, OpenAPI `type`, rendered response, another service's input).
3. **Walk hop by hop with semantic navigation — never grep-spelunk.** Use the card's "Navigate" commands: go-to-definition at each call to step into the next layer (native LSP where available; Ruby uses `source_location`); find-references to see who feeds/consumes a hop.
4. **At each hop, record the transformation** the value undergoes: rename, type coercion, string munging (`tr`/`gsub`/`JSON.parse`), serialization, defaulting, truncation. Silent conversions are where contracts break.
5. **When static reading is ambiguous, run it** — don't speculate. Use the card's REPL eval to see the real value at a hop, or its **debugger** to capture the exact stack + locals at the point of interest.
6. **Compare against the contract** — hold the observed end-state against what the spec/OpenAPI/types/another-service expects, and flag every divergence (the payoff).

For a big surface, use Bash (`rg`/`find`) to map candidate hops first, then trace the real path. Tool versions resolve via asdf automatically.

## Output

```
TRACE: <start> → <end>
PATH:
  1. <file:line>  <what happens to the value here>
  2. <file:line>  <transformation — e.g. "tr('_','.') → 'customer.kyc.updated'">
  ...
  N. <sink>       <final shape/value>
OBSERVED VIA: <go-to-def reading | REPL eval | debugger breakpoint> at the hops that needed it
DIVERGENCES: <every place real behavior differs from the contract/spec/types — or "none">
```

Trace and report; don't fix. Be precise about each transformation — a vague trace is worthless. If a hop can't be resolved statically, run it before reporting.
