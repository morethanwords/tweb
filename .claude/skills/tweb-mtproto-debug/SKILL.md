---
name: tweb-mtproto-debug
description: Debug and test the tweb (Telegram Web K) MTProto stack from Node.js using its Vitest harness. Use when investigating dialog/message/unread/forum bugs in tweb, when verifying client-side fixes against the real Telegram server, when reproducing race conditions in apiManager / appMessagesManager / dialogsStorage, or when adding new server-verified e2e tests. Covers the harness in src/tests/api/, single-account synthetic tests, and dual-account end-to-end tests.
---

# tweb MTProto debug & test harness

This skill packages the methodology used to debug and verify MTProto-stack bugs in tweb (Telegram Web K, Solid.js + TS, MTProto over WebSocket). The repo lives at `morethanwords/tweb`; entry directory is the project root containing `pnpm-lock.yaml`, `vite.config.ts`, and `src/`.

## When to invoke

- User reports a bug like “unread counter doesn’t decrement”, “mention badge stays after read”, “counter freezes when scrolling”, “double increment on new message”.
- User asks to verify a client-side fix against real server state (no synthetic-only mocking).
- User wants to add new e2e/integration tests around `appMessagesManager`, `dialogsStorage`, `apiUpdatesManager`, `apiManager`, or any read/unread flow.
- User says “run against my account” or provides a `tmp/seed*.json`.

## Required setup (verify before testing)

1. **Two seed JSONs in `tmp/`.** Each is the dump of an account’s auth state.
   - `tmp/seed.json` — account A (initiator / chat creator).
   - `tmp/seed-b.json` — account B (receiver / target of mentions).
   - The format and DevTools dump snippet are in `src/tests/api/README.md`.
2. **Sanity-check the seeds are different users** (don’t assume — file names lie):
   ```bash
   node -e "const a=JSON.parse(require('fs').readFileSync('tmp/seed.json','utf8'));const b=JSON.parse(require('fs').readFileSync('tmp/seed-b.json','utf8'));console.log('A id',a.userId,'dc',a.dcId);console.log('B id',b.userId,'dc',b.dcId);console.log('different users:',a.userId!==b.userId);"
   ```
3. **`.env.local` (or `.env`)** in repo root with `VITE_API_ID` and `VITE_API_HASH`. The harness throws clearly if missing.
4. **Confirm with user before sending real messages or creating chats.** All test channels/groups should be cleaned up in `afterAll`.

## Test categories

### A. Synthetic (in-memory) — `src/tests/api/unreadRace.test.ts`

Use when: testing pure client-side state transitions where you control all inputs, don’t need server, want fast feedback, want to isolate a specific code path.

Pattern:
- Bootstrap **one** client via `createTestClient({seed, accountNumber: 1, testDc: false})`.
- Stub `apiManager.invokeApi` for any read methods so server isn’t touched:
  ```ts
  const stubbedReadMethods = new Set(['channels.readHistory','messages.readHistory','messages.readSavedHistory','messages.readDiscussion']);
  let pendingServerReads: Array<() => void> = [];
  (client.apiManager as any).invokeApi = (method, params, opts) => {
    if(stubbedReadMethods.has(method)) {
      return new Promise<any>((resolve) => {
        pendingServerReads.push(() => resolve({_:'messages.affectedMessages',pts:0,pts_count:0}));
      });
    }
    return realInvoke(method, params, opts);
  };
  ```
- Inject synthetic state directly into managers:
  ```ts
  client.managers.appChatsManager.saveApiChats([{_:'channel', id, access_hash:'0', title, date:0, version:0, photo:{_:'chatPhotoEmpty'}, pFlags: {broadcast:true} /* or {megagroup:true,forum:true} */}]);
  client.managers.dialogsStorage.dialogs[peerId] = {…dialog…};
  client.managers.appMessagesManager.getHistoryMessagesStorage(peerId).set(mid, {…message…});
  // also: history slice push, historyStorage.readMaxId/_maxId/triedToReadMaxId
  ```
