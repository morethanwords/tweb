import path from 'path';
import {createRequire} from 'module';
import {build} from 'esbuild';

// Loaded by Node (which strips its types), not with the config: its esbuild hooks import() modules while a bundle
// builds, and in a config evaluated by Vite's module runner (`--configLoader runner`) those would go through the
// runner, closed by then.
const {frameBuildOptions, rendererBuildOptions, sandboxBuildOptions} =
  createRequire(import.meta.url)('../src/vendor/widget-sandbox/scripts/sandbox-build.ts');

// Chromium: makes the document cross-origin isolated (SharedArrayBuffer for the `sab` transport's synchronous
// layout queries) without COOP/COEP, so third-party frames and popups keep working; cross-origin
// subresources without CORS load without credentials. Other engines ignore it.
export const ISOLATION_POLICY = 'isolate-and-credentialless';
/** Widgets run in the page (`inline`): only the `sab` debug transport needs the isolation, on a page opened with it. */
const ISOLATE_QUERY = /[?&]isolate=1(&|$)/;

/**
 * The popup suites' servers aim widget-sandbox's attack corpus, written for a canary on 127.0.0.1:9999, at their
 * checkout's canary (TWEB_WIDGET_CANARY, its port: playwright.popups.config.ts), so two checkouts' runs never share one.
 * In a CSS escape the address is `127.0.0.1\:9999`, its backslash doubled in the `?raw` module's string.
 */
const CANARY_PORT = process.env.TWEB_WIDGET_CANARY;
const ATTACK_FIXTURE = /[\\/]widgetSandbox[\\/]fixtures[\\/]attacks[\\/][^\\/?]+\.html\?raw\b/;
const CANARY_ADDRESS = /(127\.0\.0\.1(?:\\\\)?:)9999(?!\d)/g;

/**
 * The QuickJS build (`@telegram/widget-sandbox-quickjs`, a `link:` to src/vendor/widget-sandbox-quickjs) is taken from
 * this checkout's copy, wherever node_modules takes it from: a worktree whose node_modules is the main checkout's (a
 * symlink, as start-preview.sh allows) would get the main checkout's copy, and the dev server would refuse its files as
 * out of the worktree. Resolved as the resolver would (the package's exports, the environment's conditions), only from
 * here.
 */
const QUICKJS_PACKAGE = /^@telegram\/widget-sandbox-quickjs(?:[/?]|$)/;
const QUICKJS_DIR = '/src/vendor/widget-sandbox-quickjs/';
/** esbuild's resolver run of an import of the package by the hook below, which it leaves alone. */
const QUICKJS_RESOLVING = Symbol('quickjs');

/** A file of the QuickJS package as resolved, in `rootDir`'s copy (a query, `?url`, stays). */
const quickjsIn = (rootDir, file) => {
  const normalized = file.replace(/\\/g, '/');
  const index = normalized.lastIndexOf(QUICKJS_DIR);
  return index === -1 ? file : rootDir.replace(/\\/g, '/') + normalized.slice(index);
};

/**
 * The QuickJS package taken from `rootDir`'s copy (above), before Vite's own resolver, which would take it where
 * node_modules has it: in the page's graph (widgetSandboxPlugin) and in the workers', which a build makes with plugins
 * of their own (`worker.plugins`) — the engine worker runs the widgets.
 */
export function widgetSandboxQuickjsPlugin(rootDir) {
  return {
    name: 'widget-sandbox-quickjs',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      if(!QUICKJS_PACKAGE.test(id)) return;
      const resolved = await this.resolve(id, importer, {...options, skipSelf: true});
      return resolved && {...resolved, id: quickjsIn(rootDir, resolved.id)};
    }
  };
}

