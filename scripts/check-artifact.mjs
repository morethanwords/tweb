import ts from 'typescript-browser';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {readdir, readFile, writeFile, lstat, mkdir} from 'node:fs/promises';
import {resolve, relative, join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const BUDGETS = Object.freeze({javascript: 250 * 1024, lazyCode: 4 * 1024 * 1024, css: 100 * 1024, total: 5 * 1024 * 1024});
const allowedVendor = new Set(['src/vendor/solid/dist/solid.js', 'src/vendor/solid/web/dist/web.js', 'src/vendor/solid/store/dist/store.js']);
const codePackages = new Set(['@codemirror/state', '@codemirror/view', '@codemirror/commands', '@codemirror/lang-javascript', '@codemirror/lint', '@codemirror/language', '@codemirror/autocomplete', '@marijn/find-cluster-break', '@lezer/common', '@lezer/highlight', '@lezer/lr', '@lezer/javascript', 'style-mod', 'w3c-keyname', 'crelt', 'typescript-browser', 'typescript', 'quickjs-emscripten-core', '@jitl/quickjs-wasmfile-release-sync', '@jitl/quickjs-ffi-types']);
export function allowedModule(id, code = false) {
  const clean = id.split('?')[0];
  if(code && clean.includes('node_modules/')) {
    const file = clean.slice(clean.lastIndexOf('node_modules/') + 13);
    const name = file.startsWith('@') ? file.split('/').slice(0, 2).join('/') : file.split('/')[0];
    return codePackages.has(name);
  }
  return clean === 'index.html' || clean.startsWith('src/shell/') || allowedVendor.has(clean)
    || code && clean === '__vite-browser-external' || clean === '\0rolldown/runtime.js' || clean === '\0vite/preload-helper.js' || code && (clean.startsWith('\0') && clean.includes('commonjs'));
}
export function validateAssetReferences(path, body, paths) {
  const references = [];
  if (path.endsWith('.css')) {
    for (const match of body.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) references.push(match[1] ?? match[2] ?? match[3]);
    for (const match of body.matchAll(/@import\s+["']([^"']+)["']/gi)) references.push(match[1]);
  }
  if (path.endsWith('.html')) {
    for (const match of body.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) references.push(match[1]);
    if (/<script\b(?![^>]*\bsrc\s*=)[^>]*>/i.test(body) || /\son[a-z]+\s*=/i.test(body)) throw new Error('Inline executable HTML in ' + path);
  }
  for (const reference of references) {
    const value = reference.trim();
    if (value.startsWith('#')) continue;
    if (!value || value.includes('\\')) throw new Error('Unresolved asset reference in ' + path);
    const url = new URL(value, 'https://artifact.invalid' + path);
    if (url.origin !== 'https://artifact.invalid' || !paths.has(url.pathname)) throw new Error('Unlisted asset reference in ' + path + ': ' + value);
  }
}
/** Parse executable syntax, excluding compiler diagnostic strings and comments. */
export function validateJavaScript(path, body, paths, workers, ownsAdapter) {
  const source = ts.createSourceFile(path, body, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const localReference = text => {
    const url = new URL(text, 'https://artifact.invalid' + path);
    if(url.origin !== 'https://artifact.invalid' || url.search || url.hash || !paths.has(url.pathname)) throw new Error('Unlisted JavaScript import in ' + path + ': ' + text);
    return url.pathname;
  };
  let factories = 0;
  const moduleReference = text => {
    if(workers.includes(localReference(text))) throw new Error('Worker entry imported as a module in ' + path);
  };
  function visit(node) {
    if(ts.isImportDeclaration(node) || ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if(!ts.isStringLiteralLike(node.moduleSpecifier)) throw new Error('Nonliteral module source.');
      moduleReference(node.moduleSpecifier.text);
    }
    if(ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      if(node.arguments.length !== 1 || !ts.isStringLiteralLike(node.arguments[0])) throw new Error('Dynamic module source in ' + path);
      moduleReference(node.arguments[0].text);
    }
    if(ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Worker') {
      const argument = node.arguments?.[0];
      if(!ownsAdapter || ++factories !== 1 || !argument || !ts.isNewExpression(argument) || !ts.isIdentifier(argument.expression) || argument.expression.text !== 'URL' || !argument.arguments?.length || !ts.isStringLiteralLike(argument.arguments[0]) || !workers.includes(localReference(argument.arguments[0].text))) throw new Error('Unauthorized worker source in ' + path);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
export async function createManifest(directory, manifestPath, {checkModules = true, companion = false} = {}) {
  const base = resolve(directory);
  const evidence = companion ? 'semantic-artifacts' : 'artifacts';
  const files = [];
  const textAssets = [];
  const javascriptAssets = [];
  const graphs = checkModules ? [...JSON.parse(await readFile(`${evidence}/chunks.json`, 'utf8')), ...JSON.parse(await readFile(`${evidence}/worker-chunks.json`, 'utf8'))] : [];
  const byPath = new Map(graphs.map(chunk => [chunk.file, chunk]));
  const initial = new Set();
  function include(file) {if(initial.has(file)) return; initial.add(file); for(const dependency of byPath.get(file)?.imports ?? []) include(dependency);}
  for(const chunk of graphs) if(chunk.entry && chunk.facade === (companion ? 'companion.html' : 'index.html')) include(chunk.file);
  const workers = graphs.filter(chunk => chunk.entry && chunk.facade === 'src/shell/code/worker.ts').map(chunk => chunk.file);
  const workerFiles = new Set();
  function includeWorker(file) {if(workerFiles.has(file)) return; workerFiles.add(file); const chunk = byPath.get(file); for(const dependency of [...chunk?.imports ?? [], ...chunk?.dynamicImports ?? []]) includeWorker(dependency);}
  workers.forEach(includeWorker);
  if(checkModules && (workers.length !== 1 || !initial.size)) throw new Error('Expected one isolated code worker and one application entry.');
  async function walk(dir) {
    for (const name of (await readdir(dir)).sort()) {
      const file = join(dir, name);
      const info = await lstat(file);
      if (info.isSymbolicLink()) throw new Error('Symlinks are forbidden in artifacts.');
      if (info.isDirectory()) { await walk(file); continue; }
      const key = relative(base, file).split('\\').join('/');
      if (!/^(?:index\.html|(?:assets\/)?[A-Za-z0-9_./-]+\.(?:html|js|css|woff2|svg))$/.test(key) || key.endsWith('.map')) throw new Error('Unexpected artifact: ' + key);
      const bytes = await readFile(file);
      const body = bytes.toString('utf8');
      const chunk = byPath.get('/' + key);
      const codeWorker = workerFiles.has('/' + key);
      // Trusted compiler/QuickJS modules contain host feature probes and diagnostic text.
      // Their graph is separately constrained; worker guards and CSP catch attempted capabilities.
      if (/\.(?:js|html)$/.test(key) && !codeWorker && !companion && /(?:api\.telegram\.org|web\.telegram\.org|telegram\.org\/|indexedDB|localStorage|sessionStorage|serviceWorker|RTCPeerConnection|XMLHttpRequest|\bfetch\s*\(|new\s+(?:SharedWorker|WebSocket|EventSource)|sendBeacon|document\.cookie|navigator\.(?:mediaDevices|storage|geolocation))/.test(body)) throw new Error('Forbidden browser capability in ' + key);
      if(key.endsWith('.js') && /new\s+Worker\s*\(/.test(body) && (!chunk?.modules.includes('src/shell/code/adapter.ts') || (body.match(/new\s+Worker\s*\(/g) ?? []).length !== 1)) throw new Error('Unauthorized worker factory in ' + key);
      if (key.endsWith('.css') && /url\(\s*['"]?(?:https?:|data:|blob:|\/\/)/i.test(body)) throw new Error('Non-local CSS asset in ' + key);
      if(key.endsWith('.js') && !chunk && checkModules) throw new Error('Missing module ownership for ' + key);
      if(key.endsWith('.js')) javascriptAssets.push({path: '/' + key, body, ownsAdapter: !!chunk?.modules.includes('src/shell/code/adapter.ts')});
      if (/\.(?:css|html)$/.test(key)) textAssets.push({path: '/' + key, body});
      files.push({path: '/' + key, bytes: bytes.length, gzip: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex')});
    }
  }
  await walk(base);
  if (!files.some(file => file.path === '/index.html')) throw new Error('Missing index.html.');
  const paths = new Set(files.map(file => file.path));
  for(const asset of javascriptAssets) validateJavaScript(asset.path, asset.body, paths, workers, asset.ownsAdapter);
  for (const asset of textAssets) validateAssetReferences(asset.path, asset.body, paths);
  let modules = [];
  if (checkModules) {
    modules = JSON.parse(await readFile(`${evidence}/modules.json`, 'utf8'));
    const workerModules = JSON.parse(await readFile(`${evidence}/worker-modules.json`, 'utf8'));
    const unexpected = [...modules, ...workerModules].filter(id => !(companion && id === 'companion.html') && !allowedModule(id, true));
    if (unexpected.length) throw new Error('Non-shell runtime modules: ' + unexpected.join(', '));
    if(companion) for(const id of modules) {
      if(!id.startsWith('src/shell/') || id.includes('?') || id === 'src/shell/companion-bridge.ts' || id.startsWith('src/shell/code/')) continue;
      const source = await readFile(id, 'utf8');
      if(/\bfetch\s*\(|new\s+(?:WebSocket|EventSource)|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie/.test(source)) throw new Error('Unauthorized companion capability in ' + id);
    }
    const workerSource = new Set(['worker.ts', 'worker-guard.ts', 'contracts.ts', 'compiler.ts', 'sandbox.ts', 'generated/wasm.ts', 'generated/standard-library.ts', 'generated/quickjs-loader.js'].map(file => 'src/shell/code/' + file));
    for(const chunk of graphs) {
      for(const dependency of [...chunk.imports, ...chunk.dynamicImports]) if(!paths.has(dependency)) throw new Error('Unlisted module import: ' + dependency);
      if([...chunk.imports, ...chunk.dynamicImports].some(dependency => workers.includes(dependency))) throw new Error('Worker entry imported as a module by ' + chunk.file);
      if(initial.has(chunk.file) && chunk.modules.some(id => id.includes('node_modules/'))) throw new Error('Code tooling leaked into initial bundle.');
      if(chunk.modules.includes('__vite-browser-external') && !(workerFiles.has(chunk.file) && chunk.facade === 'src/shell/code/compiler.ts')) throw new Error('Node shim outside compiler.');
      if(!workerFiles.has(chunk.file) && chunk.modules.some(id => /node_modules\/(?:typescript(?:-browser)?|quickjs-emscripten-core|@jitl)\//.test(id) || /src\/shell\/code\/(?:compiler|sandbox|worker|generated)/.test(id))) throw new Error('Compiler or executor escaped dedicated worker.');
      if(workerFiles.has(chunk.file) && chunk.modules.some(id => id.startsWith('src/shell/') && !workerSource.has(id) && id !== 'src/shell/core/types.ts')) throw new Error('Application code leaked into worker.');
    }
    for (const file of ['src/vendor/solid/dist/solid.js', 'src/vendor/solid/web/dist/web.js']) if (modules.filter(id => id === file).length !== 1) throw new Error('Expected exactly one vendored browser runtime: ' + file);
  }
  const gzip = {
    javascript: files.filter(file => file.path.endsWith('.js') && (!checkModules || initial.has(file.path))).reduce((sum, file) => sum + file.gzip, 0),
    lazyCode: files.filter(file => file.path.endsWith('.js') && checkModules && !initial.has(file.path)).reduce((sum, file) => sum + file.gzip, 0),
    css: files.filter(file => file.path.endsWith('.css')).reduce((sum, file) => sum + file.gzip, 0),
    total: files.reduce((sum, file) => sum + file.gzip, 0)
  };
  if (checkModules) for (const [name, limit] of Object.entries(BUDGETS)) if (gzip[name] > limit) throw new Error(name + ' gzip budget exceeded: ' + gzip[name] + ' > ' + limit);
  const manifest = {schemaVersion: 1, files, modules, workers, workerFiles: [...workerFiles], chunks: graphs, gzip, budgets: BUDGETS};
  await mkdir(resolve(manifestPath, '..'), {recursive: true});
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = await createManifest('dist', 'artifacts/build-manifest.json');
  console.log('Artifact verified:', manifest.files.length, 'files;', JSON.stringify(manifest.gzip), 'gzip bytes.');
}
