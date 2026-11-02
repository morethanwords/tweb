#!/bin/bash
# probe-usage.sh <config dir> — one tiny Haiku call under that login, from an empty directory (no CLAUDE.md to load).
# Prints the seven-day window, tab-separated: utilization (0..1), status, resetsAt (epoch), overageStatus, and
# whether overage is in use (either of the two flags that say so). Prints nothing when the answer carried no
# rate_limit_event. Needs the network: unsandboxed.
set -u
cfg=$1
. "$(dirname "$0")/common.sh"; drop_claude_env
dir=$(mktemp -d /tmp/night-probe.XXXXXX)
(cd "$dir" && CLAUDE_CONFIG_DIR=$cfg timeout 180 "$HOME/.local/bin/claude" -p --model claude-haiku-5-5 \
  --output-format stream-json --verbose 'Reply with: ok' 2>/dev/null) |
  jq -r 'select(.type=="rate_limit_event") | .rate_limit_info |
    [(.unifiedWindows.seven_day.utilization // "?"), (.status // "?"),
     (.unifiedWindows.seven_day.resetsAt // .resetsAt // "?"), (.overageStatus // "?"),
     ((.isUsingOverage // false) or (.overageInUse // false))] |
    @tsv' | tail -1
rm -rf "$dir"
