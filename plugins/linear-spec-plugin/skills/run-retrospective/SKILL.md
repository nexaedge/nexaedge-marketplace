---
name: run-retrospective
description: "Post-spec retrospective that captures lessons learned, fixes documentation drift, and proposes skill improvements. Reads the Linear spec, story sub-issues with comments, and the Validation Report. Writes retrospective to the knowledge base on disk and posts a back-link comment on the spec issue."
argument-hint: "[Linear spec identifier (e.g. DIN-142) or text to search for]"
---

Your output: documentation fixes (some on disk, some in Linear), topic-based lesson files in the knowledge base's `docs/` (or equivalent), and proposed skill / CLAUDE.md improvements.

The retrospective itself stays on disk — Linear holds the execution unit, the knowledge base holds the durable record.

## Linear contract

Scripts live in `${CLAUDE_PLUGIN_DIR}/scripts/linear/`. Required: `LINEAR_API_KEY`. If it isn't set, fetch it from 1Password: `export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"`.

This skill **reads** from Linear (story comments, validation report) and **writes** a single back-link comment on the spec issue at the end. All other writes are to the disk knowledge base.

## Phase 0 — Resolve the spec issue

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/resolve-spec.js" "<identifier>" --require-spec-label
```

Capture: `issue.identifier`, `issue.url`, `project.id`, `project.name`, `project.documents`, `issue.description`, sub-issues.

## Phase 1 — Locate the Knowledge-Base Destination

The retrospective lives on disk. Find where:

1. Read the Linear project description's `Context:` line — this is the path on disk to the project briefing (e.g. `~/code/jaisonerick/second-brain/engagements/dinie/`).
2. The convention (per `linear-workflow/docs/approach.md`) is:
   - **Engagements with OS structure:** `<engagement>/<os>/retrospectives/spec-vX.Y.md`
   - **Ventures / studio:** `<project>/retrospectives/spec-vX.Y.md`
3. If the convention does not fit cleanly (no obvious OS folder, etc.), ask the user via `AskUserQuestion` for the destination path. Never guess.
4. Check whether the file already exists — if yes, ask whether to overwrite or amend.

## Phase 2 — Collect Evidence

Gather all sources of truth about what happened during this spec:

1. **Story sub-issues + comments** — for each sub-issue from `resolve-spec.js`, fetch:
   ```bash
   node "${CLAUDE_PLUGIN_DIR}/scripts/linear/get-issue.js" "<story-id>" --with-comments
   ```
   Look in the comments for `## Execution Log` blocks: `Issues Encountered`, `Struggled With`, `Decisions Made`.
2. **Validation Report Project Document** — read its content for failures, fix cycles, DX findings, struggles.
3. **Spec architecture document** (`Spec vX.Y — Architecture`) — for the original plan against which to detect drift.
4. **Code repository commit history** (if a code project) — `git log --oneline` for the spec's timeframe; look for fix commits, reverts, multiple attempts.
5. **Current skills** — `${CLAUDE_PLUGIN_DIR}/skills/*/SKILL.md` for context on what agents are told to do.
6. **CLAUDE.md** — current project conventions.

## Phase 3 — Identify Patterns

Categorize findings into four buckets:

### A. Documentation Drift

Spec architecture says X, but the actual code does Y. Examples:
- Port numbers differ between architecture and config
- Data model has fields the architecture doesn't mention
- API contracts changed during implementation

### B. Struggle Patterns

Things that took multiple attempts. Sources:
- Validation re-run cycles (how many rounds? what kept failing?)
- Story execution-log comments with "Struggled With" or repeated "Issues Encountered"
- Commit history showing fix-after-fix patterns

### C. Agent Autonomy Gaps

Places where agents couldn't proceed without help:
- AskUserQuestion calls (what did agents not know?)
- Tool errors (what tools failed and why?)
- Validation DX findings (environment/setup issues agents hit)

### D. Skill Gaps

Recurring issues that skills should prevent:
- Patterns that could be added to engineer/qa/orchestrate skills
- Missing conventions in CLAUDE.md
- Common mistakes agents keep making

After listing ALL findings across all four categories:

1. Prioritize by impact (how much time was wasted? how likely to recur?)
2. **Pick the top 3-5 findings** to preserve as lessons. Not everything needs documentation — focus on high-impact, likely-to-recur items.

## Phase 4 — Write the Retrospective File on Disk

Write the file to the destination determined in Phase 1:

