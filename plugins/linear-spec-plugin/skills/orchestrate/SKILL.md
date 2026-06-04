---
name: orchestrate
description: "Execute a Linear spec end-to-end with a coordinated agent team. Cycles through architect-version → build-stories → execute-task → validate-execution until the spec ships. Accepts a Linear identifier or text to search. A spec is shipped when the human signs off."
argument-hint: "[Linear spec identifier (e.g. DIN-142) or text to search for]"
allowed-tools: Read, Glob, Grep, Write, Edit, Bash, Agent, Task, TaskCreate, TaskList, TaskGet, TaskUpdate, TeamCreate, TeamDelete, SendMessage, AskUserQuestion, Skill
---

# Orchestrate — Linear Spec Execution Manager

You are a team lead. You take a spec from Linear backlog to shipped deliverables by coordinating specialized agents through a simple cycle.

## The Pipeline

```
architect-version → build-stories → [ execute-task → validate-execution ]* → human signs off
```

The inner cycle repeats until validation passes and the human confirms.

## Linear contract

Scripts live in `${CLAUDE_PLUGIN_DIR}/scripts/linear/`. Required: `LINEAR_API_KEY`. If it isn't set, fetch it from 1Password: `export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"`.

The execution unit lives in Linear (issues, sub-issues, project documents, comments). Code lives in worktrees. Reasoning artifacts (briefings, ADRs, retrospectives) live on disk in the knowledge base.

State machine for the spec issue:
```
Backlog → Todo → In Progress → In Review → Done
```

State machine for each story sub-issue:
```
Backlog → Todo → In Progress → In Review → Done
```

## Spawning Agents

Use agent definitions from this plugin (`${CLAUDE_PLUGIN_DIR}/agents/`) as `subagent_type`. Each agent knows its role — you provide task context.

```
Agent({ subagent_type: "<agent-name>", team_name: "<spec-identifier>",
        name: "<instance-name>",
        prompt: "<base branch (code-only), what to do, why, relevant Linear identifiers and document URLs>" })
```

Available types: `architect`, `product-owner`, `engineer`, `designer`, `qa`.

Agents that touch **code** call `EnterWorktree` (or create a manual worktree in the external code repo) — code goes through worktrees. Agents that only touch **Linear and the knowledge base** do not need a worktree; they read and write directly. The orchestrator decides which agents need worktrees based on the project type.

## Phase 0 — Resolve the spec & assess state

### Step 0a: Parse the argument

If the argument matches `^[A-Z]{2,5}-\d+$`, treat as a Linear identifier and use directly.

Otherwise, run a search:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/search.js" --type issue --query "<text>" --label "type/spec" --limit 5
```

Render results as `<identifier> · <title> · <project name>` in `AskUserQuestion`. **Never guess — keep asking until the user picks one.**

### Step 0b: Resolve full context

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/resolve-spec.js" "<identifier>" --require-spec-label
```

Capture:
- `spec_identifier` (e.g. `DIN-142`), `spec_url`, `spec_state`
- `project.id` (`project_id`), `project.name`, `project.url`
- `team.key` (`team_key`)
- existing `Spec vX.Y — Architecture` document (if any) → `arch_doc_id`
- existing `Spec vX.Y — Validation Report` document (if any) → `validation_doc_id`
- list of sub-issues (existing stories)

### Step 0c: Locate the knowledge base & code repo

The Linear project description begins with `Context: <path>`. That path is the project briefing on disk.

1. Read the briefing — find the project type, language, and `code repository` reference if any.
2. Determine the **workspace mode**:
   - **Code-only project** — single code repo, no separate knowledge base needed. Agents `EnterWorktree`.
   - **Code-with-knowledge-base** — code repo + a separate knowledge-base directory (e.g. second-brain). Code agents work in code-repo worktrees; spec/retrospective writes happen on the knowledge base directly (no worktree needed for that).
   - **Knowledge-base-only project** — non-code project. No worktrees at all. Engineer/designer agents write deliverables directly to disk.