/**
 * The parts of widget-sandbox's own Vite plugin (src/vendor/widget-sandbox/vite.ts) that tweb needs,
 * without its cross-origin isolation headers: COEP would break third-party frames (mini apps, games,
 * payments). Widgets need no isolation (their engine runs in the page); `?isolate=1` gives a page
 * `Document-Isolation-Policy` for the `sab` debug transport, where the browser has it.
 *
 * `virtual:sandbox-bundle` / `virtual:renderer-bundle` / `virtual:frame-bundle`: the in-sandbox shim, the
 * renderer, and the renderer with the engine for the `frame` transport, built by esbuild from the vendored sources.
 * The engine is widget-sandbox's own QuickJS build (its packages/quickjs-wasm), vendored next to the package and
 * linked as `@telegram/widget-sandbox-quickjs` (package.json).
 */
export default function widgetSandboxPlugin(rootDir) {
  const packageRoot = path.join(rootDir, 'src/vendor/widget-sandbox');
  const virtualBundles = {
    'virtual:sandbox-bundle': () => sandboxBuildOptions(packageRoot),
    'virtual:renderer-bundle': () => rendererBuildOptions(packageRoot),
    // the engine and the renderer in one frame, for browsers that cannot isolate the page (`frame` transport)
    'virtual:frame-bundle': () => frameBuildOptions(packageRoot)
  };

  // the esbuild bundles' imports of it (the `frame` transport's engine)
  const esbuildQuickjs = {
    name: 'widget-sandbox-quickjs',
    setup(build) {
      build.onResolve({filter: QUICKJS_PACKAGE}, async({path: id, kind, importer, resolveDir, pluginData}) => {
        if(pluginData === QUICKJS_RESOLVING) return;
        const resolved = await build.resolve(id, {kind, importer, resolveDir, pluginData: QUICKJS_RESOLVING});
        if(resolved.errors.length || resolved.namespace !== 'file') return;
        return {path: quickjsIn(rootDir, resolved.path), sideEffects: resolved.sideEffects, suffix: resolved.suffix};
      });
    }
  };

  return [widgetSandboxQuickjsPlugin(rootDir), {
    name: 'widget-sandbox',
    resolveId(id) {
      if(id in virtualBundles) return '\0' + id;
    },
    ...(CANARY_PORT && {
      transform: {
        filter: {id: ATTACK_FIXTURE},
        handler(code, id) {
          // a vector that spelt the port otherwise would aim past the canary and pass unseen
          if(code.match(/9999/g)?.length !== code.match(CANARY_ADDRESS)?.length) {
            throw new Error(`${id}: 9999 not as 127.0.0.1:9999, which the e2e servers aim at the canary's port`);
          }

          return {code: code.replace(CANARY_ADDRESS, `$1${CANARY_PORT}`), map: null};
        }
      }
    }),
    async load(id) {
      if(!id.startsWith('\0')) return;
      const options = virtualBundles[id.slice(1)];
      if(!options) return;
      const buildOptions = options();
      const out = await build({...buildOptions, plugins: [...(buildOptions.plugins ?? []), esbuildQuickjs], metafile: true});
      // a watched build (a preview's bundle) builds again when a source of the bundle changes; a module of a plugin's
      // own namespace is no file
      const cwd = buildOptions.absWorkingDir ?? process.cwd();
      for(const input of Object.keys(out.metafile.inputs)) {
        if(!/^[\w-]+:/.test(input)) this.addWatchFile(path.resolve(cwd, input));
      }

      return `export default ${JSON.stringify(out.outputFiles[0].text)};`;
    },
    handleHotUpdate({file, server}) {
      if(!file.startsWith(packageRoot) || !/\/src\/(sandbox|renderer|shared|host)\//.test(file)) return;
      for(const id of Object.keys(virtualBundles)) {
        const mod = server.moduleGraph.getModuleById('\0' + id);
        if(mod) server.moduleGraph.invalidateModule(mod);
      }
      server.ws.send({type: 'full-reload'});
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Set before any later middleware can end the response (the preview's static index.html does).
        if(ISOLATE_QUERY.test(req.url || '')) res.setHeader('Document-Isolation-Policy', ISOLATION_POLICY);
        next();
      });
    }
  }];
}
