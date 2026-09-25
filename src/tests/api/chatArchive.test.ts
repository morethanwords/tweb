/**
 * Archives one Telegram chat to disk so an agent can read it later — the engine
 * behind the `tg-chat-archive` skill (.claude/skills/tg-chat-archive), which is
 * the intended way to run it. Skipped unless TG_ARCHIVE_PEER is set.
 *
 * Layout (TG_ARCHIVE_DIR, default ~/.claude/tg-archive):
 *   INDEX.md                    every archived chat, rebuilt on each run
 *   <key>/meta.json             peer, coverage (minId..maxId, complete), topics
 *   <key>/messages.jsonl        one ArchivedMessage per line, ascending id
 *   <key>/transcript/YYYY-MM.md readable transcript, regenerated from the jsonl
 * where <key> is user<id> / chat<id> / channel<id>.
 *
 * Every run pulls what is new since the last one (re-reading the newest TAIL
 * messages so edits and reactions land — a stored record is replaced only when the
 * message's edit timestamp moved, see mergeArchivedMessage), then keeps backfilling older history
 * until the start of the chat, at most TG_ARCHIVE_MAX of them per run — an
 * interrupted backfill resumes from its last checkpoint.
 *
 * Env:
 *   TG_ARCHIVE_PEER  id (-100…, -…, tweb #-…), @username, t.me link, or `me`
 *   TG_API_SEED      account seed (the skill defaults to its own session); a
 *                    chat archived before is read with the session recorded in
 *                    its meta.json unless TG_ARCHIVE_SEED_EXPLICIT=1
 *   TG_ARCHIVE_DIR   archive root
 *   TG_ARCHIVE_MAX   older messages backfilled per run (default 50000);
 *                    what is new since the last sync is always read in full
 *   TG_ARCHIVE_SINCE YYYY-MM-DD (local midnight): keep nothing older, stop the
 *                    backfill there; remembered in meta.json, `all` drops it
 *   TG_ARCHIVE_FULL  1 = re-read everything; messages gone from the server
 *                    are kept and marked deleted
 *   TG_ARCHIVE_DRY   1 = only resolve the peer and print what would be archived
 */

import {existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync} from 'fs';
import {homedir} from 'os';
import {join, resolve as resolvePath} from 'path';
import type {Chat, Dialog, InputPeer, Message, MessagesDialogs, MessagesMessages, Peer, User} from '@layer';
import {createTestClient, AccountSeed} from './harness';
import {installNodeEnv} from './nodeEnv';
import {
  ArchiveContext,
  ArchivedMessage,
  PeerSpec,
  archiveMessage,
  collectTopics,
  mergeArchivedMessage,
  parsePeerSpec,
  peerKey,
  savePeers,
  userName,
  writeTranscripts
} from './chatArchiveFormat';

const PEER = process.env.TG_ARCHIVE_PEER;
const seedPath = process.env.TG_API_SEED;
const describeOrSkip = PEER && seedPath ? describe : describe.skip;

const ROOT = process.env.TG_ARCHIVE_DIR || join(homedir(), '.claude', 'tg-archive');
const MAX = Number(process.env.TG_ARCHIVE_MAX) || 50_000;
const FULL = process.env.TG_ARCHIVE_FULL === '1';
const DRY = process.env.TG_ARCHIVE_DRY === '1';
const SINCE = process.env.TG_ARCHIVE_SINCE;

const PAGE = 100;
// the newest messages are re-read on every sync so edits and reactions land
const TAIL = 200;
const CHECKPOINT_PAGES = 50;
const PAUSE_MS = 300;

type ChatType = 'saved' | 'user' | 'bot' | 'group' | 'supergroup' | 'forum' | 'channel';

type Meta = {
  key: string,
  type: ChatType,
  title: string,
  username?: string,
  // the same chat as tweb's URL hash and the Bot API spell it
  ids: {tweb: string, botApi: string},
  accessHash?: string,
  accountUserId: number,
  serverCount?: number,
  count: number,
  // [minId, maxId] is archived without gaps; complete = it reaches down to the
  // first message, or to `since` when the archive is limited to a period
  minId?: number,
  maxId?: number,
  complete: boolean,
  since?: string,
  // the session file the chat is read with — later runs reuse it
  seed?: string,
  firstDate?: string,
  lastDate?: string,
  syncedAt?: string,
  timeZone: string,
  topics?: Record<number, string>
};

