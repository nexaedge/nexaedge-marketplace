#!/usr/bin/env bash
# spec-plugin · PreToolUse(Bash) · WARN-ONLY
# Nudge agents to use the forked exploration primitives (/explore-conventions,
# /verify-symbol, /probe-contract, /trace-flow) instead of in-context
# grep-spelunking, which is the #1 source of context bloat / forced compaction.
#
# Contract: ALWAYS allows the command (never blocks). When the Bash command
# looks like genuine code *exploration*, it returns an allow + additionalContext
# the model sees on its next turn. Bulletproof: any parsing failure → silent allow.

command -v jq >/dev/null 2>&1 || exit 0
cmd="$(cat | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -z "$cmd" ] && exit 0

# Resolve the real verb: strip a leading `cd <path> &&` and any VAR=val prefixes.
probe="$cmd"
case "$probe" in cd[[:space:]]*"&&"*) probe="${probe#*&&}" ;; esac
probe="$(printf '%s' "$probe" | sed -E 's/^[[:space:]]*//; s/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)+//' 2>/dev/null)"
verb="$(printf '%s' "$probe" | awk '{print $1}' 2>/dev/null)"; verb="${verb##*/}"

# Only consider clear search/read tools.
case " grep rg ag ack cat head tail find fd " in
  *" $verb "*) ;;
  *) exit 0 ;;
esac

# Skip when it's clearly a gate / build / git / install pipeline (the search tool
# is part of legit work, e.g. `bun test | grep -i fail`), not exploration.
case "$cmd" in
  *test*|*pytest*|*vitest*|*jest*|*mypy*|*ruff*|*rubocop*|*tsc*|*eslint*|*build*|*rake*|*cargo*|*"go test"*|*git\ *|*bundle*|*install*|*" run "*) exit 0 ;;
esac

# Narrow to genuine multi-file / recursive exploration to limit false nudges:
#  - rg / ag / ack / fd are inherently recursive search
#  - grep with -r/-R/-l/--include or a path argument
#  - find searching by -name/-path
#  - cat/head/tail of a source-code file
nudge=0
case "$verb" in
  rg|ag|ack|fd) nudge=1 ;;
  grep) case "$cmd" in *" -r"*|*" -R"*|*" -l"*|*--include*|*"/"*) nudge=1 ;; esac ;;
  find) case "$cmd" in *-name*|*-path*|*-iname*) nudge=1 ;; esac ;;
  cat|head|tail) printf '%s' "$cmd" | grep -qE '\.(ts|tsx|js|jsx|mjs|cjs|rb|py|go|rs|ejs|java|kt|swift|c|cc|cpp|h|hpp|php)([[:space:]";|&)]|$)' && nudge=1 ;;
esac
[ "$nudge" -eq 1 ] || exit 0

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    additionalContext: "spec-plugin nudge: this looks like in-context code exploration. If you are searching/reading source to understand a convention, symbol, behavior, or flow, prefer the forked primitive skill — /explore-conventions, /verify-symbol, /probe-contract, or /trace-flow — which runs in an isolated child and returns only the conclusion, keeping your context lean. (Allowed — ignore this if it is part of a gate/build or a file you are actively editing.)"
  }
}'
exit 0
