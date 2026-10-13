#!/bin/bash
#
# A code review by Codex (GPT), for the agents working in this repo.
#
# Asked for a review, an agent does not review its own change: it hands the
# change to `codex exec review`, together with what the change is for, then
# checks what comes back against the code (.claude/skills/codex-review/SKILL.md).
# Codex reads the change and the code around it in its own read-only sandbox, so
# it cannot touch a tree other sessions work in — and cannot run the tests
# either, those stay with the agent.
#
# Usage: bash scripts/codex-review.sh [--about <text>] <what>
#
# What is reviewed — exactly one of:
#   --commit <sha>      what a commit changes
#   --base <branch>     the current branch and its uncommitted changes against
#                       <branch>: a worktree's own branch against master
#   --uncommitted       every uncommitted change, untracked files too; only in
#                       a checkout nobody else works in
#   --paths <path>...   these files (from the checkout's root) as they are in
#                       the tree, on top of HEAD
#   --patch <file>      this diff, on top of HEAD (`git diff HEAD`, not the
#                       index-relative `git diff`)
# --paths and --patch are for a checkout shared with other sessions, where
# --uncommitted would review everyone's work in progress.
#
# --about says what the change is for and what it does on purpose, the way a
# commit message would: Codex reviews the change against it rather than
# guessing the intent from the diff. Codex cannot be given instructions next to
# a commit, so the change goes to it as one commit — HEAD's, a branch's or the
# tree's changes on top of their base — whose message is that text, built in a
# throwaway index on no branch, with HEAD and the real index untouched. A commit
# already has a message, so --about is optional for --commit and --base and
# required for the rest.
#
# The models are tried in order until one answers: CODEX_REVIEW_MODELS (default
# "gpt-6.1-sol gpt-6-astra"), each at CODEX_REVIEW_EFFORT (default xhigh), each
# attempt for at most CODEX_REVIEW_TIMEOUT minutes (default 20).
#
# Prints the review and keeps it, with Codex's event log, in tmp/codex-review/.
# Exit status:
#   0  reviewed; the review may still list findings
#   2  bad arguments, or nothing to review
#   3  Codex is unavailable: not installed, signed out, every model refused or
#      failed. The reason is printed; review the change some other way.
#   4  cannot run here: ~/.codex is not writable, as inside an agent's sandbox,
#      which keeps Codex off the network too. Run this outside the sandbox.
#
set -uo pipefail

say() { echo "[codex-review] $*" >&2; }
die() { local code=$1; shift; say "$*"; exit "$code"; }
USAGE='usage: bash scripts/codex-review.sh [--about <text>] --commit <sha> | --base <branch> | --uncommitted | --paths <path>... | --patch <file>'

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die 2 "not inside a git checkout"

about=
if [ "${1:-}" = --about ]; then
  [ $# -ge 2 ] || die 2 "$USAGE"
  about=$2
  shift 2
fi
mode=${1:-}
[ $# -gt 0 ] && shift
case "$mode" in
  --commit|--base|--patch) [ $# -eq 1 ] || die 2 "$USAGE";;
  --uncommitted) [ $# -eq 0 ] || die 2 "$USAGE";;
  --paths) [ $# -ge 1 ] || die 2 "$USAGE";;
  *) die 2 "$USAGE";;
esac
case "$mode" in
  --commit|--base) ;;
  *) [ -n "$about" ] || die 2 "say what the change is for and what it does on purpose: --about <text>";;
esac
# HEAD is read once: another session may commit while this runs
head=$(git rev-parse --verify -q HEAD) || die 2 "no commit to review against"
case "$mode" in
  --commit)
    sha=$(git rev-parse --verify -q "$1^{commit}") || die 2 "no such commit: $1"
    [ -z "$about" ] || git rev-parse --verify -q "$sha^" >/dev/null || die 2 "--about needs a commit with a parent";;
  --base)
    base=$(git merge-base "$head" "$1" 2>/dev/null) || die 2 "no such branch, or nothing in common with it: $1";;
  --patch)
    [ -s "$1" ] || die 2 "no such patch, or it is empty: $1"
    patch=$(realpath "$1");;
esac
cd "$ROOT" || die 2 "cannot enter $ROOT"

# the standalone installer puts it here, and a non-login shell may not have it on PATH
command -v codex >/dev/null || PATH=$HOME/.local/bin:$PATH
command -v codex >/dev/null || die 3 "Codex is unavailable: codex is not installed"
CODEX_DIR=${CODEX_HOME:-$HOME/.codex}
[ -d "$CODEX_DIR" ] || die 3 "Codex is unavailable: it was never set up ($CODEX_DIR is missing)"
probe=$(mktemp "$CODEX_DIR/.codex-review.XXXXXX" 2>/dev/null) ||
  die 4 "cannot write to $CODEX_DIR: inside a sandbox? Run this outside it"
rm -f "$probe"
codex login status >/dev/null 2>&1 || die 3 "Codex is unavailable: signed out (codex login status)"

