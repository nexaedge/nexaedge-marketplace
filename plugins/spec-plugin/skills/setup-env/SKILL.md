---
name: setup-env
description: "Bring a fresh worktree/checkout to a runnable state — verify base HEAD, copy gitignored files (.env), allocate per-agent DB/test env, install deps, run the smoke gate. Deterministic, mechanical. Reports a single ready/blocked verdict."
argument-hint: "[worktree path + base SHA]"
allowed-tools: Read, Glob, Grep, Bash
context: fork
agent: Explore
effort: low
---

Run this to make a fresh worktree actually runnable, the same way every time, so no engineer or QA agent has to rediscover the setup dance. This is the single most-repeated waste across past runs (manual `.env` copies, stale HEAD, per-agent DB collisions). Execute it deterministically.

This skill runs in an isolated forked Explore child and returns only its tight conclusion — so the caller's context stays clean.

## Source of truth: the setup-playbook

If the caller points you at a **`setup-playbook.md`** (e.g. `specs/<version>/setup-playbook.md`), it is authoritative — follow it exactly. If you discover a step it's missing, **append the fix to the playbook** so the next agent doesn't rediscover it. If there's no playbook, run the generic checklist below and **write what worked into a playbook** for reuse.

**Fix-forward on worktree-removal blockers.** When you (or an engineer) hit an untracked-artifact directory that blocks `git worktree remove` (a test/coverage/temp dir a tool created), **append it to the env definition** — add it to the worktree `.gitignore` and the setup-playbook — so the next agent doesn't rediscover it. Same discipline as appending a missing step to the playbook.

## Checklist

1. **Base HEAD is correct.** Confirm the worktree is rooted at the expected base commit, not a stale one (a recurring failure). If the caller gave an expected SHA, verify `git rev-parse HEAD` matches; if it's behind, `git reset --hard <base>` (worktree only) or report. Your CWD is not the worktree — run git against it with `git -C <worktree> …` and prefix other commands with `cd <worktree> && …`; CWD resets between Bash calls (see [references/toolkit.md](../references/toolkit.md) → "Code-workspace facts"). For a local integration checkout with no remote, don't `git pull`; verify the expected commit with `git -C <worktree> log` per the setup-playbook. **In the playbook's reusable worktree-creation command, base the worktree on the branch ref `<code_branch>` (`git worktree add <path> -b <story-branch> <code_branch>`), never a frozen commit SHA** — the playbook is reused across stories as the branch advances, so a pinned SHA becomes stale.
2. **Gitignored files (only what the repo actually reads).** Worktrees don't inherit gitignored files — but copy only what THIS repo genuinely needs, detected from the repo (an `.env.example`, config that loads env, fixtures referenced by tests). **A library/SDK usually needs NONE — do not copy or invent a `.env` it doesn't use.** Don't copy `.tool-versions` either: a worktree of the repo already has it (it's tracked). For an app that does read `.env`, copy `.env`/`.env.local`/`.env.test`/credentials from the main checkout.
   - Confirm the worktree's `.gitignore` excludes test/coverage output dirs (`coverage/`, `.pytest_cache/`, `tmp/`). Tools like SimpleCov leave untracked artifacts there that otherwise block `git worktree remove`. Add any missing entries.
3. **Per-agent isolation for parallel runs.** Avoid collisions between sibling worktrees:
   - DB: allocate a unique database / `TEST_ENV_NUMBER` (e.g. `dinie_test3`) and create/load schema (`bin/rails db:create db:schema:load`, or the project's equivalent).
   - Tooling config: set `root: true` (eslint/jest) if a parent config leaks in. Tool versions resolve via asdf automatically (`.tool-versions`); if a command still hits the wrong version, the worktree is missing a `.tool-versions` or the runtime isn't installed — report that, don't paper over it.
4. **Install dependencies** for THIS worktree (`node_modules`/gems aren't inherited): `bun install --frozen-lockfile` / `pnpm install` / `npm ci` / `bundle install` — use the project's lockfile-respecting command. Unset corporate proxies if a hermetic install needs it.
5. **Smoke gate.** Run the project's `scripts/check-env.sh` if present, or the cheapest "is it alive" command (build, `--version`, health endpoint). 

## Output

```
ENV: ready | blocked
WORKTREE: <path>  @ <sha>
DID: <one line per step actually performed>
PLAYBOOK: <updated | created | followed as-is>
BLOCKED ON: <only if blocked — exactly what's wrong so an engineer can fix it>
```

Mechanical only — do not write application code or fix bugs. If a step fails for a non-mechanical reason (real code error, missing service), STOP and report `blocked` with the exact error.
