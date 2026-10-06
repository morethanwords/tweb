#!/bin/bash
#
# Launch an authorized tweb preview — or hand back the one already running.
#
# Each preview gets:
#   * its own freshly minted, INDEPENDENT authorization (so multiple previews
#     / worktrees never share an auth key — parallel use logs both out)
#   * its own free port (so multiple preview servers can run at once)
#
# ONE PREVIEW PER CHECKOUT. Every preview is registered in tmp/previews/ of the
# main checkout (shared by all worktrees), and before starting anything the
# script looks there: a live preview of the same checkout — so of the same
# branch — in the same mode is REUSED and its URL printed, instead of a second
# server being started beside it. A second one would be pointless, and on the
# same --id it would share the first one's auth and log both out. A preview the
# registry has never seen (started by an older copy of this script, say in a
# stale worktree) is adopted the first time a run sees its port.
#
# LEASES. Whoever gets a preview from this script holds a lease on it, and
# --stop stops a preview only when nobody else holds it — so one session cannot
# kill the preview another one is still using. Never stop a preview by pid,
# port or tmux session; use --stop.
#   * --detach (what an agent should use): the lease belongs to the calling
#     Claude Code session, or outside one to the calling shell. It lapses when
#     that process exits, or 12 h after the holder last got the preview from
#     this script. An agent whose shell lives for one command names itself in
#     TWEB_PREVIEW_HOLDER; its lease lasts the 12 h.
#   * A foreground run holds the preview for as long as it runs. When the
#     preview already exists it ATTACHES: prints the URL and waits, holding it,
#     until Ctrl-C — unless it asked for another --port, which fails instead.
# A lapsed lease only stops protecting the preview; nothing is killed for it.
#
# The per-preview authorization is minted once per --id and reused on restart;
# pass --remint to force a new one. Minting is serialised by a lock because it
# briefly drives the master session (tmp/seed.json) and reads the login code
# from the Telegram service chat — two concurrent mints would collide.
#
# Usage (run from anywhere — the script cd's to the repo root itself):
#   bash scripts/start-preview.sh [--detach] [--id <id>] [--port <port>] [--remint]
#                                 [--no-worker] [--static | --watch]
#   bash scripts/start-preview.sh --list
#   bash scripts/start-preview.sh --stop [--port <port>] [--force]
#
# The default is the Vite DEV SERVER (hot reload) — and it answers a request
# that came from anywhere but this machine with a BUILT bundle instead. One
# command, one port: localhost keeps HMR, a remote device gets static.
#
# Why the split: the dev server ships every module unbundled (2047 requests for
# an authorized boot, against 99 built), each one a round trip over the network,
# and its HMR websocket dies whenever a mobile browser backgrounds the tab — on
# return the Vite client pings until the server answers and then calls
# location.reload(), throwing away whatever you were testing.
#
# The bundle is built LAZILY: nothing is built until the first remote (or
# ?static=1) request arrives, so a desktop-only session pays nothing. That first
# request gets a self-refreshing "building" page for ~15s; after that a watcher
# keeps the bundle in step with your edits (~7s per rebuild).
#
#   ?static=1     force the built bundle from localhost too (to check it).
#   ?static=0     force the dev server for a remote request (to debug the split).
#   TWEB_PREVIEW_REMOTE=dev (env, or .env.local of the checkout): remote requests
#                 get the dev server too, ?static=1 still gets the bundle.
#   --static      serve ONLY the built bundle, no dev server at all.
#   --watch       --static plus a rebuild watcher.
#
#   --detach      take the running preview, or start one in the background, and
#                 return once it answers, printing its URL. The server runs in a
#                 window of tmux's default server when tmux is installed
#                 (`tmux -L default attach -t preview-<port>`); its log is
#                 tmp/previews/<port>.log of the main checkout.
#   --list        the registered previews: URL, checkout, branch, id, mode, and
#                 who holds each.
#   --stop        drop your lease — on --port, or on every preview you hold —
#                 and stop each preview nobody else holds. --force stops it
#                 whoever holds it: a human's call, never an agent's.
#   --id          preview identity; the auth is cached per id.
#                 Default: the current worktree directory name. Without --id any
#                 preview of this checkout on the same master seed is reused;
#                 with it, only that id's — so a new id is how to get a separate
#                 preview (another account, a clean origin).
#   --port        port for a new preview. Default: first free port from 9001
#                 upward. With --detach a preview of this checkout running on
#                 another port is still handed out (the script says so); a
#                 foreground run fails instead.
#   --remint      discard the cached auth for this id and mint a fresh one.
#   --no-worker   run MTProto + crypto in the main thread (debug only). Sets
#                 Modes.noWorker at build time so breakpoints span the full
#                 pipeline without needing ?noWorker=1 in the URL.
#   --hmr         the default, spelled out (dev server + static for remotes).
#   --static      serve only the built bundle — no dev server, no HMR anywhere.
#   --watch       --static plus `vite build --watch`: every edit rebuilds (~7s)
#                 and the phone picks it up on a manual refresh. Old hashed
#                 chunks are kept so a page loaded mid-rebuild cannot 404.
#                 Not compatible with --hmr (which needs no rebuild at all).
#
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd -P)"

