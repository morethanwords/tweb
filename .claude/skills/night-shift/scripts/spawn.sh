#!/bin/bash
# spawn.sh <id> <stream> <title> — starts a worker in window <run>:<id> of the default tmux server. A worker never
# runs unsupervised: nothing is spawned past the run's hard stop or once the run was stopped (state/stopped — an
# overage stop leaves it too), and when this run's supervisor is not running (the first call, or after a crash) it
# is started in <run>:sup first and must be up before the worker is. RESUME=<session id> resumes an exited worker.
set -u
N=$(cd "$(dirname "$0")" && pwd); . "$N/night.env"
id=$1; stream=$2; title=$3; T=$NIGHT_TMUX
[ -e "$N/state/stopped" ] && { echo "refused: this run was stopped — $(cat "$N/state/stopped")"; exit 1; }
[ "$(date +%s)" -lt $((NIGHT_RESET - 240)) ] || { echo "refused: past this run's hard stop"; exit 1; }
mkdir -p "$N/log" "$N/state" "$N/reports" "$N/claims" "$N/bugs/queue"
sup_alive() {
  local p
  p=$(cat "$N/state/supervisor.pid" 2>/dev/null) && [ -n "$p" ] &&
    tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -qF "$N/supervisor.sh"
}
supcmd="bash $(printf '%q' "$N/supervisor.sh"); exec bash"
if ! tmux -L default has-session -t "=$T" 2>/dev/null; then
  tmux -L default new-session -d -s "$T" -n sup -x 220 -y 50 -c "$NIGHT_REPO" "$supcmd"
elif ! sup_alive; then
  tmux -L default respawn-window -k -t "=$T:sup" -c "$NIGHT_REPO" "$supcmd" 2>/dev/null ||
    tmux -L default new-window -d -t "=$T:" -n sup -c "$NIGHT_REPO" "$supcmd"
fi
for _ in 1 2 3 4 5 6 7 8 9 10; do sup_alive && break; sleep 0.5; done
sup_alive || { echo "refused: the supervisor did not start (see $T:sup)"; exit 1; }
if [ -n "${RESUME:-}" ]; then
  prompt="Сессия перезапущена (id: $id). Продолжай свой поток по $N/RULES.md и $N/streams/$stream.md."
else
  prompt="Ты — сессия ночной смены, id: $id. Прочитай $N/RULES.md, затем $N/streams/$stream.md, и выполняй. До утра никого нет: вопросов не задавай, решай сам по правилам."
fi
cmd=$(printf '%q ' env "RESUME=${RESUME:-}" bash "$N/run-claude.sh" "$id" "$NIGHT_TITLE · $title" "$prompt")
tmux -L default kill-window -t "=$T:$id" 2>/dev/null
tmux -L default new-window -d -t "=$T:" -n "$id" -c "$NIGHT_REPO" "$cmd"
touch "$N/state/$id.spawned"
[ -z "${RESUME:-}" ] && printf '%s\t%s\t%s\t%s\n' "$id" "$stream" "$title" "$(date -u +%FT%TZ)" >> "$N/workers.tsv"
echo "spawned $id ($stream)${RESUME:+ resumed $RESUME}"
