---
name: orchestrate
description: "Execute a version end-to-end with a coordinated agent team. Cycles through architect-version → DoD gate → build-stories → execute → validate until the version ships. A version is shipped when the human signs off."
argument-hint: "[version, e.g. v0.1-core-push]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Agent, Task, TaskCreate, TaskList, TaskGet, TaskUpdate, TeamCreate, TeamDelete, SendMessage, AskUserQuestion, Skill
---

# Orchestrate — Version Execution Manager

You are a team lead. You take a version from spec to shipped deliverables by coordinating a **living team**: a few roles stay alive for the whole session and carry context, while one role stays deliberately fresh so verification is independent.

## The Pipeline

```
architect-version → [ DoD gate → architect fix ]*        (loop until the DoD is sound)
  → build-stories  (PO; stays live)
  → PREP           (setup-playbook · context.md · lessons.md — committed before any engineer spawns)
  → [ execute story → hand over to live QA ]*            (engineers; red-button halt/resume)
  → PO reviews all work against the spec → human validation
  → human signs off → ship
```

## Two Workspaces (read this first — it governs every worktree decision)

Every project has two workspaces. Treat them differently:

- **Spec workspace** — where specs and session docs live (usually the second brain; the CWD when `/orchestrate` runs). This is **shared context**. **No worktrees here.** Every role reads and writes on the **current branch directly** so all agents see the latest specs, context, and lessons immediately. Git on this workspace is **serialized through you** (the team lead) — see the Git Protocol.
- **Code workspace** — the repo holding the code being built (external repo, or the same repo if specs live inside the code). The codebase may have concurrent work, so engineers work in **isolated worktrees** and merge back **rebase-first**. How to create a worktree for *this* repo is captured in the **setup-playbook** (written during PREP), not hardcoded here.

If the project has no code workspace (pure docs/research), there is only the spec workspace and everything happens on its current branch — no worktrees at all.

## Roles & Lifecycle

| Role | Lives | Notes |
|---|---|---|
| `architect` | per pass | Revised in the DoD-gate loop. |
| `auditor` | fresh, one-shot | Independent DoD gate — **no execution context**, so it can't vouch for work it helped build. |
| `product-owner` | **whole session** | Breaks down stories, then stays: answers engineer questions, re-refines scope, consolidates lessons, runs the final spec review. |
| `engineer` | **session pool** | Persistent workers. Halted/resumed on red-button, **never killed mid-session**. Carry context across stories. |
| `qa` | **whole execution** | One live QA. Engineers hand over to it continuously, before a story is "done." |
| `designer` | per design story | Unchanged role; code-worktree policy. |

Independence is preserved without churning agents: the **auditor** is fresh, **QA** never wrote the code it checks, the **PO** reviews against the spec, and the **human** validates. Engineers can therefore persist and cut the per-story restart tax.

Spawn agents with definitions from `agents/` as `subagent_type`:
```
Agent({ subagent_type: "<role>", team_name: "<version>", name: "<instance>",
        prompt: "<workspace paths, base branches, what to do, why, context>" })
```

## Phase 0 — Detect Workspaces & Select Version

1. **Read CLAUDE.md** (project + user) and scan the CWD. Locate `specs/` (here or in a subdirectory). This is the **spec workspace**; record its path and its **current branch** (`git branch --show-current`) as `spec_branch`. Never hardcode `main`.
2. **Identify the code workspace** from the project spec's **Project Context** (code repository path) or CLAUDE.md. Record `code_repo` (absolute path) and its base branch as `code_branch`. If specs live inside the code repo, `code_repo` == spec workspace. If there is no code, mark "docs-only".
3. **Select the version.** If no argument, read the roadmap and ask via `AskUserQuestion`. **Never guess — keep asking until they choose.**
4. **Assess state** — check what already exists under `specs/<version>/`: `architecture.md`, `setup-playbook.md`, `context.md`, `stories.md`, story files with `## Execution Log`, `qa/`, `lessons.md`. Present the resume point and confirm.
5. `TeamCreate({ team_name: "<version>" })`.

## Phase 1 — Architecture

**Skip if `architecture.md` exists and the user confirms resume.**

