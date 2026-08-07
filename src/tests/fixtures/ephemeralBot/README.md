# Ephemeral, Business and Guard Bot API fixture

This long-polling bot exercises the Bot API side of Ephemeral Messages in a
real group chat. It can also be connected to a Telegram Business account for
end-to-end Chat Automation testing, and act as the guard bot of a chat so that
guard-bot joins can be tested end to end. It is intentionally separate from
Vitest: the fixture talks to Telegram over the network and needs a dedicated
bot token.

## Prerequisites

Create or choose a dedicated test bot and keep its token outside the
repository. For Ephemeral Messages, add the bot to the group used by the
preview account and copy the numeric Bot API chat ID of that group.

The fixture defaults to `@tweb_ephemeral_ui_25359431_bot`. Override the
expected username when using another bot so the startup guard can verify that
the supplied token belongs to the intended account.

## Running

```bash
read -s 'TG_EPHEMERAL_BOT_TOKEN?Bot token: '
export TG_EPHEMERAL_BOT_TOKEN
export TG_EPHEMERAL_BOT_CHAT_IDS='-1001234567890'
pnpm test:ephemeral-bot
```

`TG_EPHEMERAL_BOT_CHAT_IDS` accepts a comma-separated list. Messages and
callback queries from every other chat are ignored, and the fixture registers
its commands only in allowlisted chats.

For another test bot, override the expected username:

```bash
export TG_EPHEMERAL_BOT_USERNAME='my_test_bot'
pnpm test:ephemeral-bot
```

The token is read only from the process environment. Do not put it in tracked
files, command examples, or test snapshots.

The process registers its command list on startup and then uses Bot API long
polling. A bot token can have only one update consumer: the fixture aborts on
an active webhook or a conflicting `getUpdates` process. Stop it with
`Ctrl+C`; the current update is finished and acknowledged before exit.

## Chat Automation / Business Mode

Enable Business Mode for the test bot before connecting it. The fixture checks
`getMe.can_connect_to_business` at startup and aborts if the supplied bot
cannot be connected to a business account.

Business Mode has two independent, mandatory allowlists:

- `TG_EPHEMERAL_BOT_BUSINESS_USER_IDS` contains the numeric user ID of every
  test business account allowed to connect the bot.
- `TG_EPHEMERAL_BOT_BUSINESS_CHAT_IDS` contains the numeric private-chat ID of
  every test customer the bot may answer. In a private chat this is the
  customer's user ID.

Both variables must be configured together. They accept comma-separated
positive numeric IDs. `TG_EPHEMERAL_BOT_CHAT_IDS` may be omitted when only
Chat Automation is being tested.

When testing included/excluded rules, put every QA customer involved in the
scenario in the fixture allowlist, including the customer that will be excluded
in Chat Automation. The fixture allowlist is the outer safety boundary; the
server-side Chat Automation scope is the behavior under test.

```bash
read -s 'TG_EPHEMERAL_BOT_TOKEN?Bot token: '
export TG_EPHEMERAL_BOT_TOKEN
export TG_EPHEMERAL_BOT_BUSINESS_USER_IDS='1000000001'
export TG_EPHEMERAL_BOT_BUSINESS_CHAT_IDS='1000000002'
pnpm test:ephemeral-bot
```

In Chat Automation, connect this bot and grant it permission to reply. The
read-messages permission is optional: when granted, the fixture also marks the
test command as read. No delete, profile, gift, story, or Stars permissions are
needed.

Wait for the fixture's `ready` event, then send `/business` from the
allowlisted customer account to the connected business account. Commands
queued before this fixture run are ignored. The fixture replies on behalf of
the business account only when all of these checks pass:

- the connection owner is allowlisted and the connection is enabled;
- the customer chat is allowlisted;
- the message is incoming, private, and not an automatic or bot-authored
  business message;
- the connection has permission to reply.

