// @vitest-environment node
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {build} from 'vite';

// scripts/check-bundle-mangling.mjs fails `pnpm build` when the minifier binds a read in a default
// value to the wrong symbol, or a string literal comes out with a U+FFFD its source does not have. It runs here against a small module built the way the app is: the
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

// a replacement character the source writes itself, as CSS serializers do for NUL
function escapeNul(text) {
  return text.replace(/\0/g, '\\uFFFD');
}

globalThis.fixture = {pickServer, captionOf, others, shadowed, renamed, sameParameter, escapeNul};
`;

// `function t(e,t,n,r=t===\`client\`)`
const PICK_SERVER = /function \w+\((\w+),(\w+),(\w+),(\w+)=(\w+)===`client`\)/;
// `function n(t,{caption:n=\`\`,entities:r=[]}={},i=e(n,r))`
const CAPTION_OF = /function \w+\((\w+),\{caption:(\w+)=``,entities:(\w+)=\[\]\}=\{\},(\w+)=(\w+)\((\w+),(\w+)\)\)/;

// a replacement character named once and used far from there, as parse5's tokenizer does for NUL: the minifier
// inlines it where it is used, lines away from the escape (a module of its own: next to another U+FFFD the minifier
// shares one variable instead)
const INLINED_SOURCE = `
const REPLACEMENT_CHARACTER = '\\uFFFD';

const TAGS = ['a', 'b'];

function emitNul(chars) {
  chars.push('nul', REPLACEMENT_CHARACTER);
  return chars;
}

globalThis.fixture = {emitNul, TAGS};
`;

// a replacement character the source writes itself, on the same line as other literals: a word, and one character (last:
// a test puts one code unit in the place of its two); and one in a regular expression, which the minifier prints as it is
const NEIGHBOUR_SOURCE = `
globalThis.fixture = {replace: '\\uFFFD', label: 'client', pattern: /a\uFFFDb/, emoji: '😀'};
`;

let dir: string;
let inlinedDir: string;
let neighbourDir: string;
let bundle: string;
let inlinedBundle: string;
let neighbourBundle: string;

/** Builds `source` the way the app is built into `out/bundle.js` (with its map) in a directory of its own. */
async function buildFixture(source: string) {
  const root = mkdtempSync(join(tmpdir(), 'check-bundle-mangling-'));
  writeFileSync(join(root, 'entry.js'), source);
  await build({
    configFile: false,
    root,
    logLevel: 'silent',
    build: {
      outDir: join(root, 'out'),
      minify: true,
      sourcemap: true,
      rolldownOptions: {input: join(root, 'entry.js'), output: {entryFileNames: 'bundle.js'}}
    }
  });
  return {root, code: readFileSync(join(root, 'out/bundle.js'), 'utf8')};
}

beforeAll(async() => {
  ({root: dir, code: bundle} = await buildFixture(SOURCE));
  ({root: inlinedDir, code: inlinedBundle} = await buildFixture(INLINED_SOURCE));
  ({root: neighbourDir, code: neighbourBundle} = await buildFixture(NEIGHBOUR_SOURCE));
}, 60_000);

afterAll(() => {
  rmSync(dir, {recursive: true, force: true});
  rmSync(inlinedDir, {recursive: true, force: true});
  rmSync(neighbourDir, {recursive: true, force: true});
});

function check(code: string, root = dir) {
  writeFileSync(join(root, 'out/bundle.js'), code);
  const {status, stdout, stderr} = spawnSync(process.execPath, [checker, join(root, 'out')], {encoding: 'utf8'});
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

test('passes a replacement character the source writes itself', () => {
  // the minifier prints the escape as the character, which is what the check has to tell apart
  expect(bundle).toContain('\uFFFD');
  expect(check(bundle).status).toBe(0);
});

test('passes a replacement character a source defines as a constant, inlined where it is used', () => {
  expect(inlinedBundle, 'the constant is no longer inlined').toMatch(/`nul`,`\uFFFD`|"nul","\uFFFD"|'nul','\uFFFD'/);
  expect(check(inlinedBundle, inlinedDir).status).toBe(0);
});

test('fails a literal that lost its content next to a use of such a constant', () => {
  const {status, output} = check(inlinedBundle.replace(/([`"'])nul\1/, '$1n\uFFFDl$1'), inlinedDir);
  expect(status).toBe(1);
  expect(output).toContain('1 U+FFFD');
});

test('fails a literal that lost its content next to a replacement character the source writes itself', () => {
  expect(neighbourBundle, 'the regular expression is no longer printed as it is').toContain('/a\uFFFDb/');
  expect(check(neighbourBundle, neighbourDir).status).toBe(0);
  const {status, output} = check(neighbourBundle.replace(/([`"'])client\1/, '$1cli\uFFFDnt$1'), neighbourDir);
  expect(status).toBe(1);
  expect(output).toContain('1 U+FFFD');
});

test('fails a one-character literal that came out as a replacement character next to one the source writes itself', () => {
  expect(neighbourBundle, 'the emoji is no longer printed as itself').toContain('😀');
  const {status, output} = check(neighbourBundle.replace('😀', '\uFFFD'), neighbourDir);
  expect(status).toBe(1);
  expect(output).toContain('1 U+FFFD');
});

test('fails a replacement character the source does not have: a literal that lost its content', () => {
  expect(bundle).toContain('`client`');
  const {status, output} = check(bundle.replace('`client`', '`cli\uFFFDnt`'));
  expect(status).toBe(1);
  expect(output).toContain('1 U+FFFD');
});
