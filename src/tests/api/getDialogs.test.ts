import {readFileSync} from 'fs';
import {createTestClient, AccountSeed} from './harness';

const ENABLED = process.env.TG_API_TEST === '1';
const seedPath = process.env.TG_API_SEED;

const describeOrSkip = ENABLED && seedPath ? describe : describe.skip;

describeOrSkip('mtproto api', () => {
  let client: Awaited<ReturnType<typeof createTestClient>>;

  beforeAll(async() => {
    const seed = JSON.parse(readFileSync(seedPath!, 'utf8')) as AccountSeed;
    client = await createTestClient({
      seed,
      testDc: process.env.TG_API_PROD_DC !== '1'
    });
  }, 60_000);

  afterAll(() => {
    client?.dispose();
  });

  test('help.getConfig returns config', async() => {
    const config: any = await client.apiManager.invokeApi('help.getConfig');
    expect(config?._).toBe('config');
    expect(Array.isArray(config?.dc_options)).toBe(true);
  }, 30_000);

  test('messages.getDialogs returns a result', async() => {
    const dialogs: any = await client.apiManager.invokeApi('messages.getDialogs', {
      offset_date: 0,
      offset_id: 0,
      offset_peer: {_: 'inputPeerEmpty'},
      limit: 30,
      hash: '0'
    });
    expect(dialogs).toBeDefined();
    expect(typeof dialogs._).toBe('string');

    if(process.env.TG_API_PRINT === '1') {
      printDialogs(dialogs);
    }
  }, 30_000);
});

function printDialogs(res: any) {
  const usersById = new Map<string, any>();
  for(const u of res.users || []) usersById.set(String(u.id), u);
  const chatsById = new Map<string, any>();
  for(const c of res.chats || []) chatsById.set(String(c.id), c);
  const messagesByPeerKey = new Map<string, any>();
  for(const m of res.messages || []) {
    if(!m?.peer_id) continue;
    messagesByPeerKey.set(peerKey(m.peer_id) + ':' + m.id, m);
  }

  const lines: string[] = [];
  lines.push(`\n=== Dialogs (${(res.dialogs || []).length}) ===`);

  for(const dlg of res.dialogs || []) {
    const peer = dlg.peer;
    const title = resolveTitle(peer, usersById, chatsById);
    const top = messagesByPeerKey.get(peerKey(peer) + ':' + dlg.top_message);
    const preview = top ? messagePreview(top) : '<no top message>';
    const unread = dlg.unread_count ? ` [${dlg.unread_count} unread]` : '';
    const pinned = dlg.pFlags?.pinned ? ' 📌' : '';
    lines.push(`• ${title}${pinned}${unread}`);
    lines.push(`    ${preview}`);
  }


  console.log(lines.join('\n'));
}

function peerKey(peer: any): string {
  if(peer._ === 'peerUser') return 'u' + peer.user_id;
  if(peer._ === 'peerChat') return 'c' + peer.chat_id;
  if(peer._ === 'peerChannel') return 'ch' + peer.channel_id;
  return peer._ || 'unknown';
}

function resolveTitle(peer: any, users: Map<string, any>, chats: Map<string, any>): string {
  if(peer._ === 'peerUser') {
    const u = users.get(String(peer.user_id));
    if(!u) return `<user ${peer.user_id}>`;
    const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || ('user ' + u.id);
    return name + (u.username ? ` (@${u.username})` : '');
  }
  if(peer._ === 'peerChat') {
    const c = chats.get(String(peer.chat_id));
    return c?.title || `<chat ${peer.chat_id}>`;
  }
  if(peer._ === 'peerChannel') {
    const c = chats.get(String(peer.channel_id));
    return (c?.title || `<channel ${peer.channel_id}>`) + (c?.username ? ` (@${c.username})` : '');
  }
  return JSON.stringify(peer);
}

function messagePreview(msg: any): string {
  const date = msg.date ? new Date(msg.date * 1000).toISOString().slice(0, 16).replace('T', ' ') : '';
  const text = (typeof msg.message === 'string' && msg.message) ||
    (msg.media ? `[${msg.media._}]` : '') ||
    (msg.action ? `[action: ${msg.action._}]` : '') ||
    '<empty>';
  const compact = text.length > 80 ? text.slice(0, 77) + '...' : text;
  return `${date} | ${compact.replace(/\n/g, ' ')}`;
}
