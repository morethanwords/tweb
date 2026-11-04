import CacheStorageController from '@lib/files/cacheStorage';
import DeferredIsUsingPasscode from '@lib/passcode/deferredIsUsingPasscode';

// * A stand-in for the browser's CacheStorage that finds an entry the way a browser does: by the
// * request's URL, resolved against the worker's own (dot segments, `\`, tabs and the fragment included).
const BASE_URL = 'https://web.telegram.org/k/mtproto.worker.js';
const stores = new Map<string, Map<string, string>>();

function getRequestKey(request: RequestInfo | URL) {
  const url = new URL(request instanceof Request ? request.url : request.toString(), BASE_URL);
  url.hash = '';
  return url.href;
}

function makeCache(entries: Map<string, string>) {
  return {
    put: async(request: RequestInfo, response: Response) => {
      entries.set(getRequestKey(request), await response.text());
    },
    match: async(request: RequestInfo) => {
      const body = entries.get(getRequestKey(request));
      return body === undefined ? undefined : new Response(body);
    },
    delete: async(request: RequestInfo) => entries.delete(getRequestKey(request)),
    keys: async() => [...entries.keys()].map((url) => new Request(url))
  } as unknown as Cache;
}

function getStore(name: string) {
  let entries = stores.get(name);
  if(!entries) stores.set(name, entries = new Map());
  return entries;
}

vi.stubGlobal('caches', {
  open: async(name: string) => makeCache(getStore(name)),
  delete: async(name: string) => stores.delete(name)
});

DeferredIsUsingPasscode.resolveDeferred(false);

let storage: CacheStorageController;
beforeEach(() => {
  stores.clear();
  storage?.forget();
  storage = new CacheStorageController('cachedFiles');
});

function save(entryName: string, body: string) {
  return storage.save({entryName, response: new Response(body), size: body.length});
}

async function read(entryName: string) {
  return (await storage.get(entryName))?.text();
}

// * each name finds its own entry, the one holding its index
async function expectEntriesByIndex(names: string[]) {
  for(let i = 0; i < names.length; ++i) {
    expect(await read(names[i]), JSON.stringify(names[i])).toBe('' + i);
  }
}

const VICTIM = 'document_5017245930584555';
// * a web file's URL is the bot's: an invoice's photo, an inline result's thumbnail
const CLIMBING_URLS = [
  'https://evil.example/%2e%2e/%2e%2e/%2e%2e/%2e%2e/' + VICTIM,
  'https://evil.example/%2E%2e/%2e./.%2E/../' + VICTIM,
  'https://evil.example/../../../../' + VICTIM,
  'https:\\\\evil.example\\..\\..\\..\\..\\' + VICTIM,
  'https://evil.example/./../\t../../../' + VICTIM,
  'https://evil.example/' + '../'.repeat(8) + VICTIM + '#tail'
];

describe('CacheStorageController entry names', () => {
  test('a web file whose URL climbs out with dot segments never reaches another file\'s entry', async() => {
    await save(VICTIM, 'real');

    for(const url of CLIMBING_URLS) {
      const entryName = 'webFile_' + url;
      await save(entryName, 'evil');
      expect(await read(VICTIM), url).toBe('real');
      expect(await read(entryName), url).toBe('evil');
      expect(await storage.has(entryName), url).toBe(true);

      await storage.delete(entryName);
      expect(await storage.has(entryName), url).toBe(false);
      expect(await read(VICTIM), url).toBe('real');
    }
  });

  test('names a URL would read the same are entries of their own', async() => {
    const names = [
      '', '.', '..', '?x', '.?x', '..?x', '/x', '//x', 'x', 'x/', '/.', './x',
      'a', 'a?', 'a#b', 'a#c', 'a\tb', 'a\nb', 'ab', 'a ', 'a  ', 'a\x7f',
      'a\uD800', 'a�', 'a/./b', 'a/../b', 'a/b', 'b', 'a\\b', 'a//b',
      '%2e', '%2E', 'a/%2e%2e/b', 'é', '%C3%A9', 'a?\'', 'a?%27', '%u002E', '%25'
    ];

    for(let i = 0; i < names.length; ++i) {
      await save(names[i], '' + i);
    }

    expect(getStore('cachedFiles').size).toBe(names.length);
    await expectEntriesByIndex(names);
  });

  test('the names the app makes keep the entries cached before', async() => {
    const names = [
      VICTIM,
      'photo_5017245930584555_x',
      'document_5017245930584555_m',
      'peerPhoto_5017245930584555_small',
      'stickerSetThumb_\u{1F3B2}_3',
      'geoPoint_55.751244_-37.618423_100_100_15_2',
      '1-5017245930584555?offset=0&limit=524288',
      'hls_quality_5017245930584555',
      'backgrounds/fqv01SQemVIBAAAApND8LDRUhRU?blur',
      'webFile_https://example.com/photo.jpg?size=m'
    ];

    // * where the old code put them
    const entries = getStore('cachedFiles');
    names.forEach((name, i) => entries.set(getRequestKey('/' + name), '' + i));

    await expectEntriesByIndex(names);
  });
});
