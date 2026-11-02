---
name: night-shift
description: "Spend what is left of a Claude account's usage window on useful tweb work: a fleet of parallel Claude Code sessions under a second login (CLAUDE_CONFIG_DIR), each in its own worktree, nothing committed, steered by a bash supervisor that measures usage, nudges idle sessions, adds sessions while the burn is too slow, wraps up and hard-stops before the window resets, and a summary for the morning. Use when the user asks to use up / burn / spend the remaining usage or limit of an account (\"загрузи работой оставшийся лимит\", \"израсходуй юзедж\", \"ночная смена\", \"night shift\") or to repeat the night shift."
user-invocable: true
argument-hint: "[config dir of the login to spend, e.g. ~/.claude-<name>]"
---

# Night shift — turn an account's remaining usage into reviewed work

First run: 2026-11-01 → 02, a second login, 49% → 97% of the weekly window in ~9.5 h, 17 sessions, 163 items
(109 ready for review, 35 waiting for a decision), all uncommitted in `.claude/worktrees/night-*`. Where its run
directory survives (`tmp/night-1101/` of the main checkout), it is the worked example: `SUMMARY.md`, `reports/`, `log/`.

The machine wiring (logins, tmux sockets, previews, guards) is in `AGENTS.local.md`; read it first.

## Roles

- **Orchestrator** — this session, usually under the user's main login. Sets up, launches, checks in a few
  times, reports. Keep its own token use small: the work happens in the workers.
- **Workers** — interactive `claude --remote-control "<title>" --permission-mode auto` sessions under the login
  being spent, one per window `<run>:<id>` of the DEFAULT tmux socket, where `<run>` is the run dir's name. They
  show up in that account's claude.ai as «Ночь · …», where the user can watch or step in.
- **Supervisor** — `supervisor.sh`, plain bash in window `<run>:sup`, no model.

## 0. Before anything

1. **The login.** A second login in its own config dir, made as `AGENTS.local.md` describes (`claude auth login`
   with `CLAUDE_CONFIG_DIR`, the memory dir a symlink to the main one, settings copied from `~/.claude/settings.json`).
   Never `/login` in a session of the main login: the credentials file is shared by every session of that dir.
2. **The window and the money.** `scripts/probe-usage.sh <config dir>` prints the seven-day utilization, the reset
   time and the overage status (one tiny Haiku call; unsandboxed). If overage is not rejected/disabled, stop and ask
   the user — past 100% the account would be billed. The supervisor also hard-stops on any sign of overage.
3. **Ask the user** which streams, in what order (offer 5–10 options grounded in the repo's open work: bug backlog,
   security scan, tests health, runtime speed and memory, cold start, worktree salvage, parity prototypes, code-reading
   audit, layer update, RTL/a11y sweep, engines, manager tests). Their order is a priority, not a sequence: everything
   runs at once, the top streams get more sessions.
4. **Resources.** `df -h /` (the first run used ~20 GB for ~157 worktrees, ~5 GB/h), `free -g`, the test queue
   (`bash scripts/test-queue.sh`). Heavy suites queue machine-wide; the claude processes themselves take 40–120% CPU each.

## 1. Set up the run

```bash
bash .claude/skills/night-shift/scripts/init.sh tmp/night-<MMDD> ~/.claude-<name>   # unsandboxed
```

It creates the run dir (`log/ state/ reports/ claims/ bugs/queue/ streams/`), copies the scripts and templates into
it (a running supervisor never sees a later edit of the skill), probes usage, and writes `night.env` (reset time,
config dir, limits). The run dir's name names the run: its tmux session, and the prefix of every worktree, branch
and preview id its workers make — the worktrees of an earlier night may still wait for review, and a second night
must not collide with them. Then edit in the run dir:

- `streams/salvage.md` — the lists A/B: worktrees with uncommitted work (`git worktree list` + `status --porcelain`,
  commits not in master), split by size.
