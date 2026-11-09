---
name: eco
description: "Eco mode — do a task on a tight Claude usage budget: this session only orchestrates (plans, decides, briefs, checks reports — it writes no code), Codex does the reading-heavy research and every review round (its limits are far wider), and Claude agents at a lower effort or a cheaper model (Opus medium, Sonnet medium) write the code and run the browser checks. Use when the user asks to save usage, to work as an orchestrator, or to hand the work to cheaper agents — \"сэкономь юзедж\", \"мало юзеджа\", \"будь оркестратором\", \"спавни агентов\", \"раздай агентам\", \"экономно\", \"эко-режим\", \"eco mode\", \"save usage\"."
user-invocable: true
argument-hint: "<the task>"
---

# Eco mode: one planning session, cheap hands, Codex as the reviewer

The session that runs this skill is the **orchestrator**. It is the expensive model at a high effort, and every token
it reads stays in its context and is paid again on every later turn. So it keeps its own context small and spends it
on what needs judgement: the plan, the decisions where references disagree, the briefs, and checking what comes back.
Everything else goes elsewhere:

| Work | Who | Why |
|---|---|---|
| Reading reference clients / large code to find what is missing | **Codex** (`codex exec`) | reading is the most token-hungry part; Codex's limits are much wider |
| Every code review round | **Codex** (`scripts/codex-review.sh`, the `codex-review` skill) | same, and a reviewer that did not write the code |
| Complex UI, tricky state, anything a weak model gets subtly wrong | Agent, `model: "opus"`, `effort: "medium"` | |
| Managers, plumbing, fixes from a findings list, tests, browser checklists | Agent, `model: "sonnet"`, `effort: "medium"` | |
| A fix of a line or two, a string, a renamed key | Agent, `model: "sonnet"`, `effort: "low"` | 3–5 calls instead of 10–40 |
| Plan, decisions, briefs, verdicts on findings | the orchestrator | |

This skill is the explicit instruction the Agent tool asks for before it sets `effort` on an agent: pass `effort` and
`model` on every agent this skill spawns. Never use `subagent_type: "fork"` — a fork inherits the orchestrator's model,
effort and whole context.

**Where the usage actually goes** (measured on a feature done this way, 2026-11): every tool call re-reads the whole
context from the cache, and those reads were about half of everything spent; writing new context to the cache was
another third. So the first lever is **fewer calls and smaller contexts**: a fresh agent is cheap because its context
is small, and the orchestrator was the largest single item (about half) because its context only grew. The second is
the model: Sonnet costs half of Opus on every part of it, cache reads included, so whatever Sonnet can do goes to
Sonnet. Every context also starts with the same base — the harness, AGENTS.md, the local notes, the memory index — so
a short-lived agent still costs that base once. The costliest single mistake was a rework: an agent left the reference
clients' design, the orchestrator accepted it, and the user sent it back.

## Hard rules

- **The orchestrator writes no code** — not a feature, not a two-line review fix, not a test. Every edit of the
  repository goes to an agent. It may write its own scratch files (prompts, notes) and memory.
- **It never reads an agent's output file or transcript** — only the agent's final report. It does not read whole
  source files to "check" an agent's work; it asks Codex to review instead, and reads Codex's report.
- **It does not resume a large agent for a small follow-up.** Resuming re-reads the agent's whole context (often
  200k+ tokens). A fresh agent with a precise brief is cheaper. Continue an agent only for a quick question whose
  answer is already in its context.
- **It does not load what it does not need**: no large references or skills pulled in for a side question, no source
  files read "to see". Whatever enters its context is paid again on every later call.
- **One task per session.** A request unrelated to the task (another skill, another feature) is better done in a
  session of its own: say so, and do it here only if the user wants it here.
- **Never commit** unless the user says so (AGENTS.md); `/finalize` is the usual way to.

## Phases

The work runs in phases: **research and plan → implementation (and its browser check) → review rounds →
finalize**. At the end of each phase the orchestrator writes `$SCRATCH/handoff.md` — the task, every decision taken
and why, the worktree and branch, the files the change touches, the Codex report's path, what each agent reported in a
line, the review rounds so far with their counts, the previews running, what is next — and asks the user to run
`/compact` (or to start a new session and point it at the file). The orchestrator cannot compact itself, and a phase
boundary is where a summary loses the least. Not on an automatic threshold mid-phase: the base alone is ~130k tokens,
and a low threshold compacts every few calls and loses decisions in the middle of the work.

