# Linear Spec Plugin

A Claude Code plugin for spec-driven project execution backed by **Linear**. Same skill set and agent team as `spec-plugin`, but the execution unit (specs, stories, validation reports) lives in Linear via the GraphQL API instead of on disk. Reasoning artifacts (briefings, ADRs, research, retrospectives, comms) stay where they belong — in your knowledge base.

For the disk-only flow, use [`spec-plugin`](../spec-plugin) instead. The two are designed to be installed independently.

## Pipeline

```
/ideate → /architect → /plan → /orchestrate (per spec)
```

| Skill | Purpose |
|-------|---------|
| `/ideate` | Build a project specification through conversational refinement (disk) |
| `/architect` | Project-level implementation approach (Project Document) |
| `/plan` | Evolutionary delivery roadmap → Initiative + Projects + Spec Issues |
| `/orchestrate` | Execute a spec end-to-end with a coordinated agent team |

The orchestrator runs a simple cycle per spec:

```
/architect-version → /build-stories → [ /execute-task → /validate-execution ]* → human signs off
```

A spec ships when the human confirms its Definition of Done is met.

## What lives where

The plugin honors the boundary defined in [`linear-workflow/docs/approach.md`](https://github.com/jaisonerick/second-brain) (private):

| Artifact | Location |
|---|---|
| Briefing (`<entity>.md`) | disk (knowledge base) |
| Project-level architecture | **Linear Project Document** `Architecture` |
| Spec body | **Linear issue description** (label `type/spec`) |
| Spec architecture | **Linear Project Document** `Spec vX.Y — Architecture` |
| Stories | **Linear sub-issues** under the spec issue |
| Story execution logs | **Linear comments** on the story sub-issue |
| Validation reports | **Linear Project Document** `Spec vX.Y — Validation Report` |
| Retrospectives | disk (knowledge base), with a back-link comment on the spec issue |
| Research, decisions (ADRs), comms, contracts, people, resources | disk |

## Inputs: ID or text search

Skills that take a target accept either:

- **A Linear identifier** matching `^[A-Z]{2,5}-\d+$` — e.g. `DIN-142`, used directly.
- **Free text** — runs a search and presents the top matches via `AskUserQuestion` so you can pick.

`/architect` and `/plan` take projects/initiatives, not issues — same picker pattern.

## Configuration

Required:

```bash
export LINEAR_API_KEY="lin_api_..."
```

Set this in `~/.zshenv.local` so it is available to non-interactive shells too. Personal API keys are issued from Linear → Settings → API.

If you keep the key in 1Password (e.g. at `op://Environments/Linear/credential`), pull it on demand:

```bash
export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"
```

## Agents

| Agent | Role |
|-------|------|
| `architect` | Deep-dive spec architecture. Writes Linear documents — no code. |
| `product-owner` | Story breakdown (creates sub-issues) and retrospectives (disk). |
| `engineer` | Task execution — runs in a worktree, posts logs as comments. |
| `designer` | Visual UI creation following the design system. |
| `qa` | Writes validation specs and executes them. Reports failures — never fixes. |

Agents that touch code call `EnterWorktree` as their first action to work on an isolated copy of the repo. Worktrees apply to **code only** — not to your knowledge-base directory, which is read/write directly.

## All Skills

| Skill | Description |
|-------|-------------|
| `/ideate` | Project spec through conversation (disk briefing) |
| `/architect` | Deliverable architecture as Project Document |
| `/plan` | Initiative + projects + spec issues from a roadmap |
| `/architect-version` | Spec body in issue description; spec architecture as Project Document |
| `/build-stories` | Sub-issues under the spec issue |
| `/execute-task` | Comments + state transitions on a story sub-issue |
| `/validate-execution` | Validation Report Project Document; comment on spec issue |
| `/run-retrospective` | Retrospective on disk; back-link comment on the spec issue |
| `/orchestrate` | Full spec execution with agent team |

## Bundled Linear scripts

The plugin ships a Node CLI in `scripts/linear/` (zero dependencies, Node 18+ stdlib only). Skills invoke these scripts; you can also call them directly from your shell:

| Script | Operation |
|---|---|
| `resolve-spec.js <id>` | Full context for a spec issue |
| `search.js --type issue\|project\|initiative --query "..."` | Picker source |
| `get-issue.js <id> [--with-comments] [--with-children]` | Read an issue |
| `get-project.js <id> [--with-issues] [--with-documents]` | Read a project |
| `list-sub-issues.js <parent>` | Children of an issue |
| `list-documents.js <project> [--title-match <regex>]` | Find a doc by title |
| `set-issue-description.js <id>` (stdin = body) | Replace description |
| `post-comment.js <id>` (stdin = body) | Add a comment |
| `transition-issue.js <id> --state "<name>"` | Move workflow state |
| `create-sub-issue.js <parent> --title "..."` (stdin = body) | New sub-issue |
| `create-issue.js --project <id> --team <key> --title "..." --label type/spec` (stdin = body) | New top-level issue |
| `create-document.js --project <id> --title "..."` (stdin = content) | New Project Document |
| `update-document.js <id> [--title "..."]` (stdin = content) | Replace doc content |
| `create-project.js --team <key> --name "..." [--initiative <id>]` (stdin = description) | New deliverable project |
| `create-initiative.js --name "..."` (stdin = description) | New initiative (OS) |
| `set-project-description.js <id>` (stdin = description) | Replace project description |

All scripts emit JSON to stdout on success and human messages to stderr on failure. Non-zero exit on error.

## Worktree Isolation (code only)

Agents work in isolated git worktrees to avoid conflicts:

1. **Agent definitions** instruct each agent to call `EnterWorktree` before doing any work
2. **Orchestrate skill** provides worktree names in agent prompts
3. **PostToolUse hook** on `EnterWorktree` runs `scripts/setup-worktree.sh` if it exists in your project

The plugin's agent hooks look for `scripts/setup-worktree.sh` in your **project directory** (not the plugin). If the file exists, it runs automatically after `EnterWorktree` to copy gitignored files into the worktree. Create one in your project like this:

```bash
#!/usr/bin/env bash
# scripts/setup-worktree.sh — runs via PostToolUse hook on EnterWorktree
set -euo pipefail

MAIN_REPO=$(git worktree list --porcelain | head -1 | sed 's/worktree //')
WORKTREE_DIR=$(pwd)

[ "$MAIN_REPO" = "$WORKTREE_DIR" ] && exit 0

for f in .env .env.local .tool-versions; do
  [ -f "$MAIN_REPO/$f" ] && [ ! -f "$WORKTREE_DIR/$f" ] && cp "$MAIN_REPO/$f" "$WORKTREE_DIR/$f"
done

exit 0
```

## Installation

```
/plugin marketplace add nexaedge-marketplace --source github --repo nexaedge/nexaedge-marketplace
/plugin install linear-spec-plugin@nexaedge-marketplace
```

## Optional Dependencies

- **`/interface-design` plugin** — Required for `designer` agent stories.
- **Chrome DevTools MCP** — Used by `/validate-execution` for browser-based validation.

## Out of scope (v1)

- Cycles and priorities — no auto-assignment; set them in Linear if you use them.
- Reserved labels beyond `type/spec` — sub-issues and sub-tasks are unlabeled.
- Migration from disk-based `spec-plugin` — manual replay; not automated.