- Trigger the code path under test (`processLocalUpdate`, `readHistory`, `saveUpdate`, etc.).
- Assert on dialog/topic counters and storage state.
- Resolve `pendingServerReads` in finally so the harness can dispose cleanly.

Run:
```bash
TG_API_TEST=1 TG_API_PROD_DC=1 TG_API_SEED=./tmp/seed.json \
  pnpm test src/tests/api/unreadRace.test.ts -- --reporter=verbose --silent=false
```

### B. Server-verified end-to-end — `src/tests/api/serverVerify.test.ts`

Use when: bug involves divergence between local state and server state, fix touches server-call code paths, you need to verify Telegram’s actual behavior (some MTProto methods have non-obvious semantics, see Pitfalls).

Pattern:
- Bootstrap two clients via `createDualClients({seedA, seedB, testDc: false})` from `src/tests/api/dualHarness.ts`.
- **Trace outgoing calls** on the receiver side:
  ```ts
  const realInvokeB = dual.B.apiManager.invokeApi.bind(dual.B.apiManager);
  (dual.B.apiManager as any).invokeApi = (method, params, opts) => {
    console.log('  [B → server]', method, summarize(params));
    const p = realInvokeB(method, params, opts);
    p.then((r) => console.log('  [B ← server]', method, 'OK', r?._),
           (e) => console.log('  [B ← server]', method, 'ERR', e?.type || e?.message));
    return p;
  };
  ```
- Pre-load self users on both sides:
  ```ts
  await Promise.all([
    dual.A.apiManager.invokeApi('users.getUsers', {id: [{_:'inputUserSelf'}]}),
    dual.B.apiManager.invokeApi('users.getUsers', {id: [{_:'inputUserSelf'}]})
  ]);
  ```
  Many code paths in `appMessagesManager.saveMessage` read `appUsersManager.getSelf().id` and crash with `undefined.id` if self isn’t loaded.
- Pick **B’s username** from the dialog list or via `users.getUsers(self)` and resolve from A:
  ```ts
  const resolved = await dual.A.apiManager.invokeApi('contacts.resolveUsername', {username: usernameB});
  const bInputUser = {_: 'inputUser', user_id: resolved.users[0].id, access_hash: resolved.users[0].access_hash};
  ```
- Create scratch chats with deterministic names (`tweb-test-${Date.now()}`) and **always clean up** in `finally`:
  ```ts
  await dual.A.apiManager.invokeApi('messages.deleteChat', {chat_id: createdChatId});  // creator/admin only
  await dual.B.apiManager.invokeApi('messages.deleteHistory', {peer:{_:'inputPeerChat',chat_id:createdChatId}, max_id: 0}); // no `revoke:true` for non-admins
  ```
- After the read flow, **re-fetch from server** as truth source:
  ```ts
  const after = await dual.B.apiManager.invokeApi('messages.getPeerDialogs', {
    peers: [{_:'inputDialogPeer', peer:{_:'inputPeerChat', chat_id: createdChatId}}]
  });
  expect(after.dialogs[0].unread_mentions_count).toBe(0);
  ```
- Compare local (`dialogsStorage.getDialogOnly(peerId)`) vs server.

Run:
```bash
TG_API_E2E=1 TG_API_PROD_DC=1 \
  TG_API_SEED=./tmp/seed.json TG_API_SEED_B=./tmp/seed-b.json \
  pnpm test src/tests/api/serverVerify.test.ts -- --reporter=verbose --silent=false
```

## Critical pitfalls (lessons learned)

### 1. Server vs client mention semantics

