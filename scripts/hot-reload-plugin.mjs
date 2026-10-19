/**
 * The dev server's side of hot updates (src/helpers/hotRegistry.ts, src/helpers/hotModule.ts):
 *
 * - every app module it serves goes through scripts/hot-module-transform.mjs, which makes a hot update — a module run
 *   again — keep what live code holds of the previous evaluation: its state, its classes (patched in place), and for
 *   a module that accepts its own updates, its exports;
 * - the page reload a hot update asks for when the live page cannot take it (`tweb:reload`).
 *   `import.meta.hot.invalidate()` would not do: Vite answers it by running the module's importers again, which then
 *   make new instances beside the live ones. So the page sends `tweb:reload`, and the server reloads it the way it
 *   does after an edit no boundary accepts — "page reload" in its log, every page it serves reloaded;
 * - a hot context for a module whose edit took out its last effect (hotListen / hotEffect) together with its last
 *   mention of `import.meta.hot`: Vite gives such a module's next evaluation no context, and a new context is what
 *   tells @helpers/hotModule that the module ran again, so that the previous evaluation's effects are undone.
 *
 * Runs last (`enforce: 'post'`), on the code the other plugins made; never in a build, nor under vitest.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {transformForHotWithMap} from './hot-module-transform.mjs';

const LANG = {'.ts': 'ts', '.tsx': 'tsx', '.js': 'js', '.jsx': 'jsx'};

// an app module: not a dependency, a worker's entry (it comes with a query), the vendored libraries, the tests, nor
// the registry itself
const isAppModule = (id) => !id.includes('?') && !id.includes('\0') && !id.includes('/node_modules/') &&
  /\/src\/.+\.[jt]sx?$/.test(id) && !id.endsWith('.d.ts') && !/\/src\/(vendor|tests)\//.test(id) &&
  !/\/src\/helpers\/hot(Module|Registry)\.ts$/.test(id);

/**
 * The transform parses each module twice, ~4 ms a module: a few seconds of a cold start. Its result depends on nothing
 * but the module's source, the code it gets and the transform's own code, so a restarted server reads it back.
 */
function transformCache(root) {
  const dir = path.join(root, 'tmp', 'hot-transform-cache');
  const scripts = path.dirname(fileURLToPath(import.meta.url));
  const version = createHash('sha1');
  for(const own of ['hot-module-transform.mjs', 'hot-reload-plugin.mjs']) version.update(fs.readFileSync(path.join(scripts, own)));
  const versionHash = version.digest('hex');
  try {
    // a cache that grew past any use (every edit adds an entry) starts over
    if(fs.readdirSync(dir).length > 30000) fs.rmSync(dir, {recursive: true, force: true});
  } catch{}
  fs.mkdirSync(dir, {recursive: true});
  return (id, source, code, make) => {
    const key = createHash('sha1').update(versionHash).update('\0' + id + '\0').update(source).update('\0').update(code).digest('hex');
    const file = path.join(dir, key);
    try {
      // `{code, map}`, or null: nothing to add
      return JSON.parse(fs.readFileSync(file, 'utf8')) ?? undefined;
    } catch{}
    const out = make();
    fs.promises.writeFile(file, JSON.stringify(out ?? null)).catch(() => {});
    return out;
  };
}

export default function hotReloadPlugin() {
  // the modules whose code has set up a hot effect since the server started
  const hadEffects = new Set();
  let cached;
  // the maps of the edits, for a debugger to step through the module's own code: a server without hot updates (the
  // e2e suites') is spared them - laying a map over the code's own is a cost it pays for every module, at its first
  // page load
  let maps = true;

  return {
    name: 'tweb-hot-reload',
    apply: 'serve',
    enforce: 'post',
    configResolved(config) {
      if(!process.env.VITEST) cached = transformCache(config.root);
      maps = config.server.hmr !== false;
    },
    transform(code, id) {
      if(process.env.VITEST) return;
      const file = id.split('?')[0];
      let out = code;
      if(/\/src\/.+\.[jt]sx?$/.test(file)) {
        if(/\bhot(Listen|Effect)\(/.test(code)) {
          hadEffects.add(file);
        } else if(hadEffects.has(file) && !code.includes('import.meta.hot')) {
          out += '\nimport.meta.hot;\n';
        }
      }

      if(isAppModule(id)) {
        try {
          const source = fs.readFileSync(id, 'utf8');
          const input = out;
          const kept = cached(id, source, input, () => transformForHotWithMap(source, input, {lang: LANG[id.slice(id.lastIndexOf('.'))], id}));
          // where the edits move code along its lines, their map, which the dev server lays over the code's own
          if(kept) return maps ? kept : {code: kept.code, map: null};
        } catch(err) {
          this.warn(`left as it is, hot updates of it keep nothing: ${err.message}`);
        }
      }

      // appended after the code: its source map stays as it is (`map: null`)
      return out === code ? undefined : {code: out, map: null};
    },
    configureServer(server) {
      server.ws.on('tweb:reload', ({path, reason}) => {
        server.config.logger.info(`page reload ${path || ''} (${reason})`, {timestamp: true});
        server.ws.send({type: 'full-reload', path: '*'});
      });
    }
  };
}
