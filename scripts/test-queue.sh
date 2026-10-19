#!/bin/bash
#
# One queue for the heavy test runs of every checkout on this machine.
#
# A Playwright suite takes 75% of the CPUs and a full vitest run about as many
# forks: sized for a machine that runs one of them at a time. When several
# agents run suites at once, one per worktree, the CPU is oversubscribed a few
# times over, every test runs that much slower, and the runs fail on their own
# timeouts — a retry only adds to the load. So a heavy run first takes its
# workers out of one budget for the whole machine (75% of the CPUs) and waits
# until they are free: the runs go one after another, each at full speed.
#
# The runs join on their own (scripts/testQueue.ts): a Playwright run waits in
# its config's globalSetup for the workers it resolved to, a full vitest run
# while vite.config.ts loads. So `pnpm test:popups`, a bare `playwright test -c
# …` and a full `vitest run` all queue — `pnpm test` too, when it runs without a
# terminal as an agent's does; in a terminal it is a watch session and does not.
# A vitest run of a few files does not queue, it is cheap. A Playwright run
# narrowed to some files or tests gets at most 4 workers
# (TWEB_TEST_QUEUE_NARROWED) unless --workers says otherwise, so a few of them
# share the machine. The queue is off on CI, on machines without flock(1)
# (macOS), and with TWEB_TEST_QUEUE=0.
#
# How the runs agree on the order, with no daemon:
#   * The queue is a directory, tmp/test-queue/ of the main checkout, shared by
#     every worktree. A run has one ticket file there: its number, how many
#     workers it needs, what it is, and whether it waits or runs.
#   * A small holder process keeps the ticket locked (flock) for exactly as long
#     as the run lives. The kernel drops the lock when the holder dies, so a
#     ticket nobody holds belongs to a run that is gone — finished, crashed,
#     killed — and whoever looks next deletes it. A dead run never keeps its
#     place.
#   * Every read or change of the queue happens under one lock (.lock), and the
#     numbers come from a counter under it: no two runs get the same number, and
#     no two decide at once that it is their turn.
#   * A run starts when it is the lowest-numbered waiting ticket and its workers
#     fit in what the running ones leave. Strictly in order: quick runs never
#     overtake a big one, so a full sweep is not starved.
#   * A run started with TWEB_TEST_QUEUE_PRIORITY=1 — the full vitest run of a
#     release build (build.js) — goes ahead of every waiting run, never ahead of
#     a running one: it is next as soon as they leave its workers free. It takes
#     a number below every ticket in the queue, so the script of every checkout,
#     whatever its version, puts it first.
#
# Usage:
#   bash scripts/test-queue.sh       what runs and what waits, in order
# The runs call it themselves:
#   bash scripts/test-queue.sh hold <id> <run-pid> <workers> <label>
#   bash scripts/test-queue.sh wait <id> <run-pid>    (prints the workers granted)
#   bash scripts/test-queue.sh budget                 (prints the budget)
#
# TWEB_TEST_QUEUE_BUDGET sets the budget: workers for the whole machine.
#
set -uo pipefail

die() { echo "[test-queue] $*" >&2; exit 2; }
command -v flock >/dev/null || die "flock(1) is not installed"
COMMON=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || die "not inside a git checkout"
Q="$(dirname "$COMMON")/tmp/test-queue"
mkdir -p "$Q" || die "cannot create $Q"
BUDGET=${TWEB_TEST_QUEUE_BUDGET:-$(( $(nproc) * 3 / 4 ))}
[ "$BUDGET" -ge 1 ] 2>/dev/null || BUDGET=1

# Every queue operation is short, so a lock held this long belongs to a stopped process (Ctrl-Z): give up
# instead of hanging every run on the machine — the run then goes without the queue.
lock() { exec 9>>"$Q/.lock" && flock -w 30 9; }
unlock() { exec 9>&-; }
tick() { printf -v NOW '%(%s)T' -1; }
# AGE = how long ago $1 (epoch seconds) was
age() { local s=$(( NOW - $1 )); printf -v AGE '%dm%02ds' $((s / 60)) $((s % 60)); }

# A ticket's fields into globals, and DESC = "#12 popups · rtl, 12 workers". Builtins only: every waiting
# run reads the whole queue every 2 s, on a machine that is short of CPU by definition.
load() {
  local k v
  NEED=1 LABEL='?' CHECKOUT='?' SINCE=$NOW STATE=waiting STARTED='' PRIORITY=''
  while IFS='=' read -r k v; do
    case $k in NEED|LABEL|CHECKOUT|SINCE|STATE|STARTED|PRIORITY) printf -v "$k" '%s' "$v" ;; esac
  done <"$1"
  NUM=${1##*/t-}; NUM=$((10#${NUM%%-*}))
  local s=s; [ "$NEED" != 1 ] || s=''
  printf -v DESC '#%d %s · %s, %s worker%s' "$NUM" "$LABEL" "$CHECKOUT" "$NEED" "$s"
  [ -z "$PRIORITY" ] || DESC+=', priority'
}
# the loaded fields back into ticket $1 — in place: the holder's lock is on this very file
store() {
  printf '%s\n' "NEED=$NEED" "LABEL=$LABEL" "CHECKOUT=$CHECKOUT" "SINCE=$SINCE" "STATE=$STATE" ${STARTED:+"STARTED=$STARTED"} ${PRIORITY:+"PRIORITY=$PRIORITY"} >"$1"
}