say() { echo "[start-preview] $*"; }
die() { echo "[start-preview] $*" >&2; exit 1; }

ACTION=start; DETACH=0; SERVE=0; FORCE=0
ID=""; PORT=""; REMINT=0; NO_WORKER=0; WATCH=0; ASK_HMR=0; ASK_STATIC=0
while [ $# -gt 0 ]; do
  case "$1" in
    --id) ID="${2:?}"; shift 2;;
    --port) PORT="${2:?}"; shift 2;;
    --remint) REMINT=1; shift;;
    --no-worker) NO_WORKER=1; shift;;
    --hmr) ASK_HMR=1; shift;;
    --static) ASK_STATIC=1; shift;;
    --watch) ASK_STATIC=1; WATCH=1; shift;;
    --detach) DETACH=1; shift;;
    --list) ACTION=list; shift;;
    --stop) ACTION=stop; shift;;
    --force) FORCE=1; shift;;
    # internal: the server half of --detach, which starts it in the background
    --serve) SERVE=1; shift;;
    *) die "unknown arg: $1";;
  esac
done
case "$PORT" in *[!0-9]*) die "--port takes a number, got '$PORT'";; esac

# Claude Code's Bash sandbox gives every command its own pid and network
# namespaces: from inside, no preview's process or port is visible (each would
# look dead), and a server started there is reachable by nothing.
[ -z "${SANDBOX_RUNTIME:-}" ] || die "run this outside the sandbox — from inside it no other process or port is visible"

# Order-independent: asking for both is a contradiction however they were typed.
if [ "$ASK_HMR" = 1 ] && [ "$ASK_STATIC" = 1 ]; then
  echo "[start-preview] --hmr cannot be combined with --static/--watch." >&2
  echo "[start-preview] Plain (no flag) already gives you both: HMR on localhost," >&2
  echo "[start-preview] the built bundle for anything remote." >&2
  exit 1
fi
# NB: not `[ ... ] && HMR=0` — under `set -e` a false test as the last command
# of the list exits the script.
if [ "$ASK_STATIC" = 1 ]; then HMR=0; else HMR=1; fi
if [ "$HMR" = 1 ]; then MODE=hmr; elif [ "$WATCH" = 1 ]; then MODE=watch; else MODE=static; fi

sanitize() { printf '%s' "$1" | tr -c 'A-Za-z0-9._-' '_'; }

# default id = worktree dir name; sanitise for use as a filename
if [ -n "$ID" ]; then ID_GIVEN=1; else ID_GIVEN=0; ID="$(basename "$REPO")"; fi
ID="$(sanitize "$ID")"

