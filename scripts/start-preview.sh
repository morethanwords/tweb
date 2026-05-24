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
#
#   --id          preview identity; the auth is cached per id.
#                 Default: the current worktree directory name.
#   --port        fixed port. Default: first free port from 9001 upward.
#   --remint      discard the cached auth for this id and mint a fresh one.
#   --no-worker   run MTProto + crypto in the main thread (debug only). Sets
#                 Modes.noWorker at build time so breakpoints span the full
#                 pipeline without needing ?noWorker=1 in the URL.
#
set -euo pipefail

cd "$(dirname "$0")/.."
REPO="$(pwd)"

ID=""; PORT=""; REMINT=0; NO_WORKER=0
while [ $# -gt 0 ]; do
  case "$1" in
    --id) ID="${2:?}"; shift 2;;
    --port) PORT="${2:?}"; shift 2;;
    --remint) REMINT=1; shift;;
    --no-worker) NO_WORKER=1; shift;;
    *) echo "[start-preview] unknown arg: $1" >&2; exit 1;;
  esac
done

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
  TG_API_TEST=1 TG_API_PROD_DC=1 TG_API_SEED="$MASTER_SEED" PREVIEW_SEED_OUT="$SEED" \
    pnpm test src/tests/api/previewAuth || true
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

echo "[start-preview] id=$ID  port=$PORT  seed=$SEED  no-worker=$NO_WORKER"
echo "[start-preview] preview: http://localhost:$PORT"
exec env PREVIEW_SEED="$SEED" TWEB_PREVIEW=1 TWEB_NO_WORKER="$NO_WORKER" pnpm exec vite \
  --config vite.preview.config.ts --port "$PORT" --strictPort
