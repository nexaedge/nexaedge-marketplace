---
name: architect
description: "Create the project-level implementation approach as a Linear Project Document. For code projects: technology stack, schemas, API contracts, system design. For non-code projects: delivery approach, document structure, resource plan. Adapts based on the project spec. Use after /ideate."
argument-hint: "[Linear project ID, project name to search, or path to project briefing]"
---

Your task: produce a comprehensive implementation approach document and write it to the **deliverable's Linear project as a Project Document titled `Architecture`**. This is the PROJECT-LEVEL architecture — it covers decisions shared across ALL specs/versions in this project. Individual specs get their own architecture documents via `/architect-version`.

## Linear contract

This skill writes to Linear via the bundled scripts in `${CLAUDE_PLUGIN_DIR}/scripts/linear/`. They require `LINEAR_API_KEY` in the environment. If it isn't set, fetch it from 1Password before running scripts: `export LINEAR_API_KEY="$(op read op://Environments/Linear/credential)"`.

## Phase 0 — Resolve the target Linear project

The argument is one of:

- **A Linear project URL or UUID** — use directly.
- **A free-text query** — call `search.js` and present the top matches via `AskUserQuestion`.
- **A path to a project briefing on disk** (or no argument, with a briefing in CWD) — read the briefing's frontmatter for a Linear URL; if none, treat the briefing's title or folder name as a search term.

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/search.js" --type project --query "<text>" --limit 5
```

Render results as `<name> — <team keys> — <url>` and let the user pick. If there are no matches, ask the user to provide the URL or run `/plan` first to create the project. **Never guess — keep asking until the user confirms.**

Once resolved, fetch the project and its existing documents:

```bash
node "${CLAUDE_PLUGIN_DIR}/scripts/linear/get-project.js" "<project-id>" --with-documents --with-issues
```

Record `project_id`, `project_url`, and check whether a document titled `Architecture` already exists. If yes, ask via `AskUserQuestion` whether to redo or revise.

## Phase 1 — Load Knowledge-Base Context

The reasoning/context lives on disk:

1. **Read the project briefing** if accessible (path provided or referenced in the Linear project description's `Context:` line).
2. Look for surrounding files in the same folder: research notes, decisions, comms — anything that informs the architecture.
3. From the briefing's frontmatter or content, identify the **project type** (code, business/consulting, research, hybrid).
4. If the briefing is missing, ask the user to point at one or run `/ideate` first.

The briefing's project context (type, language, workspace, code repository) tells you what kind of architecture this needs.

## Phase 2 — Identify Decision Points

Catalog every foundational decision needed. The categories depend on the project type.

### For Code / Product Projects

- **Language & Runtime** — Programming language(s), version requirements, package management
- **Web Framework** — Backend API framework, frontend framework
- **Data Storage** — Primary database(s), caches, state storage
- **Task Processing** — Queue system, worker architecture, job patterns
- **LLM & AI** — LLM abstraction, embedding strategy, provider config (if applicable)
- **External Services** — Third-party APIs, integrations
- **Pipeline Orchestration** — How processing steps are defined and coordinated
- **State Management** — What's tracked where, incremental processing
- **Real-time Communication** — Live updates, webhooks, SSE
- **Observability** — Tracing, metrics, logging, cost tracking
- **Frontend** — UI framework, component library, data visualization
- **Configuration** — Settings management (files, env vars, runtime)
- **Project Structure** — Directory layout, module organization
- **Setup & Deployment** — How to install dependencies, configure, start, and deploy

Not every project needs all categories. Skip what's irrelevant.

### For Business / Consulting Projects

- **Delivery Structure** — What gets delivered, in what order, in what format
- **Document Organization** — How deliverables are structured and where they live
- **Tools & Resources** — What tools, data sources, or reference materials are needed
- **Stakeholder Communication** — How updates, reviews, and approvals flow
- **Quality Gates** — What review/approval steps exist before delivery
- **Dependencies** — External inputs, access, or decisions needed
- **Risk Mitigation** — How identified risks are managed

### For Research / Exploration Projects

- **Research Methodology** — How investigation will be conducted
- **Source Strategy** — What sources to use, how to evaluate them
- **Output Format** — Structure of the research output
- **Analysis Framework** — How findings will be organized and evaluated
- **Tool Selection** — Research tools, data collection methods
- **Scope Management** — How to handle scope expansion during research

### For Hybrid Projects

Mix categories from the above as appropriate.

## Phase 3 — Consult User

For each major decision, use `AskUserQuestion` to present:

- The decision to make
- 2-4 concrete options with trade-offs (include a comparison table when useful)
- Your recommendation and why

Group related decisions (2-3 per round) to keep the conversation efficient. Iterate until all major decisions are resolved.

## Phase 4 — Write Architecture Document to Linear

Compose the architecture content as Markdown using the section template that fits the project type (see below), then write it to Linear:

```bash
# New document
cat <<'MD' | node "${CLAUDE_PLUGIN_DIR}/scripts/linear/create-document.js" \
  --project "<project-id>" \
  --title "Architecture"
