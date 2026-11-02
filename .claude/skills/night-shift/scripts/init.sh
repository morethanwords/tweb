#!/bin/bash
# init.sh <run dir> <config dir> [--allow-overage] — sets up a night-shift run: its directories, the scripts and
# templates copied in (a running supervisor never sees a later edit of the skill), and night.env with the reset
# time of the login's seven-day window. The run dir's name names the run: its tmux session, and the prefix of every
# worktree, branch and preview id its workers make. Unsandboxed (the probe needs the network, the config dir is outside).
set -eu
[ $# -ge 2 ] || { echo "usage: init.sh <run dir> <config dir> [--allow-overage]"; exit 1; }
SKILL=$(cd "$(dirname "$0")/.." && pwd)
# the main checkout: workers start there, where the login's memory symlink is keyed
REPO=$(dirname "$(git -C "$SKILL" rev-parse --path-format=absolute --git-common-dir)")
run=$(realpath -m "$1"); cfg=$(realpath "$2")
RUN=$(basename "$run" | tr -c 'A-Za-z0-9_\n-' '-')
[ -e "$run/night.env" ] && { echo "$run is set up already"; exit 1; }
[ -d "$cfg" ] || { echo "no config dir $cfg"; exit 1; }
tmux -L default has-session -t "=$RUN" 2>/dev/null && { echo "a tmux session '$RUN' exists already: name the run dir otherwise"; exit 1; }

IFS=$'\t' read -r util status reset overage using < <(bash "$SKILL/scripts/probe-usage.sh" "$cfg") ||
  { echo "usage probe gave nothing — is $cfg logged in? (CLAUDE_CONFIG_DIR=$cfg claude auth status)"; exit 1; }
[[ $reset =~ ^[0-9]+$ ]] && [ "$reset" -gt "$(date +%s)" ] && [[ $util =~ ^[0-9.]+$ ]] ||
  { echo "the probe gave no usable window (utilization '$util', reset '$reset')"; exit 1; }
echo "seven-day window: utilization $util, status $status, resets $(date -u -d "@$reset" '+%F %H:%M UTC'), overage $overage (using: $using)"
if [ "$using" = true ] || { [ "$overage" != rejected ] && [ "${3:-}" != --allow-overage ]; }; then
  echo "overage is not off for this login: past 100% it would be billed. Ask the user; --allow-overage to go on anyway."
  exit 2
fi

mkdir -p "$run"/{log,state,reports,claims,bugs/queue,streams}
cp "$SKILL"/scripts/{common,probe-usage,spawn,run-claude,supervisor}.sh "$run/"
cp "$SKILL"/templates/RULES.md "$SKILL"/templates/BACKLOG.md "$run/"
cp "$SKILL"/templates/streams/*.md "$run/streams/"
{
  echo "# night-shift run, set up $(date -u '+%F %H:%M UTC')"
  printf 'NIGHT_REPO=%q\nNIGHT_CONFIG_DIR=%q\nNIGHT_RESET=%q\nNIGHT_RUN=%q\nNIGHT_TMUX=%q\n' "$REPO" "$cfg" "$reset" "$RUN" "$RUN"
  echo 'NIGHT_TITLE=Ночь'
  echo 'NIGHT_MAX_WORKERS=18'
  echo 'NIGHT_WRAPUP_UTIL=0.95'
} > "$run/night.env"
lit() { printf '%s' "$1" | sed 's/[&|\\]/\\&/g'; }   # a literal for the right side of s|||
sed -i -e "s|{{N}}|$(lit "$run")|g" -e "s|{{REPO}}|$(lit "$REPO")|g" -e "s|{{RUN}}|$(lit "$RUN")|g" \
  -e "s|{{RESET_UTC}}|$(date -u -d "@$reset" '+%F %H:%M UTC')|g" -e "s|{{RESET_LOCAL}}|$(date -d "@$reset" '+%H:%M %Z')|g" \
  -e "s|{{UTIL}}|$util|g" "$run"/RULES.md "$run"/BACKLOG.md "$run"/streams/*.md
echo "set up $run (run $RUN) — next: fill streams/salvage.md and streams/parity.md, then the preflight (SKILL.md §2)"
