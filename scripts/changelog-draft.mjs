#!/usr/bin/env node
// Sends a section of the changelog as a rich post to the drafts channel, where it is read and edited before it
// is moved to @WebK_en / @WebK_ru by hand (the bot is not in those):
//
//   node scripts/changelog-draft.mjs [--lang en] [--section Unreleased] [--new] [--find-owner <@username|id>] [--dry-run]
//
// The bot and the channel are this machine's, in tmp/changelog-bot/ of this checkout or, for what it lacks, of the
// main one: `token` (never printed) and `config.json` ({"draftsChatId": -100…}). The draft sent last for a section
// and language is kept in this checkout's (`drafts.json`), so a rerun edits it in place; --new sends another one.
// The owner's own chat with the bot gets it too, with its animated emoji, which a bot may not put in a channel
// (`ownerChatId` in config.json: --find-owner takes it from the last message the bot got from that person, after
// they pressed Start — named, since anyone can write to a bot).
// Clips: a `<!-- video: send.mp4 "caption" -->` line of the section, the file in tmp/changelog-clips/ of this
// checkout or the main one; a clip not recorded yet shows in the draft as a placeholder.
// --dry-run prints the post and the app's message and sends nothing.
// In the Bash sandbox: NODE_USE_ENV_PROXY=1, with api.telegram.org allowed.

import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {UNRELEASED, parseChangelog, getPost, getAppMessage, findProblems} = require('../src/scripts/changelogs.js');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// * a worktree starts with an empty tmp/: what it lacks is the main checkout's
const MAIN_ROOT = path.dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {cwd: ROOT, encoding: 'utf8'}).trim());
const findLocal = (...parts) => [ROOT, MAIN_ROOT].map((root) => path.join(root, 'tmp', ...parts)).find((filePath) => fs.existsSync(filePath));
const BOT_DIR = path.join(ROOT, 'tmp', 'changelog-bot');

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const lang = getArg('--lang', 'en');
const sectionTitle = getArg('--section', UNRELEASED);
const isNew = args.includes('--new');
const isDryRun = args.includes('--dry-run');

const fileName = lang === 'en' ? 'CHANGELOG.md' : `CHANGELOG_${lang}.md`;
const section = parseChangelog(fs.readFileSync(path.join(ROOT, fileName), 'utf8')).find(({title}) => title === sectionTitle);
if(!section) {
  console.error(`${fileName} has no "### ${sectionTitle}" section`);
  process.exit(1);
}

const problems = findProblems(section.body);
if(problems.length) {
  console.error(`${fileName}, ${sectionTitle}: ${problems.join(', ')}`);
  process.exit(1);
}

const media = [];
const markdown = getPost(section.body, (file, caption) => {
  const filePath = findLocal('changelog-clips', file);
  if(!filePath) {
    return `🎬 *Video to come${caption ? ': ' + caption : ''}*`;
  }

  const id = `clip${media.length + 1}`;
  media.push({id, filePath});
  return `![](tg://video?id=${id}${caption ? ` "${caption.replace(/"/g, '\'')}"` : ''})`;
});

if(isDryRun) {
  console.log(markdown);
  console.log('\n--- the app\'s message ---\n');
  console.log(getAppMessage(section.body));
  process.exit(0);
}

const [tokenPath, configPath] = ['token', 'config.json'].map((name) => findLocal('changelog-bot', name));
if(!tokenPath || !configPath) {
  console.error('The bot is not set up here: tmp/changelog-bot/ needs its token and config.json');
  process.exit(1);
}

const token = fs.readFileSync(tokenPath, 'utf8').trim();
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const {draftsChatId} = config;
const draftsPath = path.join(BOT_DIR, 'drafts.json');
const drafts = fs.existsSync(draftsPath) ? JSON.parse(fs.readFileSync(draftsPath, 'utf8')) : {};
const draftKey = `${sectionTitle}:${lang}`;

async function callBot(method, params, files = []) {
  const body = new FormData();
  for(const key in params) {
    body.append(key, typeof(params[key]) === 'object' ? JSON.stringify(params[key]) : String(params[key]));
  }

  for(const {id, filePath} of files) {
    body.append(id, await fs.openAsBlob(filePath), path.basename(filePath));
  }

  // * the token is in the URL: never let it into an error
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {method: 'POST', body});
  return response.json();
}

const richMessage = {
  markdown,
  ...(media.length && {media: media.map(({id}) => ({id, media: {type: 'video', media: `attach://${id}`, supports_streaming: true}}))})
};