# Delete the tickets whose holder is gone. Under the lock.
reap() {
  local t
  for t in "$Q"/t-*; do
    [ -e "$t" ] && flock -n "$t" true 2>/dev/null && rm -f "$t"
  done
}

hold() {
  local id=$1 pid=$2 top branch seq n x t low=''
  tick
  NEED=$3 LABEL=$4 SINCE=$NOW STATE=waiting STARTED='' PRIORITY=''
  [ "${TWEB_TEST_QUEUE_PRIORITY:-}" != 1 ] || PRIORITY=1
  [ "$NEED" -ge 1 ] 2>/dev/null || NEED=1
  [ "$NEED" -le "$BUDGET" ] || NEED=$BUDGET
  top=$(git rev-parse --show-toplevel 2>/dev/null); CHECKOUT=${top##*/}
  branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  [ -z "$branch" ] || [ "$branch" = "$CHECKOUT" ] || CHECKOUT="$CHECKOUT ($branch)"
  lock || exit 1
  seq=$(cat "$Q/seq" 2>/dev/null)
  [[ $seq =~ ^[0-9]+$ ]] || seq=0
  # never below a ticket still in the queue, should the counter have been deleted under it
  for x in "$Q"/t-*; do
    [ -e "$x" ] || continue
    n=${x##*/t-}; n=$((10#${n%%-*}))
    [ "$n" -le "$seq" ] || seq=$n
    [ -n "$low" ] && [ "$low" -le "$n" ] || low=$n
  done
  seq=$((seq + 1))
  echo "$seq" >"$Q/seq"
  # a priority run, below every ticket: the queue goes by the numbers, here and in the older copies of this
  # script in the other checkouts alike
  [ -z "$PRIORITY" ] || [ "${low:-0}" -lt 1 ] || seq=$((low - 1))
  printf -v t '%s/t-%08d-%s' "$Q" "$seq" "$id"
  store "$t"
  # Taken before the queue lock is dropped, so nobody ever sees this ticket unheld while the run lives.
  exec 8<"$t"
  flock -n 8 || { rm -f "$t"; exit 1; }
  unlock
  # without fd 8: the lock must go with this process, not with a tail that outlives a killed holder
  tail --pid="$pid" -f /dev/null 8<&- 2>/dev/null
  lock && rm -f "$t"
}

wait_turn() {
  local id=$1 pid=$2 start t x used first seen=0 key said="" said_at=0
  local -a ahead keys
  tick; start=$NOW
  while kill -0 "$pid" 2>/dev/null; do
    lock || die "the queue's lock has been held for 30 s"
    reap
    tick
    t=""; for x in "$Q"/t-*-"$id"; do [ -e "$x" ] && t=$x; done
    if [ -z "$t" ]; then
      unlock
      [ "$seen" = 0 ] || die "this run's ticket is gone: its holder died"
      [ $(( NOW - start )) -lt 60 ] || die "the holder never put this run in the queue"
      sleep 0.2; continue
    fi
    seen=1; used=0; first=""; ahead=(); keys=()
    for x in "$Q"/t-*; do
      [ -e "$x" ] || continue
      load "$x"
      if [ "$STATE" = running ]; then
        used=$(( used + NEED )); age "$STARTED"
        ahead+=("running $DESC — for $AGE"); keys+=("r$NUM")
      else
        [ -n "$first" ] || first=$x
        if [[ "$x" < "$t" ]]; then ahead+=("waiting $DESC"); keys+=("w$NUM"); fi
      fi
    done
    load "$t"
    if [ "$first" = "$t" ] && [ $(( used + NEED )) -le "$BUDGET" ]; then
      STATE=running STARTED=$NOW
      store "$t"
      unlock
      age "$start"
      [ -z "$said" ] || echo "[test-queue] $DESC starts after waiting $AGE" >&2
      echo "$NEED"
      return 0
    fi
    unlock
    key="${keys[*]}"
    if [ "$key" != "$said" ] || [ $(( NOW - said_at )) -ge 60 ]; then
      [ -n "$said" ] || echo "[test-queue] $DESC waits for its turn: the machine runs one budget of $BUDGET workers for all checkouts. If you cannot wait in the foreground, run it in the background. The queue: bash scripts/test-queue.sh" >&2
      age "$start"
      echo "[test-queue] waiting $AGE, $(( BUDGET - used )) of $BUDGET workers free, ahead:" >&2
      [ ${#ahead[@]} = 0 ] || printf '  %s\n' "${ahead[@]}" >&2
      said=$key; said_at=$NOW
    fi
    sleep 2
  done
  exit 1
}

status() {
  local x used=0
  local -a lines=()
  lock || die "the queue's lock has been held for 30 s"
  reap
  tick
  for x in "$Q"/t-*; do
    [ -e "$x" ] || continue
    load "$x"
    if [ "$STATE" = running ]; then
      used=$(( used + NEED )); age "$STARTED"
      lines+=("running $DESC — for $AGE")
    else
      age "$SINCE"
      lines+=("waiting $DESC — for $AGE")
    fi
  done
  unlock
  echo "[test-queue] $used of $BUDGET workers in use; ${#lines[@]} run(s) in the queue ($Q)"
  [ ${#lines[@]} = 0 ] || printf '  %s\n' "${lines[@]}"
}

case "${1:-status}" in
  hold) shift; hold "$@" ;;
  wait) shift; wait_turn "$@" ;;
  status) status ;;
  budget) echo "$BUDGET" ;;
  *) die "unknown command '$1' — see the header of $0" ;;
esac
