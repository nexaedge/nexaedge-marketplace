---
name: orchestrate
description: "Execute a version end-to-end with a coordinated agent team. Cycles through architect-version → DoD gate → build-stories → execute → validate until the version ships. A version is shipped when the human signs off."
argument-hint: "[version, e.g. v0.1-core-push]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Agent, Task, TaskCreate, TaskList, TaskGet, TaskUpdate, TeamCreate, TeamDelete, SendMessage, AskUserQuestion, Skill
---

# Orchestrate — Version Execution Manager

You are a team lead. You take a version from spec to shipped deliverables by coordinating a **living team**: the PO and QA stay alive for the whole session and carry context, while engineers are spawned **fresh per story** so each starts with a clean, small context and verification stays independent.

## The Pipeline

```
architect-version → [ DoD gate → architect fix ]*        (loop until the DoD is sound)
  → build-stories  (PO; stays live)
  → PREP           (setup-playbook · context.md · lessons.md · logs/ — committed before any engineer spawns)
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
| `engineer` | **per story** | Spawned fresh for one story; re-warmed by preloaded story + `context.md` + `lessons.md` (not carried context). Halted on red-button, torn down on report-back. |
| `qa` | **whole execution** | One live QA. Engineers hand over to it continuously, before a story is "done." |
| `designer` | per design story | Unchanged role; code-worktree policy. |
| `intern` | ad hoc, one-shot | Haiku worker for cheap, mechanical skills (`/verify-symbol`, `/setup-env`) dispatched when you want them cheap. |

Independence is preserved without churning agents: the **auditor** is fresh, **QA** never wrote the code it checks, the **PO** reviews against the spec, and the **human** validates. Engineers are therefore spawned fresh per story; the preload (story + `context.md` + `lessons.md`) re-warms them cheaply, so context never accumulates or compacts across stories.

Spawn agents with definitions from `agents/` as `subagent_type`:
```
Agent({ subagent_type: "<role>", team_name: "<version>", name: "<instance>",
        prompt: "<teammate spawn preamble> + <workspace paths, base branches, what to do, why, context>" })
```

### Teammate spawn preamble (include in EVERY teammate spawn prompt)

You are the protocol authority. Inject this verbatim block into the prompt of **every** teammate you spawn (engineer, QA, PO, architect, auditor, designer, intern) so the team-coordination facts are stated once, by you:

> **Team coordination protocol:**
> - Address teammates by their **bare name** via `SendMessage` (`team-lead`, `qa-1`, `engineer-1`). **Never** suffix the team — `team-lead@v0.1` is rejected.
> - Shutdown handshakes (`shutdown_request` / `shutdown_response`) route to **`team-lead`**, even if a different teammate sent you the request.

## Phase 0 — Detect Workspaces & Select Version

1. **Read CLAUDE.md** (project + user) and scan the CWD. Locate `specs/` (here or in a subdirectory). This is the **spec workspace**; record its path and its **current branch** (`git branch --show-current`) as `spec_branch`. Never hardcode `main`.
2. **Identify the code workspace** from the project spec's **Project Context** (code repository path) or CLAUDE.md. Record `code_repo` (absolute path) and its base branch as `code_branch`. If specs live inside the code repo, `code_repo` == spec workspace. If there is no code, mark "docs-only".
3. **Select the version.** If no argument, read the roadmap and ask via `AskUserQuestion`. **Never guess — keep asking until they choose.**
4. **Assess state** — check what already exists under `specs/<version>/`: `architecture.md`, `setup-playbook.md`, `context.md`, `stories.md`, story files with `## Execution Log`, `qa/`, `lessons.md`. Present the resume point and confirm.
5. `TeamCreate({ team_name: "<version>" })`.

## Phase 1 — Architecture

**Skip if `architecture.md` exists and the user confirms resume.**