# the master seed lives in the MAIN worktree's tmp/ (tmp/ is gitignored, so a
# fresh worktree has none of its own) — locate it via the shared git dir.
# TWEB_MASTER_SEED may be: unset (default seed.json), an absolute path, or a
# bare filename which we resolve against the main worktree's tmp/.
MAIN="$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd -P)"
MASTER_SEED="${TWEB_MASTER_SEED:-seed.json}"
case "$MASTER_SEED" in
  /*) ;;  # already absolute — leave as-is
  *) MASTER_SEED="$MAIN/tmp/$MASTER_SEED" ;;
esac

# --- the registry -------------------------------------------------------------
# tmp/previews/<port>/meta    the preview: KEY=value lines, read back without eval
# tmp/previews/<port>/leases/ one file per holder, same format
# tmp/previews/<port>.log     the server's output when it was started --detach
REG="$MAIN/tmp/previews"
mkdir -p "$REG"
LEASE_TTL=$((12 * 3600))

kv() { awk -v k="$2" 'index($0, k "=") == 1 { print substr($0, length(k) + 2); exit }' "$1" 2>/dev/null || true; }
# In C and UTC: lstart follows TZ (and the locale, on macOS), and the --serve
# half of --detach runs in tmux's environment rather than its caller's.
proc_start() { LC_ALL=C TZ=UTC0 ps -o lstart= -p "$1" 2>/dev/null | tr -s ' ' | sed 's/^ //;s/ $//' || true; }
# alive, and the same process: the start time tells it from a later one that reused its pid
proc_alive() { [ -n "$1" ] && [ -n "$2" ] && [ "$(proc_start "$1")" = "$2" ]; }
# Read afresh every time: the --serve half of --detach takes the entry over from
# the run that reserved it, so the pid changes once.
entry_alive() { [ -f "$1/meta" ] && proc_alive "$(kv "$1/meta" PID)" "$(kv "$1/meta" PSTART)"; }
proc_args() { ps -ww -o args= -p "$1" 2>/dev/null || true; }
proc_ppid() { ps -o ppid= -p "$1" 2>/dev/null | tr -d ' ' || true; }
proc_cwd() {
  readlink "/proc/$1/cwd" 2>/dev/null ||
    lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' ||
    true
}
tree_pids() { local c; echo "$1"; for c in $(pgrep -P "$1" 2>/dev/null || true); do tree_pids "$c"; done; }
fmt_time() { date -d "@$1" '+%b %e %H:%M' 2>/dev/null || date -r "$1" '+%b %e %H:%M'; }

# Listening on the port, on any address. lsof where it exists (macOS), ss on
# Linux, where lsof often is not installed.
port_busy() {
  if command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP:"$1" -sTCP:LISTEN -t >/dev/null 2>&1
  else ss -Hltn "sport = :$1" 2>/dev/null | grep -q .; fi
}
port_pid() {
  if command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true
  else ss -Hltnp "sport = :$1" 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1 || true; fi
}
# the ports of 9001-9099 something listens on
listening_ports() {
  if command -v lsof >/dev/null 2>&1; then lsof -nP -iTCP -sTCP:LISTEN -Fn 2>/dev/null | sed -n 's/^n.*:\([0-9]*\)$/\1/p'
  else ss -Hltn 2>/dev/null | awk '{print $4}' | sed 's/.*://'; fi |
    awk '$1 >= 9001 && $1 <= 9099' | sort -un || true
}
# the preview answers (the server binds 127.0.0.1, see --host below)
port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

LOCKED=0; MINT_LOCKED=0; MINT_LOCK=""; OWN_ENTRY=""; OWN_LEASE=""; BUILD_PID=""
# Every read-modify-write of the registry happens under this lock; none takes
# longer than a few process lookups, and nothing long-lived is started inside
# one (a child would inherit the flock descriptor and hold the lock).
if command -v flock >/dev/null 2>&1; then
  reg_lock() { exec 9>"$REG/.lock"; flock -w 60 9 || die "the registry lock $REG/.lock was held for a minute"; LOCKED=1; }
  reg_unlock() { flock -u 9; exec 9>&-; LOCKED=0; }
else
  reg_lock() {
    local i owner
    for i in $(seq 1 600); do
      if mkdir "$REG/.lock.d" 2>/dev/null; then echo $$ >"$REG/.lock.d/pid"; LOCKED=1; return 0; fi
      owner=$(cat "$REG/.lock.d/pid" 2>/dev/null || true)
      # A holder killed inside the section leaves the directory behind. It is
      # broken under a second lock, re-reading the owner there: two waiters
      # breaking it at once, the slower would remove the lock the faster took.
      if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null && mkdir "$REG/.lock.break" 2>/dev/null; then
        if [ "$(cat "$REG/.lock.d/pid" 2>/dev/null || true)" = "$owner" ]; then rm -rf "$REG/.lock.d"; fi
        rmdir "$REG/.lock.break"
      fi
      sleep 0.1
    done
    die "the registry lock $REG/.lock.d was held for a minute"
  }
  reg_unlock() { rm -rf "$REG/.lock.d"; LOCKED=0; }
fi

cleanup() {
  # under `set -e` a failed last command of an && list would end the trap early
  set +e
  [ "$MINT_LOCKED" = 1 ] && rmdir "$MINT_LOCK" 2>/dev/null
  [ -n "$BUILD_PID" ] && kill "$BUILD_PID" 2>/dev/null
  [ -n "$OWN_LEASE" ] && rm -f "$OWN_LEASE"
  # the entry this run registered — unless the server half of --detach took it over
  if [ -n "$OWN_ENTRY" ] && [ "$(kv "$OWN_ENTRY/meta" PID)" = "$$" ]; then
    [ "$LOCKED" = 1 ] || reg_lock
    [ "$(kv "$OWN_ENTRY/meta" PID)" = "$$" ] && rm -rf "$OWN_ENTRY"
  fi
  [ "$LOCKED" = 1 ] && reg_unlock
  return 0
}
trap cleanup EXIT

# Who is asking. Inside Claude Code that is the session — CLAUDE_PID is its
# process — but only if that process really is our ancestor: a tmux server hands
# the environment it was started with, stale CLAUDE_* included, to every window
# it opens. Anywhere else the shell that ran us is the holder.
find_holder() {
  local p=$$
  if [ -n "${CLAUDE_PID:-}" ] && [ -n "${CLAUDE_CODE_SESSION_ID:-}" ]; then
    while [ -n "$p" ] && [ "$p" -gt 1 ]; do
      if [ "$p" = "$CLAUDE_PID" ]; then
        HOLDER_KEY="claude-$(sanitize "$CLAUDE_CODE_SESSION_ID")"; HOLDER_PID=$CLAUDE_PID
        HOLDER_WHO="Claude Code session $CLAUDE_CODE_SESSION_ID"
        return 0
      fi
      p=$(proc_ppid "$p")
    done
  fi
  # An agent whose shell lives for one command names itself; with no process
  # to outlive, its lease lasts the 12 h.
  if [ -n "${TWEB_PREVIEW_HOLDER:-}" ]; then
    HOLDER_KEY="name-$(sanitize "$TWEB_PREVIEW_HOLDER")"; HOLDER_PID=""; HOLDER_WHO="$TWEB_PREVIEW_HOLDER"
    return 0
  fi
  HOLDER_KEY="pid-$PPID"; HOLDER_PID=$PPID
  HOLDER_WHO="the shell that ran it, pid $PPID: $(proc_args "$PPID" | cut -c1-50)"
}
# a foreground run holds what it starts or attaches to for exactly as long as it runs
self_holder() { HOLDER_KEY="pid-$$"; HOLDER_PID=$$; HOLDER_WHO="a foreground run in $REPO (pid $$)"; }

lease_alive() {
  local pid exp
  pid=$(kv "$1" PID)
  if [ -n "$pid" ]; then proc_alive "$pid" "$(kv "$1" PSTART)" || return 1; fi
  exp=$(kv "$1" EXPIRES)
  [ "${exp:-0}" = 0 ] || [ "$exp" -gt "$(date +%s)" ]
}
# $1 = entry dir, $2 = seconds the lease lasts without a renewal (0: while the holder runs)
lease_take() {
  local f="$1/leases/$HOLDER_KEY" now since exp=0
  now=$(date +%s); since=$(kv "$f" SINCE)
  [ "$2" = 0 ] || exp=$((now + $2))
  mkdir -p "$1/leases"
  local pst=""
  [ -z "$HOLDER_PID" ] || pst=$(proc_start "$HOLDER_PID")
  printf '%s\n' "PID=$HOLDER_PID" "PSTART=$pst" "WHO=$HOLDER_WHO" "SINCE=${since:-$now}" "EXPIRES=$exp" >"$f"
}
lease_note() {
  if [ -n "$HOLDER_PID" ]; then
    say "held for $HOLDER_WHO for 12 h — each run that gets it again renews that — or until it exits"
  else
    say "held for $HOLDER_WHO for 12 h; each run that gets it again renews that"
  fi
  say "let go of it with: bash scripts/start-preview.sh --stop --port $1"
}
# the live leases on an entry, one line each
holders() {
  local f line exp
  for f in "$1"/leases/*; do
    [ -f "$f" ] && lease_alive "$f" || continue
    line="$(kv "$f" WHO), since $(fmt_time "$(kv "$f" SINCE)")"
    exp=$(kv "$f" EXPIRES)
    [ "${exp:-0}" = 0 ] || line="$line, until $(fmt_time "$exp")"
    [ "$(basename "$f")" = "${HOLDER_KEY:-}" ] && line="$line  <- you"
    echo "$line"
  done
  return 0
}
describe() {
  local d=$1 repo branch
  repo=$(kv "$d/meta" REPO)
  branch=$(git -C "$repo" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')
  printf '%s' "http://localhost:$(kv "$d/meta" PORT)  $repo ($branch)  id=$(kv "$d/meta" ID)  $(kv "$d/meta" MODE)"
  [ "$(kv "$d/meta" NO_WORKER)" = 1 ] && printf ' no-worker'
  printf '  since %s' "$(kv "$d/meta" STARTED)"
  port_open "$(kv "$d/meta" PORT)" || printf '  [starting]'
  echo
}
print_holders() {
  local h; h=$(holders "$1")
  if [ -n "$h" ]; then printf '%s\n' "$h" | sed "s/^/${2:-}held by: /"
  else echo "${2:-}held by nobody — any run may --stop it"; fi
}

entry_write() {
  mkdir -p "$1/leases"
  printf '%s\n' "PID=$$" "PSTART=$(proc_start $$)" "PORT=$PORT" "REPO=$REPO" "ID=$ID" "MODE=$MODE" \
    "NO_WORKER=$NO_WORKER" "MASTER=$MASTER_SEED" "STARTED=$(date '+%b %e %H:%M')" "LOG=$LOG_FILE" >"$1/meta.tmp"
  mv "$1/meta.tmp" "$1/meta"
}

# A preview the registry has never seen is adopted when a run first sees its
# port: its own foreground run holds it, as if it had registered itself.
# Anything else listening there is left alone (it still keeps its port).
adopt() {
  local port=$1 pid p args top="" root="" rootargs="" cwd id mode=hmr nw=0 master="$MAIN/tmp/seed.json" m d pst
  pid=$(port_pid "$port"); [ -n "$pid" ] || return 0
  # Up from the listener through the server's own processes; the topmost one
  # that ran this script is the preview's root. A tmux server's args can name
  # the script too, so tmux ends the walk.
  p=$pid
  while [ -n "$p" ] && [ "$p" -gt 1 ]; do
    args=$(proc_args "$p")
    case "$args" in
      tmux*|*/tmux\ *) break;;
      *start-preview.sh*) root=$p; rootargs=$args;;
      *vite*|*pnpm*) top=$p;;
      *) break;;
    esac
    p=$(proc_ppid "$p")
  done
  # Often no process names the script any more: in HMR mode it execs into pnpm,
  # and `sh -c` / `bash -c` exec a lone command. The listener still runs the
  # preview config; the id is then taken for the default.
  if [ -z "$root" ]; then
    case "$(proc_args "$pid")" in *vite.preview.config*) root=$top;; *) return 0;; esac
  fi
  cwd=$(proc_cwd "$pid"); [ -n "$cwd" ] || return 0
  id=$(printf '%s\n' "$rootargs" | sed -n 's/.*--id[= ]\([^ ;|&]*\).*/\1/p')
  [ -n "$id" ] || id=$(basename "$cwd")
  case "$(proc_args "$pid")" in
    *' preview '*) case "$rootargs" in *--watch*) mode=watch;; *) mode=static;; esac;;
  esac
  case "$rootargs" in *--no-worker*) nw=1;; esac
  m=$(printf '%s\n' "$rootargs" | sed -n 's/.*TWEB_MASTER_SEED=\([^ ;|&]*\).*/\1/p')
  case "$m" in '') ;; /*) master=$m;; *) master="$MAIN/tmp/$m";; esac
  pst=$(proc_start "$root")
  d="$REG/$port"; mkdir -p "$d/leases"
  printf '%s\n' "PID=$root" "PSTART=$pst" "PORT=$port" "REPO=$cwd" "ID=$(sanitize "$id")" "MODE=$mode" \
    "NO_WORKER=$nw" "MASTER=$master" "STARTED=$(date -d "$pst UTC" '+%b %e %H:%M' 2>/dev/null || echo "$pst UTC")" \
    "LOG=" >"$d/meta"
  printf '%s\n' "PID=$root" "PSTART=$pst" "WHO=its own foreground run, pid $root (started outside the registry)" \
    "SINCE=$(date +%s)" "EXPIRES=0" >"$d/leases/pid-$root"
}

# Under the lock: forget previews whose server is gone and leases whose holder
# is, and adopt the previews the registry has never seen.
reg_sync() {
  local d f p
  for d in "$REG"/[0-9]*/; do
    d=${d%/}; [ -d "$d" ] || continue
    if ! entry_alive "$d"; then rm -rf "$d"; continue; fi
    for f in "$d"/leases/*; do
      [ -f "$f" ] && ! lease_alive "$f" && rm -f "$f"
    done
  done
  for p in $(listening_ports); do
    [ -d "$REG/$p" ] || adopt "$p"
  done
  return 0
}

# A live preview this request can use: same checkout, mode and worker setting;
# the same id when --id was given, else the same master seed (the account).
# The requested port wins, then the default id.
find_match() {
  local d score best=-1
  MATCH=""
  for d in "$REG"/[0-9]*/; do
    d=${d%/}; [ -f "$d/meta" ] || continue
    [ "$(kv "$d/meta" REPO)" = "$REPO" ] && [ "$(kv "$d/meta" MODE)" = "$MODE" ] &&
      [ "$(kv "$d/meta" NO_WORKER)" = "$NO_WORKER" ] || continue
    if [ "$ID_GIVEN" = 1 ]; then [ "$(kv "$d/meta" ID)" = "$ID" ] || continue
    else [ "$(kv "$d/meta" MASTER)" = "$MASTER_SEED" ] || continue; fi
    score=0
    [ "$(kv "$d/meta" PORT)" = "$PORT" ] && score=2
    [ "$(kv "$d/meta" ID)" = "$ID" ] && score=$((score + 1))
    [ "$score" -gt "$best" ] && { best=$score; MATCH=$d; }
  done
  return 0
}

