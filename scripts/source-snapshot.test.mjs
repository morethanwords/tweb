import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readSourceSnapshot, assertSourceSnapshot, sourceDirectories, sourceRootFiles} from './source-snapshot.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'shell-source-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  for(const directory of sourceDirectories) await mkdir(join(root, directory));
  for(const file of sourceRootFiles) await writeFile(join(root, file), file);
  await writeFile(join(root, 'src/app.ts'), 'original');
  return root;
}

test('the whole gate stays bound to its initial inputs, including test configuration', async t => {
  const root = await fixture(t), initial = await readSourceSnapshot(root);
  await assertSourceSnapshot(initial, root);
  await writeFile(join(root, 'playwright.companion.config.ts'), 'changed after unit tests');
  await assert.rejects(assertSourceSnapshot(initial, root), /playwright.companion.config.ts/);
  assert.notEqual((await readSourceSnapshot(root)).engineBuild, initial.engineBuild);
});

test('added and removed source files invalidate evidence while output files do not', async t => {
  const root = await fixture(t), initial = await readSourceSnapshot(root);
  await mkdir(join(root, 'semantic-artifacts'));
  await writeFile(join(root, 'semantic-artifacts/result.json'), '{}');
  await assertSourceSnapshot(initial, root);
  await writeFile(join(root, 'src/new.ts'), 'new code');
  await assert.rejects(assertSourceSnapshot(initial, root), /src\/new.ts/);
  await rm(join(root, 'src/new.ts'));
  await rm(join(root, 'src/app.ts'));
  await assert.rejects(assertSourceSnapshot(initial, root), /src\/app.ts/);
});

test('independent visual references and offline HTML are included in the build identity', async t => {
  const root = await fixture(t);
  await writeFile(join(root, 'reference/native.scss'), 'original');
  const initial = await readSourceSnapshot(root);
  await writeFile(join(root, 'reference/native.scss'), 'modified');
  await writeFile(join(root, 'index.html'), 'modified');
  await assert.rejects(assertSourceSnapshot(initial, root), /index.html.*reference\/native.scss|reference\/native.scss.*index.html/);
});