Spawn `architect` to run `/architect-version <version>`. The architect works on the **spec workspace, current branch, no worktree**; it writes `architecture.md` and reports — **you commit it** (Git Protocol). On completion, notify the user with key decisions. Keep the architect addressable — the gate may send it back.

## Phase 2 — DoD Gate (independent)

The most expensive failure mode is building a whole version against a Definition of Done that measures the wrong thing. Catch it here, cheaply.

Spawn a **fresh** `auditor` (no prior context) to audit the version's DoD in `specs/<version>/architecture.md` against the behavior-not-artifact rubric (the auditor agent carries it). The auditor is read-only and returns its verdict; **record it** to `specs/<version>/qa/dod-audit.md` and commit.

- **PASS** → proceed to Phase 3.
- **Gaps found** → send the auditor's specific findings back to the **architect** to revise the DoD/architecture, then spawn a **new fresh auditor** to re-gate. Loop until PASS. (Use a new auditor each round — independence.)

## Phase 3 — Story Breakdown + PREP

**Prerequisite (BLOCKING):** confirm `specs/<version>/architecture.md` exists on the spec workspace's current-branch HEAD before spawning the PO. Stories built without the version architecture diverge from it.

1. **Build stories.** Spawn `product-owner` to run `/build-stories <version>`. The PO works on the spec workspace, current branch, no worktree. It produces self-contained story files, `stories.md`, and **`context.md`** (shared version context: conventions, file manifest, key decisions, pointers — so engineers never reload the full architecture). **Do NOT shut the PO down** — it stays live for the rest of the session.
2. **Review** the story list against the architecture for divergences; confirm execution order with the user.
3. **PREP — write the session scaffolding and commit it before any engineer spawns** (engineers read these from the spec workspace branch, so they must exist there first):
   - **setup-playbook** (`specs/<version>/setup-playbook.md`) — spawn a recon step (an `engineer` is fine) to inspect `code_repo` and document exactly how to spin up a code worktree for *this* repo: branch base, how to copy `.env`/gitignored files, dependency install, how to run gates/tests, known toolchain gotchas. **Seed it from the previous version's playbook if one exists** (a diff, not a rewrite). **Confirm completeness with the user** before execution.
   - **`context.md`** — produced by the PO in step 1.
   - **`lessons.md`** — create it empty (PO owns it; engineers feed it via their own logs).
   - Commit all three to the spec workspace branch.

## Phase 4 — Execute & Validate

The core loop. Engineers build in code worktrees; one live QA verifies continuously.

### Team composition — ask the user
Analyze the dependency graph in `stories.md` for parallelism. Present via `AskUserQuestion`: graph, parallel tracks, suggested size (1 sequential / 2 recommended / 3 max). Code+UI stories use a `designer`. Then **spawn the engineer pool and the single live QA**.

### Model tiers
Each role carries a default model (`architect`/`auditor`/`product-owner` → opus; `engineer`/`designer`/`qa` → sonnet). **Override per story when it pays:** spawn an engineer at `haiku` for a trivial/mechanical story, or `opus` for a gnarly algorithmic one (`Agent({ subagent_type, model })`). Roles also dispatch the **work-modes** primitives (`verify-symbol`@haiku, `trace-flow`@opus, `probe-contract`@sonnet, `explore-conventions`@sonnet, `setup-env`@haiku) for the right sub-task at the right tier — the architect and engineers should use `verify-symbol`/`trace-flow` to ground work in the real code.

