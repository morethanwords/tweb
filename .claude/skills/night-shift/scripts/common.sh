# common.sh — sourced by the night-shift scripts.

# Anything started under another login drops what could speak for a different one first: the stale CLAUDE_*
# variables the default tmux server hands every window (the main account's bridge among them), and any ANTHROPIC_*
# variable (an API key or an auth token in the environment wins over the login of CLAUDE_CONFIG_DIR).
drop_claude_env() {
  local v
  for v in $(compgen -e); do case $v in CLAUDE*|ANTHROPIC*) unset "$v";; esac; done
}
