---
name: assess-effectiveness
description: "Assess how the LATEST spec-plugin version is performing across every previous session that invoked it — aggregate run efficiency (thinking%, compactions, exploration-vs-skills, preload firing, fresh-per-story), process adherence, and recurring spec-quality issues — then propose concrete, evidence-backed improvements for the NEXT version (plugin skills/agents/hooks, and spec/process patterns). Read-only: proposes, never self-modifies. Not tied to a single run."
argument-hint: "[optional: plugin version, e.g. v12 — defaults to latest installed]"
effort: high
allowed-tools: Read, Glob, Grep, Bash, Agent, Write
---

```!
VER="$ARGUMENTS[0]"; case "$VER" in v[0-9]*) VA="--version $VER" ;; *) VA="" ;; esac
python3 "${CLAUDE_SKILL_DIR}/bin/run-metrics.py" $VA 2>/dev/null || echo "(metrics did not run — invoke manually: python3 \"\${CLAUDE_SKILL_DIR}/bin/run-metrics.py\")"
```

You assess how the **latest spec-plugin version performs across all the sessions that invoked it** — not one run — and propose evidence-backed improvements for the **next** version: primarily to the plugin (skills/agents/hooks), secondarily to spec/process patterns. The cross-session metrics for the target version are **preloaded above**.

**You propose, never self-modify** — your output is a review a human acts on. (This is the safe replacement for the removed self-modifying retrospective.)

## What's preloaded
The preload ran `bin/run-metrics.py` for the latest installed spec-plugin version: every transcript across `~/.claude/projects` that loaded a spec-plugin skill at that version, with per-session **turns · output-k · thinking% · compactions · explore-Bash:Skill · preload-fired · which-skill**, plus an aggregate and the v11 baseline. Re-run with a wider window / pinned version when useful:
```
python3 "${CLAUDE_SKILL_DIR}/bin/run-metrics.py" [--version vNN] [--since "YYYY-MM-DD HH:MM"] [--all] [--dir <projects-subdir>]
```

## Three lenses — aggregate, systemic-not-anecdotal
A single bad session is noise; a pattern across the version's sessions is signal.

### 1. Run efficiency
From the metrics, vs the baseline the script prints:
- **median thinking%** still high → `effort` miscalibrated for a role tier.
- **compactions** > ~0 on any session → stories too big, or context bloating somewhere.
- **explore-Bash : Skill** still high → the no-grep nudge + forked primitives aren't biting; identify which role/skill is the offender (the `which-skill` column).
- **preload-fired** < 100% of `execute-task`/`validate-execution` sessions → the skill sometimes isn't invoked, or the preload is failing — investigate the misses (a real gap we've hit before).
- **giant single sessions / many stories in one** → fresh-per-story not honored by the lead.

### 2. Process adherence — across the runs
How often the design actually held: skills invoked (appearing in the set means it did), preloads fired, exploration delegated, fresh-per-story, peer-to-peer QA. A low rate is a plugin or driving problem — **separate a spec/plugin bug from a driving artifact** (e.g. a resume run driven in the old persistent style doesn't fault the plugin).

### 3. Recurring spec-quality issues — sampled, secondary
This view spans versions, so there's no single DoD to grade. Instead sample the heaviest/most-anomalous sessions' `lessons.md` / `qa/dod-audit.md` (find them via the session's project/cwd) for issues that **recur across runs** — architecture↔as-built drift, DoD items that needed a REV, oversized stories. A recurring spec issue is a candidate for a `build-stories` / `architect-version` guidance change.

## How you work — delegate, stay lean
Do **not** read every transcript in your own context. **Delegate** to sub-agents (run them in parallel) and synthesize their compact findings:
- An **analysis agent** on the 2–3 heaviest / most-anomalous sessions the metrics flag — where the turns/tokens went, biggest single turns, repeated re-reads, grep-spelunking the nudge didn't stop. Point it at the session files; it returns findings, never raw transcripts.
- A **pattern agent** to scan the set's `lessons.md` / `qa` for recurring spec-quality + adherence issues (lenses 2–3).

## Output — the version effectiveness review
Write `spec-plugin-effectiveness-<version>.md` in the CWD, and report a tight summary to the caller:
1. **Headline** — how `vN` performs vs the v11 baseline (and the prior version, if known) across the five metrics.
2. **Systemic findings** — the cross-session patterns, each with the metric / offending sessions as evidence.
3. **Process adherence** — what held vs leaked across runs; plugin-bug vs driving-artifact.
4. **Recurring spec issues** — if any.
5. **Proposed improvements for the NEXT version — prioritized:**
   - **A · Plugin (skills/agents/hooks):** concrete edit — `file` + rationale + **the metric it should move**.
   - **B · Spec/process guidance:** sizing, DoD, self-containment patterns worth encoding.
   Each proposal: **evidence (metric / session / quoted line) → change → expected effect.** **Do not apply any of them.**

## Constraints
- **Propose, never self-modify** — write the review; don't edit the plugin or any spec.
- **Systemic over anecdotal** — one bad session is noise; a cross-session pattern is signal.
- **Lean** — delegate the mining to sub-agents; never dump raw transcripts into your own context.