Edited and deleted business-message updates are logged but never mutated.
Messages other than `/business` are ignored. This makes it safe to keep the
fixture running while testing included and excluded chat rules.

## Guard Mode

A guard bot greets people who try to join a chat: instead of an admin approving
them by hand, the join opens the bot's Mini App and the bot answers the join
request query. Enable join request queries for the test bot in @BotFather — the
fixture checks `getMe.supports_join_request_queries` at startup and aborts if
the supplied bot cannot process them.

Then assign the bot as the guard bot of the test chat: promote it to admin in
Web K and turn on **Process Join Requests** in its admin rights. The chat also
needs **Approve new members** on, which that switch enables for you.

```bash
read -s 'TG_EPHEMERAL_BOT_TOKEN?Bot token: '
export TG_EPHEMERAL_BOT_TOKEN
export TG_EPHEMERAL_BOT_GUARD_CHAT_IDS='-1001234567890'
export TG_EPHEMERAL_BOT_GUARD_RESULT='approve'
pnpm test:ephemeral-bot
```

`TG_EPHEMERAL_BOT_GUARD_CHAT_IDS` is the outer safety boundary: join requests
from every other chat are ignored, so the fixture can never answer for a real
chat. It accepts a comma-separated list and may be used on its own — the other
allowlists are not required for Guard Mode.

`TG_EPHEMERAL_BOT_GUARD_RESULT` is the outcome sent to
`answerChatJoinRequestQuery`: `approve` (default), `decline`, or `queue` to hand
the decision back to the administrators. Restart the fixture to rehearse another
one. The three map exactly onto the three client outcomes — joined, refused, and
"you will be added once an admin approves".

Set `TG_EPHEMERAL_BOT_GUARD_WEB_APP_URL` to an HTTPS URL to test the Mini App
step: the fixture calls `sendChatJoinRequestWebApp` first, so the client opens
that page inside the join Mini App, and only then resolves the query with the
configured result. `TG_EPHEMERAL_BOT_GUARD_WEB_APP_DELAY_MS` (default 8000)
controls how long the app stays up in between.

Two server rules bound what the fixture can rehearse, both established against
the live API:

- a query may carry only one Mini App — a second `sendChatJoinRequestWebApp`
  answers `RESULT_INVALID`;
- a query has a short response window. `TG_EPHEMERAL_BOT_GUARD_WEB_APP_START_DELAY_MS`
  holds the app back on purpose to observe that: at 20s the query is already
  gone ("query is too old"), and the join falls back to an ordinary approval
  request that the guard bot never resolves.

Together those mean the Mini App URL always reaches the client through
`messages.requestChatJoinWebView`, never as a later `joinChatBotResultWebView`
decision, so the client's swap-the-URL-in-place path cannot be produced from
the Bot API.

A query the fixture can no longer answer — expired, or already resolved — is
logged as `guard-query-unanswerable` with the API message and skipped. It has to
be skipped rather than fatal: the same update is redelivered on every poll until
the batch is acknowledged, so dying on it wedges the fixture on that one update.

A join request without `query_id` is an ordinary approval request that was not
delegated to a guard bot. The fixture logs it and leaves it to the admins,
because there is no query to answer.

Wait for the fixture's `ready` event, then join the chat from a second account —
by invite link and by the Join button, since the client treats those paths
differently. Each answered query is logged as `guard-join-request-answered`.

## Commands

- `/secret` sends an ephemeral text reply.
- `/media`, `/sticker`, `/video`, `/animation`, `/document`, `/audio`,
  `/voice`, and `/videonote` cover media presentation.
- `/location` and `/link` cover location and link previews.
- `/burst` sends three grouped ephemeral replies.
- `/button` covers an inline callback.
- `/edit` and `/delete` cover ephemeral mutations.
- `/poll` returns the expected unsupported-content notice.
- `/plain` sends an ordinary public bot reply as a control case.

The fixture also acknowledges ephemeral client media when the user replies
without a command.