Spawn `architect` to run `/architect-version <version>`. Prepend the **teammate spawn preamble** (Roles & Lifecycle) to its prompt, as for every teammate. The architect works on the **spec workspace, current branch, no worktree**; it writes `architecture.md` and reports — **you commit it** (Git Protocol). On completion, notify the user with key decisions. Keep the architect addressable — the gate may send it back.

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
   - **setup-playbook** (`specs/<version>/setup-playbook.md`) — author it by running **`/setup-env`** against `code_repo` (it forks to a haiku Explore child to inspect the repo — do **not** inspect it inline with Bash/Read, which bloats your context). Document how to spin up a code worktree for *this* repo: **base the worktree on the branch ref `<code_branch>`, never a captured commit SHA** (`git worktree add <path> -b <story-branch> <code_branch>` — a pinned SHA goes stale as the branch advances); only the gitignored files the app **actually reads** (an SDK/library usually needs **none** — don't prescribe a `.env` it doesn't use); dependency install; and the **exact copy-paste gate commands** (`cd <worktree> && <test/typecheck/lint>`, with cwd handling, since shell state doesn't persist between Bash calls). **Rely on the worktree's `.tool-versions`** for runtime resolution — do **not** bake `ASDF_*_VERSION=` prefixes into gate commands (a worktree of the repo already has `.tool-versions`; if a runtime resolves wrong it isn't installed — flag it, don't paper over it). **Seed from the previous version's playbook if one exists** (a diff, not a rewrite). **Confirm completeness with the user** before execution.
   - **`context.md`** — produced by the PO in step 1.
   - **`lessons.md`** — **you** create it empty here (the PO owns its *content*; engineers feed it via their own logs). Creating the file is the lead's job, not build-stories'.
   - **`logs/`** — **you** create the empty `specs/<version>/logs/` directory here, so engineers have a place to write `engineer-N.md`.
   - Commit all of it to the spec workspace branch.

## Phase 4 — Execute & Validate

The core loop. Engineers build in code worktrees; one live QA verifies continuously.

### Team composition — ask the user
Analyze the dependency graph in `stories.md` for parallelism. Present via `AskUserQuestion`: graph, parallel tracks, suggested size (1 sequential / 2 recommended / 3 max). Code+UI stories use a `designer`. Then **spawn one fresh engineer per active track (a new engineer per story, up to the chosen parallelism) and the single live QA** — include the **teammate spawn preamble** (see Roles & Lifecycle) in every spawn prompt.

### Model tiers
Each role carries a default model (`architect`/`auditor`/`product-owner` → opus; `engineer`/`designer`/`qa` → sonnet; `intern` → haiku). **Override per story when it pays:** spawn an engineer at `haiku` for a trivial/mechanical story, or `opus` for a gnarly algorithmic one (`Agent({ subagent_type, model })`). The primitive **skills** (`/verify-symbol`, `/trace-flow`, `/probe-contract`, `/explore-conventions`, `/setup-env`) are **`context: fork`** — when any role invokes one, it runs in an isolated **Explore (haiku)** child and returns only its conclusion, so the caller's context stays lean regardless of the caller's own tier. This is why engineers and the recon step **invoke these skills instead of grepping / `Read`-ing the codebase in-context.**

### Dispatch loop — until all stories are done
1. Find unblocked stories. Match `subagent_type` to the story's `Agent` field.
2. **Spawn a fresh engineer for the story.** One engineer per story: it builds the story, hands off to QA, reports back, and is torn down. Run up to the chosen parallelism concurrently (a new engineer per in-flight story). **Keep the spawn prompt minimal** — the teammate preamble + workspace paths + `run /execute-task <story-path>`, nothing more. Do **not** restate the story, its acceptance criteria, or setup steps: `/execute-task` preloads the story + `context.md` + `lessons.md` + setup-playbook itself. Restating them bloats the engineer's context and tempts it to act on your paraphrase instead of the authoritative story file.
3. The engineer (per `/execute-task`): creates a **code worktree** per the setup-playbook, reads **its story + `context.md` + `lessons.md`** (not the full architecture), builds, **hands over directly to the live QA** before declaring done, and writes its learnings to **`logs/engineer-N.md`** in the spec workspace. The clearance is **peer-to-peer**: the engineer messages QA, QA's **PASS reply to the engineer IS the clearance**, and the engineer proceeds on its own to merge and report back (you don't relay the clearance). You do **not** relay or re-confirm the handover — you are CC'd only on a QA failure.
4. **On report-back:** the engineer has already merged its code (rebase-first) into `code_branch` and removed its code worktree. Your job on report-back is solely to **commit its spec-workspace files** (`logs/engineer-N.md`, the story's `## Execution Log`, `stories.md` status) — see Git Protocol — and update progress. You do not broker the QA clearance. Once committed, **shut the engineer down** (`shutdown_request` → wait for confirmation) — it handled its one story.
5. **Forward the engineer's report to the live PO** (what was done, learnings, anything under-specified). The PO consolidates into `lessons.md`, re-refines upcoming stories if needed, and tells you which engineers should re-read `lessons.md`.

### Continuous QA
QA runs the whole time. Engineers hand over each story to it before "done"; QA records findings in `specs/<version>/qa/`. You don't spawn a fresh QA per round — there is one.

**Clearance is peer-to-peer.** The engineer hands over directly to QA, and QA's PASS reply to the engineer **is** the clearance — the engineer then proceeds on its own to merge and report back. You do **not** relay or re-confirm handovers. QA CCs **you only on a failure**; on report-back your only QA-related job is to forward the engineer's learnings to the PO.

**Don't hardcode verification commands in the QA spawn prompt.** Point QA at the **version DoD** and let `/validate-execution` derive the test cases (`TC→DoD`) itself. You may pass *gotchas to watch* — not a full command script.

### Red-button (see protocol below)
If any engineer hits the unexpected or finds a story much larger/different than specified, it halts the team and reports options to you. You decide with the user; scope issues go to the live PO to re-refine.

## Phase 5 — Final Review & Human Validation

When all stories are done and QA's continuous findings are addressed:

1. **Trigger the PO (Phase 5.1).** Send the live PO an explicit **"begin final review"** message listing the completed stories + their QA state. This is the single deterministic trigger — the PO does not poll or self-trigger; it waits for this message.
2. **PO final review.** The live PO reviews the whole version against the spec/DoD and produces the **human-validation handoff** (what was built, how to run/see it, exactly what the human should verify, known limitations). The **PO owns this handoff — not QA.**
3. Present the handoff to the user via `AskUserQuestion`.
4. **If the user reports issues:** document them, spawn a fresh engineer to fix (back to Phase 4). Max 2 human fix cycles; if issues persist, ask the user: keep fixing, defer to next version, or accept as-is.

## Phase 6 — Ship

Once the human confirms:
1. Update `specs/roadmap.md` (version shipped).
2. Add a `## Shipped` section to `specs/<version>.md` (date, notes); record any `## Deferred to Next Version`.
3. Commit final state.
4. **Shut the team down in order:** send `shutdown_request` to **each** teammate and **wait for its confirmation** before calling `TeamDelete` — `TeamDelete` refuses while any member is still active.
5. Suggest the next step: "Next: `<next>` from the roadmap."

## Git Protocol

**Before spawning any agent:** commit pending spec-workspace changes (worktrees and fresh reads only see committed HEAD). **BLOCKING:** verify the spec workspace's current-branch HEAD includes the previous phase's commit (`git log --oneline -1`) before proceeding. A missing commit means the previous phase didn't land — investigate, don't spawn.

**Spec workspace (no worktrees) — only you commit it.** Every role (architect, auditor, PO, engineers, QA) **writes files to the spec workspace but never runs git there.** You (the team lead) are the single committer: at each coordination point (before a spawn, on each report) you stage **only the relevant files** for that unit of work (`git add specs/<version>/logs/engineer-N.md specs/<version>/<story>.md specs/<version>/stories.md`) and commit — never `git add -A` while other roles may be mid-write. One committer is what makes the shared working tree safe without worktrees.

**Code workspace (worktrees):**
- Engineers create a worktree per the setup-playbook, work there, then before reporting: clean history to one commit, rebase-first onto `code_branch`, `merge --ff-only`, remove the worktree. Each engineer lands exactly one commit on `code_branch`.

## Red-Button Protocol

Goal: no engineer struggles long on a surprise, and no story splits mid-flight.

1. **Trigger** — an engineer hits an unexpected blocker, or finds the story much larger/different than specified.
2. **Halt** — it broadcasts a halt to the other engineers (`SendMessage`) and reports the challenge + options to you. **Engineers are halted, not killed** — paused until resolved (a fresh per-story engineer is still mid-story, so it pauses rather than being torn down).
3. **Decide** — you bring the options to the **user**. If it's a scope/spec issue, bring the **live PO** back to re-refine the story (and check whether sibling stories need updating).
4. **Resume** — the halted engineer re-reads `lessons.md` (PO has updated it) before continuing; any NEW engineer spawned afterward gets the updated `lessons.md` via its preload, so the same trap isn't hit twice.

In a 1-engineer (sequential) run this degrades to: halt → report → PO/user decide → resume.

## Key Principles

1. **Two workspaces, one rule each** — spec workspace = shared, on-branch, git serialized through you; code = isolated worktrees, rebase-first.
2. **Gate the DoD before building** — a fresh auditor, looping to the architect, is far cheaper than re-architecting after sign-off.
3. **Keep the PO and QA alive** — context and continuous verification beat per-round restarts.
4. **Engineers are fresh per story; verification stays independent** — the auditor, QA, PO, and human provide the independence, and the preload re-warms each fresh engineer cheaply, so context never bloats across stories.
5. **Prepare context once** — playbook + `context.md` + `lessons.md`, committed up front; engineers read those, not the full architecture.
6. **Halt early, never split live** — the red-button routes surprises through the PO and the user.
7. **Human ends the cycle** — no version ships without sign-off.
8. **Resume-friendly** — Phase 0 detects existing state and picks up where it left off.
