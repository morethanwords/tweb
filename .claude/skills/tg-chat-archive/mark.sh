#!/bin/bash
#
# Mark archived messages as done (dealt with) so a later session does not check them
# again — see SKILL.md next to this file. Offline: edits messages.jsonl and the
# transcript only.
#
# Usage (from anywhere):
#   bash .claude/skills/tg-chat-archive/mark.sh <chat> <id>[,<id>…]… [--note TEXT] [--undo] [--dir PATH]
#   bash .claude/skills/tg-chat-archive/mark.sh <chat> --list [--dir PATH]
#
#   <chat>   folder key (chat123), Bot API or tweb id, @username, or a piece of the title
#   --note   what was done about it, or where — shown in the transcript after ✔
#   --undo   take the marks back
#   --list   print the marked messages; ✔? = edited after it was marked
#
set -euo pipefail

# realpath: the skill is also reached through the ~/.codex/skills symlink; no cd, so a
# relative --dir means what the caller meant. The formatter is TypeScript: Node strips its
# types, and the warnings about that are noise
exec node --no-warnings "$(dirname "$(realpath "$0")")/mark.mjs" "$@"
