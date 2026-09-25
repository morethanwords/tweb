// Done marks for archived messages — see SKILL.md next to this file. Offline: it only edits
// the chat's messages.jsonl and regenerates its transcript, never touches Telegram.
import {existsSync, readFileSync, readdirSync, renameSync, writeFileSync} from 'fs';
import {homedir} from 'os';
import {join} from 'path';
import {isDoneStale, markDone, writeTranscripts} from '../../../src/tests/api/chatArchiveFormat.ts';

const USAGE = 'usage: mark.sh <chat> <id>[,<id>…]… [--note TEXT] [--undo] [--dir PATH]\n' +
  '       mark.sh <chat> --list [--dir PATH]';

function fail(message) {
  console.error('[tg-archive] ' + message);
  process.exit(1);
}

const args = process.argv.slice(2);
let chat, note, undo = false, list = false, root = process.env.TG_ARCHIVE_DIR || join(homedir(), '.claude', 'tg-archive');
const ids = [];
for(let i = 0; i < args.length; ++i) {
  const arg = args[i];
  if(arg === '--note') note = args[++i];
  else if(arg === '--undo') undo = true;
  else if(arg === '--list') list = true;
  else if(arg === '--dir') root = args[++i];
  else if(chat === undefined) chat = arg;
  else ids.push(...arg.split(',').filter(Boolean).map((id) => {
    if(!/^\d+$/.test(id)) fail(`not a message id: ${id}\n${USAGE}`);
    return +id;
  }));
}

if(!chat || (!list && !ids.length)) fail(USAGE);

/** A chat by its folder key, Bot API or tweb id, @username, or a piece of its title. */
function findChat(query) {
  const metas = existsSync(root) ? readdirSync(root, {withFileTypes: true})
  .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'meta.json')))
  .map((entry) => JSON.parse(readFileSync(join(root, entry.name, 'meta.json'), 'utf8'))) : [];

  const q = query.replace(/^@/, '').toLowerCase();
  const exact = metas.filter((meta) => [meta.key, meta.ids?.botApi, meta.ids?.tweb, meta.username]
  .some((value) => value && String(value).toLowerCase() === q));
  const found = exact.length ? exact : metas.filter((meta) => meta.title.toLowerCase().includes(q));
  if(found.length !== 1) {
    fail(found.length ?
      `"${query}" matches ${found.map((meta) => `${meta.title} (${meta.key})`).join(', ')} — name one` :
      `no archived chat matches "${query}" — see ${join(root, 'INDEX.md')}`);
  }

  return found[0];
}

const meta = findChat(chat);
const dir = join(root, meta.key);
const jsonlPath = join(dir, 'messages.jsonl');
const messages = readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));

if(list) {
  const marked = messages.filter((message) => message.done);
  for(const message of marked) {
    const stale = isDoneStale(message) ? ' ✔? edited since it was marked' : '';
    console.log(`#${message.id} ${message.date.slice(0, 10)} ${message.from?.name ?? ''} — ✔ ${message.done.at.slice(0, 10)}${message.done.note ? ': ' + message.done.note : ''}${stale}`);
  }
  console.log(`[tg-archive] ${meta.title}: ${marked.length} marked done`);
  process.exit(0);
}

const byId = new Map(messages.map((message, index) => [message.id, index]));
const missing = ids.filter((id) => !byId.has(id));
if(missing.length) fail(`not in the archive of ${meta.title}: ${missing.map((id) => '#' + id).join(', ')} — sync it first`);

const at = new Date().toISOString();
for(const id of ids) {
  const index = byId.get(id);
  if(undo) delete messages[index].done;
  else messages[index] = markDone(messages[index], note, at);
}

writeFileSync(jsonlPath + '.tmp', messages.map((message) => JSON.stringify(message)).join('\n') + '\n');
renameSync(jsonlPath + '.tmp', jsonlPath);
writeTranscripts(dir, messages, {
  title: meta.title,
  timeZone: meta.timeZone,
  topics: meta.type === 'forum' ? meta.topics : undefined
});

console.log(`[tg-archive] ${meta.title}: ${ids.map((id) => '#' + id).join(', ')} ${undo ? 'unmarked' : 'marked done'}`);
