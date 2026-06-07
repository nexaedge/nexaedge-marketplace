---
name: validate-execution
description: "Validate a version's implementation against its Definition of Done. For code projects: runs automated tests against the live application. For non-code projects: reviews deliverables against acceptance criteria. Runs incrementally on re-runs. Ends with human validation guidance."
argument-hint: "[version, e.g. v0.1-core-push]"
---

Your task: as the **single live QA for the whole execution**, write the validation specs and run them **continuously as engineers hand work over** — not in one batch at the end.

**How this runs:**
- You write validation specs from the Definition of Done (Phase 1), then verify each story **when its engineer hands it over** (per-handover steps below). Coverage accumulates in `specs/<version>/qa/` across the version.
- **You do not produce the human-validation guide** — the **PO** does, from your accumulated findings, in the final review. You feed evidence; the PO frames it for the human.
- **Spec-workspace git:** write your specs and findings under `specs/<version>/qa/`, but **do not commit** — the team lead commits the spec workspace.

**Per-handover verification (do this each time an engineer hands a story over):**
1. The engineer's handover names what was built, how to exercise it, and which DoD items it covers — take that as authoritative (ignore duplicate "please verify" messages from other senders).
2. **Pull `code_branch`** so you validate the latest integrated state, then run the cases relevant to that story (Phase 3), comparing actual vs expected.
3. **Record the result** in `specs/<version>/qa/`, and **reply PASS or specific findings directly to the engineer** so they fix while the work is fresh. One-line status to the team lead on PASS; full report + CC the lead on FAIL.

## Phase 1 — Load Context

1. **Locate specs.** If the orchestrator specified a specs repo path in your prompt, read specs from there. Otherwise, look for `specs/` in CWD.
2. Read the version architecture: `specs/<version>/architecture.md` — focus on the sharpened, auditor-gated Definition of Done (not the higher-level one in the version spec)
3. Read the stories index: `specs/<version>/stories.md`
4. **Read the project spec** — check **Project Context** for project type and code repository path
5. Check if validation specs exist at `specs/<version>/qa/`
6. **Code checkout:** maintain your own checkout/worktree of `code_repo` at `code_branch`, set up per the **setup-playbook** (`specs/<version>/setup-playbook.md`). Pull `code_branch` as engineers merge their stories so you always validate the latest integrated state.

### If no validation specs exist → Write them first (Phase 1B)

1. Read each story file to understand what was built/delivered and its acceptance criteria
2. Read the overall architecture: `specs/architecture.md`
3. Design validation specs based on the project type (see below)

**For code projects:**
Each Definition of Done item that can be verified programmatically should have test cases.
Keep it lean — ~10-15 test cases per version.

Write specs at `specs/<version>/qa/NNN-spec-name.md`:

```markdown
# QA Spec NNN: Spec Title

**Area**: API | Integration | UI | Health | User Flow
**Prerequisites**: What must be running

## Setup
Steps to prepare the environment.

## Test Cases

### TC-001: Test case title
**Definition of Done item**: (which DoD item this covers)
**Steps**:
1. Concrete action (e.g., "POST /api/resource with body: {...}")
2. Verify result

**Expected**: What should happen
**Severity**: critical | major | minor

## Human Review Checklist
- [ ] Visual/UX items to verify manually
```

**For non-code projects:**
Each Definition of Done item becomes a review criterion. Validation is done by reading and evaluating deliverables.

Write specs at `specs/<version>/qa/NNN-spec-name.md`:

```markdown
# QA Spec NNN: Spec Title

**Area**: Completeness | Quality | Accuracy | Format
**Deliverables to review**: (list of files/documents)

## Review Criteria

### RC-001: Criterion title
**Definition of Done item**: (which DoD item this covers)
**What to check**:
1. Read [document/section]
2. Verify [specific quality or content requirement]

**Expected**: What a passing deliverable looks like
**Severity**: critical | major | minor

## Human Review Checklist
- [ ] Items requiring subjective judgment
```