## 1. Workspace

Work in a worktree of its own unless the user says otherwise, so the agents' edits never mix with other sessions'.
`SCRATCH` is the session's scratchpad directory (or a new folder under `tmp/`) — every snippet here writes there:

```bash
SCRATCH=<the scratchpad directory>; mkdir -p "$SCRATCH"; SCRATCH=$(realpath "$SCRATCH")   # absolute: later steps cd
git worktree add -b <branch> .claude/worktrees/<name> master
ln -s "$(pwd)/node_modules" .claude/worktrees/<name>/node_modules
# generated, gitignored files tsc needs (CSS module typings, the lang pack version):
git ls-files --others --ignored --exclude-standard src | grep -E '\.d\.scss\.ts$|langPackLocalVersion\.ts$' > "$SCRATCH/gen.txt"
rsync -a --files-from="$SCRATCH/gen.txt" ./ .claude/worktrees/<name>/
```

In a worktree, tools run as `pnpm --config.verify-deps-before-run=false exec tsc|vitest|oxlint …` and suites as
`pnpm_config_verify_deps_before_run=false pnpm test:…` — never `CI=true` (it would purge the main checkout's
`node_modules` through the symlink).

## 2. Research with Codex

When the task is "find what is missing and close the gap" (or anything that needs reading a lot of foreign code),
write a prompt file and let Codex answer it, read-only:

```bash
export PATH="$HOME/.local/bin:$PATH"   # codex is often installed there, outside a non-login shell's PATH
cd .claude/worktrees/<name>             # the task's tree: what Codex finds there is what the agents will find
codex exec -m <model> -c 'model_reasoning_effort="xhigh"' \
  -c 'default_permissions="ro"' -c "permissions.ro.filesystem={\":root\"=\"read\", \"$SCRATCH\"=\"write\"}" \
  --ephemeral --json -o "$SCRATCH/report.md" - < "$SCRATCH/prompt.md" > "$SCRATCH/run.jsonl" 2> "$SCRATCH/run.stderr"
```

Run it in the background, outside the Bash sandbox (Codex needs `~/.codex` and the network). The model names are the
ones `scripts/codex-review.sh` tries (`CODEX_REVIEW_MODELS`). Check `run.stderr` / the first lines of `run.jsonl` a
minute in: a run that died at once (exit 127, sign-in) costs nothing to restart now and a lot to discover later.

The prompt asks for a dense report in sections, so the orchestrator can plan from it without opening the code:
- **A. Reference behaviour** — per case, every control/rule with `path:line` in at least one reference client; where
  the clients disagree, say so and which is newest.
- **B. Gaps** — numbered: what the references do, what the repo does now (`path:line` or "absent"), the API/config
  pieces (exact names checked in `src/layer.d.ts`), size S/M/L.
- **C. Reusable pieces** in the repo, with paths.
- **D. Work packages** — 2–4, touching disjoint files.
- **E. Open questions** — only what code cannot settle.

The orchestrator reads that report once, in full. It settles section E and every disagreement itself (newest client,
the documented API, consistency with the rest of the app) and writes those decisions into the briefs; it asks the user
only what truly is theirs to decide.

**What the references agree on is pinned in the brief, in so many words** — above all the kind of each control (a
text input, not "a list of chips"; a header save button, not a corner one), what it does on click, copy and paste,
what animates, and the strings: take them from the reference clients, never invent them (and in tweb a re-worded
existing lang key needs a new key — the server's pack keeps the old text).

## 3. Implementation agents

Split along section D: packages that touch **disjoint files**, run in parallel, in the background. Where one package
calls into another (a manager method the UI uses), the orchestrator writes the **contract** (signature, what resolves,
what rejects, what is cached when) into both briefs, so neither waits for the other.

Every brief carries (the agent knows nothing else):
- **Where**: the worktree's absolute path; every Read/Edit/Write path starts with it (the main checkout is another
  tree with the same relative paths); no commit, stash or branch switch; the tool invocations above.
- **Who else is in the tree**: the other agents' files, which this one must not touch, and that their tsc errors are
  theirs; for a shared file (e.g. `src/lang.ts`), where in it this agent adds and "re-read right before each edit".