type Target = Pick<Meta, 'key' | 'type' | 'title' | 'username' | 'ids' | 'accessHash'> & {inputPeer: InputPeer};

/**
 * The archive only ever reads. Every Telegram API method — the runner's own and
 * whatever the booting manager stack fires on its own — goes through
 * MTPNetworker.wrapApiCall, and one not on this list never leaves the process:
 * its promise stays pending, as on a client that is offline. So nothing here,
 * or in any manager, can edit, delete, leave, join or mark a chat as read.
 */
const READ_ONLY_METHODS = new Set([
  'users.getUsers',
  'contacts.resolveUsername',
  'messages.getChats',
  'messages.getDialogs',
  'messages.getHistory'
]);

const apiCalls = {sent: new Map<string, number>(), blocked: new Map<string, number>()};

async function allowOnlyReads() {
  installNodeEnv();
  const MTPNetworker = (await import('@lib/mtproto/networker')).default;
  const wrapApiCall = MTPNetworker.prototype.wrapApiCall;
  MTPNetworker.prototype.wrapApiCall = function(method: string, ...args: any[]) {
    const allowed = READ_ONLY_METHODS.has(method);
    const counter = allowed ? apiCalls.sent : apiCalls.blocked;
    counter.set(method, (counter.get(method) || 0) + 1);
    return allowed ? wrapApiCall.call(this, method, ...args) : new Promise(() => {});
  };
}

const log = (...args: any[]) => console.log('[tg-archive]', ...args);

