---
name: changelog
description: "Write what is new in tweb for the people who use it: the \"### Unreleased\" section of CHANGELOG.md and CHANGELOG_ru.md, which is the post about the version in @WebK_en / @WebK_ru (a rich message) and, through its headlines, the short message the app sends on update. Drafted from the commits since it was last brought up to date, in plain words: what people can do now and what works better for them, never how it was built; sent as a draft to the private drafts channel by the changelog bot. Use before every Build (`node build.js`), before a version bump, and whenever the changelog, release notes or a post about the update are asked for: \"обнови ченжлог\", \"напиши ченжлог\", \"что нового\", \"пост в канал\", \"release notes\", \"changelog\"."
user-invocable: true
---

# Changelog: what is new, for the people who use the app

## Where it goes, and who reads it

A version's section in `CHANGELOG.md` (English) or `CHANGELOG_ru.md` (Russian)
is read in three places:

- **The post** in @WebK_en / @WebK_ru: the whole section, as a rich message —
  headings, paragraphs, lists and a clip under each feature.
- **The app's message.** When a client updates to the version, every account
  in it gets, once, in its "Telegram" chat, the section's headlines with their
  leads and the link to the post. The app puts "Telegram Web K was updated to
  version X" over it. People in other languages get the English one.
- **GitHub.** The version line at the bottom of the main menu links to
  `CHANGELOG.md`.

A build within a version (2.2 (684) → 2.2 (685)) tells nobody anything; only a
new version is announced. What has not been announced yet waits under
`### Unreleased` at the top of both files. `node build.js <version>` turns it
into `### <version> (<build>)`, and refuses when the section is missing, does
not fit, is technical, or does not end with the link to its post yet.

**The reader** uses Telegram in a browser. They have never seen the code, the
commits or the bug tracker. They want to know two things: what they can do now
that they could not before, and what got better in a way they would notice.

## The shape of a section

```markdown
### Unreleased
One or two sentences on what this update is about.

#### ✈️ Messages fly as you send them
A sent message flies from the message field into its place in the chat.

More on it: what else, where to find it, a [link](https://telegram.org/blog/…)
when Telegram announced it.

<!-- video: send-message.mp4 "Sending a message" -->

#### More new things
- A smaller feature, in one line.

#### Fixes
- What went wrong for people, said by how it looked to them.

[Videos and details in our channel](https://t.me/WebK_en/18)
```

- **Headlines** are `#### <emoji> <name>` headings: at most 6, the features
  most people will care about. The paragraph right under one is its **lead**:
  one sentence, at most 160 characters, only plain text, **bold** and links.
  "✈️ **Name.** Lead" is that headline's line in the app's message.
- **Everything else** — more text under a headline, headings without an emoji,
  lists, clips — is the post's only. Keep what is in sight short: a sentence
  or two under a headline, and a long list folded into groups of a few lines,
  each `<details><summary>Group</summary>` … `</details>` (blank lines inside
  around the list), closed until tapped.
- **The last line** is the link to the post, added once it is out. Only the
  app's message shows it.
- **Clips** are `<!-- video: <file> "<caption>" -->` lines, which GitHub does
  not show. The file goes in `tmp/changelog-clips/`. A clip not recorded yet is
  a placeholder in the draft.
