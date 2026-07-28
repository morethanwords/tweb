# Ephemeral Bot API fixture

This long-polling bot exercises the Bot API side of Ephemeral Messages in a
real group chat. It is intentionally separate from Vitest: the fixture talks
to Telegram over the network and needs a dedicated bot token.

## Prerequisites

Create or choose a test bot, add it to the group used by the preview account,
and keep its token outside the repository. Copy the numeric Bot API chat ID of
that group; the fixture refuses to start without an explicit chat allowlist.

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
polling. Stop it with `Ctrl+C`.

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
