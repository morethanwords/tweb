// The import graphs behind two costs of an edit: whether the dev server can hot-update it or has to reload the
// page, and how many test files `vitest --changed` reruns for it. Run from anywhere:
//
//   node scripts/import-graph.mjs hmr [--live <port>]  the modules whose edit reloads the page, by area
//   node scripts/import-graph.mjs why <file...>        the importer chain by which an edit of <file> reloads the page
//   node scripts/import-graph.mjs funnels [steps]      greedy: the modules that, made HMR boundaries, save most reloads
//   node scripts/import-graph.mjs hazards [n]          the stateful modules hot updates make second instances of, and
//                                                      the import that pulls each into a boundary's closure
//   node scripts/import-graph.mjs tests [file...]      how many test files an edit reaches; the hubs; chains to <file>
//   node scripts/import-graph.mjs cycle [steps]        the largest import cycle and the modules that hold it together
//   node scripts/import-graph.mjs edges [steps]        ...and the single import edges that hold it together
//   node scripts/import-graph.mjs check [--update]     the ratchet: fails when the cycle, the reloads or the dirty
//                                                      updates grew past scripts/import-graph.budget.json
//   any of them with --cut a.ts,b.ts: what if those modules were imported only from the app's root
//
// HMR. Vite reloads the page when some chain of importers climbs from the edited module to a module nobody
// imports — the page's entry, or a worker's — without meeting a module that accepts the update (its
// propagateUpdate). A dynamic import() counts as an importer like a static one. The boundaries are found
// statically, by the rules the dev server applies: an explicit `import.meta.hot.accept(` (self, or of named
// deps), and, in a .tsx, solid-refresh's own accept, which it adds when the module declares a component at its top
// level — a function or arrow named in PascalCase, not async, taking at most one parameter — or a createContext().
// `hmr --live <port>` compares that with what a running dev server of this checkout actually serves — and makes that
// server transform every module, so its HMR then acts like the whole-graph model (restart it afterwards).
//
// Vite only knows an importer once it has served it, so what an edit does depends on what the session loaded. By
// default every module counts as loaded, which is where a long-lived dev server ends up. `--boot` (hmr, why, funnels)
// keeps to what a signed-in boot loads: the static imports reached from the entry and from the dynamic imports the
// boot itself takes (BOOT_IMPORTS), plus the workers. `--loaded <json>` takes the list of a recorded session instead.
//
// Tests. The graph vitest walks for --changed: each test file's static and dynamic imports, type-only ones elided,
// setup files not included.
import esbuild from 'esbuild';
import {parseAst} from 'vite';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if(process.cwd() !== ROOT) process.chdir(ROOT);
const BUDGET_PATH = 'scripts/import-graph.budget.json';
const PAGE_ENTRY = 'src/index.ts';
// worker code runs beside the page and a page-side boundary does nothing for it: counted apart, as "worker side"
const WORKER_SIDE = /^src\/lib\/(appManagers|mtproto|crypto|storages|mainWorker|serviceWorker|calls)\//;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
// vitest's default include, minus its excludes in vite.config.ts
const TEST_SKIP_DIRS = new Set(['node_modules', 'dist', '.claude', '.pnpm-store', 'cypress', '.idea', '.git', '.cache',
  '.output', '.temp', 'solid', 'tmp', 'public']);

// what a signed-in boot imports dynamically on its way to the chat list (recorded 2026-10-12): these, and every
// dynamic import of bootstrapIm
const BOOT_IMPORTS = ['src/pages/bootstrapIm.ts', 'src/pages/mountAuthFlow.tsx', 'src/components/chatTips/index.tsx',
  'src/lang.ts', 'src/langSign.ts', 'src/countries.ts', 'src/vendor/fastBlur.js'];

// what-if: modules no longer imported by app code, only from the root (--cut a,b — registered at startup instead)
const CUT_ROOTS = new Set([PAGE_ENTRY, 'src/pages/bootstrapIm.ts', 'src/lib/solidjs/hotReloadGuardValue.ts', 'src/components/popupSandbox/index.ts']);
let cutTo = new Set();

const isAppModule = (f) => f.startsWith('src/') && !f.startsWith('src/vendor/') && !TEST_FILE.test(f);
const percent = (n, of) => (100 * n / of).toFixed(0) + '%';
const pad = (s, n) => String(s).padStart(n);

// * graphs

const externalize = {
  name: 'externalize',
  setup(build) {
    // query imports (?url, ?worker, ?raw), styles and assets are not modules of the graph
    build.onResolve({filter: /\?|\.(s?css|svg|png|jpe?g|webp|gif|wasm|woff2?|ttf|html|hbs|mp3|tgs|lottie)$/}, (a) => ({path: a.path, external: true}));
  }
};

