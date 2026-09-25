---
name: tg-chat-archive
description: Save the messages of a Telegram chat, group or channel to local disk (~/.claude/tg-archive) and keep that copy in sync, so this and later sessions can read, search and analyse the chat without Telegram. Use when the user asks to save, archive, download, export, back up, sync or update a chat by ID, @username or link — "сохрани чат", "выгрузи сообщения из чата", "заархивируй канал", "обнови архив чата", "подтяни новые сообщения". Also use BEFORE answering any question about a chat's contents — "что писали в чате X", "найди в чате", "summarize the chat": check ~/.claude/tg-archive/INDEX.md first, and refresh that chat if it is stale.
---

# Telegram chat archive

Pulls one chat's history through tweb's MTProto stack running in Node (the
harness in `src/tests/api/`, no browser) and writes it as plain files. Runs are
incremental: the first one downloads the history, every later one adds what is
new.

## Read-only by construction

Every Telegram API method goes through `MTPNetworker.wrapApiCall`, and the
runner replaces it before the managers boot with an allow-list,
`READ_ONLY_METHODS` in `chatArchive.test.ts`: `users.getUsers`,
`contacts.resolveUsername`, `messages.getChats`, `messages.getDialogs`,
`messages.getHistory`. Any other method — including every startup request the
manager stack fires on its own (`help.getAppConfig`, `stories.getAllStories`, …)
— never leaves the process; its promise just stays pending. So no bug can
edit, delete, leave, join, send or mark a chat as read. `auth.logOut` is
blocked the same way, and `logOut()` is stubbed so its local half cannot wipe
the session mid-run.

Each run ends by printing `API calls sent: …` and `blocked, never sent: …` —
show those lines when the user asks what the archive does to their account.
Never widen the list with a method that changes anything; a new need gets a
read method, added deliberately.

## Where the archive lives

```
~/.claude/tg-archive/
  INDEX.md                      every archived chat: title, type, folder, ids, counts, date range, last sync
  channel1005640892/            one folder per chat: user<id> / chat<id> / channel<id>
    meta.json                   title, type, ids, coverage (minId..maxId, complete), forum topics
    messages.jsonl              one message per line, ascending id — the source of truth, done marks included
    transcript/2026-09.md       readable monthly transcript, regenerated from the jsonl
```

This is outside the repo on purpose: chats are private data and must never be
committed. `--dir` points a run somewhere else (use your scratchpad for tests).

## Running it

```bash
bash .claude/skills/tg-chat-archive/archive.sh <peer> [--dry] [--full] [--since YYYY-MM-DD|all] [--max N] [--dir PATH] [--master SEED] [--seed SEED]
```

`<peer>` takes whatever the user gives you:

| Form | Example | Meaning |
|---|---|---|
| Bot API channel id | `-1001234567890` | supergroup / channel |
| negative id | `-1234567890` | tweb URL hash (`web.telegram.org/k/#-1234567890`) or a basic group — both are tried |
| positive id | `777000` | private chat with a user or bot |
| username / link | `@name`, `t.me/name`, `https://t.me/c/1234567890/55` | public chat, or a private channel post link |
| `me` | `me` | Saved Messages |

A numeric id is looked up in the account's dialog list (main list + archive
folder); a chat you are not in can only be reached by its @username or link.
After the first run the access hash is cached in `meta.json`, so later runs
skip the lookup.

Workflow:

1. **Confirm the chat first**: `--dry` resolves it and prints title, type,
   ids and the server's message count, writing nothing. Show that to the user
   if there is any doubt that it is the right chat.
2. **Archive**: the same command without `--dry`. Progress is printed every
   1000 messages; the last line says whether history is `complete` or
   `older history pending below #N`.
3. **Big chats**: one run backfills at most `--max` older messages (default
   50 000; a page is 100 messages at ~3 pages/s, so 50 000 ≈ 3–5 minutes).
   Run again to continue — progress is checkpointed every 5 000 messages, so
   even a killed run resumes where it stopped. For a chat with hundreds of
   thousands of messages, tell the user the size (from `--dry`) before starting.