stop_tree() {
  local pids p i alive
  pids=$(tree_pids "$1")
  # shellcheck disable=SC2086
  kill -TERM $pids 2>/dev/null || true
  for i in $(seq 1 50); do
    alive=""
    for p in $pids; do kill -0 "$p" 2>/dev/null && alive="$alive $p"; done
    [ -n "$alive" ] || return 0
    sleep 0.2
  done
  # shellcheck disable=SC2086
  kill -KILL $alive 2>/dev/null || true
}

# --- --list -------------------------------------------------------------------
if [ "$ACTION" = list ]; then
  find_holder
  reg_lock; reg_sync; reg_unlock
  n=0
  for d in "$REG"/[0-9]*/; do
    d=${d%/}; [ -f "$d/meta" ] || continue
    n=$((n + 1))
    describe "$d"
    print_holders "$d" '    '
    log=$(kv "$d/meta" LOG); [ -z "$log" ] || echo "    log: $log"
  done
  [ "$n" -gt 0 ] || echo "no previews running"
  for p in $(listening_ports); do
    [ -d "$REG/$p" ] || echo ":$p is taken by something that is not a preview"
  done
  exit 0
fi

# --- --stop -------------------------------------------------------------------
if [ "$ACTION" = stop ]; then
  find_holder
  reg_lock; reg_sync
  TARGETS=()
  if [ -n "$PORT" ]; then
    if [ ! -d "$REG/$PORT" ]; then
      if port_busy "$PORT"; then die ":$PORT is not a preview started by this script — leaving it alone"; fi
      die "nothing runs on :$PORT"
    fi
    TARGETS=("$REG/$PORT")
  else
    for d in "$REG"/[0-9]*/; do
      d=${d%/}; [ -f "$d/leases/$HOLDER_KEY" ] && TARGETS+=("$d")
    done
    if [ "${#TARGETS[@]}" = 0 ]; then say "you hold no preview (see --list)"; exit 0; fi
  fi
  RC=0
  for d in "${TARGETS[@]}"; do
    port=$(kv "$d/meta" PORT)
    if [ -f "$d/leases/$HOLDER_KEY" ]; then had=1; else had=0; fi
    rm -f "$d/leases/$HOLDER_KEY"
    if [ -n "$(holders "$d")" ] && [ "$FORCE" = 0 ]; then
      if [ "$had" = 1 ]; then say ":$port — your lease is dropped; it stays up for:"
      else say ":$port is not yours — left running for:"; RC=1; fi
      print_holders "$d" '    '
      continue
    fi
    # Still under the lock: until the port is free, a concurrent run must not
    # adopt the dying server again and hand it out.
    stop_tree "$(kv "$d/meta" PID)"
    rm -rf "$d"
    say ":$port stopped"
  done
  reg_unlock
  exit "$RC"