- **Animated emoji** in the post: a line
  `<!-- animated emoji: 🎨 5431456208487716895, 👥 5372926953978341366 -->`
  anywhere in the section turns every such emoji of the post into that custom
  emoji (one of an emoji, like ❤ of ❤️‍🔥, is left alone); GitHub and the app's
  message keep the plain ones. Take the animated twin from the
  [Animated Emoji](https://t.me/addemoji/RestrictedEmoji) set, and choose a
  headline's emoji among those it has. A bot may put custom emoji only in a
  private chat or a group, when its owner has Premium: in a channel they arrive
  plain, and the draft script says how many were kept.
- **The Markdown is the rich message's**: `**bold**`, `*italic*`,
  `[text](link)`, lists, `---`. Never `__`: it is bold in the post and italic
  in the app.
- Headings are raised by two levels in the post (`####` becomes `##`), so a
  sub-heading under a headline is `#####`.

## How to write it

1. **Say what the person sees or does, in the app's own words.** Use the names
   of screens, buttons and settings as the app shows them: `src/lang.ts` for
   English, the Russian app for Russian («Избранное», not "Saved Messages").
   Never the code's names for things:

   | the code says | people say |
   |---|---|
   | composer, input | message field |
   | bubble | message |
   | topbar | the top of the chat |
   | dialog, peer | chat |
   | left sidebar | chat list |
   | right sidebar | profile |
   | media viewer | photo viewer, video player |
   | popup | window |
   | service chat, 777000 | the "Telegram" chat |

2. **Nothing technical.** No code, file names, functions, protocol terms (API,
   layer, constructor, flags), build or test tooling, commit hashes, numbers
   that need a profiler, and no links to bug reports or GitHub.
   `src/tests/changelog.test.ts` turns away the obvious words, but passing it
   does not make a text readable.
3. **Only what people get by default in this version.** Leave out everything
   that is off by default: behind a URL flag (`?a11y=1`), in Settings →
   Experimental, held back by a constant (the wallet's `WALLET_RELEASED`), or
   only on test servers. Leave out everything only developers see: the popup
   sandbox, previews, logs, memory tools. When a commit does not make it clear,
   read the diff.
4. **Only what Telegram has announced.** A Telegram-wide feature goes in once
   it is public: on telegram.org/blog or in the official apps. Link its blog
   post. Never anything from a private source.
5. **Fixes: the ones people could have run into.** Name a few they would
   recognize, by what went wrong for them ("a draft could come back after the
   message was sent"). Sum up the rest in one line. Never list every fix.
6. **Speed and memory: say what people feel.** "Chats open faster", "less
   memory in a tab left open for days".
7. **Russian is written, not translated word for word.** Use natural Russian
   and the names the Russian app uses. Address the reader as «Вы», as the
   earlier sections do.
8. **Rewrite the section, do not append to it.** It is the post exactly as
   people will read it. Put a new change into the item it belongs to. Move an
   item that grew into a feature up. Remove an item that was reverted or turned
   out to be hidden.

## Steps

1. **Find what is new.** The last commit that changed `CHANGELOG.md`
   (`git log -1 --format=%h -- CHANGELOG.md`) is where the section was last
   brought up to date. If that commit only fixed an older section, take the
   one before it. Read what came after:
   `git log --no-merges --reverse --format='%h %s%n%b' <that>..HEAD`.
   For hundreds of commits, split the range by month and give each part to a
   subagent with this file as its brief. Each one returns candidate items and
   the commits behind them; you write the section yourself.
2. **Sort the commits.** A commit is a candidate when people can see the change
   by default. Skip tests, tooling, previews, the import graph budget, docs,
   skills, everything behind a flag, and refactors that change nothing people
   see.
3. **Write the section.** Add `### Unreleased` at the very top if it is not
   there yet.
4. **Check it:** `pnpm test src/tests/changelog.test.ts`, and
   `node scripts/changelog-draft.mjs --dry-run` shows the post and the app's
   message as they will be.
5. **Where it goes:**
   - as part of a Build, the section goes into the Build commit, as a draft
     nobody sees yet;
   - before a version, it goes to the drafts channel (below).

## Releasing a version

The user decides when, and which number. The number has to differ from the one
the app has now (`VITE_VERSION` in `.env`): the app tells people about a
version only when its number changes, so a new build of the same number says
nothing to anybody. The link to the post is built into the version, so the
order matters:

1. **A last pass over the section**: headlines in order of interest, the
   Russian saying the same as the English, and what landed since the section
   was written added where it belongs.
2. **The draft.** `node scripts/changelog-draft.mjs [--lang ru]` sends the
   section to the private drafts channel as a rich post. It runs unsandboxed,
   with `NODE_USE_ENV_PROXY=1` inside the sandbox. A rerun edits the same draft;
   `--new` sends another. The bot is in the drafts channel only. It sends the
   draft to its owner's own chat with it too, where the animated emoji stay:
   the owner forwards the post from there. That chat is found once, after they
   press Start, with `--find-owner @their_username`.
3. **The review.** The user reads the draft there and edits it, or asks for
   changes. Bring every edit they make in the channel back into the section:
   it stays the source of the app's message and of the next draft.
4. **Clips**: one short video (10–30 s) per headline, of the feature at the
   pace a person sees it, in a preview of accounts made for the post: never an
   account whose chats are someone's own, and nothing in a frame but the chats
   made for it. Look at every clip frame by frame where a screen slides or
   changes before it goes into a draft. A machine with the tools for it says
   how in `tmp/clip/README.md`; elsewhere the user records them. Rerun the
   draft once they are in `tmp/changelog-clips/`.
5. **Before the posts**: look at the app's message as the "Telegram" chat will
   show it, and when anything about how it is delivered changed, go through the
   move from the current version to the new one on a built bundle: the message
   comes once, reads, the unread counters go back to none, and a reload leaves
   no trace of it.
6. **The posts**: the user moves the drafts to @WebK_en and @WebK_ru. Sessions
   never post there.
7. **The link**: add the last line to each section, in its own language:
   `[Videos and details in our channel](https://t.me/WebK_en/<id>)` or
   `[Видео и подробности — в нашем канале](https://t.me/WebK_ru/<id>)`.
8. **The build**: `node build.js <version>`. It runs every test first; a run
   that stops has already written the new version and build number into `.env`
   and `public/version` and turned the sections into the version's: put them
   back as they were before running it again, or the build number skips.
