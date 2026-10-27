// @vitest-environment node
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {build} from 'vite';

// scripts/check-bundle-mangling.mjs fails `pnpm build` when the minifier binds a read in a default
// value to the wrong symbol. It runs here against a small module built the way the app is: the
// bundle as built has to pass, and each misbinding written into it has to fail. A rewrite keeps every
// name's length, so the source map still lines up.

const checker = resolve(__dirname, '../../scripts/check-bundle-mangling.mjs');

const SOURCE = `
const wrap = (text, entities) => ({text, entities});

// a default reading a sibling parameter that the body reads too
function pickServer(dcId, connectionType, transport, reuse = connectionType === 'client') {
  return [dcId, connectionType, transport, reuse];
}

// a default reading destructured siblings that the body never mentions
function captionOf(files, {caption = '', entities = []} = {}, wrapped = wrap(caption, entities)) {
  return [files.length, wrapped];
}

// the same names in another function, spelled however the minifier likes there
function others(caption, connectionType) {
  return [caption, connectionType, (connectionType) => connectionType + caption];
}

// a nested function binding the default's variable name for itself, over and over
function shadowed(list, connectionType, reuse = connectionType === 'client') {
  return list.filter((connectionType) => connectionType.ok && connectionType.y && connectionType.z && reuse);
}

// a destructured sibling bound under a name of its own, and a default inside one pattern reading an
// earlier element of it
function renamed(files, {caption: text = '', entities = []} = {}, wrapped = wrap(text, entities)) {
  return [files.length, wrapped];
}
function sameParameter({first, second = first} = {}) {
  return second;
}

globalThis.fixture = {pickServer, captionOf, others, shadowed, renamed, sameParameter};
`;

// `function t(e,t,n,r=t===\`client\`)`
const PICK_SERVER = /function \w+\((\w+),(\w+),(\w+),(\w+)=(\w+)===`client`\)/;
// `function n(t,{caption:n=\`\`,entities:r=[]}={},i=e(n,r))`
const CAPTION_OF = /function \w+\((\w+),\{caption:(\w+)=``,entities:(\w+)=\[\]\}=\{\},(\w+)=(\w+)\((\w+),(\w+)\)\)/;

let dir: string;
let bundle: string;

beforeAll(async() => {
  dir = mkdtempSync(join(tmpdir(), 'check-bundle-mangling-'));
  writeFileSync(join(dir, 'entry.js'), SOURCE);
  await build({
    configFile: false,
    root: dir,
    logLevel: 'silent',
    build: {
      outDir: join(dir, 'out'),
      minify: true,
      sourcemap: true,
      rolldownOptions: {input: join(dir, 'entry.js'), output: {entryFileNames: 'bundle.js'}}
    }
  });
  bundle = readFileSync(join(dir, 'out/bundle.js'), 'utf8');
}, 60_000);

afterAll(() => {
  rmSync(dir, {recursive: true, force: true});
});

function check(code: string) {
  writeFileSync(join(dir, 'out/bundle.js'), code);
  const {status, stdout, stderr} = spawnSync(process.execPath, [checker, join(dir, 'out')], {encoding: 'utf8'});
  return {status, output: stdout + stderr};
}

// captionOf with its default reading `read` (one of its minified names) in place of `caption`
function captionOfReading(read: (names: {files: string, caption: string, entities: string, wrapped: string}) => string) {
  const match = bundle.match(CAPTION_OF);
  expect(match, 'the minified fixture changed shape').toBeTruthy();
  const [whole, files, caption, entities, wrapped, wrap] = match;
  return bundle.replace(whole, whole.replace(`${wrap}(${caption},`, `${wrap}(${read({files, caption, entities, wrapped})},`));
}

// every check reads the source variable behind a minified name out of the map's `names`: a minifier
// that stops writing them leaves the check passing everything (rolldown 1.2.3, Vite 8.2, wrote none
// for a module no plugin had transformed first)
test('the minifier names its identifiers in the source map', () => {
  const map = JSON.parse(readFileSync(join(dir, 'out/bundle.js.map'), 'utf8'));
  expect(map.names).toEqual(expect.arrayContaining(['connectionType', 'caption']));
});

test('passes the bundle as built', () => {
  const {status, output} = check(bundle);
  expect(output).toContain('no miscompiled defaults');
  expect(status).toBe(0);
});

test('fails a default that spells a variable unlike the rest of its function', () => {
  const match = bundle.match(PICK_SERVER);
  expect(match, 'the minified fixture changed shape').toBeTruthy();
  const [whole, , , transport, reuse, read] = match;
  const {status, output} = check(bundle.replace(whole, whole.replace(`${reuse}=${read}===`, `${reuse}=${transport}===`)));
  expect(status).toBe(1);
  expect(output).toContain(`'connectionType'`);
  expect(output).toContain('in the same function');
});

test('fails a default that reads a sibling destructured from another property', () => {
  const {status, output} = check(captionOfReading(({entities}) => entities));
  expect(status).toBe(1);
  expect(output).toContain(`is bound next to it as 'entities'`);
});

test('fails a default that reads an earlier parameter standing for another variable', () => {
  const {status, output} = check(captionOfReading(({files}) => files));
  expect(status).toBe(1);
  expect(output).toContain(`is bound next to it as 'files'`);
});

test('fails a default that reads its own parameter', () => {
  const {status, output} = check(captionOfReading(({wrapped}) => wrapped));
  expect(status).toBe(1);
  expect(output).toContain(`'caption'`);
});
