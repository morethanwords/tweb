import assert from 'node:assert/strict';
import {test} from 'vitest';
import {checkManifest} from './manifest.mjs';

const inventory = {
  commit: 'pinned',
  files: [{file: 'upstream.test.ts', sha256: 'content-hash', tests: [{line: 10}, {line: 20}]}],
  support: [{file: 'fixture.json', sha256: 'fixture-hash'}],
  extra: [],
  unhandled: [],
  aliases: []
};
const manifest = {
  version: 2,
  commit: 'pinned',
  files: [{file: 'upstream.test.ts', sha256: 'content-hash', declarations: 2, review: 'adapted', overrides: {absent: [20]}}],
  support: inventory.support,
  reviews: {
    adapted: {status: 'local', reason: 'Public API adaptation', evidence: [{file: 'local.test.ts', test: 'retains selection'}]},
    absent: {status: 'not-used', reason: 'Optional plugin not installed', evidence: [{file: 'extensions.ts', symbol: 'CHAT_INPUT_EXTENSIONS'}]}
  }
};
const readFile = (file) => ({'local.test.ts': 'retains selection', 'extensions.ts': 'CHAT_INPUT_EXTENSIONS'})[file];

test('counts every declaration using a file decision and explicit exceptions', () => {
  assert.deepEqual(checkManifest(inventory, manifest, readFile), {
    files: 1, declarations: 2, supportFiles: 1, unaccounted: 0, statuses: {local: 1, 'not-used': 1}
  });
});

for(const [name, mutate, error] of [
  ['changed test body', (m) => m.files[0].sha256 = 'old-hash', /changed file/],
  ['lost declaration', (m) => m.files[0].declarations = 1, /Declaration count/],
  ['missing review', (m) => delete m.reviews.adapted, /Unreviewed/],
  ['stale override', (m) => m.files[0].overrides.absent = [30], /Invalid review override/],
  ['overlapping overrides', (m) => m.files[0].overrides.adapted = [20], /Invalid review override/],
  ['duplicate file', (m) => m.files.push(m.files[0]), /file inventory/],
  ['changed fixture', (m) => m.support[0].sha256 = 'old-hash', /fixtures/],
  ['missing local test', (m) => m.reviews.adapted.evidence[0].test = 'deleted test', /Missing local test/]
]) {
  test(`rejects ${name}`, () => {
    const changed = structuredClone(manifest);
    mutate(changed);
    assert.throws(() => checkManifest(inventory, changed, readFile), error);
  });
}
