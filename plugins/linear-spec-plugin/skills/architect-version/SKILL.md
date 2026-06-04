---
name: architect-version
description: "Deep-dive architecture for a single spec. Reads the Linear spec issue, the deliverable's Architecture document, and adjacent spec issues, then writes the spec body to the issue description and creates a `Spec vX.Y — Architecture` Project Document. Use before /build-stories."
argument-hint: "[Linear identifier (e.g. DIN-142) or text to search for]"
---

Your task: produce a comprehensive architecture document for a single spec, write the spec body into the Linear issue description, and create the architecture as a separate Linear Project Document.

## Linear contract

Scripts live in `${CLAUDE_PLUGIN_DIR}/scripts/linear/`. They require `LINEAR_API_KEY`. If it isn't set, fetch it from 1Password: `export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"`.

Two artifacts are produced per spec:

- **Spec body** → Linear **issue description** (short, value-oriented).
- **Spec architecture** → Linear **Project Document** titled `Spec vX.Y — Architecture` on the same project (long, technical).

The issue description ends with a back-link to the architecture document (`appendArchitectureLink` convention in `lib/markdown.js`).

## Phase 0 — Resolve the spec issue

The argument is one of:

- A Linear identifier matching `^[A-Z]{2,5}-\d+$` (e.g. `DIN-142`) — use directly.
- Free text — call `search.js`:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/search.js" --type issue --query "<text>" --label "type/spec" --limit 5
```

Render results as `<identifier> · <title> · <project name>` in `AskUserQuestion`. Never guess — keep asking until the user picks one.

Then resolve full context:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/resolve-spec.js" "<identifier>" --require-spec-label
```

Capture: `issue.id`, `issue.identifier`, `issue.description`, `project.id`, `project.documents`, `team.key`, sibling sub-issues (none expected at this phase).

## Phase 1 — Load Knowledge-Base & Adjacent Specs

1. **Read the deliverable's Architecture document.** Look for it in `project.documents` by title `Architecture`. Read with `get-issue.js`/`list-documents.js` as needed (Linear renders content via the API — for this skill you can rely on what the resolve-spec response gave you, but if you need full content, `list-documents.js --title-match "^Architecture$"` returns the doc id).
2. **Read the project briefing on disk.** Path is in the Linear project's description (`Context: <path>`). The briefing reveals project type and code repository path.
3. **Read sibling spec issues** in the same project — list them via `get-project.js --with-issues` and skim their descriptions to understand prior and future scope.
4. **Read the current spec issue's description** (already returned by `resolve-spec.js`). If it's empty or marked draft, you'll generate it in Phase 4.
5. Check whether a Project Document `Spec vX.Y — Architecture` already exists for this issue — if yes, ask via `AskUserQuestion` whether to redo, revise, or abort.

## Phase 2 — Analyze

Identify all key decisions needed for this spec. Adapt categories to the project type.

### For Code Projects

- Technology choices (libraries, frameworks, tools)
- Data flow and data models
- API contracts (endpoints, request/response shapes)
- Component boundaries and responsibilities
- Integration points with prior and future specs
- Error handling, state management, performance
- Test strategy (see below)

### For Non-Code Projects

- Deliverable structure and format
- Research methodology or delivery approach for this spec specifically
- Input sources and dependencies
- Quality criteria and review process
- Stakeholder touchpoints in this spec
- Integration with prior deliverables

Pay special attention to **"Simplified in this spec"** from the spec body — architecture should match the simplified scope, not the full future state.

## Phase 3 — Consult User

Use `AskUserQuestion` for every significant decision point. Present:
- The decision to make
- 2-4 concrete options with trade-offs
- Your recommendation and why

Limit to 2-3 decisions per round. Iterate until resolved.

## Phase 4 — Generate or refine spec body, then write to Linear

If the issue description is empty/draft, generate the spec body using the template below. If it already has content, read it and update only what changed (keep what the user already approved).

Spec body template (Linear issue description):

```markdown
> Builds on: [VX.Y-1 — Title](<previous spec URL>) (or "New project").
> Next: [VX.Y+1 — Title](<next spec URL>).

## What's New
...
## Demo
...
## Capabilities
### Delivered in this spec:
### Simplified in this spec (improved later):
### Not yet available:
## Definition of Done
- [ ] ...
## Open Questions
- ...
```

Stage the body to `/tmp/linear-spec/<identifier>.body.md` and write:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/set-issue-description.js" "<identifier>" \
  < /tmp/linear-spec/<identifier>.body.md
```

(Don't append the architecture link yet — Phase 5 does that after creating the doc.)

## Phase 5 — Write the Spec Architecture Document

Compose the architecture content as Markdown using the section template that fits the project type, then create the Project Document:

```bash
cat /tmp/linear-spec/<identifier>.architecture.md | \
  node "${CLAUDE_PLUGIN_DIR}/scripts/linear/create-document.js" \
    --project "<project-id>" \
    --title "Spec vX.Y — Architecture"
```

(If revising an existing one, use `update-document.js <doc-id>` instead.)

Capture the returned `url`.

### For Code Projects — sections

1. **Overview** — What this spec delivers, scope boundaries
2. **Key Decisions** — Each decision with chosen option and rationale
3. **Data Model** — Schemas, types, database tables
4. **API Contracts** — Endpoints, request/response shapes, error codes
5. **Component Breakdown** — Each component: responsibility, inputs, outputs
6. **Integration Points** — Connections to existing and future work
7. **Test Strategy** — Testing approach by complexity tier:
   - Core/complex logic: thorough unit tests
   - Key components: at least one test pass
   - Simple glue: tested implicitly
   - Integration and E2E tests
   - Test infrastructure (fixtures, mocking)
8. **Flow Diagrams** — Mermaid diagrams for data flows, sequences
9. **State Machines** — Mermaid state diagrams for stateful processes
10. **Constraints & Assumptions**

### For Non-Code Projects — sections

1. **Overview** — What this spec delivers, scope boundaries
2. **Key Decisions** — Each decision with rationale
3. **Deliverable Specification** — Exact structure, format, and content outline for each deliverable
4. **Input Requirements** — What data, access, or prior work is needed
5. **Quality Criteria** — How each deliverable will be evaluated
6. **Stakeholder Review Plan** — Who reviews what, when
7. **Dependencies & Risks** — What could block or delay this spec
8. **Constraints & Assumptions**

### Diagram Requirements

Use mermaid for ALL diagrams (Linear renders mermaid in documents):
- `flowchart` for processes and relationships
- `sequenceDiagram` for interactions
- `erDiagram` for data models
- `stateDiagram-v2` for state machines

## Phase 6 — Append architecture link to issue description

Re-read the issue description (or use the body you staged in Phase 4) and append the architecture document link, then re-write the description:

```markdown
<!-- linear-spec-plugin:arch-link -->
**Architecture:** [Spec vX.Y — Architecture](<doc URL>)
```

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/set-issue-description.js" "<identifier>" \
  < /tmp/linear-spec/<identifier>.body.with-arch.md
```

The marker `<!-- linear-spec-plugin:arch-link -->` lets re-runs replace the link in place.

## Phase 7 — Final Review

Present a summary:
- Spec issue URL with the body written
- Architecture document URL
- Scope of decisions made
- Deferred decisions (and why)
- Key risks or open questions
- Ask for final sign-off
