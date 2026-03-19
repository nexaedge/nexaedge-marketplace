#!/usr/bin/env bash
# Marketplace and plugin management helpers.
# Expects MARKETPLACE_ROOT and MARKETPLACE_JSON to be set by the caller.
# Expects lib/github.sh to be sourced before this file.

# --- URL parsing ---

# Parse a GitHub or skills.sh URL into components. Sets: GH_OWNER, GH_REPO, GH_REF, GH_SUBPATH.
# Supports:
#   https://github.com/owner/repo
#   https://github.com/owner/repo/tree/branch
#   https://github.com/owner/repo/tree/branch/path
#   https://skills.sh/owner/repo/skill-name
parse_github_url() {
  local url="${1%/}"  # strip trailing slash

  # skills.sh URL → maps to github.com owner/repo with skills/<skill-name> subpath
  if [[ "$url" =~ ^https://skills\.sh/([^/]+)/([^/]+)/([^/]+)$ ]]; then
    GH_OWNER="${BASH_REMATCH[1]}"
    GH_REPO="${BASH_REMATCH[2]}"
    GH_REF=""
    GH_SUBPATH="skills/${BASH_REMATCH[3]}"
  elif [[ "$url" =~ ^https://github\.com/([^/]+)/([^/]+)(/tree/([^/]+)(/(.+))?)?$ ]]; then
    GH_OWNER="${BASH_REMATCH[1]}"
    GH_REPO="${BASH_REMATCH[2]%.git}"
    GH_REF="${BASH_REMATCH[4]:-}"
    GH_SUBPATH="${BASH_REMATCH[6]:-}"
  else
    echo "Error: URL must be a GitHub or skills.sh URL"
    return 1
  fi
}

# --- Marketplace JSON operations ---

# Check if a plugin name exists in marketplace.json.
plugin_exists() {
  local name="$1"
  jq -e --arg n "$name" '.plugins[] | select(.name == $n)' "$MARKETPLACE_JSON" &>/dev/null
}

# Add a plugin entry to marketplace.json. Returns 1 if already exists.
add_plugin_entry() {
  local name="$1"
  local source_json="$2"

  if plugin_exists "$name"; then
    echo "  ⚠ Plugin '$name' already exists in marketplace, skipping"
    return 1
  fi

  local entry
  entry=$(jq -n --arg n "$name" --argjson s "$source_json" '{name: $n, source: $s}')
  jq --argjson entry "$entry" '.plugins += [$entry]' "$MARKETPLACE_JSON" > "$MARKETPLACE_JSON.tmp"
  mv "$MARKETPLACE_JSON.tmp" "$MARKETPLACE_JSON"
  echo "  ✓ Added plugin '$name' to marketplace"
}

# Remove a plugin entry from marketplace.json. Returns 1 if not found.
remove_plugin_entry() {
  local name="$1"

  if ! plugin_exists "$name"; then
    echo "  ⚠ Plugin '$name' not found in marketplace"
    return 1
  fi

  jq --arg n "$name" '.plugins = [.plugins[] | select(.name != $n)]' \
    "$MARKETPLACE_JSON" > "$MARKETPLACE_JSON.tmp"
  mv "$MARKETPLACE_JSON.tmp" "$MARKETPLACE_JSON"
  echo "  ✓ Removed plugin '$name' from marketplace"
}

# Check if a plugin is local (has files in plugins/ directory).
is_local_plugin() {
  local name="$1"
  [[ -d "$MARKETPLACE_ROOT/plugins/$name" ]]
}

# Remove a local plugin directory entirely.
remove_local_plugin() {
  local name="$1"
  local plugin_dir="$MARKETPLACE_ROOT/plugins/$name"

  if [[ ! -d "$plugin_dir" ]]; then
    return 1
  fi

  rm -rf "$plugin_dir"
  echo "  ✓ Deleted plugins/$name/"
}

# Remove a single skill from a local plugin. If it was the last skill, remove the plugin.
# Returns the plugin name via REMOVED_PLUGIN if the whole plugin was cleaned up.
remove_local_skill() {
  local plugin_name="$1"
  local skill_name="$2"

  local skill_dir="$MARKETPLACE_ROOT/plugins/$plugin_name/skills/$skill_name"

  if [[ ! -d "$skill_dir" ]]; then
    echo "  ⚠ Skill '$skill_name' not found in plugin '$plugin_name'"
    return 1
  fi

  rm -rf "$skill_dir"
  echo "  ✓ Deleted plugins/$plugin_name/skills/$skill_name/"

  # Check if the plugin has any remaining skills
  local remaining
  remaining=$(find "$MARKETPLACE_ROOT/plugins/$plugin_name/skills" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)

  if [[ "$remaining" -eq 0 ]]; then
    echo "  → No skills remaining in '$plugin_name', removing plugin..."
    remove_local_plugin "$plugin_name"
    remove_plugin_entry "$plugin_name"
    REMOVED_PLUGIN="$plugin_name"
  fi
}

# Build a git-subdir source JSON, omitting ref if it matches the default branch.
build_gitsubdir_source() {
  local owner="$1" repo="$2" path="$3" ref="${4:-}"

  local json
  local full_url="https://github.com/$owner/$repo.git"
  json=$(jq -n --arg url "$full_url" --arg path "$path" \
    '{source: "git-subdir", url: $url, path: $path}')

  if [[ -n "$ref" ]]; then
    local default_branch
    default_branch=$(gh api "repos/$owner/$repo" --jq '.default_branch')
    if [[ "$ref" != "$default_branch" ]]; then
      json=$(echo "$json" | jq --arg ref "$ref" '. + {ref: $ref}')
    fi
  fi

  echo "$json"
}

# --- Local plugin scaffolding ---

# Ensure a local plugin directory exists with a valid plugin.json.
# Creates the scaffold if missing. No-op if already present.
ensure_local_plugin() {
  local plugin_name="$1"
  local author_gh_user="${2:-}"

  local plugin_dir="$MARKETPLACE_ROOT/plugins/$plugin_name"

  if [[ -f "$plugin_dir/.claude-plugin/plugin.json" ]]; then
    return 0
  fi

  echo "  → Creating new local plugin '$plugin_name'..."
  mkdir -p "$plugin_dir/.claude-plugin"

  local author_name
  if [[ -n "$author_gh_user" ]]; then
    author_name=$(gh api "users/$author_gh_user" --jq '.name // .login' 2>/dev/null || echo "$author_gh_user")
  else
    author_name="unknown"
  fi

  jq -n \
    --arg name "$plugin_name" \
    --arg desc "Vendored skills from external repositories" \
    --arg author "$author_name" \
    --arg author_url "https://github.com/${author_gh_user:-unknown}" \
    '{
      name: $name,
      version: "v1",
      description: $desc,
      author: { name: $author, url: $author_url }
    }' > "$plugin_dir/.claude-plugin/plugin.json"
}

# --- Skill vendoring ---

# Write an .upstream.json file for a vendored skill.
write_upstream_json() {
  local target_file="$1"
  local repo_url="$2"
  local remote_path="$3"
  local commit_sha="$4"

  jq -n \
    --arg repo "$repo_url" \
    --arg path "$remote_path" \
    --arg commit "$commit_sha" \
    --arg vendored_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{repository: $repo, path: $path, commit: $commit, vendored_at: $vendored_at}' \
    > "$target_file"
}

# Download a remote skill directory into a local plugin, pinned to a commit.
# Returns 1 if the skill already exists locally.
vendor_skill() {
  local owner="$1"
  local repo="$2"
  local remote_skill_dir="$3"
  local skill_name="$4"
  local plugin_name="$5"
  local commit_sha="$6"

  local skill_local_dir="$MARKETPLACE_ROOT/plugins/$plugin_name/skills/$skill_name"

  if [[ -d "$skill_local_dir" ]]; then
    echo "  ⚠ Skill '$skill_name' already exists in plugin '$plugin_name', skipping"
    return 1
  fi

  ensure_local_plugin "$plugin_name" "$owner"

  mkdir -p "$skill_local_dir"
  echo "  → Downloading skill files from $remote_skill_dir..."
  gh_download_dir "$owner" "$repo" "$remote_skill_dir" "$skill_local_dir" "$commit_sha"

  write_upstream_json "$skill_local_dir/.upstream.json" \
    "https://github.com/$owner/$repo" "$remote_skill_dir" "$commit_sha"

  echo "  ✓ Vendored skill '$skill_name' into plugins/$plugin_name/"
}

# Re-download a vendored skill from a newer upstream commit.
update_skill() {
  local skill_local_dir="$1"
  local owner="$2"
  local repo="$3"
  local remote_path="$4"
  local new_commit="$5"
  local repo_url="$6"

  # Remove old skill files (keep directory structure)
  find "$skill_local_dir" -type f ! -name '.upstream.json' -delete
  find "$skill_local_dir" -type d -empty -delete 2>/dev/null || true

  echo "    → Downloading updated files..."
  gh_download_dir "$owner" "$repo" "$remote_path" "$skill_local_dir" "$new_commit"

  write_upstream_json "$skill_local_dir/.upstream.json" \
    "$repo_url" "$remote_path" "$new_commit"

  echo "    ✓ Updated to ${new_commit:0:12}"
}
