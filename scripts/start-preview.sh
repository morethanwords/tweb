#!/bin/bash
#
# Launch an authorized tweb preview.
#
# Each preview gets:
#   * its own freshly minted, INDEPENDENT authorization (so multiple previews
#     / worktrees never share an auth key — parallel use logs both out)
#   * its own free port (so multiple preview servers can run at once)
#
# The per-preview authorization is minted once per --id and reused on restart;
# pass --remint to force a new one. Minting is serialised by a lock because it
# briefly drives the master session (tmp/seed.json) and reads the login code
# from the Telegram service chat — two concurrent mints would collide.
#
# Usage (run from anywhere — the script cd's to the repo root itself):
#   bash scripts/start-preview.sh [--id <id>] [--port <port>] [--remint] [--no-worker]
#                                 [--static | --watch]
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
#   --static      serve ONLY the built bundle, no dev server at all.
#   --watch       --static plus a rebuild watcher.
#
#   --id          preview identity; the auth is cached per id.
#                 Default: the current worktree directory name.
#   --port        fixed port. Default: first free port from 9001 upward.
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
REPO="$(pwd)"

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
    *) echo "[start-preview] unknown arg: $1" >&2; exit 1;;
  esac
done

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

# default id = worktree dir name; sanitise for use as a filename
[ -n "$ID" ] || ID="$(basename "$REPO")"
ID="$(printf '%s' "$ID" | tr -c 'A-Za-z0-9._-' '_')"

# the master seed lives in the MAIN worktree's tmp/ (tmp/ is gitignored, so a
# fresh worktree has none of its own) — locate it via the shared git dir.
# TWEB_MASTER_SEED may be: unset (default seed.json), an absolute path, or a
# bare filename which we resolve against the main worktree's tmp/.
MAIN="$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)"
MASTER_SEED="${TWEB_MASTER_SEED:-seed.json}"
case "$MASTER_SEED" in
  /*) ;;  # already absolute — leave as-is
  *) MASTER_SEED="$MAIN/tmp/$MASTER_SEED" ;;
esac
if [ ! -f "$MASTER_SEED" ]; then
  echo "[start-preview] master seed not found: $MASTER_SEED" >&2
  echo "[start-preview] set TWEB_MASTER_SEED or place tmp/seed.json in the main repo" >&2
  exit 1
fi

SEED="$REPO/tmp/preview-sessions/$ID.json"
mkdir -p "$REPO/tmp/preview-sessions"
[ "$REMINT" = 1 ] && rm -f "$SEED"

# mint a fresh, independent authorization for this preview (once per id)
if [ ! -f "$SEED" ]; then
  LOCK="$MAIN/tmp/.preview-mint.lock"
  echo "[start-preview] minting a fresh authorization for id='$ID'..."
  for i in $(seq 1 180); do
    if mkdir "$LOCK" 2>/dev/null; then break; fi
    if [ "$i" = 180 ]; then echo "[start-preview] timed out waiting for mint lock" >&2; exit 1; fi
    sleep 1
  done
  trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
  # vitest can exit non-zero on a harmless transport-teardown race even when the
  # test passed; the real success signal is whether the seed file was written.
  # `verify-deps-before-run` off for the same reason as the vite run below: in a worktree
  # node_modules is a symlink and pnpm's pre-run check aborts on it without a TTY.
  TG_API_TEST=1 TG_API_PROD_DC=1 TG_API_SEED="$MASTER_SEED" PREVIEW_SEED_OUT="$SEED" \
    pnpm --config.verify-deps-before-run=false test src/tests/api/previewAuth || true
  rmdir "$LOCK" 2>/dev/null || true
  trap - EXIT
  if [ ! -f "$SEED" ]; then echo "[start-preview] mint failed — $SEED not produced" >&2; exit 1; fi
fi

# pick the first free port from 9001 upward unless one was given
if [ -z "$PORT" ]; then
  for p in $(seq 9001 9099); do
    if ! lsof -ti ":$p" >/dev/null 2>&1; then PORT="$p"; break; fi
  done
fi
[ -n "$PORT" ] || { echo "[start-preview] no free port in 9001-9099" >&2; exit 1; }

if [ "$HMR" = 1 ]; then MODE="dev server + static for remotes";
elif [ "$WATCH" = 1 ]; then MODE="static + watch";
else MODE="static"; fi
echo "[start-preview] id=$ID  port=$PORT  seed=$SEED  no-worker=$NO_WORKER  mode=$MODE"
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
  echo "[start-preview] hot reload on localhost; remote requests get a built bundle (?static=1 to force it here)"
  exec env TWEB_PREVIEW_STATIC_DIR="$REPO/tmp/preview-dist/$ID" \
    "${VITE[@]}" --host 127.0.0.1 --port "$PORT" --strictPort
fi

# --- static mode (the default) ----------------------------------------------
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
  trap 'kill "$BUILD_PID" 2>/dev/null || true' EXIT INT TERM
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
