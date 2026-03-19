#!/usr/bin/env bash
# Git commit, push, CI wait, and plugin update helpers.
# Expects MARKETPLACE_ROOT to be set by the caller.

# Wait for any in-flight or queued CI bump runs to finish.
wait_for_idle_ci() {
  echo "→ Waiting for CI to be idle..."

  for status in in_progress queued; do
    local run_id
    run_id=$(gh run list --workflow=bump-version.yml --branch=main --limit=1 \
      --status "$status" --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)

    if [[ -n "$run_id" ]]; then
      gh run watch "$run_id" --exit-status || echo "⚠ CI run failed or was skipped"
    fi
  done
}

# Stage and commit locally (does not push).
commit_local() {
  local message="$1"
  shift
  local files=("$@")

  cd "$MARKETPLACE_ROOT"

  for f in "${files[@]}"; do
    git add "$f"
  done

  git commit -m "$message"
}

# Wait for the bump-version CI workflow triggered by our push.
wait_for_bump() {
  echo "→ Waiting for CI bump-version workflow..."
  sleep 3

  local run_id
  run_id=$(gh run list --workflow=bump-version.yml --branch=main --limit=1 \
    --json databaseId --jq '.[0].databaseId')

  if [[ -n "$run_id" ]]; then
    gh run watch "$run_id" --exit-status || echo "⚠ CI run failed or was skipped (may be [skip-bump])"
  fi

  echo "→ Pulling CI bump commit..."
  git pull --rebase
}

# Update the locally installed marketplace plugin.
update_local_plugin() {
  echo "→ Updating marketplace plugin..."
  claude plugin update nexaedge-marketplace 2>/dev/null || true
}

# Full deploy pipeline:
#   1. Stage + commit locally
#   2. Wait for any in-flight CI to finish
#   3. Rebase on top of latest remote + push
#   4. Wait for our push's CI bump
#   5. Update local plugin
deploy() {
  local message="$1"
  shift
  local files=("$@")

  commit_local "$message" "${files[@]}"
  wait_for_idle_ci

  echo "→ Pulling latest..."
  git pull --rebase

  echo "→ Pushing to main..."
  git push

  wait_for_bump
  update_local_plugin
}
