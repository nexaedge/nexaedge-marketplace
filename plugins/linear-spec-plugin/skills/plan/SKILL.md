---
name: plan
description: "Design an evolutionary delivery roadmap by creating a Linear initiative (where applicable), deliverable projects, and one issue per spec. Adapts to project type — code releases, consulting milestones, research phases. Use after /ideate and /architect."
argument-hint: "[project briefing path or Linear URL of an existing project/initiative]"
---

Your task: design an evolutionary delivery roadmap by working with the user to decide what gets done first, what comes next, and what "done" looks like for each spec — and persist the structure to **Linear** (initiative, projects, spec issues).

## Linear contract

Scripts live in `${CLAUDE_PLUGIN_DIR}/scripts/linear/` and read `LINEAR_API_KEY` from env. If it isn't set, fetch it from 1Password: `export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"`.

The shape created in Linear (engagement example):
```
Team           DIN
└─ Initiative  OS-002 (Advisor OS)            ← created by this skill if missing
   └─ Project  OS-002 / 02 API Implementation ← deliverable; one project per deliverable
      └─ Issue Spec v0.3 — short name        ← one issue per spec, label type/spec
```

For ventures/studio projects there is no initiative — just project + spec issues.

## Philosophy

You are a project manager. Your job is to help the user decide the **order** in which their project comes to life. Each spec is defined by what it delivers — not by what gets built internally.

- **Every spec delivers something tangible.** Even the first spec produces one real outcome.
- **The user decides priority.** You propose, they choose. Never assume what matters most.
- **Specs describe outcomes, not tasks.** Focus on what's different after each spec ships.
- **Simple before complete.** The first version of any capability is the simplest version that works.

## Phase 0 — Resolve the target & detect re-planning

The argument can be:

- Path to a project briefing on disk.
- A Linear project URL (existing deliverable to extend).
- A Linear initiative URL (existing OS to add deliverables under).
- A free-text query — search via `search.js --type project` or `--type initiative` and pick.

Resolve to one of:
- `team_key` (e.g. `DIN`, `NEX`, `STU`, `JAI`) — required.
- Optional `initiative_id` — set when this is OS-level work; absent for ventures/studio.
- Optional set of existing `project_id`s — populated if some deliverables already exist.

If a Linear initiative or any matching project already has spec issues, this is **re-planning**. Read existing structure with:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/get-project.js" "<project-id>" --with-issues --with-documents
```

Ask via `AskUserQuestion`:
- **Change scope or priorities** — Reorder/repurpose existing spec issues, move them between projects.
- **Expand the project** — Add new specs/deliverables.

Plan the diff against existing Linear state. Never recreate issues that already exist; update or skip.

## Phase 1 — Load Knowledge-Base Context

1. **Find the project briefing on disk.** Check the path provided, the project's Linear description (`Context: ...`), and the surrounding folder.
2. Read the architecture (Linear Project Document `Architecture` on the deliverable project, or the project briefing if architecture has not been written yet).
3. Read the briefing's project context — know the project type and code repository path (if separate).
4. Note the team key. If unknown, ask the user.

## Phase 2 — Identify the Core

Start from the briefing/architecture and ask the user to find the core.

**Ask via `AskUserQuestion`:** "Looking at your project, what is the ONE thing this must deliver? If it only did this one thing, would it still be worth doing?"

This becomes V0.1 — the minimum viable spec.

## Phase 3 — Build the Spec Sequence

Work with the user to decide what goes into each spec.

### Step 1: List the Deliverables

From the briefing, extract every distinct outcome the project delivers. Present them as a flat list.

Adapt the framing to the project type:

*Code projects:*
- "User can do X"
- "System supports Y"
- "Z is configurable"

*Business/consulting projects:*
- "Client receives X"
- "Analysis of Y is complete"
- "Decision on Z is documented"

*Research projects:*
- "Question X is answered"
- "Data on Y is collected and analyzed"
- "Report on Z is delivered"

### Step 2: Define V0.1

Given the core from Phase 2, ask what's essential for the first spec vs. what can wait.

### Step 3: Layer Remaining Deliverables

After V0.1, present remaining deliverables and ask the user to prioritize into subsequent specs.

For each spec, challenge:
- "Is this spec doing too much? Should we split it?"
- "This deliverable has a simple version and a full version. Ship simple now?"
- "These two deliverables are independent. Same spec or separate?"

### Step 4: Define the V1.0 Milestone

**Ask:** "Which spec is your V1.0 — the first version that's 'complete enough' to present, ship, or hand off?"

### Version Numbering

- **V0.x** (0.1, 0.2, ...) — Development versions. Each adds capability. May have rough edges.
- **V1.0** — First complete version. Ready for its audience.
- **V1.x** (1.1, 1.2, ...) — Post-release enhancements.

## Phase 4 — Materialize in Linear

For each new structural element, run scripts. Show the user the plan and confirm before writing.

### 4a. Initiative (engagements only)

If `initiative_id` is unset and the project type is engagement-with-OS, create the initiative:

```bash
echo "<one-paragraph initiative description with second-brain Context: line>" | \
  node "${CLAUDE_PLUGIN_DIR}/scripts/linear/create-initiative.js" --name "<OS-XXX — Title>"
