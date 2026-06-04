---
name: execute-task
description: "Execute a single story sub-issue end-to-end — either a new story or a fix from validation findings. Reads the sub-issue, parent spec, and architecture, then produces working output that meets all acceptance criteria. Code goes through worktrees; execution logs and state changes go to Linear."
argument-hint: "[Linear story identifier (e.g. DIN-150) or text to search for]"
---

Your task: execute ONE story end-to-end, producing output that meets all acceptance criteria. The story is either a new task (from `/build-stories`) or a fix (from `/validate-execution` findings).

## Linear contract

Scripts live in `${CLAUDE_PLUGIN_DIR}/scripts/linear/`. Required: `LINEAR_API_KEY`. If it isn't set, fetch it from 1Password: `export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"`.

State transitions for a story sub-issue:
```
Backlog/Todo → In Progress → (In Review →) Done
```

Execution logs are posted as **comments** on the sub-issue. Acceptance criteria stay in the description as a checklist; tick them via `set-issue-description.js` once each is satisfied.

## Phase 0 — Resolve the story

Argument is an identifier or free text. If text:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/search.js" --type issue --query "<text>" --limit 5
```

Pick via `AskUserQuestion`. Then load full context:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/get-issue.js" "<identifier>" --with-comments --with-children
```

Verify it has a `parent` (it should — stories are sub-issues). Capture: `issue.id`, `issue.identifier`, `issue.description`, `issue.state`, `issue.parent.identifier`, existing comments.

If existing comments include an in-progress execution log, **resume** from where it left off — read the most recent log to understand current state.

## Phase 1 — Load Knowledge-Base & Spec

1. **Resolve the parent spec issue** — gives you the project, the deliverable architecture, and the spec architecture:
   ```bash
   node "${CLAUDE_PLUGIN_DIR}/scripts/linear/resolve-spec.js" "<parent-identifier>"
   ```
2. **Read the project briefing on disk** (path in the project's `Context:` line) — project type and code repository path.
3. **Read the spec architecture document** (`Spec vX.Y — Architecture` Project Document) for component breakdown, data model, decisions.
4. **Read the deliverable architecture** (`Architecture` Project Document) for cross-cutting decisions.
5. Scan existing workspace (and code repo if separate) for patterns, conventions, and what's already built/written.

### Project Type Detection

The project briefing's project context determines your execution approach:
- **code**: Write code, run tests, verify builds — runs in a `git worktree`.
- **business / consulting**: Write documents directly in the knowledge base (no worktree).
- **research**: Investigate, analyze, produce findings on disk.
- **hybrid**: Mix approaches as needed.

### If this is a fix task

The orchestrator will include validation findings in the prompt — specific failures that need to be addressed. Read the comments on the parent spec issue and the linked Validation Report Project Document to understand what failed and why.

### If this follows a design story

If the story lists a prior `/interface-design` story as a prerequisite, fetch that story's comments via `get-issue.js --with-comments` to find the files it produced. Build on them, don't redesign them.

## Phase 2 — Transition to In Progress

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/transition-issue.js" "<identifier>" --state "In Progress"
```

Post an opening comment that the work is starting and how you plan to approach it (file list, order, blockers if any):

```bash
echo "<starting comment>" | node "${CLAUDE_PLUGIN_DIR}/scripts/linear/post-comment.js" "<identifier>"
```

## Phase 3 — Plan Implementation

Before producing any output:
1. List every file to create or modify
2. Define the order of operations
3. Identify any ambiguities or blockers
4. If the task is complex, present the approach to the user

## Phase 4 — Execute

### For Code Projects

`EnterWorktree` first (if not already inside one) — the orchestrator usually provides the worktree name in the prompt.

**New stories:**
1. Write the code following the architecture and patterns
2. Write tests alongside the implementation (see Phase 5)
3. Ensure everything compiles/runs

**Fix tasks:**
1. Understand the failure first — read validation findings carefully
2. Write a failing test that reproduces the failure
3. Fix the bug with minimal code change
4. Verify the test passes
5. Run the full suite — ensure no regressions

**Integrating Interface-Design Output:**
- Fetch the design story's comments and read the produced files
- Read `.interface-design/system.md` for design tokens and patterns
- Preserve the visual design — don't restyle or restructure
- Your job is to wire: data fetching, state management, API calls, routing

### For Non-Code Projects

The knowledge base lives outside any worktree — write directly to the disk paths.

**New stories:**
1. Research and gather inputs needed for the deliverable
2. Write the deliverable following the architecture's delivery structure
3. Check the deliverable against each acceptance criterion
4. Verify references are accurate

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

## Phase 5 — Verify (Code Projects)

Write automated tests alongside the implementation. Pragmatic coverage — not 100%, but confidence that key behaviors work.

### Testing Philosophy
- **Complex logic** (engines, validators, state machines, algorithms): thorough test suite
- **Key components** (database layers, providers, API routes): at least one test pass verifying primary behavior
- **Simple glue code** (factories, config loading, re-exports): tested implicitly
- **Integration points**: test that components work together

### Run Tests

After writing tests, run them and ensure they all pass. Tests MUST pass before moving to Phase 6.

## Phase 5 — Verify (Non-Code Projects)

Walk through each acceptance criterion from the sub-issue description:

1. **Completeness** — does the deliverable address everything?
2. **Quality** — is the writing clear? Are claims supported? Is the format correct?
3. **Language** — verify the output language matches the project's language setting.
4. Report what's done and what meets criteria.

## Phase 6 — Final Checks

1. Check every acceptance criterion from the sub-issue description
2. For code: run all tests, linters, type checks, builds
3. For non-code: re-read deliverable against criteria, verify references and links
4. **Integration check** — verify the output connects properly to what exists

## Phase 7 — Post Execution Log to Linear

Stage a log to `/tmp/linear-spec/<story-id>/log-<timestamp>.md` and post as a comment:

```markdown
## Execution Log — <date>

**Status**: completed | in-progress

**Completed:**
- What was done (with file paths and commit hashes if code)

**Decisions Made:**
- Any implementation decisions not in the original task

**Issues Encountered:**
- Problems hit and how they were resolved

**Struggled With:**
- Things that took multiple attempts
- Process difficulty that future agents should know about

**QA Setup:** *(code projects only — when validation needs special prep)*
- Migrations to run, env vars to set, services to start

**Pending:** *(only if in-progress)*
- What's left to do
```

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/post-comment.js" "<identifier>" \
  < /tmp/linear-spec/<story-id>/log-<timestamp>.md
```

If you ticked acceptance criteria in the description, write the updated description back:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/set-issue-description.js" "<identifier>" \
  < /tmp/linear-spec/<story-id>/description.md
```

## Phase 8 — Transition state

- All acceptance criteria pass and validation gates apply later → move to **`In Review`**.
- All criteria pass and no further validation expected for this story → move to **`Done`**.
- Still in progress → leave in **`In Progress`** (do not transition).

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/transition-issue.js" "<identifier>" --state "In Review"
```

## Phase 9 — Document QA Requirements (Code Projects Only)

After completing a code task, ensure validation can happen without guessing:

1. **Startup commands** — if the task adds or changes how services are started, update `docs/dev-environment.md` in the code repo with exact commands.
2. **Setup prerequisites** — if new seed scripts, migrations, env vars, or config overrides are needed, document them in the execution log under `**QA Setup**`.
3. **Architecture updates** — if implementation diverged from the spec architecture document, update it via `update-document.js <doc-id>` with the divergence noted.
