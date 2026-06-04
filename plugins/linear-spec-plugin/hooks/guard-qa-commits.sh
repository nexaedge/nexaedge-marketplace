#!/usr/bin/env bash
# QA commit guard for linear-spec-plugin — blocks any git add/commit from QA agent.
# QA writes results to Linear (Project Documents + comments), never to disk.
# Used as PreToolUse hook on Bash for qa agent.
# Exit: 0=allow, 2=block with message
set -euo pipefail

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null || echo "")

case "$COMMAND" in
  git\ add\ *|git\ add|git\ commit\ *|git\ commit)
    echo "BLOCKED: QA agents in linear-spec-plugin do not commit. Validation outputs go to Linear (Project Document + spec-issue comment) via the bundled scripts in \${CLAUDE_PLUGIN_DIR}/scripts/linear/."
    echo "If you need to record findings, post a comment on the spec issue or update the Validation Report document. If you found a bug, report it to the team lead — do NOT modify source code."
    exit 2
    ;;
esac

exit 0