fi

# --- start: reuse, or register a new one --------------------------------------
LOG_FILE=""
SEED="$REPO/tmp/preview-sessions/$ID.json"

if [ "$SERVE" = 1 ]; then
  [ -n "$PORT" ] || die "--serve needs --port"
  LOG_FILE="$REG/$PORT.log"
  # take the entry over from the --detach run that reserved it
  reg_lock; entry_write "$REG/$PORT"; reg_unlock
  OWN_ENTRY="$REG/$PORT"
else
  if [ "$DETACH" = 1 ]; then find_holder; else self_holder; fi
  reg_lock; reg_sync; find_match

  if [ -n "$MATCH" ]; then
    port=$(kv "$MATCH/meta" PORT); log=$(kv "$MATCH/meta" LOG)
    [ "$REMINT" = 0 ] || die "--remint: the preview on :$port runs on this id's auth — stop it first"
    # A foreground caller that names its port waits for THAT port (a preview
    # pane does): attaching to another one would leave it waiting forever.
    if [ "$DETACH" = 0 ] && [ -n "$PORT" ] && [ "$PORT" != "$port" ]; then
      say "this checkout's preview already runs, on :$port rather than :$PORT:" >&2
      describe "$MATCH" | sed 's/^/[start-preview]   /' >&2
      die "use that one (--detach hands it out), or give this one its own --id"
    fi
    if [ "$DETACH" = 1 ]; then lease_take "$MATCH" "$LEASE_TTL"
    else lease_take "$MATCH" 0; OWN_LEASE="$MATCH/leases/$HOLDER_KEY"; fi
    reg_unlock
    say "this checkout's preview is already running — reusing it, not starting another"
    [ -z "$PORT" ] || [ "$PORT" = "$port" ] ||
      say "(you asked for :$PORT; it runs on :$port — a separate preview needs its own --id)"
    describe "$MATCH" | sed 's/^/[start-preview]   /'
    print_holders "$MATCH" '[start-preview]   '
    if ! port_open "$port"; then
      say "it is still starting (minting or building) — waiting for it to answer${log:+, log: $log}"
      for i in $(seq 1 900); do
        port_open "$port" && break
        entry_alive "$MATCH" || die "it died while starting${log:+ — see $log}"
        sleep 1
      done
      port_open "$port" || die "it did not answer within 15 minutes${log:+ — see $log}"
    fi
    say "preview: http://localhost:$port"
    if [ "$DETACH" = 1 ]; then lease_note "$port"; exit 0; fi
    say "attached: this run holds it until Ctrl-C"
    while entry_alive "$MATCH"; do sleep 5; done
    say "the preview on :$port has stopped"
    exit 0
  fi

  # Two previews on one id would share its auth and log each other out.
  for d in "$REG"/[0-9]*/; do
    d=${d%/}; [ -f "$d/meta" ] || continue
    if [ "$(kv "$d/meta" REPO)" = "$REPO" ] && [ "$(kv "$d/meta" ID)" = "$ID" ]; then
      say "id '$ID' is in use by the preview on :$(kv "$d/meta" PORT) ($(kv "$d/meta" MODE)$([ "$(kv "$d/meta" NO_WORKER)" = 1 ] && echo ', no-worker')), which this request cannot reuse:" >&2
      print_holders "$d" '[start-preview]   ' >&2
      die "a second preview on the same id would share its auth and log both out — use that one, or pass another --id"
    fi
  done

  if [ -n "$PORT" ]; then
    if [ -d "$REG/$PORT" ]; then
      say "port $PORT is taken by another preview:" >&2
      describe "$REG/$PORT" | sed 's/^/[start-preview]   /' >&2
      die "pick another port, or none"
    fi
    if port_busy "$PORT"; then die "port $PORT is taken by something that is not a preview"; fi
  else
    # pick the first free port from 9001 upward
    for p in $(seq 9001 9099); do
      [ -d "$REG/$p" ] || port_busy "$p" || { PORT="$p"; break; }
    done
    [ -n "$PORT" ] || die "no free port in 9001-9099"
  fi

  [ "$DETACH" = 0 ] || LOG_FILE="$REG/$PORT.log"
  entry_write "$REG/$PORT"
  OWN_ENTRY="$REG/$PORT"
  if [ "$DETACH" = 1 ]; then lease_take "$OWN_ENTRY" "$LEASE_TTL"; else lease_take "$OWN_ENTRY" 0; fi
  reg_unlock

  if [ "$DETACH" = 1 ]; then
    : >"$LOG_FILE"
    CMD=(env PATH="$PATH" TWEB_MASTER_SEED="$MASTER_SEED")
    [ -z "${TWEB_PREVIEW_REMOTE:-}" ] || CMD+=(TWEB_PREVIEW_REMOTE="$TWEB_PREVIEW_REMOTE")
    CMD+=(bash "$REPO/scripts/start-preview.sh" --serve --id "$ID" --port "$PORT")
    [ "$NO_WORKER" = 0 ] || CMD+=(--no-worker)
    [ "$REMINT" = 0 ] || CMD+=(--remint)
    case "$MODE" in static) CMD+=(--static);; watch) CMD+=(--watch);; esac
    TMUX_NAME=""; CHILD_PID=""
    if command -v tmux >/dev/null 2>&1; then
      # tmux's DEFAULT server, explicitly: a caller nested in another tmux server
      # (TMUX set) would otherwise open the window there, and the preview would
      # live and die with that server.
      TMUX_NAME="preview-$PORT"
      if tmux -L default has-session -t "=$TMUX_NAME" 2>/dev/null; then TMUX_NAME="$TMUX_NAME-$$"; fi
      TMUX_NEW=(tmux -L default new-session -d -s "$TMUX_NAME" -c "$REPO"
        "exec $(printf '%q ' "${CMD[@]}")>>$(printf '%q' "$LOG_FILE") 2>&1")
      # With no default server yet this call forks one, into the caller's
      # cgroup — under systemd that can be a service's, and the server (every
      # preview with it) would die when that service stops. A scope of its own
      # keeps it apart.
      if ! tmux -L default has-session 2>/dev/null && command -v systemd-run >/dev/null 2>&1; then
        systemd-run --user --scope --quiet "${TMUX_NEW[@]}" 2>/dev/null || true
      fi
      tmux -L default has-session -t "=$TMUX_NAME" 2>/dev/null || "${TMUX_NEW[@]}"
    else
      (exec nohup "${CMD[@]}" >>"$LOG_FILE" 2>&1 </dev/null) &
      CHILD_PID=$!
    fi
    child_running() {
      if [ -n "$TMUX_NAME" ]; then tmux -L default has-session -t "=$TMUX_NAME" 2>/dev/null
      else kill -0 "$CHILD_PID" 2>/dev/null; fi
    }
    say "starting a preview of $REPO on :$PORT in the background (log: $LOG_FILE)"
    READY=0
    for i in $(seq 1 900); do
      pid=$(kv "$OWN_ENTRY/meta" PID); pst=$(kv "$OWN_ENTRY/meta" PSTART)
      if [ -n "$pid" ] && [ "$pid" != "$$" ]; then
        proc_alive "$pid" "$pst" || break
        if port_open "$PORT"; then READY=1; break; fi
      elif ! child_running || [ "$i" -gt 60 ]; then
        break
      fi
      sleep 1
    done
    if [ "$READY" = 0 ]; then
      echo "[start-preview] the preview did not come up — tail of $LOG_FILE:" >&2
      tail -40 "$LOG_FILE" >&2 || true
      # a dead server's entry goes now; one still ours goes with the exit trap
      reg_lock
      if [ "$(kv "$OWN_ENTRY/meta" PID)" != "$$" ] && ! entry_alive "$OWN_ENTRY"; then rm -rf "$OWN_ENTRY"; fi
      reg_unlock
      exit 1
    fi
    say "preview: http://localhost:$PORT"
    [ -z "$TMUX_NAME" ] || say "its window: tmux -L default attach -t $TMUX_NAME"
    lease_note "$PORT"
    exit 0
  fi
