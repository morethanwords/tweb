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
# Usage: bash scripts/codex-review.sh [--fast] [--about <text>] [--since <sha>] <what>
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
# --since <sha> reviews only what changed after an earlier review of the same
# change: <sha> is the commit that review was given, printed as "(as <sha>)", and
# it becomes the parent, so the diff Codex sees is just the fixes made since; the
# code around them is all there to read. For every target but --commit, and only
# while the base of the review — HEAD, or the merge base for --base — is still the
# one that review was built on: every commit built here names it in a
# "Built-by: scripts/codex-review.sh on <sha>" line.
#
# The models are tried in order until one answers: CODEX_REVIEW_MODELS (default
# "gpt-6.1-sol gpt-6-astra"), each at CODEX_REVIEW_EFFORT (default xhigh), each
# attempt for at most CODEX_REVIEW_TIMEOUT minutes (default 20).
#
# --fast runs them in Codex's fast mode (the "priority" service tier), which spends
# more of the plan's limits — only when the user asks for it. It speeds up the
# model's output, not its thinking: measured on gpt-6.1-sol in 2026-10, a review got
# 0–20% faster. A model that does not offer the tier runs at normal speed, and the
# script says so.
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
USAGE='usage: bash scripts/codex-review.sh [--fast] [--about <text>] [--since <sha>] --commit <sha> | --base <branch> | --uncommitted | --paths <path>... | --patch <file>'

ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || die 2 "not inside a git checkout"

# the options may stand anywhere, before the target or after it
about= fast=0 since= rest=()
while [ $# -gt 0 ]; do
  case "$1" in
    --about) [ $# -ge 2 ] || die 2 "$USAGE"; about=$2; shift 2;;
    --fast) fast=1; shift;;
    --since) [ $# -ge 2 ] || die 2 "$USAGE"; since=$2; shift 2;;
    *) rest+=("$1"); shift;;
  esac
done
set -- "${rest[@]}"
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
if [ -n "$since" ]; then
  [ "$mode" != --commit ] || die 2 "--since goes with every target but --commit"
  sha=$(git rev-parse --verify -q "$since^{commit}") || die 2 "no such commit: $since"
  since=$sha
fi
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
# What the change is built on: HEAD, or the merge base for --base. The rounds' commits stand one on
# top of the other on it, and each names it in its Built-by line; an earlier round built on another
# base, moved forward or back, would bring whatever lies between the two into the diff.
anchor=$head anchor_name=HEAD
if [ "$mode" = --base ]; then anchor=$base anchor_name='the merge base'; fi
BUILT_BY="Built-by: scripts/codex-review.sh on"
if [ -n "$since" ]; then
  built_on=$(git log -1 --format=%B "$since" | grep -xE "$BUILT_BY [0-9a-f]{40}" | tail -1 | awk '{print $NF}')
  [ -n "$built_on" ] || die 2 "${since:0:9} is not a commit this script built for a review"
  [ "$built_on" = "$anchor" ] ||
    die 2 "$anchor_name has moved since the review of ${since:0:9}: the fixes cannot be told apart from what lies between, review the whole change"
fi
# tells Codex that only the fixes since an earlier round are under review
since_note() {
  [ -z "$since" ] || printf '\n\nOnly the fixes made since an earlier review of this change (%s) are under review\nhere; the change as a whole was reviewed then.' "${since:0:9}"
}
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
  printf '%s\n\n%s %s\n' "$message" "$BUILT_BY" "$anchor" | git commit-tree "$tree" -p "$parent" || die 2 "cannot build the commit"
}

case "$mode" in
  --commit)
    what="commit $(git log -1 --format='%h %s' "$sha")"
    if [ -n "$about" ]; then
      message=$(printf '%s\n\nThe commit'"'"'s own message:\n\n%s' "$about" "$(git log -1 --format=%B "$sha")")
      anchor=$(git rev-parse "$sha^")
      sha=$(review_commit "$(git rev-parse "$sha^{tree}")" "$sha^") || exit
    fi;;
  --base)
    what="$(git branch --show-current) against $1"
    message=${about:-The changes of $what}
    commits=$(git log --reverse --format='- %s' "$base..$head")
    [ -z "$commits" ] || message=$(printf '%s\n\nThe commits on the branch:\n%s' "$message" "$commits")
    message="$message$(since_note)"
    [ -z "$since" ] || what="$what, the fixes since ${since:0:9}"
    tree=$(tree_of_changes) || exit
    sha=$(review_commit "$tree" "${since:-$base}") || exit;;
  *)
    case "$mode" in
      --paths) what="the changes to $*";;
      --patch) what="the patch $1";;
      *) what='the uncommitted changes';;
    esac
    message="$about$(since_note)"
    [ -z "$since" ] || what="$what, the fixes since ${since:0:9}"
    tree=$(tree_of_changes "$@") || exit
    sha=$(review_commit "$tree" "${since:-$head}") || exit;;
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
tier=() how=$effort
if [ "$fast" = 1 ]; then tier=(-c 'service_tier="priority"'); how="$effort, fast"; fi
failures=()
for model in "${models[@]}"; do
  say "$model ($how) reviews $what…"
  "${limit[@]}" codex exec -m "$model" -c "model_reasoning_effort=\"$effort\"" "${tier[@]}" -s read-only --ephemeral \
    review --commit "$sha" --title "$title" --json -o "$OUT/$model.md" \
    > "$OUT/$model.jsonl" 2> "$OUT/$model.stderr" < /dev/null
  code=$?
  if [ $code -eq 0 ] && grep -q '"type":"turn.completed"' "$OUT/$model.jsonl" && [ -s "$OUT/$model.md" ]; then
    cp "$OUT/$model.md" "$OUT/review.md"
    if [ "$fast" = 1 ] && grep -q 'is not advertised as supported' "$OUT/$model.jsonl"; then
      say "$model does not offer fast mode: it ran at normal speed"
      how=$effort
    fi
    echo "Codex review by $model ($how) of $what:"
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