- **The background**: the Codex report's path and which sections/gap numbers to read — instead of retyping it.
- **The task**, with the orchestrator's decisions spelled out as rules, and the expected values of tests stated from
  those rules ("expected values from the rules, not from your implementation").
- **AGENTS.md**: follow it — the agent reads it itself; name only the parts that matter here (a11y behind
  `Modes.a11y`, RTL, account-bound managers, no duplicated code).
- **Done means**: tsc/oxlint clean for its files, which test files pass; "no browser check" unless it is part of it.
- **The report**: at most 150–250 words — files, deviations from the brief and why, what is left open. No code, no
  diffs. (A long report is paid in the orchestrator's context.)

**A deviation from the reference clients is never accepted by the orchestrator alone**, however good the agent's
reason sounds ("a group of chips, so paste is impossible by construction"). Either the agent redoes it as the brief
says, or the user decides — a deviation found by the user after review rounds costs the rework plus every round
spent on the wrong design.

## 4. Browser checks

A separate agent (Sonnet, medium) with a **numbered checklist**: each item pass/fail with one line, bugs with a short
repro, at most ~8 screenshots saved to the scratchpad (paths in the report, so the orchestrator looks only at those it
needs). It starts or reuses a preview of the worktree (`bash scripts/start-preview.sh --detach`, AGENTS.md "Preview"; a
test-server account where the machine has one, so the agent can create chats and save settings safely — see the local
notes), drives it with a headless Playwright page, never stops another preview, and quits its driver at the end. Once
the user has been given a preview's URL, no agent drives that preview any more.

## 5. Review rounds

1. Round 1: `bash scripts/codex-review.sh --uncommitted --about "<what the change is for and what it does on purpose>"`
   in the session's own worktree; in a checkout other sessions share, `--paths` or `--patch` with only this change
   (the `codex-review` skill's targeting rules). In the background, outside the sandbox. `--about` is the same
   paragraph every round, updated with every decision made since — Codex reviews against it.
   When Codex is unavailable (exit 3), or its duplicate check did not answer, the `codex-review` skill would have the
   session review the change itself: here that review goes to a fresh agent (Opus, medium) that wrote none of the
   change, with the same `--about` and the same report format — or, if the user prefers, the loop stops and asks.
2. The orchestrator reads the report (filter out the script's progress lines) and gives each finding a verdict:
   fix, fix differently (say how), or reject (say why — e.g. it contradicts a decision taken on purpose).
3. A **fresh** agent gets the list: "check each against the code first; fix if it holds, otherwise say why not", plus
   tests to run, plus a browser re-check of every flow a fix changes the behaviour of (whoever found it), with the
   keyboard and focus where the flow has them (AGENTS.md "Verify the affected flow").
4. Next round: full again, with `--no-duplicates` (the duplicate check belongs to the first round). Rounds run on the
   whole change, never `--since`.
5. Every ~3 rounds, tell the user the trend (findings per round). The loop ends with a clean round — or, before
   `/finalize`, once a round brings only exotic edge cases (two saves in flight answered out of order, an IME Enter
   under the a11y flag, a callback after the tab closed mid-await) or style: what that round confirmed is still fixed
   (a confirmed bug is fixed however rare its trigger, unless the user says to leave it), and then no further round
   runs before `/finalize` — say so; `/finalize` runs its own rounds to a clean one. Every round costs a fix agent and
   several orchestrator calls, and late rounds of a large change keep finding one or two such cases each. It stops
   and asks the user on the `codex-review` skill's limits: after five rounds, when a finding comes back after its fix,
   or when fixes go in circles.

While Codex reviews, nothing edits the tree. A baseline check (does a failing suite fail on master too?) runs in a
separate, clean worktree of the base (`git worktree add --detach .claude/worktrees/<name>-base <base>`, prepared as in
step 1) with a preview of its own `--id` — never by reverting the change in place, which leaves its new files behind,
and never with `git stash`. Afterwards let go of its preview (`bash scripts/start-preview.sh --stop --port <port>`;
the server stops only when nobody else holds it, and the worktree stays while someone does), then remove the base
worktree (`git worktree remove`).

## 6. Tests and hand-over

The suites AGENTS.md's final review asks for, only those the change can affect, in the background and one after
another (they queue on the machine anyway). Report what ran, what was skipped and why, and what fails on master too.

Hand over: what was done and what it now does for the user, the decisions taken and why, what is left out, the
preview URL(s), and that `/finalize` reviews and commits it.