- `streams/parity.md` — where the last parity report is, if one exists.
- `BACKLOG.md` — extra tasks for sessions whose stream is done, top first.
- Anything the user asked to add or leave out.

## 2. Preflight (one session, the user answers)

Fresh config dirs ask things once that only the user may answer, and an unanswered dialog stalls a worker for good:
in the first run four of seventeen sessions stood all night on Claude Code's one-time «Read outside the working
directories» question (the memory symlink and the reference repos are outside the working dir).

```bash
bash tmp/night-<MMDD>/spawn.sh preflight preflight "Предполётная проверка"
```

- The first interactive session of a fresh config dir shows the theme picker and the security notes: Enter on each
  is fine (they are not permission dialogs).
- The preflight stream reads a memory file and a reference repo with the Read tool, which raises the read-outside
  question. **Ask the user to answer it in claude.ai of that account** (option 1, «Yes, and keep allowing», keeps the
  old behaviour; the managed deny rules for secrets still hold). After it, `.claude.json` of the config dir has
  `hasSeenAutoModeOutsideReadPrompt: true` and later sessions are not asked.
- **Never answer a worker's permission dialog yourself** (tmux keys into a dialog): the auto-mode classifier denies it
  as a bypass, and it is the user's decision. The supervisor types only into a worker whose live status is `idle`,
  read again before the Enter, and never a digit (a digit picks a dialog's option).

## 3. Launch

```bash
cd tmp/night-<MMDD>
for spec in "triage|bugs-triage|Баги: разбор" "fix1|bugs-fix|Баги: исправление 1" ...; do
  IFS='|' read -r id st title <<< "$spec"; bash spawn.sh "$id" "$st" "$title"; sleep 40
done   # in the background; 40 s apart so worktree installs and builds do not all start at once
```

Then, still in the run dir, `touch state/launched`: until it exists the supervisor only measures and watches (no nudges,
no autoscaling — the preflight session alone must not look like a slow burn). The first `spawn.sh` (the preflight's)
already started the supervisor in `<run>:sup`; `spawn.sh` starts it again whenever it is not running, and refuses
past the hard stop, so no worker runs unsupervised. A good first mix (17 sessions in the first run, the
autoscaler added the last six): triage + 3 fixers, security, tests, perf, coldstart, 2 salvage, parity, and **4
code-reading auditors from the start** — they found most of the highest-value bugs (lost messages, hung networking,
locked-out passcode) and burn tokens without CPU, which is what keeps the rate up once tests saturate the machine.

## 4. Check-ins

Schedule them with `send_later` (claude-code-remote): +45 min, +1 h 30, then every ~2 h, one ~10 min before the
expected wrap-up and one right after the reset. Each check: `log/usage.tsv`, `log/supervisor.log`,
`state/*.status`, `ATTENTION.md` (sessions on a dialog — tell the user, never answer), claims and reports growing,
`df`, `free`, earlyoom's log. Report to the user in a few lines.

Measured rates (first run, Opus at xhigh): 11 sessions ≈ 3%/h in the first hour (installs, triage, waiting for tests),
17 warmed-up sessions ≈ 9–10%/h. Adjust the supervisor if the projection is far off (§5); a burn that ends early is
fine as long as the wrap-up still leaves room for the reports and the summary.

## 5. What the supervisor does (and how to change it mid-run)

Every 5 min: a usage probe every 10 min (`log/usage.tsv`); a nudge to a session idle 20+ min unless its
`state/<id>.waiting` is under an hour old; a resume (twice at most) of a worker whose claude exited; every 20 min the
projection at wrap-up — under 95% it adds a worker (two under 85%): a backlog worker when the load is under 26, a
code-reading auditor when the CPU is saturated, up to `MAX_WORKERS`, while memory lasts; a disk warning under 8 GB.
Wrap-up at `WRAPUP_UTIL` (0.95) or 50 min before the reset: the file `WRAPUP` in the run dir (workers check it before
every item) and «Сворачивайся» typed to each worker once it is at its prompt; the summary session 15 min later; once
`SUMMARY.md` has settled and usage is under 98.5%, one small task to each worker at its prompt to use the rest; 4 min
before the reset every worker window is killed (the next window must not pay for this one; its sleeps never run past
that moment) and this run's previews left without a holder are stopped. Any sign of overage stops everything at once.
A stop leaves `state/stopped`, after which neither `spawn.sh` nor a restarted supervisor starts anything for the run;
only the user decides to remove it.

To change it mid-run: edit with `sed -i` (a new inode — the running bash keeps reading the old file), check
`bash -n`, then `tmux -L default respawn-window -k -t <run>:sup "bash <run dir>/supervisor.sh; exec bash"` at once.
Its state lives in files, so a restart loses nothing.

## 6. Rules the workers get (templates/RULES.md) and why

- A worktree per independent change, from master; nothing committed, pushed or published; reports in Russian after
  every finished item (`reports/<id>.md`), with «Вопросы к пользователю» and «Для памяти» — workers never write memory
  (it is shared with the user's other sessions).
- Codex review per change (up to 3 rounds), tsc + oxlint + the nearest test, live checks in a preview for what is seen.
- No AskUserQuestion, no plan mode: nobody answers until morning.
- Worktrees, branches and preview ids start with the run's name. One preview per worker at a time, `--id <run>-<id>`.
  The preview's seed lives in its checkout's `tmp/`, so every new worktree's preview is a new sign-in of the preview
  account: workers raise one only for what has to be seen, and count them in their reports.
- **The preview account is real.** Only Saved Messages may be written to. Do not open privacy screens, by hand or by a
  suite that sweeps Settings (`test:focus:app` does — test DC only): closing one without a change still calls
  `setPrivacy` and drops the «Premium users» exceptions (seen in the first run). Never
  print a built preview's `tmp/preview-dist/<id>/index.html` or a storage dump: the seed is in it in plain text, and a
  key that reached a transcript has to be revoked (`logOut()` + `--remint`).
- `state/<id>.waiting` before ending a turn on a background job; claims by `mkdir claims/<slug>`; on `WRAPUP` or
  «Сворачивайся» finish the item, update the report, stop previews, last line `СТОП`.

## 7. Traps met in the first run

- The default tmux server's global environment carries stale `CLAUDE_*` variables (the main account's bridge owner,
  a session id, a messaging token); every script drops them first, with any `ANTHROPIC_*` variable (an API key or
  token in the environment would win over the login) — `drop_claude_env` in `common.sh`.
- A non-interactive bash exits on an arithmetic error: one empty operand in the supervisor and the hard stop is gone.
  Anything read from a file or a session record is validated before it reaches `$(( ))`.
- Session status lives in `<config dir>/sessions/<pid>.json` (`status`: `idle` / `busy` / `shell` — waiting on a
  background shell / `waiting` — a dialog), `statusUpdatedAt` in ms; the pid is a child of the window's pane pid.
- In the orchestrator's own Bash tool `grep` may be ugrep (an alias): `command grep -F` in pipelines; scripts are fine.
- A `&&` chain that stops early leaves a half-applied change: check the edit landed before restarting the supervisor.
- The bug fixers start before triage has a queue: they wait on a background poll, which costs nothing.
- Duplicates happen (two streams fixing one bug); the summary lists them for a choice.

## 8. After the reset

Check the hard stop in the log and `tmux -L default list-windows -t <run>`, stop the run's previews still running
with no holder (`bash scripts/start-preview.sh --list`, then `--stop --port <p>` on those held by nobody), close the
tmux session `<run>`, and send the user the summary's headline: utilization start → end, items ready / waiting, what
to look at first, what went wrong — and how many sign-ins of the preview account the night left (one per worktree
that ran a preview: `ls .claude/worktrees/<run>-*/tmp/preview-sessions/*.json | wc -l`, unsandboxed), which they
may want to end in Settings → Devices. The worktrees stay until the user has reviewed them; offer to delete the rest
after.