mkdir -p tmp/codex-review || die 2 "cannot create tmp/codex-review"
find tmp/codex-review -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null
OUT=tmp/codex-review/$(date +%Y%m%d-%H%M%S)-$$
mkdir "$OUT" || die 2 "cannot create $OUT"

# HEAD's tree plus the changes asked for. Everything uncommitted starts from a copy of the real index,
# whose cached file stats spare hashing the whole tree again.
tree_of_changes() {
  local index
  index=$(git rev-parse --path-format=absolute --git-path index) || die 2 "cannot find the index"
  export GIT_INDEX_FILE=$OUT/index
  case "$mode" in
    --paths)
      git read-tree "$head" || die 2 "cannot read HEAD"
      git add -A -- "$@" || die 2 "cannot take these paths: $*";;
    --patch)
      git read-tree "$head" || die 2 "cannot read HEAD"
      git apply --cached "$patch" || die 2 "the patch does not apply to HEAD: $patch";;
    *)
      cp "$index" "$GIT_INDEX_FILE" || die 2 "cannot copy the index"
      git add -A . || die 2 "cannot take the uncommitted changes";;
  esac
  git write-tree || die 2 "cannot write the tree"
  rm -f "$GIT_INDEX_FILE"
}

# the change as one commit on no branch, whose message is $message
review_commit() {
  local tree=$1 parent=$2
  if [ "$tree" = "$(git rev-parse "$parent^{tree}")" ]; then
    rm -rf "$OUT"
    die 2 "nothing to review: no changes"
  fi
  printf '%s\n' "$message" | git commit-tree "$tree" -p "$parent" || die 2 "cannot build the commit"
}

case "$mode" in
  --commit)
    what="commit $(git log -1 --format='%h %s' "$sha")"
    if [ -n "$about" ]; then
      message=$(printf '%s\n\nThe commit'"'"'s own message:\n\n%s' "$about" "$(git log -1 --format=%B "$sha")")
      sha=$(review_commit "$(git rev-parse "$sha^{tree}")" "$sha^") || exit
    fi;;
  --base)
    what="$(git branch --show-current) against $1"
    message=${about:-The changes of $what}
    commits=$(git log --reverse --format='- %s' "$base..$head")
    [ -z "$commits" ] || message=$(printf '%s\n\nThe commits on the branch:\n%s' "$message" "$commits")
    tree=$(tree_of_changes) || exit
    sha=$(review_commit "$tree" "$base") || exit;;
  *)
    case "$mode" in
      --paths) what="the changes to $*";;
      --patch) what="the patch $1";;
      *) what='the uncommitted changes';;
    esac
    message=$about
    tree=$(tree_of_changes "$@") || exit
    sha=$(review_commit "$tree" "$head") || exit;;
esac
# a commit built here gets named
[ "$mode" = --commit ] && [ -z "$about" ] || what="$what (as ${sha:0:9})"
title=$(git log -1 --format=%s "$sha")

# why an attempt failed, from its event log: the turn's error, which may wrap the API's JSON answer
failure() {
  node -e '
    let message;
    for(const line of require("fs").readFileSync(process.argv[1], "utf8").split("\n")) {
      try {
        const event = JSON.parse(line);
        if(event.type === "turn.failed") message = event.error?.message;
        else if(event.type === "error") message = event.message;
      } catch{}
    }
    try {
      const inner = JSON.parse(message);
      message = inner.error?.message ?? inner.message ?? message;
    } catch{}
    if(message) console.log(message);
  ' "$1" 2>/dev/null
}

read -r -a models <<< "${CODEX_REVIEW_MODELS:-gpt-6.1-sol gpt-6-astra}"
effort=${CODEX_REVIEW_EFFORT:-xhigh}
minutes=${CODEX_REVIEW_TIMEOUT:-20}
limit=()
command -v timeout >/dev/null && limit=(timeout "${minutes}m")
failures=()
for model in "${models[@]}"; do
  say "$model ($effort) reviews $what…"
  "${limit[@]}" codex exec -m "$model" -c "model_reasoning_effort=\"$effort\"" -s read-only --ephemeral \
    review --commit "$sha" --title "$title" --json -o "$OUT/$model.md" \
    > "$OUT/$model.jsonl" 2> "$OUT/$model.stderr" < /dev/null
  code=$?
  if [ $code -eq 0 ] && grep -q '"type":"turn.completed"' "$OUT/$model.jsonl" && [ -s "$OUT/$model.md" ]; then
    cp "$OUT/$model.md" "$OUT/review.md"
    echo "Codex review by $model ($effort) of $what:"
    echo
    cat "$OUT/review.md"
    echo
    echo "(kept in $OUT/)"
    exit 0
  fi
  if [ $code -eq 124 ]; then
    reason="no answer in $minutes min"
  else
    reason=$(failure "$OUT/$model.jsonl")
    [ -n "$reason" ] || reason=$(grep -v '^[[:space:]]*$' "$OUT/$model.stderr" | tail -1)
    [ -n "$reason" ] || reason="exit $code"
  fi
  say "$model failed: $reason"
  failures+=("$model: $reason")
done
die 3 "Codex is unavailable: $(IFS=';'; echo "${failures[*]}" | sed 's/;/; /g')"