Write index at `specs/<version>/qa/specs.md`.

### If validation specs exist → Determine mode

Check for prior run results. If specs have `## Run Results`, this is a re-run after fixes.

**Incremental mode:** Only re-run failed/skipped items. Add a `### Re-run: <date>` subsection.

## Phase 2 — Environment Setup (Code Projects)

### Mandatory Pre-Flight Check

Verify ALL required services are up and reachable.
**If ANY service is down, STOP.** Report via SendMessage.

### Documentation Check

Verify startup commands are documented. **If missing, STOP and mark BLOCKED.**

### Start & Verify

1. Start services following documented commands
2. Verify health endpoints respond
3. Seed test data if needed

## Phase 2 — Review Setup (Non-Code Projects)

1. Locate all deliverables referenced by the stories
2. Verify all deliverables exist (report missing ones as failures)
3. Note the language setting from the project spec

## Phase 3 — Execute Validation

### What to test (and what not to)

Spend the budget where bugs hide; don't re-cover what the suite or the human already owns.

**Test:**
- **Real user/operator flows** — start the app, do what a user would, verify it works end to end.
- **Cross-component integration** — data flows correctly input → store → output.
- **Definition of Done items** — each one verifiable programmatically (every `TC-NNN` maps to one).
- **Service health** — everything starts, endpoints respond, no crashes.

**Do NOT test:**
- Unit-level behavior (engineers own that), visual craft (the human validates that), or edge cases already covered by the suite.

### For Code Projects

For each test case:
1. **Execute steps** exactly as written:
   - API calls: `curl` or `httpie` via Bash
   - Browser flows: Chrome DevTools MCP tools
   - CLI commands: run via Bash
   - Database checks: query directly
2. **Compare actual vs expected** — record clearly

**Don't trust green unit suites — exercise the real thing.** Past runs shipped contract bugs (a missing `_live_` env infix, `expires_in` vs `expires_at`) that 100+ green mocked tests hid. Use the **`/probe-contract`** skill to run the real classes in a REPL and observe the actual request/response shape; use **`/verify-symbol`** to prove a method/field/endpoint truly exists. A live staging env is nice but not required — a REPL against the real code is enough.

### For Non-Code Projects

For each review criterion:
1. **Read the deliverable** referenced by the criterion
2. **Evaluate against the criterion** — does it meet the standard?
3. **Record the finding** — pass, fail (with specific issues), or needs-improvement

## Phase 4 — Report Results

Append or update `## Run Results` in each spec file:

```markdown
## Run Results

### Run: <date>

| ID | Title | Result | Notes |
|----|-------|--------|-------|
| TC-001 | Test title | PASS | |
| TC-002 | Test title | FAIL | Expected X, got Y |

**Summary**: X passed, Y failed, Z skipped
**Failures requiring fixes**:
- TC-002: <clear description of what's wrong>
```

## Phase 5 — Determine Next Step

### If failures exist → Report to orchestrator

Report via SendMessage:
- Which items failed and why
- Suggested fix areas
- Whether failures are CRITICAL (blocking) or MINOR (deferrable)

### If all pass → Hand evidence to the PO

You don't write the human-validation guide — the PO does, in the final review. When your accumulated validation passes, report to the team lead that QA is green and hand over your evidence so the PO can frame the human handoff:

- A summary of what passed (by DoD item), with pointers to the run records in `specs/<version>/qa/`
- Anything that needs human judgment (visual craft, UX, subjective quality) that you deliberately did **not** assert
- Known limitations you observed (e.g., from "Simplified in this version")

The PO assembles these into the human-validation guide; the version ships only when the human confirms.

## Phase 6 — Document Findings

Append to the spec file:

```markdown
## Validation Findings

### Issues Found
- What didn't meet criteria

### Missing or Incomplete
- Gaps in deliverables

### Patterns Observed
- Recurring issues
```