```

Capture the returned `id` as `initiative_id`. Skip for ventures/studio.

### 4b. Deliverable projects

For each deliverable identified in Phase 3 that doesn't have a Linear project yet:

```bash
echo "Context: <path-to-briefing-on-disk>" | \
  node "${CLAUDE_PLUGIN_DIR}/scripts/linear/create-project.js" \
    --team "<team-key>" \
    --name "<deliverable name>" \
    ${initiative_id:+--initiative "$initiative_id"}
```

Each project description starts with the second-brain `Context:` line so the back-link is permanent.

For ventures/studio, the project itself plays the deliverable role — usually one project per project.

### 4c. Spec issues

For each spec V0.1, V0.2, ..., create an issue inside its target deliverable project. Body of the issue is the spec body (see template below). Use the `type/spec` label — the script auto-creates it if missing in the team:

```bash
cat <<'MD' | node "${CLAUDE_PLUGIN_DIR}/scripts/linear/create-issue.js" \
  --project "<project-id>" \
  --team "<team-key>" \
  --title "Spec vX.Y — <short name>" \
  --label "type/spec" \
  --state "Backlog"
# VX.Y: Spec Title
... (spec body, see template below) ...
MD
```

Capture each returned `identifier` (e.g. `DIN-150`) — these are how the user/orchestrator addresses specs from now on.

### Spec body template

Write the issue description in this shape:

```markdown
> Builds on: [VX.Y-1 — Title](<previous spec issue URL>) (or "New project" for V0.1).
> Next: [VX.Y+1 — Title](<next spec issue URL>) — fill after sibling specs are created.

## What's New

One paragraph: what changes after this spec ships. Focus on outcomes — what's different now.

## Demo

Concrete example of the spec's output.

For code: exact commands, inputs, expected outputs.
For business: what the deliverable looks like, key content.
For research: what the findings show, how they're presented.

## Capabilities

### Delivered in this spec:
- (bulleted list of tangible outcomes)

### Simplified in this spec (improved later):
- (things that work but in a limited way)

### Not yet available:
- (explicit list of what's deferred)

## Definition of Done

Checklist of concrete, verifiable conditions.

- [ ] Outcome X is delivered and verified
- [ ] Stakeholder Y has reviewed Z
- [ ] (etc.)

## Open Questions

- Decisions that may need to be made during implementation
```

After every spec issue is created, do a second pass to add the "Next" link in each one's description (`set-issue-description.js` with the updated body).

### Writing Principles

- **Each spec body is readable standalone.**
- **Demo is mandatory.** If you can't show a concrete example, the scope is unclear.
- **Definition of Done is the contract.** The orchestrator uses this to know when a spec is shipped.
- **No implementation details.** That's for `/architect-version` and execution.

## Phase 5 — Roadmap reflection (knowledge base)

Linear is now the source of truth for the spec sequence — so there is no `roadmap.md` to write. Instead, append a "Linear roadmap" section to the project briefing on disk (or its appropriate quick-links section):

```markdown
## Linear

- **Initiative:** [<OS-XXX>](<initiative URL>)  *(only for engagements)*
- **Deliverables:**
  - [<deliverable name>](<project URL>)
- **Specs:**
  - V0.1 — [<short name>](<DIN-XXX URL>) — Backlog
  - V0.2 — ...
```

Confirm the diff with the user before editing the briefing.

## Phase 6 — Final Review

Present a summary:
- Initiative URL (if created)
- Deliverable project URLs
- Spec issue identifiers V0.1 → V1.0+
- Any specs that feel uncertain or risky
- Suggested next step: "Run `/orchestrate <DIN-XXX>` to execute each spec in order."
