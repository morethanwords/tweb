import { relayUrl } from '../lib/mtproto/relayUrl';

const names = ['pluto', 'venus', 'aurora', 'vesta', 'flora'];

test('disabled relay leaves even legacy HTTP endpoints untouched', () => {
  for(const original of ['wss://kws2.web.telegram.org/apiws', 'https://venus-1.web.telegram.org/apiw1', 'http://149.154.167.50/apiw1']) {
    expect(relayUrl(original, '')).toBe(original);
  }
});

test('all production/test DCs and file endpoints preserve upstream selection', () => {
  for(let dc = 1; dc <= 5; dc++) {
    for(const file of ['', '-1']) {
      for(const testDc of [false, true]) {
        if(testDc && dc > 3) continue;
        const wsHost = `kws${dc}${file}`;
        const httpHost = `${names[dc - 1]}${file}`;
        const wsPath = `apiws${testDc ? '_test' : ''}`;
        const httpPath = `apiw${testDc ? '_test1' : '1'}`;
        expect(relayUrl(`wss://${wsHost}.web.telegram.org/${wsPath}`, '/mtproto', 'https://chat.example:8443'))
          .toBe(`wss://chat.example:8443/mtproto/${wsHost}/${wsPath}`);
        expect(relayUrl(`https://${httpHost}.web.telegram.org/${httpPath}`, '/mtproto/', 'https://chat.example:8443'))
          .toBe(`https://chat.example:8443/mtproto/${httpHost}/${httpPath}`);
      }
    }
  }
});

test('local HTTP and worker origin are supported without window access', () => {
  expect(relayUrl('wss://kws1.web.telegram.org/apiws', '/relay/custom', 'http://localhost:8080'))
    .toBe('ws://localhost:8080/relay/custom/kws1/apiws');
  expect(relayUrl('https://pluto.web.telegram.org/apiw1', '/mtproto'))
    .toBe(`${self.location.origin}/mtproto/pluto/apiw1`);
});

test('runs in a worker-like context without a window global', () => {
  const fs = require('fs');
  const ts = require('typescript');
  const vm = require('vm');
  const source = fs.readFileSync(require.resolve('../lib/mtproto/relayUrl'), 'utf8');
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  const context = {exports: {} as {relayUrl: typeof relayUrl}, URL,
    process: {env: {VITE_MTPROTO_RELAY_PATH: '/mtproto'}},
    self: {location: {origin: 'https://worker.example'}}};
  vm.runInNewContext(code, context);
  expect(context.exports.relayUrl('wss://kws2.web.telegram.org/apiws'))
    .toBe('wss://worker.example/mtproto/kws2/apiws');
});

test.each(['https://evil.test', '//evil.test', '/', '/a/../b', '/a%2fb', '/a?x', '/a#b', '/a\\b', 'relative'])('rejects unsafe prefix %s', path => {
  expect(() => relayUrl('wss://kws1.web.telegram.org/apiws', path, 'https://chat.example')).toThrow();
});

test.each([
  'wss://kws6.web.telegram.org/apiws', 'wss://kws1.web.telegram.org.evil.test/apiws',
  'wss://user:password@kws1.web.telegram.org/apiws', 'wss://kws1.web.telegram.org:444/apiws',
  'wss://kws1.web.telegram.org/apiws?upstream=http://localhost', 'wss://kws1.web.telegram.org/apiws#x',
  'wss://kws1.web.telegram.org/other', 'https://127.0.0.1/apiw1', 'http://venus.web.telegram.org/apiw1',
  'https://kws1.web.telegram.org/apiw1', 'wss://venus.web.telegram.org/apiws',
  'wss://kws5.web.telegram.org/apiws_test'
])('fails closed for unsupported endpoint %s', endpoint => {
  expect(() => relayUrl(endpoint, '/mtproto', 'https://chat.example')).toThrow();
});