/** module -> its imports, static and dynamic, as esbuild resolves them (type-only imports elided) */
async function importGraph(entryPoints) {
  const result = await esbuild.build({
    entryPoints, bundle: true, write: false, metafile: true, splitting: true, format: 'esm',
    outdir: path.join(os.tmpdir(), 'import-graph-out'), platform: 'node', packages: 'external', logLevel: 'silent',
    jsx: 'preserve', plugins: [externalize]
  }).catch((e) => e);
  if(!result.metafile) {
    throw new Error('esbuild failed:\n' + (result.errors || []).slice(0, 5).map((e) => e.text + ' @ ' + e.location?.file).join('\n'));
  }
  const {inputs} = result.metafile;
  const graph = new Map();
  for(const [file, input] of Object.entries(inputs)) {
    const keep = (i) => !i.external && inputs[i.path] && (!cutTo.has(i.path) || CUT_ROOTS.has(file) || TEST_FILE.test(file));
    graph.set(file, input.imports.filter(keep).map((i) => ({to: i.path, kind: i.kind})));
  }
  return graph;
}

export function closure(graph, start, skip) {
  const seen = new Set([start]);
  const stack = [start];
  while(stack.length) {
    const u = stack.pop();
    for(const {to} of graph.get(u) || []) {
      if(!seen.has(to) && !skip?.(u, to)) seen.add(to), stack.push(to);
    }
  }
  return seen;
}

