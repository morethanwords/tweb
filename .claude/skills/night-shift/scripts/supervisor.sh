#!/bin/bash
# Night-shift supervisor: plain bash, no model, in window <run>:sup (spawn.sh starts it). Every 5 minutes:
#  - a usage probe every 10 min -> log/usage.tsv; any sign of overage stops everything at once
#  - a nudge to a worker idle 20+ min, unless state/<id>.waiting is under an hour old
#  - a resume (twice at most) of a worker whose claude exited
#  - every 20 min the usage projected at wrap-up: under 95% one more worker (two under 85%) — a backlog worker while
#    the load allows, a code-reading auditor (CPU-light) when the machine is saturated
#  - wrap-up at NIGHT_WRAPUP_UTIL or 50 min before the reset (the file WRAPUP, and «Сворачивайся» to each worker once
#    it is at its prompt), the summary session 15 min later, one small task to every worker at its prompt once
#    SUMMARY.md has settled (to use the rest), and 4 min before the reset every worker window killed and this run's
#    previews nobody holds any more stopped — the next window must not pay for this one.
# Keys only ever go to a worker whose live status is idle, re-read before typing and before Enter, and never a digit:
# a permission dialog is the user's to answer (a digit or Enter would pick an option), so those are listed in
# ATTENTION.md instead. Nudges and autoscaling wait for state/launched, touched once the first wave is started.
# A non-interactive bash exits on an arithmetic error, and with it the hard stop: whatever a file or a record says is
# validated before it reaches $(( )).
# To change it mid-run: sed -i (a new inode: the running bash keeps the old file), bash -n, then at once
# `tmux -L default respawn-window -k -t <run>:sup "bash <run dir>/supervisor.sh; exec bash"` — its state is in files.
set -u
N=$(cd "$(dirname "$0")" && pwd)
. "$N/common.sh"; drop_claude_env
. "$N/night.env"
T=$NIGHT_TMUX; RESET=$NIGHT_RESET
WRAPUP=$((RESET - 50 * 60)); HARDSTOP=$((RESET - 4 * 60))
mkdir -p "$N/log" "$N/state"
log() { echo "$(date -u +%FT%TZ) $*" >> "$N/log/supervisor.log"; }
echo $$ > "$N/state/supervisor.pid"
age() { # seconds since the file changed; a file that is gone (or goes while we look) is "long ago"
  local m
  m=$(stat -c %Y "$1" 2>/dev/null) && echo $(( $(date +%s) - m )) || echo 999999
}
gte() { awk -v a="${1:-0}" -v b="$2" 'BEGIN{exit !(a+0 >= b+0)}'; }

probe() {
  local line
  line=$(bash "$N/probe-usage.sh" "$NIGHT_CONFIG_DIR")
  [ -n "$line" ] || { log "probe: no rate_limit_event"; return; }
  printf '%s\t%s\t%s\n' "$(date +%s)" "$(date -u +%FT%TZ)" "$line" >> "$N/log/usage.tsv"
}
util() { tail -1 "$N/log/usage.tsv" 2>/dev/null | cut -f3; }
overage() { [ "$(tail -1 "$N/log/usage.tsv" 2>/dev/null | cut -f7)" = true ]; }

workers() { tmux -L default list-windows -t "=$T" -F '#{window_name}' 2>/dev/null | grep -vx -e sup -e summary; }
status_of() { cut -d' ' -f1 "$N/state/$1.status" 2>/dev/null; }   # as of this pass