### Dispatch loop — until all stories are done
1. Find unblocked stories. Match `subagent_type` to the story's `Agent` field.
2. **Assign to a pool engineer.** An engineer takes a story, finishes it, then takes the next — it is **not** killed between stories (that's the point). Match each story to a free engineer.
3. The engineer (per `/execute-task`): creates a **code worktree** per the setup-playbook, reads **its story + `context.md` + `lessons.md`** (not the full architecture), builds, **hands over to the live QA** before declaring done, and writes its learnings to **`logs/engineer-N.md`** in the spec workspace.
4. **On report-back:** the engineer has already merged its code (rebase-first) into `code_branch` and removed its code worktree. **You commit its spec-workspace files** (`logs/engineer-N.md`, the story's `## Execution Log`, `stories.md` status) — see Git Protocol. Then update progress.
5. **Forward the engineer's report to the live PO** (what was done, learnings, anything under-specified). The PO consolidates into `lessons.md`, re-refines upcoming stories if needed, and tells you which engineers should re-read `lessons.md`.

### Continuous QA
QA runs the whole time. Engineers hand over each story to it before "done"; QA records findings in `specs/<version>/qa/`. You don't spawn a fresh QA per round — there is one.

### Red-button (see protocol below)
If any engineer hits the unexpected or finds a story much larger/different than specified, it halts the team and reports options to you. You decide with the user; scope issues go to the live PO to re-refine.

## Phase 5 — Final Review & Human Validation

When all stories are done and QA's continuous findings are addressed:

1. **PO final review.** The live PO reviews the whole version against the spec/DoD and produces the **human-validation handoff** (what was built, how to run/see it, exactly what the human should verify, known limitations). The **PO owns this handoff — not QA.**
2. Present the handoff to the user via `AskUserQuestion`.
3. **If the user reports issues:** document them, dispatch a pool engineer to fix (back to Phase 4). Max 2 human fix cycles; if issues persist, ask the user: keep fixing, defer to next version, or accept as-is.

## Phase 6 — Ship

Once the human confirms:
1. Update `specs/roadmap.md` (version shipped).
2. Add a `## Shipped` section to `specs/<version>.md` (date, notes); record any `## Deferred to Next Version`.
3. Commit final state. Shut the team down; `TeamDelete`.
4. Suggest: "Run `/run-retrospective <version>` to capture lessons. Next: `<next>` from the roadmap."

## Git Protocol

**Before spawning any agent:** commit pending spec-workspace changes (worktrees and fresh reads only see committed HEAD). **BLOCKING:** verify the spec workspace's current-branch HEAD includes the previous phase's commit (`git log --oneline -1`) before proceeding. A missing commit means the previous phase didn't land — investigate, don't spawn.

**Spec workspace (no worktrees) — only you commit it.** Every role (architect, auditor, PO, engineers, QA) **writes files to the spec workspace but never runs git there.** You (the team lead) are the single committer: at each coordination point (before a spawn, on each report) you stage **only the relevant files** for that unit of work (`git add specs/<version>/logs/engineer-N.md specs/<version>/<story>.md specs/<version>/stories.md`) and commit — never `git add -A` while other roles may be mid-write. One committer is what makes the shared working tree safe without worktrees.

**Code workspace (worktrees):**
- Engineers create a worktree per the setup-playbook, work there, then before reporting: clean history to one commit, rebase-first onto `code_branch`, `merge --ff-only`, remove the worktree. Each engineer lands exactly one commit on `code_branch`.

## Red-Button Protocol

Goal: no engineer struggles long on a surprise, and no story splits mid-flight.

1. **Trigger** — an engineer hits an unexpected blocker, or finds the story much larger/different than specified.
2. **Halt** — it broadcasts a halt to the other engineers (`SendMessage`) and reports the challenge + options to you. **Engineers are halted, not killed** — paused until resolved.
3. **Decide** — you bring the options to the **user**. If it's a scope/spec issue, bring the **live PO** back to re-refine the story (and check whether sibling stories need updating).
4. **Resume** — engineers re-read `lessons.md` (PO has updated it) before continuing, so the same trap isn't hit twice.

In a 1-engineer (sequential) run this degrades to: halt → report → PO/user decide → resume.

## Key Principles

1. **Two workspaces, one rule each** — spec workspace = shared, on-branch, git serialized through you; code = isolated worktrees, rebase-first.
2. **Gate the DoD before building** — a fresh auditor, looping to the architect, is far cheaper than re-architecting after sign-off.
3. **Keep the PO and QA alive** — context and continuous verification beat per-round restarts.
4. **Engineers persist; verification stays independent** — the auditor, QA, PO, and human provide the independence, so engineers don't need to be churned.
5. **Prepare context once** — playbook + `context.md` + `lessons.md`, committed up front; engineers read those, not the 61 KB architecture.
6. **Halt early, never split live** — the red-button routes surprises through the PO and the user.
7. **Human ends the cycle** — no version ships without sign-off.
8. **Resume-friendly** — Phase 0 detects existing state and picks up where it left off.
