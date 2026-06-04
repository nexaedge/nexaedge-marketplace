---
name: validate-execution
description: "Validate a Linear spec's implementation against its Definition of Done. For code projects: runs automated tests against the live application. For non-code projects: reviews deliverables against acceptance criteria. Writes a `Spec vX.Y — Validation Report` Project Document and comments the link on the spec issue. Runs incrementally on re-runs."
argument-hint: "[Linear spec identifier (e.g. DIN-142) or text to search for]"
---

Your task: validate the spec's output and guide the human through final verification. Persist all results to Linear.

## Linear contract

Scripts live in `${CLAUDE_PLUGIN_DIR}/scripts/linear/`. Required: `LINEAR_API_KEY`. If it isn't set, fetch it from 1Password: `export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"`.

Outputs:
- **Validation Report** as a Linear **Project Document** titled `Spec vX.Y — Validation Report` on the deliverable project.
- A **comment on the spec issue** linking the report.
- State transitions on the spec issue: `In Progress → In Review` (after running) → `Done` (after human signs off).

## Phase 0 — Resolve the spec issue

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/resolve-spec.js" "<identifier>" --require-spec-label
```

Capture: `issue.id`, `issue.identifier`, `issue.description`, `project.id`, `project.documents`, `team.key`, sub-issues (= stories).

## Phase 1 — Load Context

1. **Read the spec body** (issue description) — focus on Definition of Done.
2. **Read the spec architecture document** (`Spec vX.Y — Architecture`).
3. **Read each story sub-issue with comments** to understand what was built/delivered:
   ```bash
   node "${CLAUDE_PLUGIN_DIR}/scripts/linear/get-issue.js" "<story-id>" --with-comments
   ```
4. **Read the project briefing on disk** for project type and code repository path.
5. Check for an existing Validation Report Project Document on the project. If found, this is a **re-run** — read it to plan incremental validation.

### Mode

- **First run** — write a fresh Validation Report.
- **Re-run after fixes** — read previous report, identify failed/skipped items, focus on those. Append a new `### Re-run: <date>` section to the same report (or to a v2 doc if the user prefers).

## Phase 2 — Environment Setup (Code Projects)

### Mandatory Pre-Flight Check

Verify ALL required services are up and reachable. **If ANY service is down, STOP.** Report via `SendMessage` with a clear blocker.

### Documentation Check

Verify startup commands are documented (`docs/dev-environment.md` in the code repo, or the spec architecture's Setup section). **If missing, STOP and mark BLOCKED.**

### Start & Verify

1. Start services following documented commands
2. Verify health endpoints respond
3. Seed test data if needed

## Phase 2 — Review Setup (Non-Code Projects)

1. Locate all deliverables referenced by the stories (in their execution-log comments).
2. Verify all deliverables exist on disk (report missing ones as failures).
3. Note the language setting from the project briefing.

## Phase 3 — Design Validation Cases (first run only)

Each Definition of Done item gets one or more validation cases. Keep it lean — ~10-15 cases per spec.

Compose the cases as a Markdown section to be written into the Validation Report Project Document. Use this structure:

```markdown
# Spec vX.Y — Validation Report

**Spec:** <DIN-XXX URL>
**Run started:** <date>

## Cases

### TC-001 — <title>
- **Definition of Done item:** <which DoD checkbox this covers>
- **Area:** API | Integration | UI | Health | User Flow | Completeness | Quality | Accuracy | Format
- **Severity:** critical | major | minor
- **Steps:**
  1. ...
- **Expected:** ...
- **Result:** PENDING | PASS | FAIL — <notes>

### TC-002 — ...
```

## Phase 4 — Execute Validation

### For Code Projects

For each case:
1. Execute steps exactly as written:
   - API calls: `curl`/`httpie` via Bash
   - Browser flows: Chrome DevTools MCP tools
   - CLI commands: run via Bash
   - Database checks: query directly
2. Compare actual vs expected — record clearly in the case `Result:` line.

### For Non-Code Projects

For each criterion:
1. Read the deliverable referenced by the criterion.
2. Evaluate against the criterion — does it meet the standard?
3. Record the finding — pass, fail (with specific issues), or needs-improvement.

## Phase 5 — Write the Validation Report Document

Stage the full report (cases + results + summary) to `/tmp/linear-spec/<spec-id>/validation-report.md`, then create or update the Project Document:

```bash
# First run
cat /tmp/linear-spec/<spec-id>/validation-report.md | \
  node "${CLAUDE_PLUGIN_DIR}/scripts/linear/create-document.js" \
    --project "<project-id>" \
    --title "Spec vX.Y — Validation Report"

# Re-run (overwrites the same document)
cat /tmp/linear-spec/<spec-id>/validation-report.md | \
  node "${CLAUDE_PLUGIN_DIR}/scripts/linear/update-document.js" "<existing-doc-id>"
```

Report content (top to bottom):

```markdown
# Spec vX.Y — Validation Report

**Spec:** <DIN-XXX URL>
**Run:** <date>

## Summary

| Result | Count |
|---|---|
| PASS | N |
| FAIL | M |
| SKIP | K |

**Failures requiring fixes:**
- TC-002: <clear description of what's wrong>

## Cases

(full case list with results)

## Validation Findings

### Issues Found
- ...

### Missing or Incomplete
- ...

### Patterns Observed
- ...

## Re-run: <date>  *(only on re-runs)*
- Cases re-executed: ...
- Status changes: ...
```

## Phase 6 — Comment on the spec issue

Post a comment summarizing the run and linking the report:

```bash
cat <<MD | node "${CLAUDE_PLUGIN_DIR}/scripts/linear/post-comment.js" "<spec-identifier>"
**Validation run — $(date +%Y-%m-%d)**

Result: N pass / M fail / K skip.

[Validation Report](<doc URL>)
MD
```

## Phase 7 — Transition the spec issue

- All cases PASS → transition spec issue to **`In Review`**, ready for human sign-off.
- Any FAIL → leave in **`In Progress`** so the orchestrator can dispatch fix tasks. Send a `SendMessage` to the team lead with the failures and severity.

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/transition-issue.js" "<spec-identifier>" --state "In Review"
```

## Phase 8 — Determine Next Step

### If failures exist → Report to orchestrator

Report via `SendMessage`:
- Which cases failed and why
- Suggested fix areas (which story sub-issues)
- Whether failures are CRITICAL (blocking) or MINOR (deferrable)

### If all pass → Guide human validation

Present the human validation guide in the chat (and optionally append it to the report doc as a final section):

```markdown
## Human Validation Guide

### What was delivered
- Summary of the spec's outcomes

### How to review (code projects: how to run it)
- Exact steps to see/use the deliverables

### What to verify
Walk through each Definition of Done item that requires human judgment.

### Quick checks
- [ ] Key deliverables are complete and accessible
- [ ] Quality meets expectations
- [ ] [Project-specific checks]

### Known limitations in this spec
- (from "Simplified in this spec")
```

The spec ships only when the human confirms.

### Environment Failures

If validation hits environment issues instead of test failures:
1. Stop validation
2. Report blocker via `SendMessage` so the orchestrator can dispatch an engineer to fix the environment
3. Do not transition the spec issue — leave the previous state intact