fi

# --- serve (a foreground run, or the background half of --detach) -------------
mkdir -p "$REPO/tmp/preview-sessions"
[ "$REMINT" = 1 ] && rm -f "$SEED"

# mint a fresh, independent authorization for this preview (once per id)
if [ ! -f "$SEED" ]; then
  if [ ! -f "$MASTER_SEED" ]; then
    echo "[start-preview] master seed not found: $MASTER_SEED" >&2
    echo "[start-preview] set TWEB_MASTER_SEED or place tmp/seed.json in the main repo" >&2
    exit 1
  fi
  MINT_LOCK="$MAIN/tmp/.preview-mint.lock"
  echo "[start-preview] minting a fresh authorization for id='$ID'..."
  for i in $(seq 1 180); do
    if mkdir "$MINT_LOCK" 2>/dev/null; then MINT_LOCKED=1; break; fi
    if [ "$i" = 180 ]; then echo "[start-preview] timed out waiting for mint lock" >&2; exit 1; fi
    sleep 1
  done
  # vitest can exit non-zero on a harmless transport-teardown race even when the
  # test passed; the real success signal is whether the seed file was written.
  # `verify-deps-before-run` off for the same reason as the vite run below: in a worktree
  # node_modules is a symlink and pnpm's pre-run check aborts on it without a TTY.
  TG_API_TEST=1 TG_API_PROD_DC=1 TG_API_SEED="$MASTER_SEED" PREVIEW_SEED_OUT="$SEED" \
    pnpm --config.verify-deps-before-run=false test --run src/tests/api/previewAuth || true
  rmdir "$MINT_LOCK" 2>/dev/null || true
  MINT_LOCKED=0
  if [ ! -f "$SEED" ]; then echo "[start-preview] mint failed — $SEED not produced" >&2; exit 1; fi