4. **A period only** ("с начала года", "за последний месяц"): `--since
   2026-01-01` keeps nothing older than that local midnight and stops the
   backfill there; `complete` then means "complete since that day" (INDEX.md
   shows `since 2026-01-01`). The boundary is remembered, so later plain runs
   keep it; a run with an earlier `--since` fetches the missing stretch, and
   `--since all` lifts it and backfills to the start of the chat.
5. **Updating**: rerun the plain command. It reads everything new since the
   last sync plus the newest 200 messages again. A message read again keeps
   its stored record — and its done mark — unless its edit timestamp
   (`editTs`, hidden edits included) moved; then the new content replaces the
   old one and the mark stays, reading as stale (`✔?`). Views, reactions and
   `pinned` are refreshed either way.
6. **`--full`** rereads the whole history (down to `since`, if set): catches edits of old messages and
   marks messages deleted on the server with `"deleted": true` (kept, never
   dropped — it is an archive). Only a run that reaches the start of the chat
   marks deletions.

A run ends with `[tg-archive] done: …` (or `dry run — nothing written`); if
that line is missing the script exits 1 and prints the path of the full vitest
log.

## Answering a question about a chat

The user asks about content ("что было в группе MTProto", "кто предлагал X"),
usually by title, not by id:

1. Read `~/.claude/tg-archive/INDEX.md` and match the chat by title, id or
   @username.
2. Refresh it before answering: `bash .claude/skills/tg-chat-archive/archive.sh
   <its Bot API id from INDEX>` with no flags — the account session and the
   `since` boundary come from its `meta.json`. It takes ~10 s and only reads.
3. Search and read as below; cite message ids and dates in the answer.
4. A chat missing from INDEX is not archived — say so and offer to archive it
   (you need its id or link, and which account is in it).

## Marking messages done

When what a message asks for is dealt with — implemented, verified, answered —
mark it, so a later session does not check it again:

```bash
bash .claude/skills/tg-chat-archive/mark.sh <chat> <id>[,<id>…]… --note "what was done / where"
bash .claude/skills/tg-chat-archive/mark.sh <chat> --list      # what is marked; ✔? = edited since
bash .claude/skills/tg-chat-archive/mark.sh <chat> <id> --undo
```

`<chat>` is the folder key (`chat12904944`), the Bot API or tweb id, the
@username or a piece of the title. It is offline — it edits `messages.jsonl` and
regenerates the transcript, nothing else — and a sync running at the same time
keeps the marks (it takes them from disk when it writes).

- Mark only what is fully dealt with. A message that asks for two things of
  which one is done stays unmarked; say in the answer which half is open.
- The note says what was done and where (commit, file, "verified live"), short.
- A mark remembers the message's edit timestamp. If the message is edited
  later the transcript shows `✔?` and `--list` says "edited since it was
  marked": read it again, it may ask for more now.
- Questions and discussion that were settled can be marked too, with the
  answer or the decision as the note.

When the user asks what is left to do from a chat, skip `✔` messages and
re-check `✔?` ones.

## Reading the archive

Start from `INDEX.md`, then work inside the chat's folder. Do not Read a whole
large chat into context — search first, then read around the hits.

- **Find**: `grep -rn "keyword" ~/.claude/tg-archive/<key>/transcript/` — each
  message line starts `#<id> HH:MM Author`; continuation lines of a
  multi-line message are indented four spaces, so use `-B` to see the header.
- **Read a period**: Read `transcript/2026-09.md` (one file per month, times in
  the `timeZone` from `meta.json`).
- **Query** the jsonl with jq:
  ```bash
  cd ~/.claude/tg-archive/<key>
  jq -r '.from.name' messages.jsonl | sort | uniq -c | sort -rn | head      # who writes most
  jq -c 'select(.date >= "2026-09-01" and .from.name == "Alice")' messages.jsonl
  jq -c 'select(.id == 1234)' messages.jsonl                                   # a message by id
  jq -c 'select(.replyTo == 1234)' messages.jsonl                              # replies to it
  jq -c 'select(.media and (.media | startswith("[file")))' messages.jsonl    # shared files
  ```

