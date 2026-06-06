---
name: execute-task
description: "Execute a single task end-to-end — either a new story or a fix from validation findings. Reads the task context and architecture, then produces working output that meets all acceptance criteria. Adapts to project type: writes code for code projects, writes deliverables for non-code projects."
argument-hint: "[story file path or validation spec path with fix instructions]"
---

Your task: execute ONE task end-to-end, producing output that meets all acceptance criteria. The task is either a new story (from `/build-stories`) or a fix (from `/validate-execution` findings).

## Phase 1 — Load Context

1. Read the task file (your story) at the provided path
2. Determine the version from the path (e.g., `specs/v0.1-core-push/001-...` → v0.1-core-push)
3. **Locate specs.** If the orchestrator specified a specs repo path in your prompt, read specs from there. Otherwise, look for `specs/` in CWD.
4. **Read `specs/<version>/context.md`** — shared version context (conventions, manifest, cross-cutting decisions).
5. **Read `specs/<version>/lessons.md`** — what the team has learned so far. Re-read this whenever you resume after a red-button halt.
6. Your story is self-contained — only open `specs/<version>/architecture.md` if the story explicitly sends you there. (Don't reload the full architecture by default.)
7. Scan the relevant part of the code workspace for the patterns and conventions you'll follow
8. Check if the task file already has an `## Execution Log` section — if so, resume from where it left off
9. **Code worktree:** set it up exactly as the **setup-playbook** says (`specs/<version>/setup-playbook.md`) — how to add the worktree, copy `.env`/gitignored files, install deps, run gates. If you discover a setup step the playbook is missing, add it to the playbook.

### Project Type Detection

The spec's **Project Context → Type** determines your execution approach:
- **code**: Write code, run tests, verify builds
- **business / consulting**: Write documents, verify against criteria
- **research**: Investigate, analyze, produce findings
- **hybrid**: Mix approaches as needed

### If this is a fix task

The orchestrator will include validation findings in the prompt — specific failures that need to be addressed. Read the referenced validation spec to understand what failed and why.

### If this follows a design story

If the task lists a prior `/interface-design` story as a prerequisite, read that story's execution log to find the files it produced. Build on them, don't redesign them.

## Phase 2 — Plan Implementation

Before producing any output:
1. List every file to create or modify
2. Define the order of operations
3. Identify any ambiguities or blockers

**Red-button check (do this now, and any time during execution).** If the story turns out **much larger or different than specified**, or you hit an **unexpected blocker**, do NOT grind for a long time and do NOT split the story yourself:
- Broadcast a halt to the other engineers (`SendMessage`) so they don't hit the same wall.
- Report to the team lead: the challenge, what you found, and 2–3 concrete options.
- Wait for direction (the lead decides with the user; scope issues go to the live PO to re-refine). On resume, re-read `lessons.md` first.

This early-flag discipline is what prevents mid-flight story splits.

**Do it the short way — run the primitive skills inline** when you hit that kind of work, instead of grep-spelunking:
- **`/explore-conventions`** before writing a new <thing> (controller, subscriber, error, factory, test) — match the codebase's established pattern instead of inventing one.
- **`/verify-symbol`** before calling any method/field/endpoint you didn't write — confirm it exists and get its real signature.
- **`/probe-contract`** to see how something actually behaves (run it in a REPL) instead of guessing from the source.
- **`/trace-flow`** when a value crosses layers and you need to know exactly what happens to it.

Run these inline by default — you're already at the right tier for them. The cheap mechanical ones (`/verify-symbol`, `/setup-env`) may be dispatched to the **intern** (haiku) when you want them cheap; the richer moves stay inline.

## Phase 3 — Execute

### For Code Projects

**New stories:**
1. Write the code following the architecture and patterns
2. Write tests alongside the implementation (see Phase 4)
3. Ensure everything compiles/runs

**Fix tasks:**
1. Understand the failure first — read validation findings carefully
2. Write a failing test that reproduces the failure
3. Fix the bug with minimal code change
4. Verify the test passes
5. Run the full suite — ensure no regressions

**Integrating Interface-Design Output:**
- Read the design story's execution log for produced files
- Read `.interface-design/system.md` for design tokens and patterns
- Preserve the visual design — don't restyle or restructure
- Your job is to wire: data fetching, state management, API calls, routing

### For Non-Code Projects

**New stories:**
1. Research and gather inputs needed for the deliverable
2. Write the deliverable following the architecture's delivery structure
3. Check the deliverable against each acceptance criterion
4. If the deliverable references other documents or data, verify those references are accurate

**Fix tasks:**
1. Read the validation findings — understand what's missing or incorrect
2. Address each finding specifically
3. Re-verify the affected acceptance criteria

### For Research Projects

**New stories:**
1. Conduct the investigation described in the task
2. Collect and organize findings
3. Produce the output in the format specified by the architecture
4. Verify findings are supported by sources
5. Flag uncertainties or areas needing deeper investigation

## Phase 4 — Verify (Code Projects)

Write automated tests alongside the implementation. The goal is **pragmatic coverage** — not 100% unit testing, but confidence that key behaviors work.

### Testing Philosophy
- **Complex logic** (engines, validators, state machines, algorithms): thorough test suite
- **Key components** (database layers, providers, API routes): at least one test pass verifying primary behavior
- **Simple glue code** (factories, config loading, re-exports): tested implicitly
- **Integration points**: test that components work together

### Run Tests
After writing tests, run them and ensure they all pass. Tests MUST pass before moving to Phase 5.

## Phase 4 — Verify (Non-Code Projects)

For non-code projects, verification is criteria-based:

1. **Walk through each acceptance criterion** from the task file
2. **Check completeness** — does the deliverable address everything?
3. **Check quality** — is the writing clear? Are claims supported? Is the format correct?
4. **Check language** — verify the output language matches the project's language setting
5. Report what's done and what meets criteria

## Phase 5 — Final Checks & QA Handover

1. Check every acceptance criterion from the task file
2. For code: run all tests, linters, type checks, builds
3. For non-code: re-read deliverable against criteria, verify references and links
4. **Integration check** — verify the output connects properly to what exists
5. **Hand over to the live QA before declaring done.** There is one QA agent for the whole execution. `SendMessage` it: what you built, how to exercise it, and which Definition-of-Done items it covers. Address QA's findings now, while the work is fresh — don't defer them to an end-of-version gate.

**Reference the integration checkout, never your worktree.** When you author or revise an acceptance criterion (e.g. on a fix task) or tell QA which path/branch to exercise, name the **integration checkout / `code_branch`** — never your per-story worktree path. Your worktree is deleted after merge, so any criterion or instruction that points at it is stale before QA runs.

### Merge the code workspace (before reporting back)

Once QA clears, land exactly one clean commit on `code_branch` and tear down your worktree. Squash → rebase-first → `git merge --ff-only` → `git worktree remove --force`:

```bash
git log --oneline <code_branch>..HEAD      # in the worktree
git reset --soft <code_branch> && git commit -m "feat: <what you built>"
git checkout <code_branch> && git pull --rebase
git merge --ff-only worktree-<name> || { git checkout worktree-<name>; git rebase <code_branch>; # re-run gates; retry merge
}
git worktree remove --force <worktree-path>   # --force: test/coverage tools (SimpleCov, jest --coverage, pytest) leave untracked artifacts at the worktree root that block a plain remove
```

This is the **only git you run** — it's in the code worktree. Never run git in the spec workspace; the team lead commits that (single-committer rule).

## Phase 6 — Update Task File

Append an `## Execution Log` section to the task file:

```markdown
## Execution Log

### Session: <date>

**Status**: completed | in-progress

**Completed:**
- What was done (with file paths)

**Decisions Made:**
- Any implementation decisions not in the original task

**Issues Encountered:**
- Problems hit and how they were resolved

**Struggled With:**
- Things that took multiple attempts
- Process difficulty that future agents should know about

**Pending:** (only if in-progress)
- What's left to do
```

Then update `specs/<version>/stories.md` — mark the task as `completed` ONLY if ALL acceptance criteria pass. Otherwise mark as `in-progress`. After updating, **re-read stories.md** to verify the change was saved.

Also append your durable learnings (surprises, under-specified spots, setup gotchas, decisions) to **`specs/<version>/logs/engineer-<N>.md`** — your own file. The PO consolidates these into `lessons.md` for everyone.

**Spec-workspace git:** write all of the above (execution log, `stories.md`, your engineer log) on the current branch, but **do not run git in the spec workspace** — the team lead commits it (single-committer rule). Your only git is in the code worktree, per your role's merge protocol.

## Phase 7 — Make QA's job guess-free (Code Projects)

The live QA verifies your handover (Phase 5), so give it what it needs:

1. **In the handover message** — exact steps to exercise what you built, which DoD items it covers, and any new seed scripts, migrations, env vars, or config overrides needed to run it.
2. **Startup commands** — if the task changed how services start, update `docs/dev-environment.md` with the exact commands, and reflect any new gotcha in `specs/<version>/setup-playbook.md`.
3. **Architecture updates** — if the implementation diverged from the architecture doc, note it in your execution log and flag it to the team lead (so the PO can reconcile the spec). Don't silently diverge.
