// @vitest-environment node
import {mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'fs';
import {createRequire} from 'module';
import {tmpdir} from 'os';
import {join, resolve} from 'path';
import {build} from 'vite';
import {describe, expect, it} from 'vitest';

// scripts/widget-sandbox-plugin.mjs: what the dev server, the build and the tests resolve the vendored QuickJS build to
const require = createRequire(import.meta.url);
const {default: widgetSandboxPlugin, widgetSandboxQuickjsPlugin} = require('../../scripts/widget-sandbox-plugin.mjs');

const root = resolve(__dirname, '../..');
const HERE = root + '/src/vendor/widget-sandbox-quickjs/dist/emscripten-module.wasm';
// where node_modules takes it from in a worktree whose node_modules is the main checkout's (a symlink)
const ELSEWHERE = '/home/someone/tweb/src/vendor/widget-sandbox-quickjs/dist/emscripten-module.wasm';

describe('the QuickJS build (@telegram/widget-sandbox-quickjs)', () => {
  const [quickjs] = widgetSandboxPlugin(root);
  const resolveId = (id: string, resolved: string) => quickjs.resolveId.call({resolve: async() => ({id: resolved})}, id, root + '/src/x.ts', {});

  it('is resolved before Vite\'s own resolver takes it where node_modules has it', () => {
    expect(quickjs.enforce).toBe('pre');
  });

  it('is this checkout\'s copy, its query kept, wherever node_modules takes it from', async() => {
    expect(await resolveId('@telegram/widget-sandbox-quickjs/wasm?url', ELSEWHERE + '?url')).toEqual({id: HERE + '?url'});
    expect(await resolveId('@telegram/widget-sandbox-quickjs/wasm?url', HERE + '?url')).toEqual({id: HERE + '?url'});
  });

  it('leaves every other import alone', async() => {
    expect(await resolveId('widget-sandbox/host/widget-host', ELSEWHERE)).toBeUndefined();
    expect(await resolveId('@telegram/widget-sandbox-quickjs-other', ELSEWHERE)).toBeUndefined();
  });
});

/**
 * A worktree whose node_modules links the package into another checkout, built: the page and its worker. A build makes
 * the workers with plugins of their own (vite.config.ts's `worker.plugins`).
 */
describe('a worktree sharing another checkout\'s node_modules, built', () => {
  const quickjs = (dir: string, name: string) => {
    const packageDir = join(dir, 'src/vendor/widget-sandbox-quickjs');
    mkdirSync(join(packageDir, 'dist'), {recursive: true});
    writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
      name: '@telegram/widget-sandbox-quickjs',
      type: 'module',
      exports: {'.': './dist/index.mjs', './wasm': './dist/engine.wasm'}
    }));
    writeFileSync(join(packageDir, 'dist/index.mjs'), `export default 'quickjs of ${name}';`);
    writeFileSync(join(packageDir, 'dist/engine.wasm'), `wasm of ${name}`);
    return packageDir;
  };

  const buildWorktree = async(workerPlugins: boolean) => {
    const dir = mkdtempSync(join(tmpdir(), 'widget-sandbox-quickjs-'));
    try {
      const other = quickjs(join(dir, 'other'), 'the other checkout');
      const worktree = join(dir, 'worktree');
      quickjs(worktree, 'the worktree');
      mkdirSync(join(worktree, 'node_modules/@telegram'), {recursive: true});
      symlinkSync(other, join(worktree, 'node_modules/@telegram/widget-sandbox-quickjs'));
      writeFileSync(join(worktree, 'entry.js'), `import quickjs from '@telegram/widget-sandbox-quickjs';
globalThis.page = quickjs;
new Worker(new URL('./worker.js', import.meta.url), {type: 'module'});`);
      writeFileSync(join(worktree, 'worker.js'), `import quickjs from '@telegram/widget-sandbox-quickjs';
import wasm from '@telegram/widget-sandbox-quickjs/wasm?url';
self.postMessage([quickjs, wasm]);`);
      const outDir = join(worktree, 'out');
      await build({
        configFile: false,
        root: worktree,
        logLevel: 'silent',
        plugins: [widgetSandboxQuickjsPlugin(worktree)],
        worker: {format: 'es', plugins: () => workerPlugins ? [widgetSandboxQuickjsPlugin(worktree)] : []},
        build: {outDir, minify: false, assetsInlineLimit: 0, rolldownOptions: {input: join(worktree, 'entry.js')}}
      });
      const files = readdirSync(outDir, {recursive: true, withFileTypes: true}).filter((entry) => entry.isFile());
      const read = (pattern: RegExp) => files.filter(({name}) => pattern.test(name)).map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8')).join('\n');
      return {page: read(/^entry.*\.js$/), worker: read(/^worker.*\.js$/), wasm: read(/\.wasm$/)};
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  };

  it('takes this checkout\'s QuickJS in the page and in the worker, its wasm too', async() => {
    const {page, worker, wasm} = await buildWorktree(true);
    expect(page).toContain('quickjs of the worktree');
    expect(worker).toContain('quickjs of the worktree');
    expect(worker).not.toContain('the other checkout');
    expect(wasm).toBe('wasm of the worktree');
  }, 60_000);

  it('would take the other checkout\'s in the worker without the resolver among the worker\'s plugins', async() => {
    expect((await buildWorktree(false)).worker).toContain('quickjs of the other checkout');
  }, 60_000);
});