`messages.readMessageContents` only clears `media_unread` for specific mids — it does **NOT** decrement the dialog’s server-side `unread_mentions_count`. Same for `messages.readHistory`. Only `messages.readMentions` and `messages.readReactions` reset the per-dialog mention/reaction counters server-side. Without firing them, after the next `messages.getDialogs` the badge re-appears (issue #380).

The fix is in `appMessagesManager.readMessages`: capture `dialog.unread_mentions_count > 0` BEFORE `processLocalUpdate` zeroes it locally, then `Promise.all([..., readMentions(peerId)])` if any mid was a mention.

### 2. Message-id encoding

Tweb stores messages keyed by **local mid**. For channels, `localMid = MESSAGE_ID_OFFSET + serverMsgId`; for users/chats, `localMid = serverMsgId`. Use `appMessagesIdsManager.generateMessageId(serverId, channelId)` to encode and `getServerMessageId(localMid)` to decode. **Never** mix the two — `getMessageByPeer` will silently miss the message.

When constructing message objects in synthetic tests for forum topics, `reply_to.reply_to_top_id` and `reply_to.reply_to_msg_id` must use the **encoded** mid (matching what `getMessageThreadId` expects), not the raw server id.

### 3. `top_message` ≠ the message you sent

After `messages.createChat({users:[B]}) + messages.sendMessage`, the dialog’s `top_message` may be a service message (e.g., `messageActionChatAddUser`) inserted by the server **after** your text message. To find the actual mention/text, iterate `getHistory.messages` and filter by `_ === 'message' && (pFlags?.mentioned || entities?.some(e._ === 'messageEntityMention'))`. Don’t blindly trust `dialog.top_message`.

### 4. `isMentionUnread` requires `pFlags.media_unread`

```ts
return !!(pFlags.media_unread && pFlags.mentioned && (no voice/round doc));
```
If you delete `media_unread` BEFORE checking `isMentionUnread`, the check silently returns `false`. This was the root cause of the order-of-ops bug in `onUpdateReadMessagesContents`. Always capture mention-unread state into a local boolean before mutating flags.

### 5. `readHistory` early-return

`appMessagesManager.readHistory` used to return `Promise.resolve()` when `historyStorage.triedToReadMaxId >= maxId`, blocking BOTH the server call AND the local `processLocalUpdate`. The local apply must always run because users can scroll into older messages whose mid is below a previously-issued maxId. The fix gates only the server call.

### 6. Stale reload race

`dialogsStorage.applyDialogs` (called from `reloadConversation`) was overwriting local `read_inbox_max_id` / `unread_count` / `historyStorage.readMaxId` with server values, even if the server snapshot was older than the local read state. This made the badge briefly “jump back up”, then drop again on next read — looking like a duplicate counter. Fix in `saveDialog`: if `wasDialogBefore.read_inbox_max_id > dialog.read_inbox_max_id`, preserve the local values.

### 7. Forum / botforum aggregation

Topics live in `dialogsStorage.forumTopics: Map<peerId, {topics: Map<topicId, ForumTopic>}>`. The parent forum dialog has its own `unread_mentions_count` that must be **manually** decremented when a topic mention is read — `onUpdateReadHistory` decrements only `foundDialog` (the topic), so the propagation has to be added explicitly. Same for `onUpdateReadMessagesContents`.

For `isForum` checks: forums are **channels with `pFlags.forum=true`**, while botforums are **users with `pFlags.bot_forum_view=true`**. Many call sites only check `appChatsManager.isForum(peerId.toChatId())` — for botforum that returns `false` (peer is a user, not a chat), so the topic dialog is missed and `readHistory` early-returns. Always check `isForum(...) || isBotforum(peerId)` together.

### 8. @mira topics are account-scoped

@mira (`bot_forum_view: true`) creates server-side forum topics per user account, but only after meaningful interaction. A *fresh* account that just sent “hi” might see `messages.getForumTopics(peer: inputPeerUser{mira})` return 0 topics — Mira’s replies land in main history without `reply_to`. An account that has used Mira for a while will have many real topics (each topic is server-side: `messages.readDiscussion` against them works, server decrements `unread_count` correctly).

So for botforum-topic e2e, pick the account that already has topics. Confirm with `messages.getForumTopics({peer: inputPeerUser{mira_id, mira_access_hash}, …}).topics.length > 0` before running. The test pattern is in `src/tests/api/serverVerifyBotforum.test.ts`.

When applying `messages.forumTopics` into local state, pass the forum peerId as the second arg to `dialogsStorage.applyDialogs(result, peerId)` — without it `processTopics` crashes on `peerId.isAnyChat()`.

### 9. Vitest console.log is silenced by default

To see `console.log` output from inside tests, append `-- --reporter=verbose --silent=false` to the `pnpm test` command. Without it, valuable diagnostics disappear.

### 10. Two clients in one process

`createDualClients` works because the harness namespaces by `accountNumber` (1 and 2): different IDB databases (`tweb-account-1`/`tweb-account-2`) and different `localStorage` `account${n}` keys. Module-level singletons (`MTProtoMessagePort.INSTANCE`, `cryptoMessagePort`, `transportController`) are shared but harmless because `superMessagePort.ts:288-290` no-ops `postMessage` in `MODE === 'test'`. The two clients DO share `cryptoMessagePort` — fine because crypto ops are stateless.

## Standard env vars

| Var | Meaning |
|---|---|
| `TG_API_TEST=1` | Enable any gated synthetic test (single-account). |
| `TG_API_E2E=1` | Enable any gated dual-account e2e test. |
| `TG_API_PROD_DC=1` | Use production Telegram DCs instead of test DCs. |
| `TG_API_SEED=./tmp/seed.json` | Path to account A seed. |
| `TG_API_SEED_B=./tmp/seed-b.json` | Path to account B seed (e2e only). |
| `TG_API_PRINT=1` | Some tests use this to enable extra trace output. |
| `TG_API_DEBUG=1` | Harness step-timing logs in `harness.ts:createTestClient`. |

## Investigation workflow

When debugging a new bug:

1. **Reproduce synthetically first** in `unreadRace.test.ts`:
   - Construct minimal in-memory state.
   - Trigger the suspected code path.
   - Assert observed vs expected.
   - If repro fails to fail (i.e., works), you’re testing the wrong path.
2. **Trace via `console.log`** inside the production code (temporarily) to see what runs and what state mutations happen. Always remove before committing.
3. **Identify the fix** — usually one of:
   - Order-of-ops (capture state before mutating).
   - Missing branch (`isForum` without `isBotforum`, etc.).
   - Server semantics (need an extra API call: `readMentions`, `readReactions`).
   - Stale snapshot overwrite (preserve local vs server based on cursor).
4. **Verify synthetically** that the fix passes the test.
5. **Verify server-side** with `serverVerify.test.ts`-style e2e if the fix touches code that affects what server sees.
6. **Run full suite** (`pnpm test`) to check for regressions; existing crypto/srp/etc. tests must stay green (note: `srp.test.ts` is intentionally early-returning and skipped).

## Files of reference

- `src/tests/api/harness.ts` — single-client bootstrap.
- `src/tests/api/dualHarness.ts` — two-client bootstrap.
- `src/tests/api/nodeEnv.ts` — Node polyfills (WebSocket via ws, fake-indexeddb, in-memory localStorage, …).
- `src/tests/api/inlineCrypto.ts` — registers in-process crypto (no separate worker thread).
- `src/tests/api/unreadRace.test.ts` — synthetic test catalog (Bug 1–6).
- `src/tests/api/serverVerify.test.ts` — server-verified e2e (Bug 6 / issue #380).
- `src/tests/api/serverVerifyBotforum.test.ts` — server-verified e2e (Bug 5, botforum topic read via @mira).
- `src/tests/api/getDialogs.test.ts` — minimal smoke that the API plumbing works at all.
- `src/tests/api/README.md` — seed extraction instructions.
- `src/lib/appManagers/appMessagesManager.ts` — primary mutation surface (`onUpdateReadHistory`, `onUpdateNewMessage`, `onUpdateReadMessagesContents`, `readMessages`, `readHistory`, …).
- `src/lib/storages/dialogs.ts` — `applyDialogs`, `saveDialog`, forum topic storage.
- `src/lib/appManagers/apiUpdatesManager.ts` — `processUpdate`, `processLocalUpdate`, `saveUpdate`.

## What this skill does NOT cover

- UI/Solid.js rendering bugs (Solid signals, store reactivity).
- Crypto correctness (handled by existing `crypto_methods.test.ts`; SRP fixtures are stale and intentionally skipped).
- Anything beyond MTProto API + dialog state.
