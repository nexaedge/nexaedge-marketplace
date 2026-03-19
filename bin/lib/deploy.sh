#!/usr/bin/env bash
# Git commit, push, CI wait, and plugin update helpers.
# Expects MARKETPLACE_ROOT to be set by the caller.

# Wait for any in-flight CI runs to finish, then pull latest.
sync_with_ci() {
  cd "$MARKETPLACE_ROOT"

  echo "→ Waiting for CI to be idle..."
  local run_id
  run_id=$(gh run list --workflow=bump-version.yml --branch=main --limit=1 \
    --status in_progress --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)

  if [[ -n "$run_id" ]]; then
    gh run watch "$run_id" --exit-status || echo "⚠ CI run failed or was skipped"
  fi

  # Also check for queued runs
  run_id=$(gh run list --workflow=bump-version.yml --branch=main --limit=1 \
    --status queued --json databaseId --jq '.[0].databaseId' 2>/dev/null || true)

  if [[ -n "$run_id" ]]; then
    gh run watch "$run_id" --exit-status || echo "⚠ CI run failed or was skipped"
  fi

  echo "→ Pulling latest..."
  git pull --rebase
}

# Stage files, commit, and push to main.
commit_and_push() {
  local message="$1"
  shift
  local files=("$@")

  cd "$MARKETPLACE_ROOT"

  for f in "${files[@]}"; do
    git add "$f"
  done

  git commit -m "$message"

  echo "→ Pushing to main..."
  git push
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

# Full deploy pipeline: sync, commit, push, wait for bump, update local.
deploy() {
  local message="$1"
  shift
  local files=("$@")

  sync_with_ci
  commit_and_push "$message" "${files[@]}"
  wait_for_bump
  update_local_plugin
}
