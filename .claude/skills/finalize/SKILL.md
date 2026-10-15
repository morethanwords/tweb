---
name: finalize
description: "Finish the change this session made: review it through Codex (the codex-review skill), fix what the review confirms, run the tests the final review calls for, and commit it as one commit of only this change. Never pushes. Use when the user says \"финализируй\", \"финализируй в fast\", \"finalize\" or /finalize — the command is itself the explicit request to commit."
user-invocable: true
argument-hint: "[fast]"
---

# /finalize — review, fix, commit

"Финализируй" asks for three things at once: a review, fixes for what it finds,
and a commit. It is the explicit request that AGENTS.md's "never commit on your
own initiative" rule waits for, and it covers only the change at hand.

**A fix that needs no answer is made right away.** A finding whose fix is
settled by the finding itself, the code and the repo's rules is fixed at once,
without asking, even when the review phrases it as a question.

**A question holds the commit.** Sometimes the review, a fix or a test raises a
question that only the user can answer: how something should behave, which of
two fixes to take when nothing in the code or the rules decides between them,
whether a finding is wanted at all. When that happens:

1. Finish everything that does not depend on the answer.
2. Do not commit.
3. Report what is done and ask the question.
4. Commit only once the user has answered **and** said to commit ("коммить",
   "финализируй" again). An answer alone is not that.

## 1. Pin down what is being finalized

The change this session made for the current task: its own files, and its own
hunks in files other sessions also changed. Nothing else in the tree belongs to
it.

- **Ask first** if it is unclear what belongs: the session worked on several
  things, or part of the work is already committed.
- **Nothing of this session's is uncommitted:** say so and stop.

## 2. Review it — the codex-review skill

Follow `.claude/skills/codex-review/SKILL.md`, steps 1–5:

- Pick a target that covers exactly this change.
- Pass an `--about` that says what the change is for.
- Add `--fast` when the request says "fast" ("финализируй в fast", "быстро").
- When Codex is unavailable, review the change yourself, as that skill says.

## 3. Fix what the review confirms

- Fix every confirmed finding. Keep the reason for each rejected one, for the
  report.
- Review and fix in rounds, as step 6 of the codex-review skill says:
  - 3 rounds on the whole change, with fixes after each;
  - then, while a round still confirms a P0–P2 finding that gets fixed, rounds 4
    and 5 on only the fixes since the round before;
  - five reviews at most. If round 5 still confirms a P0–P2 finding, the commit
    waits and the user decides, as with a question (see the top);
  - P3 fixes after the last round go unreviewed, and the report says so.
- A finding that needs a redesign, or whose fix could go more than one way with
  nothing in the code or the rules to choose between them: a question for the
  user, so the commit waits (see the top). Every other fix is made right away.

## 4. Run the tests

Run what AGENTS.md's final review calls for, for what the change touches:

- the test files that cover it;
- `tsc` when types changed;
- `pnpm lint` on the changed files;
- a heavy suite only when it can observe the change. Run it in the background:
  it waits its turn in the machine's queue.

Then act on the results:

- **The change broke a test:** fix it and run the test again. Never commit with
  a failure the change caused.
- **A failure that is not the change's** (it fails on HEAD too, or it is flaky):
  commit, and name it in the report.

## 5. Commit — this change only, never pushed

- **Where:** one commit on the branch the checkout is on. In the main checkout
  that is master. In a worktree it is the worktree's branch; merging that into
  master is a separate request.
- **Only this change goes in:**
  - Files that are wholly yours: `git commit --only -F <message> -- <paths>`.
    Anything else that is staged stays staged.
  - Files that also carry other sessions' hunks: build the commit from HEAD plus
    only your hunks, in a temporary index, never with `git add -A` or a bare
    `git commit`.
  - Afterwards, `git status` must still show the other sessions' changes as they
    were.
- **Message:** the repo's style. The title says what changed for the user, and
  the body says why and what, with bullets for the parts. End it with the
  attribution trailer the session's instructions give.
- **Local rules:** run whatever check the local, untracked notes require before
  a commit (`AGENTS.local.md`).
- **Never** push, amend a commit that is not this change's, or force anything.

## 6. Report

The user typed one word, but the answer is as full as for the whole request it
stands for: what was reviewed, what was found and done about it, what was
tested, and what was committed. A bare "Финализировал." or "Done." is not a
report.

- **The change:** what it does and why, in a few sentences, as the commit
  message tells it.
- **The commit:** its hash and title.
- **The review:** who reviewed (Codex with its model, and fast if it was, or this
  session because Codex was unavailable). Each finding, marked as one of:
  - fixed;
  - rejected, and why;
  - fixed without another review round.
- **The tests:** what ran with its result, what was skipped and why.
- **Anything left open.** When a question held the commit, the questions, with
  what each answer would change.
