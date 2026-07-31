# Ephemeral and Business Bot API fixture

This long-polling bot exercises the Bot API side of Ephemeral Messages in a
real group chat. It can also be connected to a Telegram Business account for
end-to-end Chat Automation testing. It is intentionally separate from Vitest:
the fixture talks to Telegram over the network and needs a dedicated bot token.

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
