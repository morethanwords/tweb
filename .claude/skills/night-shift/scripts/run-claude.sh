#!/bin/bash
# run-claude.sh <id> <remote-control title> <prompt> — one worker, under the login of night.env, in its tmux window,
# with the tmux server's stale CLAUDE_* variables dropped first. RESUME=<session id> resumes that session instead.
id=$1; title=$2; prompt=$3
N=$(cd "$(dirname "$0")" && pwd)
. "$N/common.sh"; drop_claude_env
. "$N/night.env"
export CLAUDE_CONFIG_DIR=$NIGHT_CONFIG_DIR PATH=$HOME/.local/bin:$PATH
cd "$NIGHT_REPO"
if [ -n "${RESUME:-}" ]; then
  claude --resume "$RESUME" --remote-control "$title" --permission-mode auto "$prompt"
else
  claude --remote-control "$title" --permission-mode auto "$prompt"
fi
echo "claude exited ($?)"
exec bash
