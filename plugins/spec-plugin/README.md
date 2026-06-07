# Spec Plugin

A Claude Code plugin for spec-driven project execution. Provides a complete pipeline from ideation to verified, shipped deliverables — orchestrated by AI agents. Works with any project type: code, business, research, consulting.

## Pipeline

```
/ideate → /architect → /plan → /orchestrate (per version)
```

| Skill | Purpose |
|-------|---------|
| `/ideate` | Build a project specification through conversational refinement |
| `/architect` | Create the implementation approach for the project |
| `/plan` | Design an evolutionary delivery roadmap with version progression |
| `/orchestrate` | Execute a version end-to-end with a coordinated agent team |

The orchestrator coordinates a **living team** per version:

```
/architect-version → [ DoD gate → architect fix ]* → /build-stories + PREP
  → [ /execute-task → live QA handover ]*  (engineers; red-button halt/resume)
  → PO final review → human signs off
```

- A fresh, independent **auditor** gates the Definition of Done *before* any story is built, so a version isn't built against a DoD that measures the wrong thing.
- The **product-owner** and a single **QA** stay live the whole session; **engineers** are spawned fresh per story (re-warmed by a preloaded story + `context.md` + `lessons.md`, not carried context).
- A **setup-playbook**, shared **`context.md`**, and a running **`lessons.md`** are prepared up front, so engineers read those instead of re-loading the full architecture.

A version ships when the human confirms its Definition of Done is met.

## Context-Aware

Skills adapt to the workspace they're in:

- **Code repo** (has package.json, Cargo.toml, etc.) → tech stack decisions, automated tests, build verification
- **Document workspace** (organized by project, client, or topic) → structure-aware placement, document deliverables, criteria-based validation
- **Empty directory** → asks what kind of project this is, adapts accordingly
- **Nested project** (e.g., `clients/acme/billing/`) → respects parent structure, places specs in context

The project spec's **Project Context** section captures what `/ideate` learned about the workspace, so downstream skills don't re-discover it.

## Agents

| Agent | Role | Lifecycle |
|-------|------|-----------|
| `architect` | Deep-dive version architecture + a behavior-based Definition of Done. | Per pass; revised in the DoD-gate loop |
| `auditor` | Independent DoD gate — no execution context. Reports PASS or gaps; never fixes. | Fresh, one-shot per gate round |
| `product-owner` | Story breakdown, then stays live: answers questions, re-refines scope, curates `lessons.md`, runs final review + human handoff. | Whole session |
| `engineer` | Task execution — new stories and validation fixes. | Fresh per story |
| `designer` | Visual UI creation following the design system. | Per design story |
| `qa` | Writes validation specs and runs them as engineers hand work over. Reports failures — never fixes. | Whole execution (one live QA) |
| `intern` | Junior haiku worker. Runs one cheap, mechanical skill (`/verify-symbol`, `/setup-env`) and reports a tight result. | Ad hoc, one-shot |

Agents work the **code repo** in isolated worktrees and the **spec workspace** (second brain) directly on its current branch — see *Workspaces* below.

## All Skills

| Skill | Description |
|-------|-------------|
| `/ideate` | Project spec through conversation — adapts to project type |
| `/architect` | Project-level implementation approach |
| `/plan` | Evolutionary delivery roadmap (version progression) |
| `/architect-version` | Per-version architecture deep-dive |
| `/build-stories` | Version → ordered story files |
| `/execute-task` | Execute one task — code or deliverable |
| `/validate-execution` | Validate against Definition of Done — tests or review |
| `/audit-dod` | Independent DoD gate — audits a version's Definition of Done against the behavior-not-artifact rubric |
| `/orchestrate` | Full version execution with agent team |

**Primitive skills** — focused cognitive moves a role runs **inline** (or dispatches to the `intern` when cheap and mechanical):

| Skill | Description |
|-------|-------------|
| `/verify-symbol` | Confirm an external method/field/endpoint/flag exists and get its real signature |
| `/trace-flow` | Trace a value across layers end-to-end, noting where its shape changes |
| `/probe-contract` | Exercise an API/contract against the real code to confirm its behavior |
| `/explore-conventions` | Discover a codebase's conventions before writing to it |
| `/setup-env` | Stand up a code worktree / environment per the setup-playbook |

## Workspaces

Every project has two workspaces, treated differently:

- **Spec workspace** — where specs and session docs live (usually the second brain; the CWD when `/orchestrate` runs). **Shared context, no worktrees** — every role reads and writes on the current branch so all agents see the latest specs, context, and lessons. To keep the shared working tree safe, **only the team lead commits it** (single-committer); other roles write files and report.
- **Code workspace** — the repo holding the code being built. Engineers work in **isolated worktrees** and merge back rebase-first, because the codebase may have concurrent work.

How to create a worktree for *your* code repo isn't hardcoded — at the start of each version a recon step writes a **`setup-playbook.md`** describing exactly how to spin one up for this repo (branch base, copying `.env`/gitignored files, installing deps, running gates, known gotchas), confirmed with you and improved by agents as they learn.

## Specs Directory Convention

```
specs/
├── spec.md                     # Project specification (from /ideate)
├── architecture.md             # Implementation approach (from /architect)
├── roadmap.md                  # Version progression (from /plan)
├── v0.1-short-name.md          # Version specs (from /plan)
├── v0.2-short-name.md
├── v0.1-short-name/            # Per-version folders (from /orchestrate)
│   ├── architecture.md         # Version architecture + Definition of Done (from /architect-version)
│   ├── setup-playbook.md       # How to spin up a code worktree for this repo (PREP)
│   ├── context.md              # Shared version context engineers read (from /build-stories)
│   ├── stories.md              # Story index (from /build-stories)
│   ├── 010-story-slug.md       # Story files (self-contained)
│   ├── lessons.md              # PO-curated running session lessons
│   ├── logs/                   # Per-engineer running logs
│   │   └── engineer-1.md
│   └── qa/                     # Validation (from /validate-execution)
│       ├── dod-audit.md        # Independent DoD gate verdict (from auditor)
│       ├── specs.md
│       └── 010-spec-name.md
└── ...
```

The `specs/` directory lives wherever the project lives — repo root, a subdirectory, or within a larger workspace.

## Installation

```
/plugin marketplace add nexaedge-marketplace --source github --repo nexaedge/nexaedge-marketplace
/plugin install spec-plugin@nexaedge-marketplace
```

## Optional Dependencies

- **`/interface-design` plugin** — Required for `designer` agent stories.
- **Chrome DevTools MCP** — Used by `/validate-execution` for browser-based validation.
