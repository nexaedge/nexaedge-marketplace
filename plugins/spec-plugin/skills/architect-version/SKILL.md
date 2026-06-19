---
name: architect-version
description: "Deep-dive architecture for a single version. Reads the version spec, overall architecture, roadmap, and related versions, then produces a comprehensive architecture document with specific implementation choices. Adapts to project type. Use before /build-stories."
argument-hint: "[version, e.g. v0.1-core-push]"
---

Your task: produce a comprehensive architecture document for the given version that makes every important decision explicit, with rationale.

## Phase 1 — Load Context

1. **Locate specs.** If the orchestrator specified a specs location or specs repo in your prompt, use that path. Otherwise, **check CLAUDE.md (project + user) for a spec workspace mapping** (specs in a separate / mirrored repo) and use that mirrored path for the current project; only if none is declared, look for `specs/` in CWD.
2. Read the target version spec at `specs/<version>.md`
3. Read the overall architecture: `specs/architecture.md`
4. Read the roadmap: `specs/roadmap.md`
5. Read the project spec (find the main spec in `specs/`) — check **Project Context** for project type and code repository path
6. Skim other version specs (`specs/v*.md`) to understand prior and future versions
7. Check if the version folder already has files: `specs/<version>/`

## Phase 2 — Analyze

Identify all key decisions needed for this version. Adapt categories to the project type.

### For Code Projects

- Technology choices (libraries, frameworks, tools)
- Data flow and data models
- API contracts (endpoints, request/response shapes)
- Component boundaries and responsibilities
- Integration points with prior and future versions
- Error handling, state management, performance
- Test strategy (see below)

### For Non-Code Projects

- Deliverable structure and format
- Research methodology or delivery approach for this version specifically
- Input sources and dependencies
- Quality criteria and review process
- Stakeholder touchpoints in this version
- Integration with prior deliverables

Pay special attention to **"Simplified in this version"** from the version spec — architecture should match the simplified scope, not the full future version.

### Ground every sketch in reality (this is what eliminates fix cycles)

Do **not** write code sketches against assumed APIs. The biggest source of downstream rework is an architecture that references a method/field/endpoint that doesn't exist, or a transformation that silently changes a value. Before you commit a decision, verify it against the real code by running the primitive skills inline (you run at opus — the right tier for these), or dispatch the cheap mechanical `/verify-symbol` to the **intern**:

- **`/verify-symbol`** — for every external method/field/endpoint/flag your sketch relies on, confirm it exists and get its real signature (don't assume `partner.slug` or `CreditOffer.find_by_offer`).
- **`/trace-flow`** — for every cross-layer transformation in your design or DoD, trace the value end-to-end and note where its shape changes (the emit-symbol-`tr`-to-contract class of bug).

When the V0.4 architect did exactly this, the version passed QA 11/11 on the first try with zero fix cycles.

## Phase 3 — Consult User

Use AskUserQuestion for every significant decision point. Present:
- The decision to make
- 2-4 concrete options with trade-offs
- Your recommendation and why

Limit to 2-3 decisions per round. Iterate until resolved.

## Phase 4 — Write Architecture Doc

Write `specs/<version>/architecture.md`.

### The Definition of Done is your most scrutinized output

The architecture doc must contain an explicit **`## Definition of Done`** — concrete, testable acceptance criteria for this version, derived from (and sharpening) the version spec's high-level DoD. A **fresh, independent `auditor`** will gate this DoD before any story is built, so write it to survive that audit:

- **Assert behavior, not artifacts** — "produces correct output from any valid input," not "matches this frozen golden file / snapshot." A reproduction oracle passes when the code hardcodes the expected output.
- **Make each item falsifiable** — a concrete, observable way it could fail.
- **Make it react to change** — if the input/spec changed in a way this version handles, the DoD should notice.
- **Beat the trivial implementation** — if a fixture replayer, hardcoded lookup, or stub could pass an item, it's too weak. Strengthen it.

For non-code projects the same applies: criteria must assert the deliverable *does its job*, not merely that a file exists.

### Build & Packaging Order is a first-class output (don't make the PO discover it by probing)

The architecture has the facts (what files exist, what the toolchain is) but the **ordering implications** are usually left implicit, so build-stories and the PO rediscover them by trial. Make them explicit in a **`## Build & Packaging Order`** section:

- **Artifact co-location constraints** — "X must ship in the same increment as Y because Z evaluates Y at build/install time." (E.g. a version constant must co-ship with the manifest the packager evaluates at install; the package can't build until an entrypoint dir exists.)
- **DoD items blocked until a prerequisite artifact exists** — call out which DoD items can't even be attempted until an earlier artifact is in place.
- **A recommended DoD→increment ordering** — a concrete starting order for build-stories, mapping DoD items to the increment that first makes them satisfiable. This is a recommendation build-stories validates against the real toolchain, not a frozen plan.

This applies to non-code projects too: if a deliverable can only be produced once an upstream artifact exists, state the ordering.

### For Code Projects

1. **Overview** — What this version delivers, scope boundaries
2. **Key Decisions** — Each decision with chosen option and rationale
3. **Data Model** — Schemas, types, database tables
4. **API Contracts** — Endpoints, request/response shapes, error codes
5. **Component Breakdown** — Each component: responsibility, inputs, outputs
6. **Integration Points** — Connections to existing and future work
7. **Build & Packaging Order** — artifact co-location constraints, DoD items blocked until a prerequisite artifact exists, and a recommended DoD→increment ordering for build-stories (see callout above)
8. **Test Strategy** — Testing approach by complexity tier:
   - Core/complex logic: thorough unit tests
   - Key components: at least one test pass
   - Simple glue: tested implicitly
   - Integration and E2E tests
   - Test infrastructure (fixtures, mocking)
9. **Flow Diagrams** — Mermaid diagrams for data flows, sequences
10. **State Machines** — Mermaid state diagrams for stateful processes
11. **Definition of Done (testable)** — concrete, behavior-based, falsifiable acceptance criteria (see callout above; this is what the auditor gates)
12. **Constraints & Assumptions**

### For Non-Code Projects

1. **Overview** — What this version delivers, scope boundaries
2. **Key Decisions** — Each decision with rationale
3. **Deliverable Specification** — Exact structure, format, and content outline for each deliverable
4. **Input Requirements** — What data, access, or prior work is needed
5. **Quality Criteria** — How each deliverable will be evaluated
6. **Stakeholder Review Plan** — Who reviews what, when
7. **Definition of Done (testable)** — concrete, behavior-based criteria asserting each deliverable does its job (see callout above; this is what the auditor gates)
8. **Dependencies & Risks** — What could block or delay this version
9. **Constraints & Assumptions**

### Diagram Requirements (all projects)

Use mermaid for ALL diagrams:
- `flowchart` for processes and relationships
- `sequenceDiagram` for interactions
- `erDiagram` for data models
- `stateDiagram-v2` for state machines

## Phase 5 — Final Review

Present a summary:
- Scope of decisions made
- Deferred decisions (and why)
- Key risks or open questions
- The **Definition of Done** you wrote — flag that it goes to the independent auditor next

Report back to the team lead (write the doc; the lead commits it).

### DoD-gate loop

If the team lead returns **auditor findings**, the DoD measured the wrong thing somewhere. Revise the architecture/DoD to address **each finding specifically** — strengthen the items that a trivial implementation could have passed — write the update, and report back. A new fresh auditor re-gates each round; iterate until it passes.
