---
name: probe-contract
description: "Find out how code ACTUALLY behaves by executing the real classes in a REPL — the real request/response shape, the real return value — without relying on a live staging environment. Beats writing a test for 'how does this behave?'."
argument-hint: "[class/method + the behavior/shape to probe, e.g. 'TokenService#issue → real response shape']"
allowed-tools: Read, Glob, Grep, Bash
context: fork
agent: Explore
effort: low
---

Run this to answer **"what does this actually do / what's the real shape?"** by running the real code — not by reading it and guessing, and not by assuming a live staging environment exists (it usually doesn't). Past runs shipped contract bugs that 100+ green unit tests hid (a missing `_live_` env infix, `expires_in` vs `expires_at`, an illegal cookie write) — caught only by exercising the real thing. Exercise the real thing.

This skill runs in an isolated forked Explore child and returns only its tight conclusion — so the caller's context stays clean.

## Procedure

1. **Detect the project language** and **load only that language's toolkit card**:
   ```bash
   find ~/.claude/plugins -type f -path '*spec-plugin/references/<lang>.md' 2>/dev/null | head -1
   ```
   Read the matching card (`ruby.md` / `typescript.md` / `python.md`) — it has the exact REPL / tmux / debugger commands.
2. **Default order:** one-shot REPL eval → interactive REPL in tmux (when you need persistent state) → debugger (when you need the exact stack/locals at a point). Use the card's "Execute" and "Debug" sections.
3. **Instantiate the real class, call the real method, observe the output.** Stub **only** the outermost boundary (HTTP, clock, env); everything beneath runs for real. The card shows the stub-the-boundary pattern.
4. **Compare against the contract** — hold the observed shape/value against what the spec/types/OpenAPI claimed, and flag any divergence (that's the kind of thing unit tests miss).

Tool versions resolve via asdf automatically — call `bin/rails`/`node`/`python` directly; interactive sessions go through tmux per the card.

## Output

```
QUESTION: <what behavior/shape was probed>
OBSERVED: <the real value/shape — paste the actual output: the JSON, the return, the stack>
HOW: <one-shot REPL | tmux console | debugger> — <the command used>
CONTRACT NOTES: <any divergence from what the spec/types claimed — or "matches">
```

Observe and report; don't fix. If the app won't boot or a real dependency is missing, report exactly what's blocking.