fi

if [ "$HMR" = 1 ]; then MODE_TEXT="dev server + static for remotes";
elif [ "$WATCH" = 1 ]; then MODE_TEXT="static + watch";
else MODE_TEXT="static"; fi
echo "[start-preview] id=$ID  port=$PORT  seed=$SEED  no-worker=$NO_WORKER  mode=$MODE_TEXT"
echo "[start-preview] preview: http://localhost:$PORT"
# `verify-deps-before-run` is off on purpose: in a git worktree node_modules is
# a symlink into the main checkout, and pnpm's pre-run check would try to
# purge + reinstall it (aborting without a TTY, or wiping the main checkout's
# modules with one).
# `--host 127.0.0.1` pins the bind to IPv4 loopback. Vite's default (`localhost`)
# binds [::1] ONLY on macOS, which made every preview unreachable to anything
# that dialled the IPv4 literal — a proxy in front of it, for one. Keep the flag
# and a preview answers whichever form the caller uses, by name or by literal.
# Still loopback: not exposed to the LAN.
VITE=(env PREVIEW_SEED="$SEED" TWEB_PREVIEW=1 TWEB_NO_WORKER="$NO_WORKER"
      pnpm --config.verify-deps-before-run=false exec vite --config vite.preview.config.ts)

if [ "$HMR" = 1 ]; then
  # TWEB_PREVIEW_STATIC_DIR switches on the plugin that answers remote (and
  # ?static=1) requests from a built bundle, building it lazily into this dir.
  # `exec` keeps this pid — the one the registry knows the preview by.
  echo "[start-preview] hot reload on localhost; remote requests get a built bundle unless TWEB_PREVIEW_REMOTE=dev (?static=1 forces it, ?static=0 skips it)"
  exec env TWEB_PREVIEW_STATIC_DIR="$REPO/tmp/preview-dist/$ID" \
    "${VITE[@]}" --host 127.0.0.1 --port "$PORT" --strictPort