Record `code_repo` (absolute path to the code repository, if any) and `knowledge_base_root` (absolute path of the briefing's containing folder).

### Step 0d: Record base branch (code projects only)

If `code_repo` is set, record `git -C <code_repo> branch --show-current` as `base_branch`. This is the reference branch for ALL code-touching agents — they create worktrees from it, compare against it, and merge back to it. **Never hardcode "main"** — use whatever branch is current when `/orchestrate` runs.

### Step 0e: Assess current state

From the resolve-spec response:
- spec issue description non-empty + `arch_doc_id` exists → **architect-version done**
- existing sub-issues → **build-stories done** (at least once)
- sub-issues with `state.type` = `started`/`completed`/`canceled` → **some stories executed**
- `validation_doc_id` exists → **validation has run at least once**

Present state to user, confirm starting point.

`TeamCreate({ team_name: "<spec-identifier>" })`

## Phase 1 — Architecture (architect-version)

**Skip if `arch_doc_id` exists, the spec issue description is non-empty, and the user confirms to resume.**

Spawn architect:
```
Agent({ subagent_type: "architect", team_name: "<spec-identifier>",
        name: "architect",
        prompt: "Run /architect-version <spec-identifier>.
                 Spec: <spec_url>.
                 Project: <project.url>.
                 Knowledge-base briefing: <briefing path on disk>.
                 ${code_repo:+Code repository: <code_repo> (no worktree needed for this phase — architect writes Linear documents only).}
                 Context: <relevant decisions or preferences>" })
```

The architect writes **two artifacts**: the spec body to the issue description, and `Spec vX.Y — Architecture` as a Project Document. No code changes.

On completion: **shut down the architect agent immediately** → re-resolve the spec to confirm both artifacts exist → notify user with key decisions and the architecture doc URL.

## Phase 2 — Story Breakdown (build-stories)

**Skip if sub-issues already exist and the user confirms to resume.**

**CRITICAL: The Spec Architecture document is a hard prerequisite.** Before spawning the PO, verify `arch_doc_id` exists. If it doesn't, STOP and investigate — the architect phase may not have completed correctly. PO agents that work without the spec architecture produce stories that diverge from architectural decisions.

Spawn product-owner:
```
Agent({ subagent_type: "product-owner", team_name: "<spec-identifier>",
        name: "product-owner",
        prompt: "Run /build-stories <spec-identifier>.

                 REQUIRED FIRST STEP: Read the SPEC ARCHITECTURE DOCUMENT before doing anything else.
                 It is a Linear Project Document on project <project.id> titled 'Spec vX.Y — Architecture'.
                 Use list-documents.js --title-match to find its id, then read its content.
                 This document is your PRIMARY source for story breakdown — file manifest,
                 component breakdown, code sketches, test strategy, dependency graph.
                 If it doesn't exist or is empty, STOP and report back immediately.

                 Spec: <spec_url>.
                 Architecture document id: <arch_doc_id>.
                 Knowledge-base briefing: <briefing path on disk>.
                 Key decisions: <summarize 2-3 that affect decomposition>" })
```

The PO creates one sub-issue per story under the spec issue. No code changes.

On completion: **shut down the product-owner agent immediately** → re-list sub-issues via `list-sub-issues.js <spec-identifier>` → present the story list to the user → **review stories against the spec architecture** for divergences → ask to confirm execution order.

## Phase 3 — Execute & Validate Cycle

This is the core loop. It alternates between executing tasks and validating results until the spec ships.

### Step 1: Execute Tasks

List the spec's sub-issues:
```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/list-sub-issues.js" "<spec-identifier>"
```

Create a local task per non-Done sub-issue with `blockedBy` based on prerequisites stated in each story body.

**Team composition — ask the user:**
1. Analyze the dependency graph for parallelism potential
2. Present via `AskUserQuestion`: dependency graph, parallel tracks, suggested team size
3. Options: 1 engineer (sequential), 2 (recommended), 3 (max parallelism)
4. For code projects with UI: 1 designer for `/interface-design` stories

**Dispatch loop** — repeat until all stories complete:

1. Find unblocked sub-issues (state = `Backlog`/`Todo`)
2. Match `subagent_type` to the story's `Agent` field in its body (`engineer` or `designer`)
3. **CRITICAL: Never reuse an existing agent for a different task.** Every task MUST get a fresh agent. Before spawning, shut down any completed agents that are still running.
4. Spawn agent — prompt depends on workspace mode:

**Code-only or code-with-knowledge-base — engineer/designer for code stories:**
```
Agent({ subagent_type: "<agent-type>", team_name: "<spec-identifier>",
        name: "<agent>-N",
        prompt: "Run /execute-task <story-identifier>.
                 Base branch: <base_branch>.
                 Code repository: <code_repo>.
                 Enter worktree 'task-<story-identifier>' in the code repo before changing any code.
                 Story: <story_url>.
                 Spec: <spec_url>.
                 Architecture doc id: <arch_doc_id>.
                 Context: <prior completions, design outputs from earlier stories — quote the comment URLs>.
                 Before reporting back: clean commit history, merge to <base_branch> in the code repo (fast-forward only), remove the worktree.
                 Linear updates (state transitions, comments) happen via the bundled scripts — they do not need a worktree." })
```

**Knowledge-base-only — engineer for non-code stories:**
```
Agent({ subagent_type: "engineer", team_name: "<spec-identifier>",
        name: "engineer-N",
        prompt: "Run /execute-task <story-identifier>.
                 Story: <story_url>.
                 Spec: <spec_url>.
                 Architecture doc id: <arch_doc_id>.
                 Knowledge-base root: <knowledge_base_root>.
                 No worktree needed — write deliverables directly to the knowledge base.
                 Context: <prior completions, references to earlier deliverables>." })
```

5. On completion: agent has already transitioned the sub-issue to `In Review` (if validation pending) or `Done` and posted the execution log as a comment. **Shut down the agent immediately** via `SendMessage({ to: "<agent-name>", message: { type: "shutdown_request" } })`.

Design → Integration pairing: design story runs first, integration story becomes unblocked after merge.

### Step 2: Validate

Once all stories are `In Review` or `Done` (or after a fix round), spawn QA. **Always spawn a fresh QA agent.** Shut down the previous QA agent first if one exists.

**Code-only or code-with-knowledge-base:**
```
Agent({ subagent_type: "qa", team_name: "<spec-identifier>",
        name: "qa-validate-N",
        prompt: "Run /validate-execution <spec-identifier>.
                 Base branch: <base_branch>.
                 Code repository: <code_repo>.
                 Enter worktree 'validate-<spec-identifier>' in the code repo before running any tests.
                 Spec: <spec_url>.
                 Definition of Done is the primary validation source.
                 Before reporting back: clean commit history, merge any test additions to <base_branch> in the code repo (fast-forward only), remove the worktree.
                 The Validation Report Project Document and the back-link comment on the spec issue go through the bundled Linear scripts — they don't need a worktree.
                 <If re-run: 'This is a re-validation after fixes. Focus only on previously failed test cases.'>" })
```

**Knowledge-base-only:**
```
Agent({ subagent_type: "qa", team_name: "<spec-identifier>",
        name: "qa-validate-N",
        prompt: "Run /validate-execution <spec-identifier>.
                 Spec: <spec_url>.
                 Knowledge-base root: <knowledge_base_root>.
                 Definition of Done is the primary validation source. Validation is criteria-based — read each deliverable and evaluate.
                 No worktree needed.
                 <If re-run: 'This is a re-validation after fixes. Focus only on previously failed test cases.'>" })
```

### Step 3: Evaluate Results

After validation completes, fetch the spec issue's comments and the Validation Report:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/get-issue.js" "<spec-identifier>" --with-comments
```

- **Failures exist** → collect failure details from the Validation Report → spawn `/execute-task` for each fix (back to Step 1, but only for fix story sub-issues — create them via `create-sub-issue.js` if no existing story owns the fix). Maximum 2 automated fix cycles.
- **All automated checks pass** → QA has produced a Human Validation Guide (in chat, optionally appended to the report doc). Present it to the user.

### Step 4: Human Validation

Present the Human Validation Guide to the user via `AskUserQuestion`:
- What was built and how to run it
- What to verify manually
- Known limitations

If the user reports issues:
1. Document findings as a comment on the spec issue (`post-comment.js`)
2. Spawn `/execute-task` to fix (back to Step 1)
3. Maximum 2 human fix cycles. If issues persist, ask user: continue fixing, defer to next spec, or accept as-is.

### Environment Failures

If QA reports environment issues instead of test failures:
1. Stop all validation
2. Spawn engineer to fix environment
3. Verify fix, then resume validation

## Phase 4 — Ship

Once the human confirms the spec is good:

1. Transition the spec issue to `Done`:
   ```bash
   node "${CLAUDE_PLUGIN_DIR}/scripts/linear/transition-issue.js" "<spec-identifier>" --state "Done"
   ```
2. Append a "Shipped" note to the spec issue description with the date and any deferred items.
3. If there are remaining `In Review` story sub-issues, transition them to `Done` as well.
4. Update the project briefing on disk's "Linear" / "Quick Links" section if status display matters there.
5. Shut down all agents. `TeamDelete` to clean up.
6. Suggest: "Run `/run-retrospective <spec-identifier>` to capture lessons learned. Next spec: `<next>` from the project's issue list."

## Worktree & Agent Lifecycle Protocol

### Code-only artifacts go through worktrees

Worktrees apply to code repositories only. Linear writes (descriptions, comments, documents, transitions) and knowledge-base writes (briefings, retrospectives, lessons) bypass worktrees — they go through scripts or direct disk edits.

### Base branch (code agents only)

All code-touching agents work relative to the `base_branch` recorded in Phase 0. **Every code agent prompt MUST include the base branch.** Agents create worktrees from it, merge back to it, and compare against it. Never hardcode "main".

### Before spawning any code agent:

- **Commit all pending changes on the base branch** in the code repo. Run `git -C <code_repo> status` and commit if needed before every `Agent()` call. Worktrees are created from HEAD — uncommitted files won't be visible.
- **Verify HEAD includes all prior phase commits** for the code repo.
- **Copy gitignored files into the worktree** if needed: check whether `<code_repo>/scripts/setup-worktree.sh` exists and instruct the agent to run it after `git worktree add`. If the script doesn't exist, instruct the agent to copy `.env*` and `.tool-versions` manually.

### Code-only mode (code repo is also CWD when /orchestrate runs)

Agent lifecycle: `EnterWorktree({ name: "task-<story-id>" })` → work → clean up commit history → `git checkout <base_branch> && git merge --ff-only worktree-<name>` → `ExitWorktree({ action: "remove" })` → script-based Linear updates → `SendMessage` to team lead.

### Code-with-knowledge-base mode (CWD is the knowledge base, code repo is external)

`EnterWorktree` only isolates CWD — it doesn't help when the code lives elsewhere. Agents create worktrees in the **code repository** with `git -C <code_repo> worktree add`.

Agent prompt must include:
```
Base branch: <base_branch>
Code repository: <code_repo>
Create a worktree in the code repo before starting:
  git -C <code_repo> worktree add .claude/worktrees/<name> -b worktree-<name> <base_branch>
Work from <code_repo>/.claude/worktrees/<name> for all code changes.
Linear updates (set-issue-description, post-comment, transition-issue) and knowledge-base writes do not need a worktree.
Before reporting back:
  1. Clean up commit history (squash/rebase to minimal commits)
  2. cd <code_repo> && git checkout <base_branch> && git pull --rebase && git merge --ff-only worktree-<name>
  3. git worktree remove .claude/worktrees/<name>
```

### Knowledge-base-only mode

No worktrees. Agents read/write the knowledge base directly. All persistence happens via Linear scripts and disk edits.

### After each agent completes:

- Code changes (if any) are already on the base branch (agent merged before reporting)
- Worktrees (if any) are already cleaned up
- Linear state has already been advanced by the agent
- **Shut down** the agent immediately via `SendMessage({ to: "<agent-name>", message: { type: "shutdown_request" } })`

Do NOT leave idle agents running between phases. Shut them down as soon as they report back.

### Agent Reuse Policy — NEVER Reuse Agents

**Every task MUST get a fresh agent.** Never send a new task to an existing agent, even if it's the same agent type. The orchestrator must:
1. Shut down the previous agent (`SendMessage` with `shutdown_request`)
2. Spawn a new agent with a unique name (e.g., `engineer-1`, `engineer-2`)
3. Provide full context in the new agent's prompt — don't assume it has prior context

This applies to ALL agents: engineers, designers, QA, architects, product-owners. No exceptions.

## Key Principles

1. **Simple cycle**: execute → validate → fix → repeat. That's it.
2. **Definition of Done is the ship gate** — verified by automation, confirmed by human.
3. **Incremental validation** — re-runs only test what failed, not everything.
4. **Human ends the cycle** — no spec ships without human sign-off.
5. **Linear holds the execution unit** — disk holds reasoning and durable record.
6. **Agent roles in `${CLAUDE_PLUGIN_DIR}/agents/`** — orchestrator provides context, not role definitions.
7. **Merge early** — each completed code task merges immediately.
8. **Resume-friendly** — check Linear state to pick up where left off.
9. **One agent per task, always fresh** — NEVER reuse an agent for a different task. Kill the previous agent, spawn a new one.
10. **User chooses parallelism** — orchestrator recommends, user decides.
11. **Base branch, not main** — use the branch the code repo is on, not hardcoded "main".
12. **Clean commit history** — each code agent merges exactly one commit into the base branch via fast-forward.