Transcript line format:

```
#1235 14:06 [Topic] ✔(done in 1a2b3c) Bob via @bot ↩1234 ↪ Channel X ✎: «quoted part» [photo] text  {👍3 ❤️1}
```

`↩` reply to message id (`↩channel123/45` when it is in another chat), `↪`
forwarded from, `✎` edited, `✗deleted` gone from the server, `[Topic]` only in
forums, `{…}` reactions, `✔(note)` marked done, `✔?(note)` marked done before
its latest edit. Service events read `#id HH:MM · Alice added Bob`.
`grep -n "✔" transcript/*.md` lists the marked messages.

Message fields in `messages.jsonl`: `id`, `ts` (unix), `date` (ISO UTC),
`from` `{key, name, username}`, `out`, `text` (text links kept as
`[label](url)`), `media` (a one-line description — media files themselves are
NOT downloaded), `service`, `replyTo`, `replyToPeer`, `quote`, `topicId`,
`topicTitle`, `fwdFrom`, `viaBot`, `editDate` (shown edits), `editTs` (raw
edit_date, hidden edits too — what a sync compares), `groupedId` (album),
`postAuthor`, `views`, `reactions`, `pinned`, `deleted`, `done` `{at, note,
editTs}` (the mark and the edit timestamp it was made at).

## Accounts and sessions

The archive reads with the tweb test account from `tmp/seed.json` (user
`1095618548`) by default — it can only see chats that account can see.

The script never uses a seed directly: on first use it mints a session of its
own, `tmp/preview-sessions/tg-archive-<userId>.json`, through the same
`previewAuth` login that `start-preview.sh` uses for previews, and reuses it
afterwards. A key shared with a live browser tab answers `AUTH_KEY_DUPLICATED`
and would log both out, which is why it gets its own.

- Mint failed with `AUTH_KEY_DUPLICATED`: the master seed is held by a live
  tab. Mint from another session of the same account:
  `--master seed-preview.json` or `--master preview-sessions/<idle-id>.json`.
- The chat is on account B: `--master seed-b.json` (mints
  `tg-archive-2016154282.json`).
- The chat is on any other account (e.g. the user's personal one): minting
  only works for the seed accounts (it reads the login code from their
  service chat and knows their cloud password). Ask the user for a seed of a
  session that **no open tab is using**, and pass it with `--seed <path>`. The
  DevTools export snippet is in `src/tests/api/README.md`. Store it under
  `tmp/` (gitignored), never in the repo or in the archive.

Each chat's `meta.json` records the session it was read with (`seed`), and
later runs reuse it on their own — only the first run of a chat needs
`--seed` / `--master`.

One archive folder belongs to one account: ids of private chats and basic
groups are per account, so a second account refuses to write into it (use
`--dir`).

## After archiving a new chat

- Tell the user the folder, the message count and whether it is complete.
- Keep the memory pointer current: the memory file `tg-chat-archive` says the
  archive exists and where. Do not copy chat contents into memory — memory
  holds the pointer, the archive holds the messages.

## Files

- `.claude/skills/tg-chat-archive/archive.sh` — wrapper: args, session mint, success check.
- `.claude/skills/tg-chat-archive/mark.sh` / `mark.mjs` — done marks (offline; imports the formatter's TypeScript directly, Node strips the types).
- `src/tests/api/chatArchive.test.ts` — the sync engine (peer lookup, paging, checkpoints, files, INDEX.md); skipped unless `TG_ARCHIVE_PEER` is set.
- `src/tests/api/chatArchiveFormat.ts` — network-free half: peer parsing, message → record, the re-read merge rule, done marks, transcript rendering.
- `src/tests/chatArchiveFormat.test.ts` — unit tests for the formatter.

## Not covered

- Media files (photos, voice, documents) — only their description. Downloads are stubbed in the Node harness.
- Deletions and old edits are noticed only by `--full`.
- Comments under channel posts live in the linked discussion group — archive that group separately.
- Secret chats (end-to-end encrypted, device-bound) are not reachable at all.
