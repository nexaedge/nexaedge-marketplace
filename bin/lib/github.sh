#!/usr/bin/env bash
# Shared GitHub API helpers for marketplace scripts

# Build a contents API URL, appending ?ref= if a ref is provided.
_gh_contents_url() {
  local owner="$1" repo="$2" path="$3" ref="${4:-}"
  local url="repos/$owner/$repo/contents/$path"
  [[ -n "$ref" ]] && url="$url?ref=$ref"
  echo "$url"
}

gh_file_exists() {
  local url
  url=$(_gh_contents_url "$@")
  gh api "$url" --jq '.name' &>/dev/null
}

gh_file_content() {
  local url
  url=$(_gh_contents_url "$@")
  gh api "$url" --jq '.content' | base64 -d
}

gh_list_dir() {
  local url
  url=$(_gh_contents_url "$@")
  gh api "$url" --jq '.[] | "\(.type)\t\(.path)\t\(.name)"' 2>/dev/null
}

gh_download_file() {
  local owner="$1" repo="$2" remote_path="$3" local_path="$4" ref="${5:-}"
  mkdir -p "$(dirname "$local_path")"
  gh_file_content "$owner" "$repo" "$remote_path" "$ref" > "$local_path"
}

gh_download_dir() {
  local owner="$1" repo="$2" remote_dir="$3" local_dir="$4" ref="${5:-}"
  mkdir -p "$local_dir"

  while IFS=$'\t' read -r type path name; do
    [[ -z "$type" ]] && continue
    if [[ "$type" == "file" ]]; then
      gh_download_file "$owner" "$repo" "$path" "$local_dir/$name" "$ref"
    elif [[ "$type" == "dir" ]]; then
      gh_download_dir "$owner" "$repo" "$path" "$local_dir/$name" "$ref"
    fi
  done < <(gh_list_dir "$owner" "$repo" "$remote_dir" "$ref")
}

gh_resolve_sha() {
  local owner="$1" repo="$2" ref="${3:-}"
  if [[ -z "$ref" ]]; then
    ref=$(gh api "repos/$owner/$repo" --jq '.default_branch')
  fi
  gh api "repos/$owner/$repo/commits/$ref" --jq '.sha'
}

# Extract owner/repo from a GitHub URL
gh_parse_repo_url() {
  local url="$1"
  if [[ "$url" =~ github\.com/([^/]+)/([^/]+) ]]; then
    echo "${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
  fi
}

# Get the latest commit SHA that touched a specific path
gh_latest_commit_for_path() {
  local owner="$1" repo="$2" path="$3"
  local default_branch
  default_branch=$(gh api "repos/$owner/$repo" --jq '.default_branch')
  gh api "repos/$owner/$repo/commits?sha=$default_branch&path=$path&per_page=1" --jq '.[0].sha'
}