function logApiCalls() {
  const list = (calls: Map<string, number>) => [...calls].map(([method, count]) => `${method} ×${count}`).join(', ') || 'none';
  log(`API calls sent: ${list(apiCalls.sent)}`);
  log(`blocked, never sent: ${list(apiCalls.blocked)}`);
}
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function readJson<T>(path: string): T {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

function writeAtomic(path: string, data: string) {
  writeFileSync(path + '.tmp', data);
  renameSync(path + '.tmp', path);
}

function readMetas() {
  if(!existsSync(ROOT)) return [];
  return readdirSync(ROOT, {withFileTypes: true})
  .filter((entry) => entry.isDirectory())
  .map((entry) => readJson<Meta>(join(ROOT, entry.name, 'meta.json')))
  .filter(Boolean);
}

/** The archive folders a peer spec can be; a bare negative id is either kind of group. */
function peerKeys(spec: PeerSpec) {
  switch(spec.kind) {
    case 'user': return ['user' + spec.id];
    case 'channel': return ['channel' + spec.id];
    case 'chatOrChannel': return ['chat' + spec.id, 'channel' + spec.id];
    default: return [];
  }
}

/** The session an already archived chat was read with, so a refresh needs no --seed. */
function archivedSeed(spec: PeerSpec) {
  const keys = peerKeys(spec);
  const username = spec.kind === 'username' ? spec.username.toLowerCase() : undefined;
  const meta = readMetas().find((meta) => keys.includes(meta.key) || (username && meta.username?.toLowerCase() === username));
  return meta?.seed && existsSync(meta.seed) ? meta.seed : undefined;
}

function targetFromPeer(peer: Peer, users: User[] = [], chats: Chat[] = []): Target {
  if(peer._ === 'peerUser') {
    const user = users.find((user) => String(user.id) === String(peer.user_id));
    if(user?._ !== 'user') throw new Error(`user${peer.user_id} is not accessible`);
    return {
      key: 'user' + user.id,
      type: user.pFlags.self ? 'saved' : (user.pFlags.bot ? 'bot' : 'user'),
      title: user.pFlags.self ? 'Saved Messages' : userName(user),
      username: user.username,
      ids: {tweb: String(user.id), botApi: String(user.id)},
      accessHash: String(user.access_hash),
      inputPeer: user.pFlags.self ?
        {_: 'inputPeerSelf'} :
        {_: 'inputPeerUser', user_id: user.id, access_hash: user.access_hash}
    };
  }

  const id = peer._ === 'peerChat' ? peer.chat_id : peer.channel_id;
  const chat = chats.find((chat) => String(chat.id) === String(id));
  if(chat?._ === 'chat') {
    if(chat.migrated_to?._ === 'inputChannel') {
      log(`«${chat.title}» was upgraded to a supergroup; archiving channel${chat.migrated_to.channel_id} needs it by that id or link`);
    }

    return {
      key: 'chat' + chat.id,
      type: 'group',
      title: chat.title,
      ids: {tweb: '-' + chat.id, botApi: '-' + chat.id},
      inputPeer: {_: 'inputPeerChat', chat_id: chat.id}
    };
  }

  if(chat?._ === 'channel') {
    return {
      key: 'channel' + chat.id,
      type: chat.pFlags.broadcast ? 'channel' : (chat.pFlags.forum ? 'forum' : 'supergroup'),
      title: chat.title,
      username: chat.username || chat.usernames?.find((username) => username.pFlags.active)?.username,
      ids: {tweb: '-' + chat.id, botApi: '-100' + chat.id},
      accessHash: String(chat.access_hash),
      inputPeer: {_: 'inputPeerChannel', channel_id: chat.id, access_hash: chat.access_hash}
    };
  }

  throw new Error(`${peerKey(peer)} is not accessible (${chat?._ ?? 'not found'})`);
}

describeOrSkip('tg chat archive', () => {
  let client: Awaited<ReturnType<typeof createTestClient>>;
  let seed: AccountSeed, seedFile: string;

  beforeAll(async() => {
    const remembered = process.env.TG_ARCHIVE_SEED_EXPLICIT === '1' ? undefined : archivedSeed(parsePeerSpec(PEER));
    seedFile = remembered || resolvePath(seedPath);
    if(remembered) log(`reading with the session this chat was archived with: ${remembered}`);
    seed = JSON.parse(readFileSync(seedFile, 'utf8'));
    // before the managers boot: they fire their startup requests right away
    await allowOnlyReads();
    client = await createTestClient({seed, testDc: false});
    // a 401/406 answer calls logOut(): auth.logOut is blocked above, but its
    // local half would still wipe the harness session mid-run
    (client.apiManager as any).logOut = () => Promise.resolve();
  }, 120_000);

  afterAll(() => {
    client?.dispose();
  });

  const invoke: typeof client.apiManager.invokeApi = (...args) => client.apiManager.invokeApi(...args);

  /** Meta of an earlier run by this account: its access hash spares the dialog scan. */
  function cachedTarget(keys: string[]): Target {
    for(const key of keys) {
      const meta = readJson<Meta>(join(ROOT, key, 'meta.json'));
      if(!meta || meta.accountUserId !== seed.userId) continue;
      const id = key.replace(/^\D+/, '');
      const inputPeer: InputPeer = meta.type === 'saved' ? {_: 'inputPeerSelf'} :
        key.startsWith('user') ? {_: 'inputPeerUser', user_id: +id, access_hash: meta.accessHash} :
        key.startsWith('chat') ? {_: 'inputPeerChat', chat_id: +id} :
        {_: 'inputPeerChannel', channel_id: +id, access_hash: meta.accessHash};
      return {...meta, inputPeer};
    }
  }

  async function findInDialogs(matches: (peer: Peer) => boolean): Promise<Target> {
    // folder 0 is the main list, folder 1 the archive
    for(const folderId of [0, 1]) {
      let offsetDate = 0, offsetId = 0, offsetPeer: InputPeer = {_: 'inputPeerEmpty'}, scanned = 0;
      for(;;) {
        const result: MessagesDialogs = await invoke('messages.getDialogs', {
          folder_id: folderId || undefined,
          offset_date: offsetDate,
          offset_id: offsetId,
          offset_peer: offsetPeer,
          limit: PAGE,
          hash: 0
        });
        if(result._ === 'messages.dialogsNotModified') break;

        const dialogs: Dialog.dialog[] = result.dialogs.filter((dialog): dialog is Dialog.dialog => dialog._ === 'dialog');
        const found = dialogs.find((dialog) => matches(dialog.peer));
        if(found) return targetFromPeer(found.peer, result.users, result.chats);

        scanned += result.dialogs.length;
        const last: Dialog.dialog = dialogs[dialogs.length - 1];
        const lastMessage = last && result.messages.find((message) => {
          return message._ !== 'messageEmpty' && message.id === last.top_message && peerKey(message.peer_id) === peerKey(last.peer);
        }) as Message.message;
        if(result._ === 'messages.dialogs' || !lastMessage || scanned >= result.count) break;

        offsetDate = lastMessage.date;
        offsetId = lastMessage.id;
        offsetPeer = targetFromPeer(last.peer, result.users, result.chats).inputPeer;
        await delay(PAUSE_MS);
      }
    }
  }

  async function resolve(spec: PeerSpec): Promise<Target> {
    if(spec.kind === 'self') {
      const users = await invoke('users.getUsers', {id: [{_: 'inputUserSelf'}]});
      return targetFromPeer({_: 'peerUser', user_id: users[0].id}, users);
    }

    if(spec.kind === 'username') {
      const result = await invoke('contacts.resolveUsername', {username: spec.username});
      return targetFromPeer(result.peer, result.users, result.chats);
    }

    const keys = peerKeys(spec);
    const cached = cachedTarget(keys);
    if(cached) return cached;

    if(spec.kind === 'chatOrChannel') {
      // a basic group needs no access hash — ask for it directly first
      const result = await invoke('messages.getChats', {id: [+spec.id]}).catch((): undefined => undefined);
      const chat = result?.chats.find((chat) => chat._ === 'chat' && String(chat.id) === spec.id);
      if(chat) return targetFromPeer({_: 'peerChat', chat_id: chat.id}, [], result.chats);
    }

    log('not archived before — looking the peer up in the dialog list…');
    const target = await findInDialogs((peer) => keys.includes(peerKey(peer)));
    if(!target) {
      throw new Error(`no dialog with ${keys.join(' / ')} on account ${seed.userId} — pass its @username or t.me link instead`);
    }

    return target;
  }

  test('archive', async() => {
    const target = await resolve(parsePeerSpec(PEER));
    const [selfUser] = await invoke('users.getUsers', {id: [{_: 'inputUserSelf'}]});
    const selfRef = {key: 'user' + selfUser.id, name: selfUser._ === 'user' ? userName(selfUser) : 'me'};
    const ctx: ArchiveContext = {
      peers: new Map([[selfRef.key, selfRef]]),
      chat: {key: target.key, name: target.title, username: target.username},
      self: selfRef
    };
    ctx.peers.set(target.key, ctx.chat);

    let serverCount: number;
    const getHistoryPage = async(offsetId: number, limit = PAGE) => {
      const result: MessagesMessages = await invoke('messages.getHistory', {
        peer: target.inputPeer,
        offset_id: offsetId,
        offset_date: 0,
        add_offset: 0,
        limit,
        max_id: 0,
        min_id: 0,
        hash: 0
      });
      if(result._ === 'messages.messagesNotModified') return [];
      savePeers(ctx, result.users, result.chats);
      // a slice may answer INT_MAX for "count unknown" (seen on basic groups)
      const count = 'count' in result ? result.count : result.messages.length;
      if(count < 0x7FFFFFFF) serverCount ??= count;
      return result.messages;
    };

    log(`${target.title} — ${target.type} ${target.key} (tweb ${target.ids.tweb}, Bot API ${target.ids.botApi})`);

    if(DRY) {
      const [newest] = await getHistoryPage(0, 1);
      log(`${serverCount ?? 'unknown number of'} messages on the server, newest ${newest ? new Date((newest as Message.message).date * 1000).toISOString() : 'none'}`);
      logApiCalls();
      log('dry run — nothing written');
      return;
    }

    const dir = join(ROOT, target.key);
    mkdirSync(dir, {recursive: true});
    const metaPath = join(dir, 'meta.json');
    const jsonlPath = join(dir, 'messages.jsonl');

    const previous = readJson<Meta>(metaPath);
    if(previous && previous.accountUserId !== seed.userId) {
      throw new Error(`${dir} was archived by account ${previous.accountUserId}; private-chat message ids differ per account — use another TG_ARCHIVE_DIR`);
    }

    if(SINCE && SINCE !== 'all' && !/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
      throw new Error(`TG_ARCHIVE_SINCE must be YYYY-MM-DD or all, got "${SINCE}"`);
    }

    const since = SINCE === 'all' ? undefined : (SINCE ?? previous?.since);
    const sinceTs = since ? new Date(`${since}T00:00:00`).getTime() / 1000 : 0;
    // a boundary moved further back leaves older history to fetch
    const boundaryMovedBack = previous?.since && (!since || since < previous.since);

    const meta: Meta = {
      ...previous,
      key: target.key,
      type: target.type,
      title: target.title,
      username: target.username,
      ids: target.ids,
      accessHash: target.accessHash,
      accountUserId: seed.userId,
      count: previous?.count ?? 0,
      complete: !boundaryMovedBack && (previous?.complete ?? false),
      since,
      seed: seedFile,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };

    const store = new Map<number, ArchivedMessage>();
    if(existsSync(jsonlPath)) {
      for(const line of readFileSync(jsonlPath, 'utf8').split('\n')) {
        if(!line) continue;
        const message: ArchivedMessage = JSON.parse(line);
        store.set(message.id, message);
      }
    }

    const hadArchive = store.size > 0 && meta.maxId !== undefined;
    const seen = new Set<number>();

    /**
     * Done marks belong to mark.sh, never to a sync: whatever the file holds now wins, so a mark
     * made (or taken back) while this run was reading survives the rewrite.
     */
    const takeDoneMarksFromDisk = () => {
      if(!existsSync(jsonlPath)) return;
      for(const line of readFileSync(jsonlPath, 'utf8').split('\n')) {
        if(!line) continue;
        const onDisk: ArchivedMessage = JSON.parse(line);
        const current = store.get(onDisk.id);
        if(!current) continue;
        if(onDisk.done) current.done = onDisk.done;
        else delete current.done;
      }
    };

    const save = () => {
      takeDoneMarksFromDisk();
      const list = [...store.values()].sort((a, b) => a.id - b.id);
      writeAtomic(jsonlPath, list.map((message) => JSON.stringify(message)).join('\n') + (list.length ? '\n' : ''));
      meta.count = list.length;
      meta.serverCount = serverCount ?? meta.serverCount;
      meta.firstDate = list[0]?.date;
      meta.lastDate = list[list.length - 1]?.date;
      meta.syncedAt = new Date().toISOString();
      if(meta.type === 'forum') meta.topics = collectTopics(list, meta.topics);
      writeAtomic(metaPath, JSON.stringify(meta, null, 2) + '\n');
      return list;
    };

    /**
     * Pages down from offsetId (0 = the newest message). Stops at the start of
     * the chat or at `since` (reachedStart), at `cap` messages, or once `stop`
     * says it has read far enough.
     */
    const walk = async(offsetId: number, cap: number, stop?: (lowest: number, fetched: number) => boolean, checkpoint?: (lowest: number) => void) => {
      let lowest = offsetId || Infinity, fetched = 0, pages = 0;
      for(;;) {
        const messages = await getHistoryPage(offsetId);
        if(!messages.length) return {lowest, fetched, reachedStart: true};

        let oldestTs = Infinity;
        for(const message of messages) {
          const archived = archiveMessage(message, ctx);
          if(!archived) continue;
          oldestTs = Math.min(oldestTs, archived.ts);
          if(archived.ts < sinceTs) continue;
          // a message read again keeps its record unless it was edited since (and its mark always)
          store.set(archived.id, mergeArchivedMessage(store.get(archived.id), archived));
          seen.add(archived.id);
          lowest = Math.min(lowest, archived.id);
          meta.maxId = Math.max(meta.maxId ?? 0, archived.id);
        }

        fetched += messages.length;
        if(oldestTs < sinceTs) return {lowest, fetched, reachedStart: true};
        offsetId = lowest;
        if(++pages % 10 === 0) log(`${fetched} read, down to #${lowest}${serverCount ? ` of ${serverCount}` : ''}`);
        if(checkpoint && pages % CHECKPOINT_PAGES === 0) checkpoint(lowest);
        if(fetched >= cap || stop?.(lowest, fetched)) return {lowest, fetched, reachedStart: false};
        await delay(PAUSE_MS);
      }
    };

    const backfill = async(fromId: number, cap: number) => {
      const checkpoint = (lowest: number) => {
        meta.minId = lowest;
        save();
      };
      const result = await walk(fromId, cap, undefined, checkpoint);
      if(Number.isFinite(result.lowest)) meta.minId = Math.min(meta.minId ?? Infinity, result.lowest);
      meta.complete = result.reachedStart;
      return result;
    };

    let read = 0;
    if(!hadArchive) {
      log(`first sync — reading up to ${MAX} messages${since ? ` since ${since}` : ''}`);
      read = (await backfill(0, MAX)).fetched;
    } else {
      const oldMaxId = meta.maxId;
      // FULL re-reads everything; a plain sync stops once it overlaps the archive
      const top = await walk(0, FULL ? MAX : Infinity, FULL ? undefined : (lowest, fetched) => lowest <= oldMaxId && fetched >= TAIL);
      read = top.fetched;
      if(top.reachedStart) {
        if(Number.isFinite(top.lowest)) meta.minId = top.lowest;
        meta.complete = true;
      } else if(top.lowest > oldMaxId) {
        // a capped FULL run that never reached the old archive: coverage restarts here
        meta.minId = top.lowest;
        meta.complete = false;
      }

      if(FULL && top.reachedStart) {
        let deleted = 0;
        store.forEach((message, id) => {
          if(!seen.has(id) && !message.deleted && message.ts >= sinceTs) {
            message.deleted = true;
            ++deleted;
          }
        });
        log(`${deleted} archived messages are gone from the server — kept, marked deleted`);
      }

      if(!meta.complete) {
        log(`backfilling older history from #${meta.minId}`);
        read += (await backfill(meta.minId, MAX)).fetched;
      }
    }

    const list = save();

    writeTranscripts(dir, list, {
      title: meta.title,
      timeZone: meta.timeZone,
      topics: meta.type === 'forum' ? meta.topics : undefined
    });

    writeIndex();

    logApiCalls();
    log(`done: read ${read}, archived ${list.length}${meta.serverCount ? ` of ${meta.serverCount}` : ''}, ` +
      `${meta.complete ? (since ? `complete since ${since}` : 'complete') : `older history pending below #${meta.minId} — run again to continue`}`);
    log(`→ ${dir}`);
  }, 6 * 60 * 60 * 1000);
});

function writeIndex() {
  const metas = readMetas().sort((a, b) => (b.syncedAt || '').localeCompare(a.syncedAt || ''));

  const day = (iso: string) => iso?.slice(0, 10) ?? '—';
  const rows = metas.map((meta) => [
    meta.title.replace(/\|/g, '\\|') + (meta.username ? ` (@${meta.username})` : ''),
    meta.type,
    `[${meta.key}/](${meta.key}/)`,
    meta.ids.botApi,
    String(meta.count) + (meta.serverCount ? ` / ${meta.serverCount}` : ''),
    `${day(meta.firstDate)} … ${day(meta.lastDate)}`,
    meta.complete ? (meta.since ? `since ${meta.since}` : 'yes') : 'partial',
    meta.syncedAt?.slice(0, 16).replace('T', ' ') + ' UTC'
  ].join(' | '));

  writeAtomic(join(ROOT, 'INDEX.md'), [
    '# Telegram chat archive',
    '',
    'Written by the `tg-chat-archive` skill (tweb repo). One folder per chat:',
    '`meta.json`, `messages.jsonl` (one message per line, ascending id — query with jq)',
    'and `transcript/YYYY-MM.md` (readable, grep-friendly).',
    '',
    '| Chat | Type | Folder | Bot API id | Messages | Range | Complete | Synced |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((row) => `| ${row} |`),
    ''
  ].join('\n'));
}
