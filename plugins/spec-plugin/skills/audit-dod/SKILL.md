---
name: audit-dod
description: "Independently audit a version's Definition of Done — does it measure behavior or an artifact — before any code is built. Reads the version's DoD and intent fresh, scores it against a 5-point rubric, and reports PASS or specific gaps."
argument-hint: "[version]"
---

Your task: judge whether the given version's **Definition of Done actually measures the thing the version is supposed to achieve**, before a whole version gets built against it. You read, score, and report — you do not write, fix, or look at any implementation.

## Phase 1 — Read

Read only enough to judge the DoD against the intent:

1. `specs/<version>/architecture.md` — focus on the **Definition of Done** and **Test Strategy**.
2. `specs/<version>.md` — the version spec (intended outcome, "Simplified in this version").
3. `specs/architecture.md` and `specs/<version>.md`'s **Project Context** — the project's stated purpose and principles.

Do **not** look at any implementation. If you find yourself reasoning about how it's built, stop — you judge the target, not the work.

## Phase 2 — Score each DoD item against the rubric

For each DoD item, ask:

1. **Behavior, not artifact.** Does it assert the system *does the intended thing*, or merely that an output *matches a frozen artifact* (golden file, byte-for-byte reproduction, snapshot)? Reproduction oracles pass when the code hardcodes the expected output.
2. **Falsifiable.** Is there a concrete, observable way it could fail? A criterion nothing could fail is not a criterion.
3. **Reacts to change.** If the input/spec changed in a way the version is meant to handle, would the DoD *notice*? (e.g., "generates correct output from any valid input" vs "reproduces this one output".)
4. **Trivial-impl test.** Could a fixture replayer, a hardcoded lookup, or a stub plausibly pass this item without doing the real work? If yes, the item is too weak.
5. **Covers the stated purpose.** Do the DoD items, together, exercise the version's actual goal from the spec — not just the easy-to-measure edges?

## Phase 3 — Report the verdict

Report your verdict and findings as your result. Use this structure:

```markdown
# DoD Audit — <version>

**Verdict:** PASS | GAPS

## Per-item assessment
| DoD item | Behavior? | Falsifiable? | Reacts to change? | Trivial-impl risk | Verdict |
|----------|-----------|--------------|-------------------|-------------------|---------|
| ... | yes | yes | yes | low | ok |

## Gaps (if any)
- **<DoD item>** — <what it actually measures vs what it should> — <a concrete trivial implementation that would wrongly pass> — <what the item should assert instead>.
```

- **PASS** — every item is behavioral, falsifiable, change-sensitive, and not gameable by a trivial implementation.
- **GAPS** — list each weak item with: what it measures vs. what it should, a concrete trivial implementation that would pass it, and what it should assert instead. Be specific enough that the architect can fix the DoD directly. Do **not** propose to proceed.

Never accept "it's hard to test" as a reason to weaken an item.