```markdown
---
title: "Retrospective — <Project> Spec vX.Y"
created: <date>
updated: <date>
type: retrospective
spec: <DIN-XXX URL>
---

# Retrospective — <Project> Spec vX.Y

## Outcome

One paragraph: what shipped, what didn't.

## Timeline

- Architecture: <date>
- Stories created: <date>
- First validation: <date>
- Spec shipped: <date>

## What worked

- ...

## What didn't

- ...

## Top findings

### 1. <Finding title>
<What went wrong, 1-2 sentences>
<What works and how to prevent it, 1-2 sentences>
<Source: validation TC-XXX, story DIN-YYY comment, etc.>

### 2. ...

## Documentation fixes applied

- <doc/file>: <what was fixed>

## Skill improvements proposed

- <skill name>: <change>
```

## Phase 5 — Update Documentation (No Approval Needed)

Fix factual discrepancies between documentation and reality. These are corrections, not opinions:

1. **Spec architecture document on Linear** — fix incorrect ports, endpoints, data models, configuration values that don't match the actual code:
   ```bash
   cat /tmp/linear-spec/<spec-id>/architecture-fixed.md | \
     node "${CLAUDE_PLUGIN_DIR}/scripts/linear/update-document.js" "<arch-doc-id>"
   ```
2. **Sub-issue states** — if any story sub-issue still has the wrong state (e.g. left in `In Progress` after merge), transition it now:
   ```bash
   node "${CLAUDE_PLUGIN_DIR}/scripts/linear/transition-issue.js" "<story-id>" --state "Done"
   ```
3. **Knowledge-base briefing** — if the project briefing on disk still references the spec as "in flight", update it.

Keep changes minimal and factual. Don't rewrite sections — fix specific inaccuracies.

## Phase 6 — Lessons Learned & Skill Improvements (Requires Approval)

For each category below, present findings to the user via `AskUserQuestion` and only proceed with approved changes.

### A. Write Lessons to `docs/` Files (knowledge base)

Create or update topic-based files under the knowledge-base `docs/` folder (or its equivalent — confirm with the user). Each file covers one topic and can contain multiple findings.

**File format:**
```markdown
# <Topic>

## <Finding title>
<What went wrong, 1-2 sentences>
<What works and how to prevent it, 1-2 sentences>

## <Finding title>
...
```

**Rules:**
- **Append to existing files** when the topic already has a `docs/<topic>.md` file
- **Create new files** only when no existing file covers the topic
- Keep each finding to 2 paragraphs max (what went wrong + what works)

**Before writing, ask the user** (via `AskUserQuestion`):
> "I found these lessons worth documenting. Which should I save?"

### B. Propose Skill Changes

Group proposed changes by skill file. For each:
1. Describe what happened (the struggle or gap)
2. Show the proposed addition/change (as a diff or new section)
3. Ask the user via `AskUserQuestion` whether to apply

### C. Propose CLAUDE.md Additions

Only for truly universal conventions that apply across ALL specs. These should be rare.

Present each proposed addition and ask via `AskUserQuestion` before adding.

## Phase 7 — Comment Back-Link on the Spec Issue

Post a comment on the spec issue linking the retrospective on disk:

```bash
cat <<MD | node "${CLAUDE_PLUGIN_DIR}/scripts/linear/post-comment.js" "<spec-identifier>"
**Retrospective written** — <date>

Path: \`<absolute path to retrospective on disk>\`

Top findings:
1. <finding 1>
2. <finding 2>
3. <finding 3>
MD
```

## Phase 8 — Transition the spec issue to Done

If the user already signed off on the spec, transition the issue to `Done` (if not already):

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/transition-issue.js" "<spec-identifier>" --state "Done"
```

## Phase 9 — Summary & Commit

1. Summarize what was done:
   - Retrospective file written to disk
   - Documentation fixes applied (Phase 5)
   - Lessons written to knowledge-base `docs/` (Phase 6A)
   - Skill changes applied (Phase 6B)
   - CLAUDE.md updates (Phase 6C)
   - Spec issue transitioned and back-link comment posted
2. **Commit** disk changes with a descriptive message:
   ```
   Retrospective: <project> spec vX.Y — N lessons, M doc fixes, K skill updates
   ```
3. **Report** to the team lead (if running as a team member) via `SendMessage`:
   - Summary of findings
   - Files created/modified (disk + Linear)
   - Any deferred items that need manual attention