<full markdown content>
MD

# Or, if revising an existing one (you have its <doc-id> from get-project.js):
cat <<'MD' | node "${CLAUDE_PLUGIN_DIR}/scripts/linear/update-document.js" "<doc-id>"
<full markdown content>
MD
```

Use a tempfile via `Write` to a `/tmp/<project-name>/architecture.md` location and pipe it to the script — this keeps the prompt clean and lets you re-run on failure.

### For Code Projects — sections to include

1. **Technology Stack** — Table: Layer, Technology, Rationale
2. **System Architecture** — Diagram (ASCII/mermaid) showing components and data flow
3. **Project Structure** — Full directory tree with annotations
4. **Configuration** — Config file format, environment variables
5. **API Routes** — Endpoints grouped by domain (method, path, description)
6. **Database Schemas** — Full schema definitions with comments
7. **Pipeline Architecture** — Job flow, queue patterns, step transitions
8. **State Management** — Data store responsibilities, incremental processing
9. **Observability** — Instrumentation strategy, metrics, cost tracking
10. **Key Design Decisions** — Table: Decision, Choice, Why
11. **Setup & Deployment** — Exact commands, environment setup, prerequisites
12. **Dependencies** — Explicit dependency lists with version constraints

### For Non-Code Projects — sections to include

1. **Delivery Approach** — How the project will be executed, what phases
2. **Deliverable Structure** — What gets produced, document templates, folder organization
3. **Tools & Resources** — What's needed, where to find it, access requirements
4. **Communication Plan** — How stakeholders stay informed, review cadence
5. **Quality Framework** — How deliverables are reviewed and validated
6. **Key Decisions** — Table: Decision, Choice, Why
7. **Risk Register** — Risk, Impact, Mitigation, Owner
8. **Dependencies & Prerequisites** — What's needed from outside the project

### Writing Principles

- **Show, don't tell.** Include actual schemas, config examples, code patterns, directory trees, document templates — not descriptions of them.
- **Rationale everywhere.** Every choice should have a "Why" connected to project constraints.
- **Concrete over abstract.** Show actual queries, actual configs, actual document outlines.
- **Diagrams for complex relationships.** Use mermaid for architecture, data flow, sequences. Linear renders mermaid in documents.

## Phase 5 — Cross-link with the knowledge base

If the project briefing on disk has a "Linear" or "Quick Links" section, append a link to the new Architecture document. If the project's Linear description does not start with `Context: <path-to-briefing>`, propose updating it via `set-project-description.js`. Confirm with the user before editing either side.

## Phase 6 — Consistency Check

Before finalizing, verify:
- Every success criterion from the briefing has a corresponding component in the architecture
- Every deliverable has a clear production path
- No component references something not described in the architecture
- The architecture matches the project type (don't describe API routes for a research project)

## Phase 7 — Final Review

Present a summary:
- Linear document URL (returned by `create-document.js`)
- Key decisions made and their rationale
- Any deferred decisions (and when they'll be resolved)
- Risks or concerns
- Suggested next step: "Run `/plan` to design the delivery roadmap, then `/orchestrate <DIN-XXX>` to execute each spec."

Ask for final sign-off.