fi

# --- static mode --------------------------------------------------------------
echo "[start-preview] no hot reload here: re-run with --watch to rebuild on edit, or --hmr for the dev server"
# The seed script is injected by transformIndexHtml, which runs at build time
# too, so the built index.html boots already authorized — same as the dev
# preview, minus the module waterfall and minus the HMR websocket.
OUT="$REPO/tmp/preview-dist/$ID"
mkdir -p "$OUT"

if [ "$WATCH" = 1 ]; then
  LOG="$REPO/tmp/preview-dist/$ID.build.log"
  # TWEB_PREVIEW_KEEP_OUTDIR: do NOT wipe the dir between rebuilds. A phone that
  # loaded index.html seconds ago is still pulling its chunks; emptying the dir
  # would 404 them mid-load.
  TWEB_PREVIEW_KEEP_OUTDIR=1 "${VITE[@]}" build --outDir "$OUT" --watch >"$LOG" 2>&1 &
  BUILD_PID=$!
  echo "[start-preview] building (watch) -> $OUT   log: $LOG"
  for i in $(seq 1 600); do
    if grep -q 'built in' "$LOG" 2>/dev/null; then break; fi
    if ! kill -0 "$BUILD_PID" 2>/dev/null; then
      echo "[start-preview] build failed — tail of $LOG:" >&2; tail -30 "$LOG" >&2; exit 1
    fi
    if [ "$i" = 600 ]; then echo "[start-preview] build timed out — see $LOG" >&2; exit 1; fi
    sleep 1
  done
  echo "[start-preview] first build done — rebuilds land automatically, refresh the page to pick one up"
else
  echo "[start-preview] building -> $OUT"
  "${VITE[@]}" build --outDir "$OUT"
fi

# The build does NOT copy public/ (build.copyPublicDir is false: the production
# deploy target IS public/, which carries its own copy). The dev server serves it
# as Vite's publicDir, and `node server.js --dist` layers it under dist/ — a bare
# `vite preview` would serve neither, and the app would boot without its 38 MB of
# runtime assets (chat pattern, fonts, tgs, emoji). Symlink, don't copy: per-id
# copies of the same 38 MB add up, and sirv resolves through the link.
ln -sfn "$REPO/public/assets" "$OUT/assets"

# `vite preview` is a plain static server: no /@vite/client, no websocket, so a
# backgrounded mobile tab has nothing to lose and nothing to reload for.
"${VITE[@]}" preview --outDir "$OUT" --host 127.0.0.1 --port "$PORT" --strictPort
