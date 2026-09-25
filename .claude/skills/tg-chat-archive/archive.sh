#!/bin/bash
#
# Archive one Telegram chat to disk (default ~/.claude/tg-archive) and keep it
# in sync — see SKILL.md next to this file. The engine is
# src/tests/api/chatArchive.test.ts running on the MTProto Node harness.
#
# Usage (from anywhere):
#   bash .claude/skills/tg-chat-archive/archive.sh <peer> [--dry] [--full]
#        [--since YYYY-MM-DD|all] [--max N] [--dir PATH] [--master SEED] [--seed SEED]
#
#   <peer>     -100… / -… / tweb #-… id, @username, t.me link, or `me`
#   --dry      resolve the chat and print what it is; write nothing
#   --full     re-read the whole history (catches old edits, marks deletions)
#   --since    keep only messages from that day on (local time) and stop the
#              backfill there; remembered for later runs, `all` removes it
#   --max N    older messages backfilled per run (default 50000) — the next run
#              continues where this one stopped; new messages are always read
#   --dir      archive root (default ~/.claude/tg-archive)
#   --master   master seed to mint the skill's session from (default
#              tmp/seed.json; bare names resolve against the main repo's tmp/)
#   --seed     use this session seed as is, no minting — it must not be a key
#              a browser tab is using right now (AUTH_KEY_DUPLICATED)
#
# A chat archived before is read with the session its meta.json records, so a
# refresh needs neither --seed nor --master; passing either overrides it.
#
set -euo pipefail

# realpath: the skill is also reached through the ~/.codex/skills symlink
cd "$(dirname "$(realpath "$0")")/../../.."
# tmp/ is gitignored, so seeds live in the MAIN worktree's tmp/ only
MAIN="$(cd "$(dirname "$(git rev-parse --git-common-dir)")" && pwd)"

PEER=""; SEED=""; MASTER="seed.json"
while [ $# -gt 0 ]; do
  case "$1" in
    --dry) export TG_ARCHIVE_DRY=1; shift;;
    --full) export TG_ARCHIVE_FULL=1; shift;;
    --since) export TG_ARCHIVE_SINCE="${2:?}"; shift 2;;
    --max) export TG_ARCHIVE_MAX="${2:?}"; shift 2;;
    --dir) export TG_ARCHIVE_DIR="${2:?}"; shift 2;;
    --master) MASTER="${2:?}"; export TG_ARCHIVE_SEED_EXPLICIT=1; shift 2;;
    --seed) SEED="${2:?}"; export TG_ARCHIVE_SEED_EXPLICIT=1; shift 2;;
    # a negative chat id (-100…) is the peer, not a flag
    --*|-[!0-9]*) echo "[tg-archive] unknown flag: $1" >&2; exit 1;;
    *) [ -z "$PEER" ] || { echo "[tg-archive] one peer per run" >&2; exit 1; }; PEER="$1"; shift;;
  esac
done
[ -n "$PEER" ] || { echo "usage: archive.sh <peer> [--dry] [--full] [--since YYYY-MM-DD|all] [--max N] [--dir PATH] [--master SEED] [--seed SEED]" >&2; exit 1; }

if [ -z "$SEED" ]; then
  case "$MASTER" in
    /*) ;;
    *) MASTER="$MAIN/tmp/$MASTER" ;;
  esac
  [ -f "$MASTER" ] || { echo "[tg-archive] master seed not found: $MASTER" >&2; exit 1; }

  # The skill's own authorization, one per account, minted once exactly the way
  # start-preview.sh mints a preview's: a key no browser tab ever holds.
  USER_ID="$(node -p "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8')).userId" "$MASTER")"
  SEED="$MAIN/tmp/preview-sessions/tg-archive-$USER_ID.json"
  if [ ! -f "$SEED" ]; then
    mkdir -p "$MAIN/tmp/preview-sessions"
    LOCK="$MAIN/tmp/.preview-mint.lock"
    echo "[tg-archive] minting a session of its own ($SEED)…"
    for i in $(seq 1 180); do
      if mkdir "$LOCK" 2>/dev/null; then break; fi
      if [ "$i" = 180 ]; then echo "[tg-archive] timed out waiting for the mint lock" >&2; exit 1; fi
      sleep 1
    done
    trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
    TG_API_TEST=1 TG_API_PROD_DC=1 TG_API_SEED="$MASTER" PREVIEW_SEED_OUT="$SEED" \
      pnpm --config.verify-deps-before-run=false test --run src/tests/api/previewAuth || true
    rmdir "$LOCK" 2>/dev/null || true
    trap - EXIT
    if [ ! -f "$SEED" ]; then
      echo "[tg-archive] mint failed — $SEED not produced." >&2
      echo "[tg-archive] AUTH_KEY_DUPLICATED above = a live tab holds $MASTER; mint from another" >&2
      echo "[tg-archive] session of the same account: --master seed-preview.json or --master preview-sessions/<idle>.json" >&2
      exit 1
    fi
  fi
fi

LOG="$(mktemp -t tg-archive)"
# vitest can exit non-zero on a harmless transport-teardown race after the
# test passed — the runner's own last line is the real success signal
TG_ARCHIVE_PEER="$PEER" TG_API_SEED="$SEED" TG_API_PROD_DC=1 \
  pnpm --config.verify-deps-before-run=false test --run src/tests/api/chatArchive.test.ts --silent=false --reporter=verbose 2>&1 \
  | tee "$LOG" | grep --line-buffered -E '^\[tg-archive\]|^ ?FAIL |^([A-Z][A-Za-z]* )?[A-Za-z]*Error: ' || true

if grep -qE '^\[tg-archive\] (done|dry run)' "$LOG"; then
  rm -f "$LOG"
else
  echo "[tg-archive] failed — full vitest output: $LOG" >&2
  exit 1
fi