session_json() { # the <config dir>/sessions record of the claude under window <run>:<id>
  local pane f pid p i
  pane=$(tmux -L default display -p -t "=$T:$1" '#{pane_pid}' 2>/dev/null) || return 1
  for f in "$NIGHT_CONFIG_DIR"/sessions/*.json; do
    pid=$(jq -r .pid "$f" 2>/dev/null) || continue
    [ -d "/proc/$pid" ] || continue
    p=$pid
    for i in 1 2 3 4 5 6; do
      [ "$p" = "$pane" ] && { echo "$f"; return 0; }
      p=$(awk '{print $4}' "/proc/$p/stat" 2>/dev/null) || break
      [ -n "$p" ] && [ "$p" -gt 1 ] || break
    done
  done
  return 1
}
live_status() { local f; f=$(session_json "$1") && jq -r '.status // "unknown"' "$f" 2>/dev/null || echo gone; }

send() { # send <id> <text> — only to a worker at rest at its prompt, checked again before each key; no digits
  local id=$1 text=$2
  case $text in *[0-9]*) log "send: refused to type a digit to $id"; return 1;; esac
  [ "$(live_status "$id")" = idle ] || return 1
  tmux -L default send-keys -t "=$T:$id" -l "$text" || return 1
  sleep 1
  [ "$(live_status "$id")" = idle ] || { log "$id: left its prompt while typed to, Enter not pressed"; return 1; }
  tmux -L default send-keys -t "=$T:$id" Enter
}

check_worker() {
  local id=$1 f rec st upd now idle stream title tries
  now=$(date +%s)
  if ! f=$(session_json "$id"); then
    # no live claude in the window: give a start three minutes, then resume it
    [ "$(age "$N/state/$id.spawned")" -lt 180 ] && return
    tries=$(cat "$N/state/$id.restarts" 2>/dev/null); [[ $tries =~ ^[0-9]+$ ]] || tries=0
    if [ -s "$N/state/$id.sid" ] && [ "$tries" -lt 2 ]; then
      stream=$(awk -F'\t' -v id="$id" '$1==id{print $2}' "$N/workers.tsv" | tail -1)
      title=$(awk -F'\t' -v id="$id" '$1==id{print $3}' "$N/workers.tsv" | tail -1)
      echo $((tries + 1)) > "$N/state/$id.restarts"
      RESUME=$(cat "$N/state/$id.sid") bash "$N/spawn.sh" "$id" "$stream" "$title" >/dev/null
      log "$id: claude gone, resumed ($((tries + 1)))"
    elif [ ! -e "$N/state/$id.gone" ]; then
      touch "$N/state/$id.gone"; log "$id: claude gone, not resuming (restarts=$tries)"
    fi
    return
  fi
  # one read of the record: it goes away when its claude exits, maybe right after session_json found it
  rec=$(cat "$f" 2>/dev/null)
  st=$(jq -r '.status // empty' <<< "$rec" 2>/dev/null)
  upd=$(jq -r '.statusUpdatedAt // empty' <<< "$rec" 2>/dev/null)
  [ -n "$st" ] && [[ $upd =~ ^[0-9]+$ ]] || return   # gone: the next pass sees an exited worker
  jq -r .sessionId <<< "$rec" > "$N/state/$id.sid"
  upd=$((upd / 1000)); idle=$((now - upd))
  echo "$st $idle" > "$N/state/$id.status"
  [ "$st" = waiting ] && echo "- $id: на диалоге $((idle / 60)) мин" >> "$N/state/attention.tmp"
  [ -e "$N/state/launched" ] && [ ! -e "$N/state/wrapup.sent" ] || return
  if [ "$st" = idle ] && [ "$idle" -gt 1200 ] && [ "$(age "$N/state/$id.waiting")" -gt 3600 ] &&
     [ "$(age "$N/state/$id.nudged")" -gt 1200 ]; then
    send "$id" "Продолжай (сторож): ты давно простаиваешь. Продолжай свой поток; если он закончен — бери задачу из BACKLOG.md папки смены. Ждёшь фоновую работу — создай свой файл .waiting (RULES.md)." &&
      { touch "$N/state/$id.nudged"; log "$id: nudged after $((idle / 60)) min idle"; }
  fi
}

attention() { # sessions on a permission dialog: only the user may answer them
  if [ -s "$N/state/attention.tmp" ]; then
    { echo "# Ждут ответа пользователя ($(date -u +%FT%TZ))"; echo
      echo "Сессии стоят на диалоге разрешения в claude.ai аккаунта ночной смены. Отвечать за пользователя нельзя."
      echo; cat "$N/state/attention.tmp"; } > "$N/ATTENTION.md"
    [ "$(age "$N/state/attention.logged")" -gt 1800 ] && { touch "$N/state/attention.logged"; log "attention: $(tr '\n' ' ' < "$N/state/attention.tmp")"; }
  else
    rm -f "$N/ATTENTION.md"
  fi
}

once_each() { # once_each <marker> <text> — the text to every worker at its prompt that has not had it yet
  local id
  for id in $(workers); do
    [ -e "$N/state/$id.$1" ] && continue
    send "$id" "$2" && { touch "$N/state/$id.$1"; log "$id: $1 sent"; }
  done
}

spawn_extra() { # a backlog worker while the CPU has room, else a code-reading auditor
  local load=$1 k id stream prefix title
  if [ "$load" -lt 26 ]; then prefix=bk; stream=backlog; title="Бэклог"; else prefix=au; stream=audit; title="Аудит кода"; fi
  k=1; while grep -q "^$prefix$k	" "$N/workers.tsv" 2>/dev/null; do k=$((k + 1)); done
  id=$prefix$k
  bash "$N/spawn.sh" "$id" "$stream" "$title $k" >/dev/null && log "autoscale: spawned $id ($stream)"
}

autoscale() {
  local now n mem load u0 t0 u1 t1 proj i count
  now=$(date +%s)
  [ "$(age "$N/state/autoscale.last")" -lt 1200 ] && return
  [ "$now" -lt "$WRAPUP" ] || return
  touch "$N/state/autoscale.last"
  read -r t1 u1 < <(tail -1 "$N/log/usage.tsv" | cut -f1,3)
  read -r t0 u0 < <(awk -F'\t' -v lim=$((now - 1800)) '$1 <= lim' "$N/log/usage.tsv" | tail -1 | cut -f1,3)
  [[ ${t0:-} =~ ^[0-9]+$ ]] && [[ ${t1:-} =~ ^[0-9]+$ ]] && [ "$t1" -gt "$t0" ] || { log "autoscale: not enough usage samples yet"; return; }
  proj=$(awk -v u0="$u0" -v u1="$u1" -v t0="$t0" -v t1="$t1" -v w="$WRAPUP" 'BEGIN{printf "%.3f", u1 + (u1-u0)/(t1-t0)*(w-t1)}')
  n=$(workers | wc -l)
  mem=$(awk '/MemAvailable/{print int($2/1048576)}' /proc/meminfo)
  load=$(cut -d' ' -f1 /proc/loadavg | cut -d. -f1)
  log "autoscale: usage $u1, projected at wrap-up $proj, workers $n, mem ${mem}G, load $load"
  gte "$proj" 0.95 && return
  count=1; gte "$proj" 0.85 || count=2
  for i in $(seq "$count"); do
    [ "$((n + i - 1))" -lt "$NIGHT_MAX_WORKERS" ] && [ "$mem" -gt 12 ] || { log "autoscale: no room (workers $n, mem ${mem}G)"; return; }
    spawn_extra "$load"
  done
}

stop_previews() { # this run's previews nobody holds any more (their workers are gone)
  (cd "$NIGHT_REPO" && bash scripts/start-preview.sh --list 2>/dev/null) |
    awk -v pre="id=$NIGHT_RUN-" '/^http:\/\/localhost:[0-9]+ / { port = ""; if (index($0, pre)) { split($1, a, ":"); port = a[3] }; next }
         port != "" && /held by nobody/ { print port; port = "" }' |
    while read -r p; do
      (cd "$NIGHT_REPO" && bash scripts/start-preview.sh --stop --port "$p" >/dev/null 2>&1) && log "preview :$p stopped"
    done
}

hard_stop() {
  local id
  # spawn.sh refuses from now on; the first reason (an overage above all) is kept
  [ -e "$N/state/stopped" ] || echo "$1, $(date -u +%FT%TZ)" > "$N/state/stopped"
  for id in $(workers) summary; do
    [ "$(live_status "$id")" = waiting ] || tmux -L default send-keys -t "=$T:$id" Escape 2>/dev/null
  done
  sleep 10
  for id in $(workers) summary; do tmux -L default kill-window -t "=$T:$id" 2>/dev/null && log "$id: stopped ($1)"; done
  sleep 5; stop_previews
  log "stopped ($1), usage $(util)"
}

log "supervisor started (pid $$), reset $(date -u -d "@$RESET" +%FT%TZ)"
# a stopped run stays stopped (removing state/stopped is the user's call), but a stop the previous supervisor did not
# live to finish is finished: its workers must not run on
if [ -e "$N/state/stopped" ]; then
  log "this run was stopped — $(cat "$N/state/stopped"); finishing the stop"
  hard_stop "finishing an earlier stop"; exit 0
fi
while true; do
  now=$(date +%s)
  [ "$now" -ge "$HARDSTOP" ] && { hard_stop "hard stop before the reset"; exit 0; }
  # a probe takes up to 3 minutes: none in the last ones before the hard stop
  if [ "$(age "$N/state/probe.last")" -ge 600 ] && [ $((HARDSTOP - now)) -gt 200 ]; then
    touch "$N/state/probe.last"; probe
    overage && { hard_stop "OVERAGE — the account is being billed past its limit"; exit 0; }
  fi
  : > "$N/state/attention.tmp"
  for id in $(workers); do check_worker "$id"; done
  attention
  u=$(util)
  if [ -e "$N/state/launched" ] && [ ! -e "$N/state/wrapup.sent" ] && { [ "$now" -ge "$WRAPUP" ] || gte "$u" "$NIGHT_WRAPUP_UTIL"; }; then
    touch "$N/WRAPUP" "$N/state/wrapup.sent"; log "wrap-up (usage $u)"
  fi
  [ -e "$N/state/wrapup.sent" ] && once_each wrapup "Сворачивайся (сторож): лимит почти исчерпан или до сброса меньше часа. Доведи текущее до целостного состояния, обнови отчёт, останови свои превью (--stop), последней строкой отчёта напиши СТОП, ничего нового не начинай."
  if [ -e "$N/state/wrapup.sent" ] && [ ! -e "$N/state/summary.spawned" ] && [ "$(age "$N/state/wrapup.sent")" -ge 900 ]; then
    touch "$N/state/summary.spawned"; bash "$N/spawn.sh" summary summary "Итог" >/dev/null; log "summary session spawned"
  fi
  if [ -e "$N/state/summary.spawned" ] && [ -s "$N/SUMMARY.md" ] && [ "$(age "$N/SUMMARY.md")" -ge 120 ] && ! gte "$u" 0.985; then
    once_each topup "Добор лимита (после итога): до сброса осталось немного недельного лимита. Возьми ОДНУ небольшую задачу (S) — следующую из своего потока или из BACKLOG.md папки смены — и доведи до конца: проверка, запись в свой отчёт в новом разделе «После итога» под строкой СТОП. Большого не начинай; кончится лимит посреди — это нормально, отчёт обновляй по ходу."
  fi
  free_gb=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
  if [[ $free_gb =~ ^[0-9]+$ ]] && [ "$free_gb" -lt 8 ] && [ "$(age "$N/state/disk.sent")" -gt 3600 ]; then
    touch "$N/state/disk.sent"; log "disk low (${free_gb}G)"
    for id in $(workers); do
      send "$id" "Диск почти заполнен (сторож). Удали в своих ворктри dist/ и tmp/ сборок, которые больше не нужны; новый ворктри — только для нового изменения."
    done
  fi
  [ -e "$N/state/launched" ] && autoscale
  # wake no later than the hard stop
  rest=$((HARDSTOP - $(date +%s))); [ "$rest" -gt 300 ] && rest=300; [ "$rest" -lt 1 ] && rest=1
  sleep "$rest"
done
