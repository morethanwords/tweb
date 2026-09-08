# Robochat Bot Builder Shell

Standalone, client-only visual editor extracted from Telegram Web K at
[`4a82cc7667477751cfc1b0dcec75db539c797a03`](https://github.com/morethanwords/tweb/tree/4a82cc7667477751cfc1b0dcec75db539c797a03).
GPL-3.0-only; original LICENSE and retained dependency notices accompany the source.

## Try the shell

Choose a screen from the chat-style sidebar and use the pencil beside a message to
edit it; the checkmark completes the edit. Each screen supports up to ten ordered
messages, each with its own keyboard. Click a button to choose its destination.
Rename a screen directly in the chat header or with the sidebar row's pencil.
An added message stays only when its first edit contains text; leaving it blank or
canceling discards the insertion. Adding it and writing its text form one undo action.
Drag buttons within a row, into another row or into a new row. On touchscreens hold
the button before moving it; Alt+arrow keys provide an alternative to dragging. The button inspector
contains the label, destination and four color swatches, with apply, cancel and delete actions.
Editing guidance is available from the information icon in the header.
Start and end badges follow the actual scenario links.
Use **Пройти бота** to walk the branch. Screen settings include **Пройти с этого экрана**
to start a fresh test from that screen without changing the bot's entry.
In Test, selecting a sidebar screen appends its messages immediately and activates
all its keyboards; earlier messages collapse behind an expandable history row.
The full transcript stays in order and any previously pending reply is canceled.
**В редактор** restores the selected authoring screen.
The folder rail starts with **Старт** and **Меню**. Selecting a folder filters its
always-visible screen list without changing the conversation. Every folder owns a
permanent **Если непонятно** screen pinned last; edit its messages and buttons normally.
Unknown text and commands transition to that screen in the currently active bot
screen's folder. The fallback never inherits the folder merely browsed by the author.
In Edit, add or rename folders and move ordinary screens using **Папка экрана** in
screen settings. A folder can be deleted after its ordinary screens are moved away,
provided no remaining button or global entry refers to its fallback. Fallback screens
cannot be removed or moved individually. An empty fallback blocks starting a test.
In Test, type a message and send with Enter (Shift+Enter adds a line). While the bot
is typing, another message stays in the composer until its reply can be accepted.
Send `/start` to append the command and the entry screen to the conversation;
history and input focus remain. The header restart action starts a fresh transcript.
Double-click a bot message to edit it. Right-click a test message (long-press on
touchscreens) to copy its text or edit an authored bot message. Explicit text edits
update the author document and every occurrence of that message in the test;
Escape restores both. Double-click, right-click or long-press a test button to edit
its label, destination or color. These explicit changes update the author document
and test together; an already accepted reply keeps its original target, and earlier
visitor actions keep their original text. A single click follows the button after
the double-click window; Enter and Space follow it immediately.
The starting example has five ordinary screens and two folder fallbacks, with a branch and return paths.

Changes exist only in the current browser session. Reload starts the example again.
No Telegram login, network requests, browser storage, backend execution or real
AI service is present. Three explicitly selected local AI demonstrations exercise
the callback boundary. A freeform prompt without an adapter leaves the document intact.

## Reproducible environment

- Node 22.23.2: `node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32`
- pnpm 11.16.0; use `pnpm install --frozen-lockfile --ignore-scripts`.
- Browser checks require Playwright 1.61.1 Chromium and WebKit with their OS libraries.
- Vendored Solid 1.9.9 browser/web/store aliases are shared by Vite and tests; TS
  resolves their matching declaration files. The registry Solid tool peer is never bundled.

`scripts/Dockerfile.verify` supplies one complete verification environment. It pins
Node 22.23.2 from the Debian Node image and Playwright 1.61.1 by immutable digests.
The Alpine image above was used for the first isolated build; the verification
image uses glibc so WebKit can run. Use a separate dependency volume for each libc:

```sh
docker build -f scripts/Dockerfile.verify -t robochat-shell-verify .
docker run --rm --ipc=host -v "$PWD:/workspace" -v robochat-shell-verify-deps:/workspace/node_modules robochat-shell-verify sh -c 'pnpm install --frozen-lockfile --ignore-scripts && pnpm shell:verify'
```

Run `pnpm shell:verify` for typecheck, lint, unit tests, production build, static
artifact checks, both browsers, reference comparison and forbidden-API attempt checks.
The server uses `pnpm shell:serve --dir <artifact-directory> --manifest <manifest-file>` (see script usage)
and binds localhost port 3120 strictly. Only files in the generated manifest are served.
Build to `dist`, then copy a completed artifact to a separate release directory before
serving it; never build over the directory currently being served.

## Contracts and ownership

`src/shell/core/types.ts` defines the versioned document and limits.
`core/document.ts` validates and canonically serializes it. `core/editor.ts` owns
revision checks, text transactions and bounded undo; `core/simulator.ts` owns
occurrence-based local progression. `controller.ts` owns effects and request cancellation.
The native components only render data and dispatch intents. `Inspector.tsx` edits a
keyboard draft, committing one validated operation on Apply.

AI adapters implement `AiAdapter` in `core/types.ts`, passed as `App` props.
The caller receives an isolated snapshot and AbortSignal. A completion applies only
at its captured document identity and revision. Production CSP remains `connect-src
'none'`; this contract is an in-process callback, not permission to add network calls.

Export JSON with Ctrl/Cmd+Shift+E. Schema v5 contains `folderOrder`, per-folder
ordinary `stepIds` and one `fallbackStepId`, stable monotonic screen numbers,
ordered message IDs per screen, message-owned keyboard rows and separate plain text
in `content`. Every screen belongs to exactly one folder; there is no parallel global
screen-order or fallback-settings source. Only v5 documents are accepted.
Folder and screen order govern presentation. Execution uses `entryStepId`, explicit
button targets and the active screen's folder fallback. A test captures this topology;
explicit Test content/keyboard edits remain supported. Null targets remain visibly
unfinished. Import UI is not part of this version.

A transcript, pending timer, AI state, editor state and undo never enter exported JSON.
Structural commands require the current revision. Activations require the exact current
bot occurrence in the latest screen batch and its own button; timer completion also
requires the current run and pending-reply identity.

## Visual provenance

`reference/upstream-manifest.json` records original file hashes before extraction.
`reference/upstream/` is frozen reference source; it is never imported by the app.
The separate reference fixture exercises native DOM and SCSS without Telegram startup.
Candidate screenshots are compared against that independent fixture, not auto-updated
candidate baselines. Inspect the reference manifest/provenance for retained assets.

The automated short viewport checks do not prove real phone keyboard behavior.
Real iOS/Android keyboard acceptance must be exercised on a physical device.

## Limits

The shared limits allow 100 screens, 500 authored messages, 500 buttons and a
1 MiB serialized document. A test conversation holds up to 201 messages; a screen's
reply batch is accepted in full or rejected. Undo retains at most 20 finished edits
within an 8 MiB budget. Performance measurements from the earlier single-message
schema do not establish performance for this version.