// * what the server keeps of every clip, to see it was not made smaller on the way
const describeFiles = (value) => {
  if(!value || typeof(value) !== 'object') {
    return;
  }

  if(value.file_unique_id && value.width) {
    console.log(`clip: ${value.width}×${value.height}, ${value.duration ?? '?'} s, ${(value.file_size / 1e6).toFixed(1)} MB, ${value.mime_type || ''}`);
    return;
  }

  Object.values(value).forEach(describeFiles);
};

// * a bot may put custom emoji only where Telegram lets it (Bot API: a Premium owner's bot in a private chat or a
// * group, or one with a username bought on Fragment): elsewhere the plain emoji is what is kept
const countCustomEmoji = (value) => {
  if(!value || typeof(value) !== 'object') {
    return 0;
  }

  return (value.type === 'custom_emoji' ? 1 : 0) + Object.values(value).reduce((sum, child) => sum + countCustomEmoji(child), 0);
};
const animatedSent = (markdown.match(/\]\(tg:\/\/emoji\?id=\d+\)|<tg-emoji emoji-id="\d+">/g) || []).length;

// * the draft sent last to `chatId` is edited in place: kept in drafts.json under its chat too, since a message's id
// * is its chat's own, and another chat's message of the same id is not the draft
async function sendDraft(chatId) {
  const key = `${draftKey}@${chatId}`;
  let messageId = isNew ? undefined : drafts[key];
  let result;
  if(messageId) {
    result = await callBot('editMessageText', {chat_id: chatId, message_id: messageId, rich_message: richMessage}, media);
    if(!result.ok && /not modified/i.test(result.description)) {
      result = {ok: true};
    } else if(!result.ok && /not found|can't be edited/i.test(result.description)) {
      messageId = undefined;
    }
  }

  if(!messageId) {
    result = await callBot('sendRichMessage', {chat_id: chatId, rich_message: richMessage, disable_notification: true}, media);
    messageId = result.result?.message_id;
  }

  if(!result.ok) {
    console.error(`The bot refused: ${result.error_code} ${result.description}`);
    process.exit(1);
  }

  describeFiles(result.result?.rich_message);
  if(animatedSent && result.result?.rich_message) {
    const animatedKept = countCustomEmoji(result.result.rich_message);
    console.log(`animated emoji: ${animatedKept} of ${animatedSent} kept${animatedKept < animatedSent ? ' (the rest are plain: this bot may not put custom emoji here)' : ''}`);
  }

  drafts[key] = messageId;
  fs.mkdirSync(BOT_DIR, {recursive: true});
  fs.writeFileSync(draftsPath, JSON.stringify(drafts, null, 2) + '\n', {mode: 0o600});
  return messageId;
}

// * --find-owner <@username|id>: the private chat of that person, once they have pressed Start in the bot's chat, is
// * kept as ownerChatId in config.json; only theirs, as anyone can write to the bot
if(args.includes('--find-owner')) {
  const owner = getArg('--find-owner', '').replace(/^@/, '').toLowerCase();
  if(!owner || owner.startsWith('--')) {
    console.error('--find-owner needs whose chat it is: --find-owner @username, or their user id');
    process.exit(1);
  }

  const updates = await callBot('getUpdates', {allowed_updates: ['message']});
  const message = (updates.result || [])
  .map((update) => update.message)
  .filter((message) => message?.chat.type === 'private' && (String(message.from?.id) === owner || message.from?.username?.toLowerCase() === owner))
  .pop();
  if(!message) {
    console.error(updates.ok ? `No message to the bot from ${owner}: press Start in its chat, then run this again` : `The bot refused: ${updates.error_code} ${updates.description}`);
    process.exit(1);
  }

  config.ownerChatId = message.chat.id;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`the owner's chat: ${message.from.first_name}${message.from.username ? ' (@' + message.from.username + ')' : ''}${message.from.is_premium ? ', Premium' : ''}`);
}

const messageId = await sendDraft(draftsChatId);
console.log(`https://t.me/c/${String(draftsChatId).replace(/^-100/, '')}/${messageId}`);

// * the owner's own chat with the bot gets the draft too: there, unlike the channel, its animated emoji stay, and
// * the owner forwards it to the public channel from there
if(config.ownerChatId) {
  const ownerMessageId = await sendDraft(config.ownerChatId);
  console.log(`and in the owner's chat with the bot, message ${ownerMessageId}`);
}
