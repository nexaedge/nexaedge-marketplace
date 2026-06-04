---
name: build-stories
description: "Break down a single Linear spec issue into executable story sub-issues. Reads the spec body, the spec architecture document, and the deliverable architecture, then creates one ordered sub-issue per story under the spec issue. Adapts to project type. Use after /architect-version."
argument-hint: "[Linear spec identifier (e.g. DIN-142) or text to search for]"
---

Your task: break a spec into ordered stories sized for a single AI agent session, and create them as **sub-issues** under the spec issue in Linear.

## Linear contract

Scripts live in `${CLAUDE_PLUGIN_DIR}/scripts/linear/`. Required: `LINEAR_API_KEY`. If it isn't set, fetch it from 1Password: `export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"`.

Created shape:
```
Issue   Spec vX.Y — short name        (parent)
├─ Sub-issue   001 — engineer — ...
├─ Sub-issue   002 — designer — ...
└─ Sub-issue   003 — engineer — ...
```

The numeric prefix on the title (`NNN — agent — ...`) makes ordering and agent-type visible at a glance — Linear has no story-index document, the parent's child list is the index.

## Phase 0 — Resolve the spec issue

Argument is an identifier or free text. If text:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/search.js" --type issue --query "<text>" --label "type/spec" --limit 5
```

Then:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/resolve-spec.js" "<identifier>" --require-spec-label
```

Capture: `issue.id`, `issue.identifier`, `issue.description`, `project.id`, `team.key`, existing sub-issues.

If the spec issue already has sub-issues, ask via `AskUserQuestion`:
- Append new stories
- Replace (and confirm — sub-issues will not be deleted automatically; the agent will list them and the user decides which to close manually)
- Abort

## Phase 1 — Load Knowledge-Base & Architecture

1. **Read the spec body** (the issue description from `resolve-spec.js`). Pay special attention to **Definition of Done** — the final story or stories must directly satisfy it.
2. **Read the spec architecture document.** Find it in `project.documents` by title `Spec vX.Y — Architecture`. Use `list-documents.js --title-match` to confirm. Read its content.
3. **Read the deliverable architecture document** (`Architecture` on the same project) for cross-cutting decisions.
4. **Read the project briefing on disk** (path in the project's `Context:` line) for project type and code repository path.
5. Scan the existing workspace (and code repo if specified) to understand what's already built/written.

## Phase 2 — Decompose into Stories

Break the spec into stories following these principles:

### Sizing for AI Agents (NOT human teams)
- **Optimize for AI agent context window**: each story must be completable without overwhelming the agent
- A story that touches 15 files across 3 layers is **too broad**
- A story that creates one config file is **too narrow**
- Sweet spot: **one cohesive concern** per story

### Agent Assignment

Every story specifies its **agent** — the agent type that will execute it:

**For code projects:**
- **`engineer`** — Backend, data layer, API endpoints, integrations, tests, wiring UI. Runs `/execute-task`.
- **`designer`** — Visual UI creation: new pages, components, layouts, design system. Runs `/interface-design`.

**For non-code projects:**
- **`engineer`** — The default executor. Runs `/execute-task` for any deliverable type (documents, analyses, research outputs).

The orchestrator uses this field directly as `subagent_type` when spawning agents.

#### The Design → Engineer Pipeline (Code Projects Only)

For features with UI, use **paired stories**:
1. **Design story** (`agent: designer`) — Creates visual components/layouts
2. **Integration story** (`agent: engineer`) — Wires design into codebase

Not every UI story needs pairing. Use judgment.

### Testing in Stories (Code Projects)

Each engineer story must include testing acceptance criteria proportional to complexity:
- **Complex logic**: thorough unit tests
- **Key components**: at least one test pass
- **Simple glue**: no dedicated tests
- **Integration stories**: at least one integration test

Include a `## Testing Guidance` section in each code story.

### Verification in Stories (Non-Code Projects)

Each story should include clear acceptance criteria that can be verified by reading/reviewing the output:
- **Completeness**: does the deliverable cover everything specified?
- **Quality**: does it meet the standards described in the architecture?
- **Accuracy**: are facts, references, and claims correct?

### Ordering

- Foundation/prerequisite stories come first
- For code: data layer → API → UI
- Design stories before their integration stories
- Each story produces a **working increment**
- Reflect the order in the **numeric prefix** of every sub-issue title (`001 — ...`, `010 — ...`, `020 — ...`).

### Self-containment

- Include enough context in each story body that the executing agent doesn't need to read 10 other documents
- Inline the relevant architecture decisions

## Phase 3 — Show the user the plan

Before creating any sub-issues, present the proposed story list to the user as a numbered table (number, agent, title, depends-on). Iterate via `AskUserQuestion` until they approve.

## Phase 4 — Create Sub-Issues in Linear

For each approved story, create a sub-issue under the spec issue. Stage the body to `/tmp/linear-spec/<spec-id>/NNN-slug.md` and run:

```bash
cat /tmp/linear-spec/<spec-id>/NNN-slug.md | \
  node "${CLAUDE_PLUGIN_DIR}/scripts/linear/create-sub-issue.js" "<spec-identifier>" \
    --title "NNN — <agent> — <story title>" \
    --state "Backlog"
```

Story body template (sub-issue description):

```markdown
**Agent**: `engineer` | `designer`
**Spec**: <link to parent spec issue, e.g. DIN-142>

## Summary
One paragraph describing what this story delivers.

## Prerequisites
- What must exist before starting (prior story identifiers, inputs, access)

## Deliverables
- What exists after completion (new files, endpoints, documents, analyses)

## Acceptance Criteria
- [ ] Concrete, verifiable condition 1
- [ ] Concrete, verifiable condition 2

## Implementation Guidance
Specific guidance on how to produce the deliverable. For code: files to create/modify, patterns to follow. For non-code: sources to use, structure to follow, quality standards.

## Testing Guidance (code projects)
What to test, at what level, and any fixtures needed.

## Architecture Context
Inline the relevant decisions from the spec architecture so the executor doesn't need to cross-reference.

## References
- [Spec architecture document](<architecture doc URL>)
- Parent spec: <DIN-XXX>
```

Capture each created sub-issue's identifier and URL — return them as a list to the user.

## Phase 5 — Final Review

Present:
- Parent spec URL
- Created sub-issues (identifier, title, agent)
- Any uncertainty or risk
- Suggested next step: "Run `/orchestrate <spec-identifier>` to execute the spec, or `/execute-task <story-identifier>` for a single story."