/** strongly connected components, largest first; skip(u, v) drops an edge */
export function cycles(graph, skip) {
  let index = 0;
  const idx = new Map(), low = new Map(), on = new Set(), stack = [], out = [];
  for(const v of graph.keys()) {
    if(idx.has(v)) continue;
    const work = [[v, 0]];
    idx.set(v, index); low.set(v, index); index++; stack.push(v); on.add(v);
    while(work.length) {
      const top = work[work.length - 1];
      const u = top[0];
      const edges = graph.get(u) || [];
      if(top[1] < edges.length) {
        const w = edges[top[1]++].to;
        if(skip?.(u, w)) continue;
        if(!idx.has(w)) {
          idx.set(w, index); low.set(w, index); index++; stack.push(w); on.add(w); work.push([w, 0]);
        } else if(on.has(w)) {
          low.set(u, Math.min(low.get(u), idx.get(w)));
        }
      } else {
        work.pop();
        if(work.length) {
          const p = work[work.length - 1][0];
          low.set(p, Math.min(low.get(p), low.get(u)));
        }
        if(low.get(u) === idx.get(u)) {
          const c = [];
          let w;
          do { w = stack.pop(); on.delete(w); c.push(w); } while(w !== u);
          out.push(c);
        }
      }
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

const staticOnly = (graph) => new Map([...graph].map(([k, v]) => [k, v.filter((e) => e.kind !== 'dynamic-import')]));

// * tests

function listTests(dir = '.', out = []) {
  for(const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if(entry.isDirectory()) {
      if(TEST_SKIP_DIRS.has(entry.name) || (dir === '.' && entry.name === 'e2e')) continue;
      listTests(path.join(dir, entry.name), out);
    } else if(TEST_FILE.test(entry.name) && !/^(vite|vitest)\.config\./.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out.sort();
}

export async function testGraph() {
  const tests = listTests();
  const graph = await importGraph(tests);
  return {tests, graph};
}

/** module -> how many test files `vitest --changed` reruns when it changes */
function testReach(graph, tests, skip) {
  const reach = new Map();
  for(const t of tests) for(const m of closure(graph, t, skip)) reach.set(m, (reach.get(m) || 0) + 1);
  return reach;
}

function reachSummary(graph, reach) {
  const r = [...graph.keys()].filter(isAppModule).map((m) => reach.get(m) || 0).sort((a, b) => a - b);
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  return {
    modules: r.length, mean: Math.round(mean), median: r[r.length >> 1], p75: r[Math.floor(r.length * 0.75)],
    over100: percent(r.filter((x) => x >= 100).length, r.length)
  };
}
const formatReach = (s) => `an edit reaches on average ${s.mean} test files (median ${s.median}, p75 ${s.p75}); ${s.over100} of ${s.modules} modules reach 100+`;

// * HMR

function workerEntries() {
  const found = ['sw.ts'];
  const walk = (dir) => {
    for(const entry of fs.readdirSync(dir, {withFileTypes: true})) {
      const p = path.join(dir, entry.name);
      if(entry.isDirectory()) {
        if(entry.name !== 'tests' && entry.name !== 'vendor') walk(p);
      } else if(/\.worker\.[jt]s$/.test(entry.name)) {
        found.push(p);
      }
    }
  };
  walk('src');
  return found;
}

const TS_PATHS = (() => {
  const paths = {};
  const text = fs.readFileSync('tsconfig.json', 'utf8');
  for(const [, key, target] of text.matchAll(/"([^"]+)":\s*\["\.\/([^"]+)"\]/g)) paths[key] = target;
  return paths;
})();

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
function resolveSpecifier(from, specifier, known) {
  let base;
  if(specifier.startsWith('.')) base = path.join(path.dirname(from), specifier);
  else if(specifier.startsWith('/')) base = specifier.slice(1);
  else {
    for(const [key, target] of Object.entries(TS_PATHS)) {
      if(key.endsWith('/*') ? specifier.startsWith(key.slice(0, -1)) : specifier === key) {
        base = key.endsWith('/*') ? target.slice(0, -1) + specifier.slice(key.length - 1) : target;
        break;
      }
    }
  }
  if(!base) return;
  base = base.replace(/\?.*$/, '');
  return EXTENSIONS.map((ext) => base + ext).find((f) => known.has(f));
}

/** visits every node; with topLevelOnly, not the insides of functions and classes (code that runs later, if ever) */
function walkAst(node, visit, topLevelOnly) {
  if(!node || typeof node !== 'object') return;
  if(Array.isArray(node)) {
    for(const child of node) walkAst(child, visit, topLevelOnly);
    return;
  }
  if(typeof node.type === 'string') {
    visit(node);
    // a function called right where it is written runs at the top level all the same
    if(topLevelOnly && node.type === 'CallExpression' && /^(Arrow)?FunctionExpression$/.test(node.callee.type)) {
      walkAst(node.callee.body, visit, topLevelOnly);
      walkAst(node.arguments, visit, topLevelOnly);
      return;
    }
    if(topLevelOnly && /^(Function|ArrowFunction|Class)(Declaration|Expression)$/.test(node.type)) return;
  }
  for(const key in node) {
    if(key !== 'type' && key !== 'start' && key !== 'end') walkAst(node[key], visit, topLevelOnly);
  }
}

const isImportMetaHot = (n) => n?.type === 'MemberExpression' && !n.computed && n.property.name === 'hot' &&
  n.object.type === 'MetaProperty' && n.object.meta.name === 'import' && n.object.property.name === 'meta';

/** `import.meta.hot.accept(...)` calls, as Vite's lexer reads them: no argument or a callback accepts the module itself */
function explicitAccepts(ast) {
  let self = false;
  const deps = [];
  walkAst(ast, (n) => {
    if(n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || n.callee.property.name !== 'accept' ||
      !isImportMetaHot(n.callee.object)) return;
    const [first] = n.arguments;
    if(first?.type === 'Literal' && typeof first.value === 'string') deps.push(first.value);
    else if(first?.type === 'TemplateLiteral' && !first.expressions.length) deps.push(first.quasis[0].value.cooked);
    else if(first?.type === 'ArrayExpression') deps.push(...first.elements.map((e) => e.value));
    else self = true;
  });
  return {self, deps};
}

const unwrap = (n) => {
  while(n && /^(ParenthesizedExpression|TSAsExpression|TSSatisfiesExpression|TSNonNullExpression|TSInstantiationExpression|TSTypeAssertion)$/.test(n.type)) n = n.expression;
  return n;
};
const isComponentish = (name) => name && name[0] >= 'A' && name[0] <= 'Z';
const isComponentFunction = (fn) => fn && /^(FunctionExpression|ArrowFunctionExpression|FunctionDeclaration)$/.test(fn.type) &&
  !fn.async && !fn.generator && fn.params.length < 2;

/** whether solid-refresh registers anything in the module, which makes it `import.meta.hot.accept()` */
function solidRefreshAccepts(ast, source) {
  if(/\/\*\s*@refresh (skip|reload)\s*\*\//.test(source)) return false; // reload declines: Vite goes on to the importers
  const contexts = new Set();
  for(const n of ast.body) {
    if(n.type === 'ImportDeclaration' && /^solid-js(\/web)?$/.test(n.source.value)) {
      for(const s of n.specifiers) if(s.type === 'ImportSpecifier' && s.imported.name === 'createContext') contexts.add(s.local.name);
    }
  }
  for(let n of ast.body) {
    if(n.type === 'ExportNamedDeclaration' || n.type === 'ExportDefaultDeclaration') n = n.declaration;
    if(n?.type === 'FunctionDeclaration' && isComponentish(n.id?.name) && isComponentFunction(n)) return true;
    if(n?.type !== 'VariableDeclaration') continue;
    for(const d of n.declarations) {
      if(d.id.type !== 'Identifier' || !d.init) continue;
      if(isComponentish(d.id.name) && isComponentFunction(unwrap(d.init))) return true;
      const call = unwrap(d.init);
      if(call.type === 'CallExpression' && unwrap(call.callee).type === 'Identifier' && contexts.has(unwrap(call.callee).name)) return true;
    }
  }
  return false;
}

/** the HMR boundaries: modules that accept themselves, and the deps each module accepts for itself */
function staticBoundaries(files) {
  const self = new Set();
  const depAccepts = new Map();
  const known = new Set(files);
  for(const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if(!source.includes('import.meta.hot') && !/\.[jt]sx$/.test(file)) continue;
    const lang = /\.tsx$/.test(file) ? 'tsx' : /\.ts$/.test(file) ? 'ts' : /\.jsx$/.test(file) ? 'jsx' : 'js';
    const ast = parseAst(source, {lang});
    const explicit = explicitAccepts(ast);
    if(explicit.self || (/\.[jt]sx$/.test(file) && solidRefreshAccepts(ast, source))) self.add(file);
    const deps = explicit.deps.map((d) => resolveSpecifier(file, d, known)).filter(Boolean);
    if(deps.length) depAccepts.set(file, new Set(deps));
  }
  return {self, depAccepts};
}

/** the same, read off what a running dev server of this checkout serves */
async function liveBoundaries(files, port) {
  const self = new Set();
  const depAccepts = new Map();
  const known = new Set(files);
  const queue = [...files];
  await Promise.all(Array.from({length: 16}, async() => {
    while(queue.length) {
      const file = queue.pop();
      const response = await fetch(`http://127.0.0.1:${port}/${file}`);
      const code = await response.text();
      if(!response.ok || !code.includes('import.meta.hot')) continue;
      const explicit = explicitAccepts(parseAst(code, {lang: 'js'}));
      if(explicit.self) self.add(file);
      const deps = explicit.deps.map((d) => resolveSpecifier(file, d, known)).filter(Boolean);
      if(deps.length) depAccepts.set(file, new Set(deps));
    }
  }));
  return {self, depAccepts};
}

export async function hmrGraph({live, loaded, boot} = {}) {
  const workers = workerEntries();
  const graph = await importGraph([PAGE_ENTRY, ...workers]);
  if(loaded || boot) {
    // Vite only knows the importers it has served: keep to the modules a session loaded
    const bootImports = [...BOOT_IMPORTS, ...graph.get(BOOT_IMPORTS[0]).filter((e) => e.kind === 'dynamic-import').map((e) => e.to)];
    const set = loaded ? new Set(JSON.parse(fs.readFileSync(loaded, 'utf8'))) : new Set([PAGE_ENTRY, ...bootImports, ...workers].flatMap((f) => {
      return [...closure(graph, f, (u, v) => graph.get(u).find((e) => e.to === v).kind === 'dynamic-import')];
    }));
    for(const [f, edges] of graph) {
      if(set.has(f)) graph.set(f, edges.filter((e) => set.has(e.to)));
      else graph.delete(f);
    }
  }
  const files = [...graph.keys()].filter((f) => f.startsWith('src/') || f === 'sw.ts');
  const importers = new Map(files.map((f) => [f, new Set()]));
  for(const f of files) for(const {to} of graph.get(f)) importers.get(to)?.add(f);
  const boundaries = live ? await liveBoundaries(files, live) : staticBoundaries(files);
  const page = closure(graph, PAGE_ENTRY);
  const workerSide = new Set(files.filter((f) => !page.has(f) || WORKER_SIDE.test(f)));
  const inWorkers = new Set(workers.flatMap((w) => [...closure(graph, w)]));
  const sharedWithWorkers = new Set(files.filter((f) => page.has(f) && inWorkers.has(f)));
  return {graph, files, importers, workers, page, workerSide, sharedWithWorkers, ...boundaries};
}

/**
 * The modules whose edit reloads the page: those from which a chain of importers that accept nothing climbs to a
 * root (a module nobody imports). Equivalently, what the roots reach downward through modules that do not accept
 * themselves, skipping each import its importer accepts.
 */
export function reloading(h, {roots, accepting = h.self} = {}) {
  roots ??= h.files.filter((f) => !h.importers.get(f).size);
  const out = new Set();
  const stack = [];
  for(const r of roots) if(!accepting.has(r)) out.add(r), stack.push(r);
  while(stack.length) {
    const u = stack.pop();
    const accepted = h.depAccepts.get(u);
    for(const {to} of h.graph.get(u) || []) {
      if(out.has(to) || accepting.has(to) || accepted?.has(to) || !h.importers.has(to)) continue;
      out.add(to);
      stack.push(to);
    }
  }
  return out;
}

/** how often each file was edited: the commits of the last 90 days that touch it */
const editCounts = (() => {
  let counts;
  return () => counts ??= execFileSync('git', ['log', '--since=90.days', '--no-merges', '--name-only', '--format='], {encoding: 'utf8', maxBuffer: 1 << 28})
  .split('\n').filter(Boolean).reduce((m, f) => m.set(f, (m.get(f) || 0) + 1), new Map());
})();

function hmrSummary(h, accepting) {
  const app = h.files.filter(isAppModule);
  const appPage = app.filter((f) => !h.workerSide.has(f));
  // the page alone, as if no worker shared a module with it
  const pageOnly = reloading(h, {roots: [PAGE_ENTRY], accepting});
  const dirty = accepting ? new Map() : dirtyUpdates(h);
  // and with the workers' entries, which Vite climbs to just the same: a module a worker imports always reloads
  const all = reloading(h, {accepting});
  const count = (set, of) => of.filter((f) => set.has(f)).length;
  const edits = (of) => of.reduce((n, f) => n + (editCounts().get(f) || 0), 0);
  return {
    editsPage: edits(appPage), editsReloadPage: edits(appPage.filter((f) => pageOnly.has(f))),
    dirtyPage: appPage.filter((f) => !pageOnly.has(f) && dirty.has(f)).length,
    editsDirtyPage: edits(appPage.filter((f) => !pageOnly.has(f) && dirty.has(f))), dirty,
    modules: app.length, pageModules: appPage.length, boundaries: count(accepting || h.self, app),
    reload: count(pageOnly, app), reloadPage: count(pageOnly, appPage),
    reloadWithWorkers: count(all, appPage), sharedWithWorkers: count(h.sharedWithWorkers, appPage),
    pageOnly, all
  };
}

function printHmr(h, s) {
  console.log(`app graph: ${s.modules} src modules, ${s.boundaries} of them HMR boundaries; ${s.modules - s.pageModules} worker side`);
  console.log(`edit reloads the page: ${s.reload} of ${s.modules} modules (${percent(s.reload, s.modules)}); page modules: ${s.reloadPage} of ${s.pageModules} (${percent(s.reloadPage, s.pageModules)})`);
  console.log(`  of the ${s.pageModules - s.reloadPage} page modules that update hot, ${s.dirtyPage} run a stateful module again (a second appImManager, store, ...): a clean hot update for ${s.pageModules - s.reloadPage - s.dirtyPage} (${percent(s.pageModules - s.reloadPage - s.dirtyPage, s.pageModules)})`);
  console.log(`  weighted by how often each was edited (commits of the last 90 days): ${percent(s.editsReloadPage, s.editsPage)} of the edits to page modules reload, ${percent(s.editsDirtyPage, s.editsPage)} update dirty`);
  console.log(`  counting the workers' importer chains too: ${s.reloadWithWorkers} of ${s.pageModules} page modules (${percent(s.reloadWithWorkers, s.pageModules)}); ${s.sharedWithWorkers} page modules are imported by a worker as well`);
}

function funnels(h, steps) {
  const accepting = new Set(h.self);
  const pageModules = h.files.filter((f) => isAppModule(f) && !h.workerSide.has(f));
  const count = () => {
    const r = reloading(h, {roots: [PAGE_ENTRY], accepting});
    return pageModules.filter((f) => r.has(f)).length;
  };
  let now = count();
  console.log(`page modules: ${pageModules.length}; reload on edit: ${now} (${percent(now, pageModules.length)})`);
  const result = [];
  for(let step = 1; step <= steps; ++step) {
    const r = reloading(h, {roots: [PAGE_ENTRY], accepting});
    // candidates: non-accepting importers met most often right above the reloading modules
    const freq = new Map();
    for(const f of r) for(const i of h.importers.get(f)) if(r.has(i) && i !== PAGE_ENTRY) freq.set(i, (freq.get(i) || 0) + 1);
    let best;
    for(const [c] of [...freq].sort((a, b) => b[1] - a[1]).slice(0, 60)) {
      accepting.add(c);
      const n = count();
      accepting.delete(c);
      if(!best || n < best.n) best = {c, n};
    }
    if(!best) break;
    accepting.add(best.c);
    now = best.n;
    result.push(best);
    console.log(`${pad(step, 2)}. ${best.c.padEnd(60)} -> ${now} reload (${percent(now, pageModules.length)})`);
  }
  return result;
}

// * the hazard of running a boundary again
//
// Vite re-stamps (?t=) every transitive importer of an edited module, through boundaries too, unless the importer
// accepts that dep. A boundary that runs again imports anew whatever in its closure carries a newer stamp than the
// copy the page holds. So once a hot update has gone through below a stateful module — a singleton, or a module that
// defines a custom element — the next boundary to run again with that module in its closure makes a second instance
// of it: a second appImManager, a define() that throws, a TDZ in a cycle. A page reload resets the stamps.

const BUILTINS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'Array', 'Object', 'RegExp', 'Date', 'Error', 'Promise',
  'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'Int8Array',
  'Int16Array', 'Int32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array', 'DataView', 'ArrayBuffer',
  'Intl', 'BroadcastChannel', 'Image', 'Blob', 'OffscreenCanvas', 'FinalizationRegistry', 'AbortController', 'Function']);
const STATE_CALLS = new Set(['createRoot', 'createSignal', 'createStore', 'createMutable', 'createReaction', 'setInterval']);
// a listener added at the top level is added once more by each run of the module
const LISTEN_CALLS = new Set(['addEventListener', 'addMultipleEventsListeners', 'setInterval']);

/**
 * Modules that would make a second copy of what they set up when a hot update runs them again: in a top-level
 * statement they construct a (non-builtin) class, set up a Solid root, signal or store, define a custom element or add
 * a listener. A top-level declaration's value is no hazard: the dev server keeps it across evaluations
 * (scripts/hot-module-transform.mjs), and so is a `define` behind `if(!customElements.get(name))`.
 */
export function statefulModules(h) {
  const out = new Set();
  for(const f of h.files) {
    if(!isAppModule(f)) continue;
    const source = fs.readFileSync(f, 'utf8');
    if(!/new [A-Z]|create(Root|Signal|Store|Mutable|Reaction|Context|ComponentContext)\(|\.define\(|addEventListener\(|addMultipleEventsListeners\(|setInterval\(/.test(source)) continue;
    const ast = parseAst(source, {lang: /\.tsx$/.test(f) ? 'tsx' : /\.ts$/.test(f) ? 'ts' : 'jsx'});
    const contextCalls = ['createContext', 'createComponentContext'];
    const stateful = ast.body.some((statement) => {
      if(statement.type === 'IfStatement' && /customElements\.get\(/.test(source.slice(statement.test.start, statement.test.end))) return false;
      // a declaration's value is kept across evaluations
      const declaration = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration' ? statement.declaration : statement;
      if(declaration && (declaration.type === 'VariableDeclaration' || statement.type === 'ExportDefaultDeclaration')) return false;
      let found = false;
      walkAst(statement, (n) => {
        if(found || n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' ||
          n.type === 'ClassDeclaration' || n.type === 'ClassExpression') return;
        if(n.type === 'NewExpression' && n.callee.type === 'Identifier' && !BUILTINS.has(n.callee.name)) found = true;
        else if(n.type === 'CallExpression') {
          const callee = n.callee;
          if(callee.type === 'Identifier' && (STATE_CALLS.has(callee.name) || contextCalls.includes(callee.name))) found = true;
          else if(callee.type === 'MemberExpression' && callee.property.name === 'define' && callee.object.name === 'customElements') found = true;
          else if(callee.type === 'MemberExpression' && LISTEN_CALLS.has(callee.property.name)) found = true;
        }
      }, true);
      return found;
    });
    if(stateful) out.add(f);
  }
  return out;
}

/**
 * For each module whose edit updates hot: the stateful modules the update runs again. Vite re-imports the boundaries
 * (and the deps an importer accepts); they import anew whatever the edit re-stamped — the edited module and all its
 * transitive importers — so a stateful module in a cycle with a boundary comes back as a second instance.
 */
export function dirtyUpdates(h, reload = reloading(h), stateful = statefulModules(h)) {
  const out = new Map();
  for(const x of h.files) {
    if(reload.has(x) || !h.importers.has(x)) continue;
    const reimported = new Set();
    // the boundaries, as Vite's propagateUpdate finds them
    const seen = new Set([x]);
    const queue = [x];
    while(queue.length) {
      const u = queue.pop();
      if(h.self.has(u)) {
        reimported.add(u);
        continue;
      }
      for(const i of h.importers.get(u)) {
        if(h.depAccepts.get(i)?.has(u)) reimported.add(u);
        else if(!seen.has(i)) seen.add(i), queue.push(i);
      }
    }
    // the stamps: through boundaries too, but not across an accepted dep
    const stamped = new Set([x]);
    const stack = [x];
    while(stack.length) {
      const u = stack.pop();
      for(const i of h.importers.get(u)) {
        if(!stamped.has(i) && !h.depAccepts.get(i)?.has(u)) stamped.add(i), stack.push(i);
      }
    }
    const runs = new Set(reimported);
    const down = [...reimported];
    while(down.length) {
      for(const {to} of h.graph.get(down.pop()) || []) {
        if(stamped.has(to) && !runs.has(to)) runs.add(to), down.push(to);
      }
    }
    const hit = [...runs].filter((f) => stateful.has(f));
    if(hit.length) out.set(x, hit);
  }
  return out;
}

/** for each root an edit of <file> climbs to, the shortest chain of non-accepting importers: [file, importer, ..., root] */
export function why(h, file) {
  const prev = new Map([[file, null]]);
  const queue = [file];
  const chains = [];
  const rootsSeen = new Set();
  while(queue.length) {
    const u = queue.shift();
    if(u !== file && h.self.has(u)) continue;
    if(!h.importers.get(u).size && !rootsSeen.has(u)) {
      rootsSeen.add(u);
      const chain = [];
      for(let at = u; at; at = prev.get(at)) chain.unshift(at);
      chains.push(chain);
    }
    for(const i of h.importers.get(u)) {
      if(prev.has(i) || h.depAccepts.get(i)?.has(u)) continue;
      prev.set(i, u);
      queue.push(i);
    }
  }
  return chains;
}

// * commands

const args = process.argv.slice(3);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};

cutTo = new Set(option('--cut')?.split(',') || []);

const sessionOptions = () => {
  const boot = args.includes('--boot');
  if(boot) args.splice(args.indexOf('--boot'), 1);
  return {loaded: option('--loaded'), boot};
};

const commands = {
  async hmr() {
    const live = option('--live');
    const h = await hmrGraph(sessionOptions());
    const s = hmrSummary(h);
    printHmr(h, s);
    const byArea = new Map();
    for(const f of h.files) if(isAppModule(f) && !h.workerSide.has(f) && s.pageOnly.has(f)) {
      const area = f.split('/').slice(0, 3).join('/');
      byArea.set(area, (byArea.get(area) || 0) + 1);
    }
    console.log('\npage modules that reload, by area:');
    for(const [area, n] of [...byArea].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${pad(n, 4)}  ${area}`);
    if(live) {
      const l = await liveBoundaries(h.files, live);
      const diff = (a, b) => [...a].filter((f) => !b.has(f));
      console.log(`\nthe dev server on :${live}: ${l.self.size} self-accepting modules, the static rules found ${h.self.size}`);
      for(const f of diff(l.self, h.self)) console.log(`  accepts on the server only: ${f}`);
      for(const f of diff(h.self, l.self)) console.log(`  accepts by the static rules only: ${f}`);
      const deps = (b) => new Set([...b.depAccepts].flatMap(([f, d]) => [...d].map((x) => f + ' -> ' + x)));
      for(const e of diff(deps(l), deps(h))) console.log(`  dep accepted on the server only: ${e}`);
      for(const e of diff(deps(h), deps(l))) console.log(`  dep accepted by the static rules only: ${e}`);
    }
  },

  async why() {
    const h = await hmrGraph(sessionOptions());
    for(const file of args) {
      if(!h.importers.has(file)) {
        console.log(`${file}: not in the app graph`);
        continue;
      }
      const chains = h.self.has(file) ? [] : why(h, file);
      const dirty = chains.length ? undefined : dirtyUpdates(h).get(file);
      console.log(`${file}: ${chains.length ? 'reloads the page' : (h.self.has(file) ? 'an HMR boundary itself, ' : '') + (dirty ? 'updates hot, but runs again ' + dirty.join(', ') : 'updates hot, cleanly')}`);
      for(const chain of chains.sort((a, b) => a.length - b.length).slice(0, 4)) console.log('  ' + chain.join('\n    <- '));
    }
  },

  async hazards() {
    const h = await hmrGraph(sessionOptions());
    const reload = reloading(h);
    const dirty = dirtyUpdates(h, reload);
    const page = h.files.filter((f) => isAppModule(f) && !h.workerSide.has(f));
    const hot = page.filter((f) => !reload.has(f));
    console.log(`page modules that update hot: ${hot.length}; of them run a stateful module again: ${hot.filter((f) => dirty.has(f)).length}`);
    const by = new Map();
    for(const [x, hit] of dirty) if(page.includes(x)) for(const f of hit) by.set(f, [...(by.get(f) || []), x]);
    console.log('\nstateful modules by the hot edits that make a second instance of them, and the way down to them from a boundary:');
    for(const [f, edits] of [...by].sort((a, b) => b[1].length - a[1].length).slice(0, +(args[0] || 15))) {
      // the shortest import path from a boundary that runs again down to the stateful module: what to cut
      const prev = new Map();
      const queue = [];
      for(const b of h.self) if(h.page.has(b) && b !== f) prev.set(b, null), queue.push(b);
      while(queue.length && !prev.has(f)) {
        const u = queue.shift();
        for(const {to} of h.graph.get(u) || []) if(!prev.has(to) && !h.self.has(to)) prev.set(to, u), queue.push(to);
      }
      const chain = [];
      for(let at = f; at; at = prev.get(at)) chain.unshift(at);
      console.log(`${pad(edits.length, 5)}  ${f}\n         ${chain.join('\n           -> ')}`);
    }
  },

  async funnels() {
    const h = await hmrGraph(sessionOptions());
    funnels(h, +(args[0] || 12));
  },

  async tests() {
    const {tests, graph} = await testGraph();
    const sizes = tests.map((t) => closure(graph, t).size).sort((a, b) => a - b);
    const q = (p) => sizes[Math.floor(p * (sizes.length - 1))];
    console.log(`graph: ${graph.size} modules; ${tests.length} test files`);
    console.log(`modules per test file: median ${q(0.5)}, p25 ${q(0.25)}, p75 ${q(0.75)}, p90 ${q(0.9)}, max ${q(1)}`);
    const reach = testReach(graph, tests);
    console.log(formatReach(reachSummary(graph, reach)));
    // the hubs: a module whose own closure is big and that many tests reach carries the coupling
    const hubs = [...graph.keys()].filter(isAppModule).map((m) => {
      const size = closure(graph, m).size;
      return {m, tests: reach.get(m) || 0, size, score: (reach.get(m) || 0) * size};
    }).sort((a, b) => b.score - a.score);
    console.log('\nhubs (tests reaching it × modules it pulls in):');
    for(const h of hubs.slice(0, 25)) console.log(`  ${pad(h.tests, 4)} tests  ${pad(h.size, 5)} modules  ${h.m}`);
    for(const target of args) {
      const reaching = tests.filter((t) => closure(graph, t).has(target));
      console.log(`\n${target}: reached by ${reaching.length} test files`);
      const viaCount = new Map();
      const chains = [];
      for(const t of reaching) {
        const prev = new Map([[t, null]]);
        const queue = [t];
        while(queue.length && !prev.has(target)) {
          const cur = queue.shift();
          for(const {to, kind} of graph.get(cur) || []) if(!prev.has(to)) prev.set(to, {from: cur, kind}), queue.push(to);
        }
        const chain = [];
        for(let at = target; prev.get(at); at = prev.get(at).from) chain.unshift(`${prev.get(at).from}${prev.get(at).kind === 'dynamic-import' ? ' ~dyn~>' : ' ->'}`);
        chains.push([t, chain.concat(target)]);
        for(const step of chain.slice(1)) {
          const m = step.replace(/ (->|~dyn~>)$/, '');
          viaCount.set(m, (viaCount.get(m) || 0) + 1);
        }
      }
      console.log('  modules on the most chains:');
      for(const [m, n] of [...viaCount].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`    ${pad(n, 4)}  ${m}`);
      console.log('  shortest chains:');
      for(const [t, chain] of chains.sort((a, b) => a[1].length - b[1].length).slice(0, 3)) console.log(`    [${t}]\n      ${chain.join('\n      ')}`);
    }
  },

  async cycle() {
    const steps = +(args[0] || 12);
    const {tests, graph: full} = await testGraph();
    for(const [name, graph] of [['static + dynamic imports', full], ['static imports only', staticOnly(full)]]) {
      const cut = new Set();
      const skip = (u, v) => cut.has(v);
      let biggest = cycles(graph, skip)[0];
      console.log(`\n== ${name}: largest cycle ${biggest.length} modules`);
      for(let step = 0; step < steps && biggest.length > 50; ++step) {
        const inBig = new Set(biggest);
        const indeg = new Map();
        for(const u of biggest) for(const {to} of graph.get(u)) if(inBig.has(to)) indeg.set(to, (indeg.get(to) || 0) + 1);
        let best;
        for(const [m] of [...indeg].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
          cut.add(m);
          const size = cycles(graph, skip)[0].length;
          cut.delete(m);
          if(!best || size < best.size) best = {m, size, importers: indeg.get(m)};
        }
        cut.add(best.m);
        biggest = cycles(graph, skip)[0];
        console.log(`  imported from the app root only: ${best.m} (${best.importers} importers inside the cycle) -> largest cycle ${best.size}`);
      }
      if(graph === full) {
        const before = reachSummary(graph, testReach(graph, tests));
        const after = reachSummary(graph, testReach(graph, tests, skip));
        console.log(`  now: ${formatReach(before)}\n  after: ${formatReach(after)}`);
      }
    }
  },

  async edges() {
    const steps = +(args[0] || 20);
    const {tests, graph} = await testGraph();
    const removed = new Set();
    const skip = (u, v) => removed.has(u + '\0' + v);
    console.log('now: ' + formatReach(reachSummary(graph, testReach(graph, tests))));
    let big = cycles(graph, skip)[0];
    console.log(`largest cycle: ${big.length} modules`);
    for(let step = 1; step <= steps && big.length > 30; ++step) {
      const inBig = new Set(big);
      const indeg = new Map();
      for(const u of big) for(const {to} of graph.get(u)) if(inBig.has(to) && !skip(u, to)) indeg.set(to, (indeg.get(to) || 0) + 1);
      const hubs = new Set([...indeg].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([m]) => m));
      let best;
      for(const u of big) for(const {to: v} of graph.get(u)) {
        if(!hubs.has(v) || skip(u, v)) continue;
        removed.add(u + '\0' + v);
        const size = cycles(graph, skip)[0].length;
        removed.delete(u + '\0' + v);
        if(!best || size < best.size) best = {u, v, size};
      }
      removed.add(best.u + '\0' + best.v);
      big = cycles(graph, skip)[0];
      console.log(`${pad(step, 2)}. ${best.u}\n      -> ${best.v}   (largest cycle now ${big.length})`);
    }
    console.log('after: ' + formatReach(reachSummary(graph, testReach(graph, tests, skip))));
  },

  async check() {
    const update = args.includes('--update');
    const allowIncrease = args.includes('--allow-increase');
    const current = await measure();
    const budget = fs.existsSync(BUDGET_PATH) ? readBudget() : {};
    const over = Object.keys(current).filter((k) => budget[k] !== undefined && current[k] > budget[k]);
    for(const k of Object.keys(current)) console.log(`${k.padEnd(18)} ${pad(current[k], 5)}  (budget ${budget[k] ?? '-'})`);
    if(update && (!over.length || allowIncrease)) {
      // a ratchet: only ever lowered, unless asked for in so many words
      const next = Object.fromEntries(Object.keys(current).map((k) => [k, allowIncrease ? current[k] : Math.min(current[k], budget[k] ?? Infinity)]));
      fs.writeFileSync(BUDGET_PATH, JSON.stringify(next, null, 2) + '\n');
      console.log(`written to ${BUDGET_PATH}`);
    } else if(over.length) {
      console.log(`\ngrew past the budget: ${over.join(', ')}. Find what did it with \`hmr\`, \`why\`, \`hazards\` and \`cycle\`` +
        ' (a growth on purpose: check --update --allow-increase).');
      process.exitCode = 1;
    }
  }
};

/**
 * The numbers the ratchet holds down: the largest import cycle (with and without dynamic imports), the page modules
 * whose edit reloads the page, those whose hot update makes a second instance of a stateful module, and the worker
 * modules that mention import.meta.hot (any would pull Vite's client into a worker).
 */
export async function measure() {
  const [{graph}, h] = await Promise.all([testGraph(), hmrGraph()]);
  const page = h.files.filter((f) => isAppModule(f) && !h.workerSide.has(f));
  const reload = reloading(h, {roots: [PAGE_ENTRY]});
  const dirty = dirtyUpdates(h);
  const inWorkers = new Set(h.workers.flatMap((w) => [...closure(h.graph, w)]));
  return {
    largestCycle: cycles(graph)[0].length,
    largestStaticCycle: cycles(staticOnly(graph))[0].length,
    reloadPage: page.filter((f) => reload.has(f)).length,
    dirtyPage: page.filter((f) => !reload.has(f) && dirty.has(f)).length,
    hotInWorkers: [...inWorkers].filter((f) => isAppModule(f) && fs.readFileSync(f, 'utf8').includes('import.meta.hot')).length
  };
}

export const readBudget = () => JSON.parse(fs.readFileSync(BUDGET_PATH, 'utf8'));

const command = commands[process.argv[2]];
if(command) {
  await command();
} else if(process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 10).map((l) => l.slice(3)).join('\n'));
  process.exitCode = 1;
}
