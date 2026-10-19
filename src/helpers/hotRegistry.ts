/**
 * Dev only: what keeps a module's previous evaluation and its next one together when a hot update runs the module
 * again. scripts/hot-reload-plugin.mjs adds the calls to every app module the dev server serves — nothing in the
 * sources calls them — so that what live code holds of the previous evaluation is never left behind by accident:
 *
 * - keepValue: a top-level value that is state — a store, a map, an instance, a symbol, a `let` (as a cell) — is made
 *   once per page; every later evaluation gets the first one. Its code changed (or what it was made from): reload.
 * - keepClasses: every top-level class. The first evaluation's class stays the one the instances, `instanceof` and
 *   other modules hold; a later evaluation copies its methods onto it. What a live instance cannot take reloads.
 * - keepExports: a module that accepts its own updates keeps its importers on its first evaluation's exports: one
 *   that changed reloads.
 *
 * Never mentions `import.meta.hot`: worker code imports it too, and Vite's client cannot run in a worker (a worker never
 * takes a hot update, so there it only ever sees first evaluations). Its state lives on `globalThis`, so an evaluation of
 * this module after an edit of it finds the same.
 */

type Values = () => Record<string, unknown>;
type MethodsInfo = Record<string, Record<string, [hash: string, deps: string[]]>>;
// what was made with code that read classes: `versions`, the static-code versions of those classes when it last ran
// (classVersion); `url` and `reason`, the reload an edit of their static methods asks for (recordVersions)
type Holder = {versions?: Record<string, number>, url?: string, reason?: (name: string) => string};
type Entry = {source: string, deps?: Values, value: unknown} & Holder;
// what the latest evaluation's code put on the prototype and on the class itself (statics)
// and what the transform says of its static methods: the hash of their code and of the module functions they reach, and
// the names of what else they read
// and the markup its parts make through Solid's templates (keepClasses' `markup`)
type ClassEntry = {
  members: (string | symbol)[],
  statics: (string | symbol)[],
  staticCode?: [hash: string, deps: string[]],
  markup?: Record<string, string>
};
type ModuleState = {
  values: Map<string, Entry>,
  classes: Map<string, Function>,
  classEntries: WeakMap<Function, ClassEntry>,
  held?: {sources: Record<string, string>, deps?: Values} & Holder,
  // per class and method: the hash of the module's functions it reaches and the names of what else it reads, and what
  // reads those - for a method a live instance holds a copy of, which keeps the evaluation it was made in
  methods?: {info: MethodsInfo} & Holder,
  // what the classes' methods and static methods read of the module, by name
  classValues?: Values,
  namespaces?: string[],
  // how many times the module has run, and the top-level statements that act on what it keeps (keepStatement)
  evaluations: number,
  statements: Map<string, Entry>,
  statementCount?: number,
  // this evaluation has asked for a reload (reloadPage)
  reloadAsked?: boolean,
  // its dynamic imports by specifier, as its latest evaluation names them (keepImports)
  imports?: Record<string, () => Promise<unknown>>,
  exports?: () => Record<string, unknown>
};
// an exported function, as the module that made it describes it: the hash of its code and of the module's functions
// it calls, and the names of what else it reads (imports, the module's tables) — `values` reads them
type FunctionInfo = {hash: string, deps: string[], values?: Values};
// every evaluation of a class: the first held for good (everything holds it), the later ones only while something does
// (an instance a module that ran again made of one) — an evaluation nothing holds any more is not patched again
// `version`: how many times an edit changed the code of the family's own static methods; `readers`: what was made with
// them, under the name it read the class by
type Family = {first: Function, later: WeakRef<Function>[], version: number, readers?: Map<Holder, string>};
type Registry = {
  modules: Map<string, ModuleState>,
  functions: WeakMap<Function, FunctionInfo>,
  // the methods a class calls as it makes an instance (from its constructor or field initializers)
  construction: WeakMap<Function, string[]>,
  // what a class's own code puts on its prototype (as registered, and as the latest evaluation patched in): not what
  // other code adds at runtime (a getter installed as the first instance is made)
  authored: WeakMap<Function, Set<string | symbol>>,
  // every evaluation of a class, so that `instanceof` with any of them takes the instances of the others
  families: WeakMap<Function, Family>,
  // the registered classes that extend a class (by each evaluation they extended): a subclass may hold an inherited
  // method as a value
  subclasses: WeakMap<Function, WeakRef<Function>[]>,
  // the accessors shareStaticState puts on a later class: they lead to the first class, never to be copied back onto it
  sharedStateGetters: WeakSet<Function>,
  ids: WeakMap<object, number>,
  nextId: number,
  reloadRequested: boolean,
  // the tests' stand-in for the reload
  onReload?: (path: string, reason: string) => void
};

const REGISTRY_KEY = Symbol.for('tweb.hotRegistry');
const registry: Registry = (globalThis as any)[REGISTRY_KEY] ??= {
  modules: new Map(),
  functions: new WeakMap(),
  construction: new WeakMap(),
  authored: new WeakMap(),
  families: new WeakMap(),
  subclasses: new WeakMap(),
  sharedStateGetters: new WeakSet(),
  ids: new WeakMap(),
  nextId: 0,
  reloadRequested: false
} satisfies Registry;

// the module's URL without the stamp (?t=) Vite gives it for each evaluation after an edit
function moduleKey(url: string) {
  try {
    const parsed = new URL(url, 'http://localhost');
    parsed.searchParams.delete('t');
    return parsed.pathname + parsed.search;
  } catch{
    return url.replace(/[?&]t=\d+/, '');
  }
}

// an AudioWorklet's realm, which loads modules too, has neither timers nor queueMicrotask
function later(callback: () => void) {
  Promise.resolve().then(callback);
}

function retryLater(callback: () => void) {
  if(typeof(setTimeout) === 'function') setTimeout(callback, 50);
  else later(callback);
}

function moduleOf(url: string) {
  const key = moduleKey(url);
  let module = registry.modules.get(key);
  if(!module) registry.modules.set(key, module = {values: new Map(), classes: new Map(), classEntries: new WeakMap(), evaluations: 0, statements: new Map()});
  return module;
}

// how the page asks the dev server for the reload, which @helpers/hotModule hands over through `globalThis`: this module
// must not mention `import.meta.hot` nor import Vite's client — worker code imports it, and the client cannot run there
const RELOAD_SENDER_KEY = Symbol.for('tweb.hotReloadSender');

/**
 * Reloads the page, for an edit the live page cannot take. Not `hot.invalidate()`: Vite answers that by running the
 * module's importers again, which then make new instances beside the live ones. The dev server's tweb-hot-reload
 * plugin reloads every page it serves and logs "page reload <path> (<reason>)"; a page that has not loaded
 * @helpers/hotModule yet reloads itself.
 */
export function reloadPage(url: string, reason: string) {
  const path = moduleKey(url);
  // an evaluation asks once: what it leaves undone after asking (the classes past one that cannot be patched) is the
  // reload's, not a reason of its own
  const module = registry.modules.get(path);
  if(module) {
    if(module.reloadAsked) return;
    module.reloadAsked = true;
  }

  if(registry.onReload) {
    registry.onReload(path, reason);
    return;
  }

  // a worker never takes a hot update
  if(typeof(window) === 'undefined' || registry.reloadRequested) return;
  registry.reloadRequested = true;
  console.warn(`[hot] page reload ${path} (${reason})`);
  const send: (path: string, reason: string) => void = (globalThis as any)[RELOAD_SENDER_KEY];
  if(send) send(path, reason);
  else location.reload();
}

/** Tests only: what a reload would do instead (undefined puts the reload back) */
export function setReloadHandler(handler: Registry['onReload']) {
  registry.onReload = handler;
}

// ---------------------------------------------------------------------------------------------------------------------
// fingerprints

// without the stamps Vite puts on the URLs of dynamic imports, which differ from one evaluation to the next
export function sourceOf(fn: Function) {
  return Function.prototype.toString.call(fn).replace(/[?&]t=\d+/g, '');
}

function idOf(value: object | symbol) {
  // a symbol cannot be a WeakMap key everywhere yet: by description (a kept one is the same symbol anyway)
  if(typeof(value) === 'symbol') return 'symbol:' + String(value.description);
  let id = registry.ids.get(value);
  if(id === undefined) registry.ids.set(value, id = ++registry.nextId);
  return id;
}

const isPlainObject = (value: object) => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

// how far a fingerprint looks into one structure before it settles for its size
const MAX_NODES = 100000;

// a short stable hash of a string (cyrb53), to keep fingerprints small however much they stand for
function hashString(text: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for(let i = 0; i < text.length; ++i) {
    const char = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// one comparison: what it has fingerprinted already (the same object always gives the same answer within it)
type Walk = {seen: Set<object>, memo: Map<Function, string>, data: Map<object, string>};
const newWalk = (): Walk => ({seen: new Set(), memo: new Map(), data: new Map()});

/**
 * What tells two evaluations' versions of a value apart: a function by its code — an exported one by the hash its
 * module registered (keepFunctions), with the code of every registered function it reaches and what they read — a
 * class by its family (the patched class and the later ones it joined are one), anything that is not data (an
 * instance, an element) by identity, data — arrays, plain objects, maps, sets — by content, read once per comparison
 * (kept state is the same object on both sides, and gives the same answer).
 */
export function fingerprint(value: unknown, walk: Walk = newWalk(), budget?: {nodes: number}): string {
  switch(typeof(value)) {
    case 'function': {
      const family = registry.families.get(value);
      if(family) return 'class:' + idOf(family.first);
      return functionFingerprint(value, walk);
    }
    case 'symbol': return 'symbol:' + idOf(value);
    case 'object': break;
    case 'bigint': return 'bigint:' + value;
    default: return typeof(value) + ':' + String(value);
  }

  if(value === null) return 'null';
  const object = value as object;
  // values a literal makes anew every evaluation: by what they say
  if(object instanceof RegExp) return 'regexp:' + String(object);
  if(object instanceof Date) return 'date:' + object.getTime();
  const plain = Array.isArray(object) || object instanceof Map || object instanceof Set || isPlainObject(object);
  if(!plain) return 'object:' + idOf(object);
  // a structure inside another one is part of it; one of its own gets a budget of its own and is read once
  const top = !budget;
  if(top) {
    const known = walk.data.get(object);
    if(known !== undefined) return known;
    budget = {nodes: MAX_NODES};
  }
  if(walk.seen.has(object)) return 'cycle';
  // too big to read through: its size stands for it (not its identity, which a table made again does not keep)
  if(--budget.nodes < 0) return 'big:' + (object instanceof Map || object instanceof Set ? object.size : Reflect.ownKeys(object).length);
  walk.seen.add(object);
  let out: string;
  if(Array.isArray(object)) {
    out = '[' + object.map((item) => fingerprint(item, walk, budget)).join(',') + ']';
  } else if(object instanceof Map) {
    out = 'Map{' + [...object].map(([key, item]) => fingerprint(key, walk, budget) + '=>' + fingerprint(item, walk, budget)).join(',') + '}';
  } else if(object instanceof Set) {
    out = 'Set{' + [...object].map((item) => fingerprint(item, walk, budget)).join(',') + '}';
  } else {
    out = '{' + Reflect.ownKeys(object).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(object, key);
      const item = 'value' in descriptor ? fingerprint(descriptor.value, walk, budget) : 'get:' + sourceOf(descriptor.get ?? descriptor.set);
      return String(key) + ':' + item;
    }).join(',') + '}';
  }

  walk.seen.delete(object);
  const result = 'data#' + hashString(out);
  if(top) walk.data.set(object, result);
  return result;
}

/**
 * A registered function: the set of what it reaches — the code of every registered function it calls, however deep
 * and across modules, and everything else they read (by fingerprint). A set, so that neither the order the graph is
 * walked in nor its cycles change it.
 */
function functionFingerprint(fn: Function, walk: Walk): string {
  if(!registry.functions.has(fn)) return 'fn:' + hashString(sourceOf(fn));
  const known = walk.memo.get(fn);
  if(known !== undefined) return known;
  const parts = new Set<string>();
  const reached = new Set<Function>([fn]);
  const stack = [fn];
  while(stack.length) {
    const info = registry.functions.get(stack.pop());
    parts.add('code:' + info.hash);
    let values: Record<string, unknown> = {};
    try {
      values = info.values?.() ?? {};
    } catch{}
    // every edge by the name the function reads it under: two imports swapped reach the same functions
    for(const name of info.deps) {
      const value = values[name];
      if(typeof(value) === 'function' && registry.functions.has(value) && !registry.families.has(value)) {
        parts.add(info.hash + ':' + name + '->' + registry.functions.get(value).hash);
        if(!reached.has(value)) {
          reached.add(value);
          stack.push(value);
        }
      } else {
        parts.add(info.hash + ':' + name + '=' + fingerprint(value, walk));
      }
    }
  }

  const out = 'fn#' + hashString([...parts].sort().join('\n'));
  walk.memo.set(fn, out);
  return out;
}

/**
 * Compares what the previous evaluation and this one read (imported functions and data, by name) once this one has
 * run: a thunk may name an import that, in an import cycle, is not initialized yet while the module runs. `reason`
 * gets the name that differs.
 */
function compareLater(url: string, previous: Values, next: Values, reason: (name: string) => string, holder?: Holder) {
  const run = (attempt: number) => {
    let before: Record<string, unknown>, after: Record<string, unknown>;
    try {
      before = previous();
      after = next();
    } catch(err) {
      // still in the temporal dead zone of a module that has not run yet
      if(err instanceof ReferenceError && attempt < 20) retryLater(() => run(attempt + 1));
      return;
    }

    const walk = newWalk();
    for(const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if(fingerprint(before[name], walk) !== fingerprint(after[name], walk)) {
        reloadPage(url, reason(name));
        return;
      }
    }

    // a class is the same family either way — and its static methods, patched in place, are the new ones on both
    // sides by now: whether they changed since this last ran is in the version it saw then. `next` may read part of
    // what the holder saw (the methods a live instance holds): the rest stays at its version
    if(holder) {
      for(const name in after) {
        if(holder.versions && name in holder.versions && classVersion(after[name]) !== holder.versions[name]) {
          reloadPage(url, reason(name) + ' (its static methods)');
          return;
        }
      }
      recordVersions(holder, after);
    }
  };

  later(() => run(0));
}

// how many edits have changed a registered class's own static methods
function classVersion(value: unknown) {
  if(typeof(value) !== 'function' || !registry.authored.has(value)) return;
  return registry.families.get(value)?.version ?? 0;
}

/**
 * What the classes a holder read are at now, and the holder among each one's readers: an edit of a class's static
 * methods reloads for what was made with the previous ones at once (keepClasses), since the module that made it may not
 * run again — an update a self-accepting module takes stops there
 */
function recordVersions(holder: Holder, values: Record<string, unknown>) {
  const versions = holder.versions = {...holder.versions};
  for(const name in values) {
    const value = values[name];
    if(classVersion(value) === undefined) continue;
    const family = familyFor(value as Function);
    versions[name] = family.version;
    (family.readers ??= new Map()).set(holder, name);
  }
}

// what the classes a thunk reads are at, once the module has run (a cycle's import may not be initialized before)
function snapshotLater(holder: Holder, deps: Values) {
  const run = (attempt: number) => {
    try {
      recordVersions(holder, deps());
    } catch(err) {
      if(err instanceof ReferenceError && attempt < 20) retryLater(() => run(attempt + 1));
    }
  };

  later(() => run(0));
}

// ---------------------------------------------------------------------------------------------------------------------
// functions

/**
 * A module's exported functions, for the fingerprint of what another module holds of them: `infos[name]` is the hash
 * of the function's code and of the module's functions it calls, and the names of what else it reads, which `values`
 * reads. So a held imported function that calls a helper the edit changed — in its module or in one it imports — is a
 * changed function.
 */
export function keepFunctions(
  url: string,
  functions: () => Record<string, Function>,
  infos: Record<string, [hash: string, deps: string[]]>,
  values?: Values
) {
  const register = () => {
    const list = functions();
    for(const name in list) {
      if(typeof(list[name]) === 'function') registry.functions.set(list[name], {hash: infos[name][0], deps: infos[name][1], values});
    }
  };

  try {
    register();
  } catch(err) {
    // an export a cycle has not initialized yet
    if(err instanceof ReferenceError) later(() => {
      try {
        register();
      } catch{}
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// namespaces

/**
 * A module with a TypeScript namespace that holds state (a `let`, a store) its code fills: the namespace is an object
 * every evaluation makes anew and fills again, which cannot be kept without keeping its code too. Running such a
 * module again would split that state between the old code and the new: the page reloads.
 */
export function keepNamespaces(url: string, names: string[]) {
  const module = moduleOf(url);
  if(module.namespaces) {
    reloadPage(url, `namespace ${names.join(', ')}: its state cannot be kept, and live code holds the previous one`);
    return;
  }

  module.namespaces = names;
}

// ---------------------------------------------------------------------------------------------------------------------
// evaluations and statements

/** Called first thing in a module (the transform's prelude): which run of the module this is, 0 for the first */
export function beginEvaluation(url: string) {
  const module = moduleOf(url);
  module.reloadAsked = false;
  return module.evaluations++;
}

/**
 * A top-level statement that acts on what the module keeps — calls a method of it, assigns to it
 * (`promise.resolve()`, `element.classList.add(...)`, `cell = ...`): it made part of that state, so it runs once per
 * page, like the state's own initializer. Run again, it would act twice on the kept state (resolve a promise the old
 * code still waits on, add a second listener). Its code or what it reads changed, or a run of the module brings a new
 * one: the kept state was made without it, and the page reloads.
 */
export function keepStatement(url: string, key: string, run: () => void, source: string, deps?: Values) {
  const module = moduleOf(url);
  const reason = (name: string) => `${key}: ${name}, which it acts with, changed`;
  const entry = module.statements.get(key);
  if(!entry) {
    // the module has run before without it: what it would act on is already made
    if(module.evaluations > 1) {
      reloadPage(url, `${key}: a statement acting on kept state is new, and the state was made without it`);
      return;
    }

    const added: Entry = {source, deps, value: undefined, url, reason};
    module.statements.set(key, added);
    if(deps) snapshotLater(added, deps);
    run();
    return;
  }

  if(entry.source !== source) {
    reloadPage(url, `${key}: a statement acting on kept state changed`);
  } else if(entry.deps && deps) {
    compareLater(url, entry.deps, deps, reason, entry);
    entry.deps = deps;
  }
}

/**
 * A module's dynamic imports, registered by every run of it: code an earlier run made — kept state, a field's arrow
 * function, a held method, a listener — would import by that run's URLs, which Vite stamped before an edit, and get the
 * module as it was then (a kept tab's `getComponentModule`, its old code for good). Every import calls `latestImport`
 * by its specifier instead. One an edit removed stays, for the code that still names it.
 */
export function keepImports(url: string, imports: Record<string, () => Promise<unknown>>) {
  const module = moduleOf(url);
  module.imports = {...module.imports, ...imports};
}

export function latestImport(url: string, specifier: string) {
  return moduleOf(url).imports[specifier]();
}

/** After a run of the module: a statement acting on kept state that the edit removed left its effect on that state */
export function endStatements(url: string, count: number) {
  const module = moduleOf(url);
  if(module.statementCount !== undefined && count < module.statementCount) {
    reloadPage(url, 'a statement acting on kept state was removed, and its effect is in the state');
    return;
  }

  module.statementCount = count;
}

// ---------------------------------------------------------------------------------------------------------------------
// values

/**
 * A top-level value that is state, made once per page. `source` stands for the code that makes it (the plugin hashes
 * its initializer and the module's functions it calls); `deps` reads what else it is made from — imported functions and
 * data, the module's own tables. A later evaluation gets the first value, unless its code or what it was made from
 * changed: then the value on the page is the old code's, and the page reloads.
 */
export function keepValue<T>(url: string, key: string, create: () => T, source: string, deps?: Values): T {
  const module = moduleOf(url);
  const reason = (name: string) => `${key}: ${name}, which it was made with, changed`;
  const entry = module.values.get(key);
  if(!entry) {
    const value = create();
    const added: Entry = {source, deps, value, url, reason};
    module.values.set(key, added);
    if(deps) snapshotLater(added, deps);
    return value;
  }

  if(entry.source !== source) {
    reloadPage(url, `${key}: the code that made it changed`);
  } else if(entry.deps && deps) {
    compareLater(url, entry.deps, deps, reason, entry);
    entry.deps = deps;
  }

  return entry.value as T;
}

// ---------------------------------------------------------------------------------------------------------------------
// classes

const isComment = (source: string, i: number) => source[i] === '/' && (source[i + 1] === '/' || source[i + 1] === '*');

// after these a `/` starts a regular expression; after anything else (a name, a number, `)`, `]`) it divides
const REG_EXP_AFTER = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const REG_EXP_AFTER_WORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case',
  'do', 'else', 'yield', 'await']);

function startsRegExp(source: string, i: number) {
  let j = i - 1;
  while(j >= 0 && /\s/.test(source[j])) --j;
  if(j < 0 || REG_EXP_AFTER.has(source[j])) return true;
  if(!/[\w$]/.test(source[j])) return false;
  let start = j;
  while(start > 0 && /[\w$]/.test(source[start - 1])) --start;
  return REG_EXP_AFTER_WORDS.has(source.slice(start, j + 1));
}

// past the regular expression that starts at `i`, its flags included: `/` inside a class (`[/]`) or escaped ends nothing
function skipRegExp(source: string, i: number) {
  let inClass = false;
  for(let j = i + 1; j < source.length; ++j) {
    const char = source[j];
    if(char === '\\') ++j;
    else if(char === '\n') return i + 1; // not a regular expression after all
    else if(char === '[') inClass = true;
    else if(char === ']') inClass = false;
    else if(char === '/' && !inClass) {
      while(/[a-z]/i.test(source[j + 1] ?? '')) ++j;
      return j + 1;
    }
  }

  return source.length;
}

/**
 * Where the comment, string, template or regular expression literal that starts at `i` ends (the index past it), or
 * `i` when none starts there: the braces inside them are not code. Vite keeps the comments in what
 * `Function.prototype.toString()` gives. Told apart from a division by the token before the `/`.
 */
function skipLiteral(source: string, i: number): number {
  const char = source[i];
  if(isComment(source, i)) {
    const end = source[i + 1] === '/' ? source.indexOf('\n', i) : source.indexOf('*/', i + 2) + 1;
    return end > 0 ? end + 1 : source.length;
  }

  if(char === '/' && startsRegExp(source, i)) {
    return skipRegExp(source, i);
  }

  if(char === '\'' || char === '"' || char === '`') {
    for(let j = i + 1; j < source.length; ++j) {
      if(source[j] === '\\') ++j;
      else if(source[j] === char) return j + 1;
      else if(char === '`' && source[j] === '$' && source[j + 1] === '{') j = closingBrace(source, j + 1);
    }

    return source.length;
  }

  return i;
}

function closingBrace(source: string, open: number) {
  let depth = 0;
  for(let i = open; i < source.length; ++i) {
    const end = skipLiteral(source, i);
    if(end !== i) {
      i = end - 1;
      continue;
    }

    if(source[i] === '{') ++depth;
    else if(source[i] === '}' && !--depth) return i;
  }
  return source.length;
}

/**
 * What a class does to an instance as it makes it, which a live instance has already been through: the constructor,
 * static blocks and every field initializer (an arrow function in a field included — the instance keeps the one it
 * got). Method bodies are left out: those are what a hot update can swap.
 */
export function classShape(cls: Function) {
  const source = sourceOf(cls);
  const parts: string[] = [];
  let member = '';
  // the braces of a parameter list (a default `{}`, a destructured object) are the member's, not its body
  let parens = 0;
  for(let i = source.indexOf('{') + 1; i < source.length && source[i] !== '}'; ++i) {
    const end = skipLiteral(source, i);
    if(end !== i) {
      // a comment is no part of the member, a string is
      if(!isComment(source, i)) member += source.slice(i, end);
      i = end - 1;
      continue;
    }

    const char = source[i];
    if(char === '(') ++parens;
    else if(char === ')') --parens;

    if(char === '{' && parens > 0) {
      const end = closingBrace(source, i);
      member += source.slice(i, end + 1);
      i = end;
    } else if(char === '{') {
      const end = closingBrace(source, i);
      if(/^\s*(constructor\s*\(|static\s*$|(static\s+)?[\w$#]+\s*=)/.test(member)) parts.push(member.trim() + source.slice(i, end + 1));
      member = '';
      parens = 0;
      i = end;
    } else if(char === ';') {
      if(member.trim()) parts.push(member.trim());
      member = '';
      parens = 0;
    } else {
      member += char;
    }
  }
  return parts.join('\n');
}

// what the element registry takes off the class once, at `customElements.define`
const ELEMENT_CALLBACKS = ['connectedCallback', 'disconnectedCallback', 'adoptedCallback', 'attributeChangedCallback',
  'connectedMoveCallback', 'formAssociatedCallback', 'formResetCallback', 'formDisabledCallback',
  'formStateRestoreCallback'];

const valueOf = (target: object, key: string) => Object.getOwnPropertyDescriptor(target, key)?.value;
const codeOf = (value: unknown) => typeof(value) === 'function' ? sourceOf(value) : value;

/**
 * The methods an edit changed whose old function a live instance holds on to, so copying the new one onto the
 * prototype would not reach it: one the class hands out as a value (`this.onClick.bind(this)`, a listener, a
 * callback in a field), and what a custom element's registration read (its lifecycle callbacks,
 * `observedAttributes`).
 */
// the names a class or a class up its chain reads off `this` without calling them: methods it hands out as values —
// the edited code's and the latest live code's (a binding site the edit removed still made the live instances' copies)
function heldNames(original: Function, next: Function) {
  const names = new Set<string>();
  const family = familyOf(original);
  const sources = new Set<Function>();
  for(const start of [next, family[family.length - 1]]) {
    for(let cls = start; cls && cls !== Function.prototype; cls = Object.getPrototypeOf(cls)) sources.add(cls);
  }
  // and a subclass may hold an inherited one (`this.setValueSilently.bind(this)` in a subclass of the edited class)
  subclassesOf(original).forEach((cls) => sources.add(cls));
  for(const cls of sources) {
    for(const match of codeOnly(sourceOf(cls)).matchAll(/this\.([\w$]+)(?![\w$])(?!\s*(\(|\?\.\())/g)) names.add(match[1]);
  }
  return names;
}

// what `instance[name]` resolves to through the prototype chain, as code: an override added or removed is a change. Of
// a registered class only what its code defines counts
function resolvedCode(prototype: object, name: string) {
  for(let target = prototype; target; target = Object.getPrototypeOf(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if(!descriptor) continue;
    const authored = registry.authored.get(Object.getOwnPropertyDescriptor(target, 'constructor')?.value);
    if(authored && !authored.has(name)) continue;
    if('value' in descriptor) return codeOf(descriptor.value);
    return 'get:' + (descriptor.get ? sourceOf(descriptor.get) : '') + ' set:' + (descriptor.set ? sourceOf(descriptor.set) : '');
  }
}

function heldMethods(previous: Function, next: Function) {
  const held: string[] = [];
  for(const key of heldNames(previous, next)) {
    if(key === 'constructor') continue;
    const before = resolvedCode(previous.prototype, key);
    const after = resolvedCode(next.prototype, key);
    if((typeof(before) === 'string' || typeof(after) === 'string') && before !== after) held.push(key);
  }

  if(typeof(HTMLElement) !== 'undefined' && next.prototype instanceof HTMLElement) {
    for(const key of ELEMENT_CALLBACKS) {
      if(!held.includes(key) && codeOf(valueOf(previous.prototype, key)) !== codeOf(valueOf(next.prototype, key))) held.push(key);
    }

    const observed = (cls: Function) => {
      const descriptor = Object.getOwnPropertyDescriptor(cls, 'observedAttributes');
      return descriptor && (descriptor.get ? sourceOf(descriptor.get) : JSON.stringify(descriptor.value));
    };
    if(observed(previous) !== observed(next)) held.push('observedAttributes');
  }

  return held;
}

// the code with its comments, strings, templates and regular expressions blanked out
function codeOnly(source: string) {
  let out = '';
  for(let i = 0; i < source.length; ++i) {
    const end = skipLiteral(source, i);
    if(end !== i) {
      out += ' ';
      i = end - 1;
    } else {
      out += source[i];
    }
  }
  return out;
}

// a private name (`#x`) belongs to the class that declared it: a method copied from a later evaluation of the class
// cannot read it on an instance the first one made
const usesPrivateNames = (cls: Function) => /(^|[^\w$])#[A-Za-z_$]/.test(codeOnly(sourceOf(cls)));

/**
 * The first class up the chain the edit changed that no evaluation has patched (a class from outside the app — a
 * library's — or one not at a module's top level): the live instances' prototypes still lead to the old one, so neither
 * its methods nor its constructor reach them. An ancestor that only ran again, unchanged, joins the first one instead.
 */
function changedAncestor(original: Function, next: Function): Function {
  let previous = Object.getPrototypeOf(original);
  let current = Object.getPrototypeOf(next);
  while(previous !== current) {
    if(!previous || !current) return current ?? previous;
    if(familyOf(previous).includes(current)) return;
    if(sourceOf(previous) !== sourceOf(current)) return current;
    joinFamily(previous, current);
    previous = Object.getPrototypeOf(previous);
    current = Object.getPrototypeOf(current);
  }
}

// A static value that is not a function — a registry, a flag — is state; a function the module's own code puts on the
// class (a method, `Object.assign(Cls, {getInitArgs})`) and an accessor are code
const isStaticState = (descriptor: PropertyDescriptor) => 'value' in descriptor && typeof(descriptor.value) !== 'function';

function copyMembers(target: object, source: object, skip: Set<string | symbol>, onlyCode?: boolean) {
  for(const key of Reflect.ownKeys(source)) {
    if(skip.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if(onlyCode && isStaticState(descriptor)) continue;
    if(descriptor.get && registry.sharedStateGetters.has(descriptor.get)) continue;
    Object.defineProperty(target, key, descriptor);
  }
}

/**
 * The static state lives on the first class only: a later class reads and writes it there, so code that holds any of
 * them — a patched method closes over the latest — sees the same registry or flag. So does a function other code set on
 * the first class at runtime (a callback given at startup), which the later class's own code does not define.
 */
function shareStaticState(original: Function, next: Function, authoredBefore: (string | symbol)[]) {
  for(const key of Reflect.ownKeys(original)) {
    if(SKIP_STATIC.has(key)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(original, key);
    // what the class's own code no longer defines is gone, not state other code set
    const setAtRuntime = 'value' in descriptor && !Object.prototype.hasOwnProperty.call(next, key) && !authoredBefore.includes(key);
    if(!isStaticState(descriptor) && !setAtRuntime) continue;
    const get = () => (original as any)[key];
    registry.sharedStateGetters.add(get);
    Object.defineProperty(next, key, {
      get,
      set: (value) => (original as any)[key] = value,
      enumerable: true,
      configurable: true
    });
  }
}

const SKIP_PROTOTYPE = new Set<string | symbol>(['constructor']);
const SKIP_STATIC = new Set<string | symbol>(['prototype', 'name', 'length', Symbol.hasInstance]);

const plainHasInstance = Function.prototype[Symbol.hasInstance];
function hasInstanceOfFamily(this: Function, instance: unknown) {
  // `this` is the class on the right of instanceof: a subclass inherits this static and keeps its own answer
  return (registry.families.has(this) ? familyOf(this) : [this]).some((cls) => plainHasInstance.call(cls, instance));
}

// the family's evaluations alive now, the first one first
function familyOf(cls: Function): Function[] {
  const family = registry.families.get(cls);
  if(!family) return [cls];
  const later = family.later.map((ref) => ref.deref()).filter(Boolean);
  if(later.length !== family.later.length) family.later = later.map((each) => new WeakRef(each));
  return [family.first, ...later];
}

function familyFor(cls: Function) {
  let family = registry.families.get(cls);
  if(!family) registry.families.set(cls, family = {first: cls, later: [], version: 0});
  return family;
}

function joinFamily(original: Function, next: Function) {
  const family = familyFor(original);
  if(!familyOf(original).includes(next)) family.later.push(new WeakRef(next));
  registry.families.set(next, family);
  for(const cls of [original, next]) {
    if(!Object.prototype.hasOwnProperty.call(cls, Symbol.hasInstance)) {
      Object.defineProperty(cls, Symbol.hasInstance, {value: hasInstanceOfFamily, configurable: true});
    }
  }
}

// a registered class under every class it extends
function recordSubclass(next: Function) {
  for(let ancestor = Object.getPrototypeOf(next); ancestor && ancestor !== Function.prototype; ancestor = Object.getPrototypeOf(ancestor)) {
    let list = registry.subclasses.get(ancestor);
    if(!list) registry.subclasses.set(ancestor, list = []);
    list.push(new WeakRef(next));
  }
}

// the registered subclasses of every evaluation of a class, alive now
function subclassesOf(cls: Function) {
  const out = new Set<Function>();
  for(const member of familyOf(cls)) {
    const list = registry.subclasses.get(member);
    if(!list) continue;
    const alive = list.map((ref) => ref.deref()).filter(Boolean);
    if(alive.length !== list.length) registry.subclasses.set(member, alive.map((each) => new WeakRef(each)));
    alive.forEach((each) => out.add(each));
  }
  return out;
}

/**
 * An ancestor with private members that is another evaluation's in the new chain than in the live instances' one: a
 * method copied from the edited class would call into it through `super`, and its methods cannot read the live
 * instances' private members (branded for the first evaluation)
 */
function privateAncestor(original: Function, next: Function) {
  let previous = Object.getPrototypeOf(original);
  let current = Object.getPrototypeOf(next);
  while(current && current !== Function.prototype) {
    if(previous !== current && usesPrivateNames(current)) return current;
    previous = previous && Object.getPrototypeOf(previous);
    current = Object.getPrototypeOf(current);
  }
}

/**
 * A method that runs as an instance is made — called by the class's constructor or a field initializer, or by an
 * ancestor's (an override) — whose code changed: the live instances were made by the previous one
 */
// the methods that run as an instance of the class, or of a registered subclass, is made
function constructionNames(original: Function, next: Function) {
  const names = new Set<string>();
  const classes = new Set<Function>(subclassesOf(original));
  for(let cls = next; cls && cls !== Function.prototype; cls = Object.getPrototypeOf(cls)) classes.add(cls);
  for(const cls of classes) (registry.construction.get(cls) ?? []).forEach((key) => names.add(key));
  return names;
}

function changedConstructionMethod(original: Function, next: Function) {
  for(const key of constructionNames(original, next)) {
    // what each version resolves it to (the latest live one is on the first class's chain, patched): an inherited one
    // a subclass's constructor calls counts where it is defined
    if(resolvedCode(original.prototype, key) !== resolvedCode(next.prototype, key)) return key;
  }
}

/** Why the live instances of `original` cannot take `next` in place, if they cannot */
function cannotPatch(name: string, original: Function, next: Function) {
  if(classShape(original) !== classShape(next)) {
    return `${name}: its constructor or a field initializer changed, which the live instances cannot take`;
  }

  const construction = changedConstructionMethod(original, next);
  if(construction) {
    return `${name}: ${construction} runs as an instance is made, and the live instances were made by the previous one`;
  }

  const ancestor = changedAncestor(original, next);
  if(ancestor) {
    return `${name}: its superclass ${ancestor.name} changed, and the live instances still lead to the old one`;
  }

  const held = heldMethods(original, next);
  if(held.length) {
    return `${name}: ${held.join(', ')} changed, and the live instances hold the old function`;
  }

  // even a class whose code did not change: its methods close over the module's new evaluation, and they are what
  // carries an edited import to the live instances
  if(usesPrivateNames(next)) {
    return `${name}: it has private members, which a method of another evaluation cannot read on a live instance`;
  }

  const branded = privateAncestor(original, next);
  if(branded) {
    return `${name}: its superclass ${branded.name} has private members, which its methods cannot read on a live instance`;
  }
}

/**
 * Every top-level class of a module. The first evaluation's class stays the one everything holds — the instances,
 * `instanceof`, other modules' imports — and every later evaluation copies its methods and accessors onto it (and onto
 * the later evaluations' classes, for the instances a module that ran again made of them), so a method edited in place
 * takes effect on the open chat at its next call: no reload, no second instance. What a live instance cannot take
 * reloads the page instead: a changed constructor or field initializer, a changed method an instance holds the old
 * function of, a changed superclass nothing patched, private members. `held` stands for the module's functions the
 * classes hold as values or call as they make an instance (`heldSources`: their code, `heldDeps`: the imported ones):
 * one that changed reloads too, and so does a method the construction calls (`construction`: by class). A closure a
 * method made before the update keeps its code until a reload, and what a method that already ran built stays as built.
 * `statics` (by class): what its static methods reach, for what was made with them. `markup` (by class): the hash of
 * the markup its constructor and field initializers ('') and each method make through Solid's templates, which the
 * compiler hoists out of their code — an edit of the markup alone leaves the code as it was.
 */
export function keepClasses(
  url: string,
  classes: Record<string, Function>,
  heldSources?: Record<string, string>,
  heldDeps?: Values,
  construction?: Record<string, string[]>,
  methods?: MethodsInfo,
  methodValues?: Values,
  statics?: Record<string, [hash: string, deps: string[]]>,
  markup?: Record<string, Record<string, string>>
) {
  const module = moduleOf(url);
  const previousValues = module.classValues;
  module.classValues = methodValues;
  const held = (name: string) => `${name} changed, and the live instances hold or were built with the previous one`;
  if(module.held && heldSources) {
    for(const name of new Set([...Object.keys(module.held.sources), ...Object.keys(heldSources)])) {
      if(module.held.sources[name] !== heldSources[name]) {
        reloadPage(url, held(name));
        return;
      }
    }

    if(module.held.deps && heldDeps) compareLater(url, module.held.deps, heldDeps, held, module.held);
  }

  if(heldSources) {
    if(module.held) {
      module.held.sources = heldSources;
      module.held.deps = heldDeps;
    } else {
      module.held = {sources: heldSources, deps: heldDeps, url, reason: held};
      if(heldDeps) snapshotLater(module.held, heldDeps);
    }
  }

  // a method a live instance holds a copy of (bound, a listener) keeps the evaluation it was made in: what it reads of
  // the module — its functions, imports and tables — must not have changed either
  if(module.methods && methods) {
    const previous = module.methods;
    const names = new Set<string>();
    for(const className in classes) {
      const before = previous.info[className] ?? {}, after = methods[className] ?? {};
      if(!Object.keys(before).length && !Object.keys(after).length) continue;
      const original = module.classes.get(className);
      if(!original) continue;
      for(const key of liveMethods(original, classes[className])) {
        const was = ownEntry(before, key), is = ownEntry(after, key);
        if(!was && !is) continue;
        if(was?.[0] !== is?.[0]) {
          reloadPage(url, `${className}: ${key} is held by the live instances or made them, and a function it calls changed`);
          return;
        }
        was?.[1].forEach((dep) => names.add(dep));
        is?.[1].forEach((dep) => names.add(dep));
      }
    }

    if(names.size && previousValues && methodValues) {
      compareLater(url, pickValues(previousValues, names), pickValues(methodValues, names), previous.reason, previous);
    }
  }

  let firstMethods = false;
  if(methods) {
    if(module.methods) {
      module.methods.info = methods;
    } else {
      const reason = (dep: string) => `${dep} changed, and a method the live instances hold or were made by reads the previous one`;
      module.methods = {info: methods, url, reason};
      firstMethods = true;
    }
  }

  for(const name in classes) {
    const original = module.classes.get(name);
    const next = classes[name];
    if(typeof(next) !== 'function' || !next.prototype) continue;
    if(construction?.[name]) registry.construction.set(next, construction[name]);
    const nextMembers = Reflect.ownKeys(next.prototype);
    registry.authored.set(next, new Set(nextMembers));
    recordSubclass(next);
    const nextStatics = Reflect.ownKeys(next).filter((key) => !SKIP_STATIC.has(key));
    if(!original) {
      module.classes.set(name, next);
      module.classEntries.set(next, {members: nextMembers, statics: nextStatics, staticCode: statics?.[name], markup: markup?.[name]});
      continue;
    }

    if(original === next) {
      continue;
    }

    const reason = cannotPatch(name, original, next);
    if(reason) {
      reloadPage(url, reason);
      return;
    }

    // a module that ran again with the same code too: its methods close over the new evaluation, whose imports an edit
    // changed
    const entry = module.classEntries.get(original);
    const markupChanged = changedMarkup(entry.markup ?? {}, markup?.[name] ?? {}, original, next);
    if(markupChanged !== undefined) {
      reloadPage(url, markupChanged ?
        `${name}: the markup ${markupChanged} makes changed, and it is held by the live instances or made them` :
        `${name}: the markup its constructor or a field initializer makes changed, which the live instances were built with`);
      return;
    }
    entry.markup = markup?.[name];
    // whether the edit changed a static method: what an instance was made with may have called the old one
    const staticCode = (cls: Function, key: string | symbol) => {
      const descriptor = Object.getOwnPropertyDescriptor(cls, key);
      if(!descriptor || registry.sharedStateGetters.has(descriptor.get)) return;
      if('value' in descriptor) return typeof(descriptor.value) === 'function' ? sourceOf(descriptor.value) : undefined;
      return 'get:' + (descriptor.get ? sourceOf(descriptor.get) : '') + ' set:' + (descriptor.set ? sourceOf(descriptor.set) : '');
    };
    const staticsChanged = entry.staticCode?.[0] !== statics?.[name]?.[0] ||
      [...new Set([...entry.statics, ...nextStatics])].some((key) => staticCode(original, key) !== staticCode(next, key));
    const staticReads = new Set([...entry.staticCode?.[1] ?? [], ...statics?.[name]?.[1] ?? []]);
    for(const cls of familyOf(original)) {
      // another evaluation may have joined it already
      if(cls === next) continue;
      for(const key of entry.members) {
        if(!nextMembers.includes(key)) delete cls.prototype[key as keyof typeof cls.prototype];
      }
      // a static the edit removed goes too (one other code set at runtime stays: it is shared below)
      for(const key of entry.statics) {
        if(!nextStatics.includes(key)) delete (cls as any)[key];
      }

      copyMembers(cls.prototype, next.prototype, SKIP_PROTOTYPE);
      copyMembers(cls, next, SKIP_STATIC, true);
      registry.authored.set(cls, new Set(nextMembers));
    }

    shareStaticState(original, next, entry.statics);
    joinFamily(original, next);
    entry.members = nextMembers;
    entry.statics = nextStatics;
    entry.staticCode = statics?.[name];
    const family = registry.families.get(original);
    // what was made with the previous ones, wherever it is: its module may not run again
    const [reader, read] = family.readers?.entries().next().value ?? [];
    if(staticsChanged) {
      ++family.version;
      if(reader) {
        reloadPage(reader.url, reader.reason(read) + ' (its static methods)');
        return;
      }
    } else if(reader && staticReads.size && previousValues && methodValues) {
      // or what they read of other modules changed
      compareLater(reader.url, pickValues(previousValues, staticReads), pickValues(methodValues, staticReads), (dep) => `${reader.reason(read)} (its static methods read ${dep})`);
    }
  }

  // the classes a method reads that the live instances hold or were made by: only those (a method that is not held or
  // part of the construction is patched, and calls the new class's static methods)
  if(firstMethods && methodValues) {
    const names = new Set<string>();
    for(const className in methods) {
      const cls = module.classes.get(className);
      if(cls) liveMethods(cls, classes[className]).forEach((key) => ownEntry(methods[className], key)?.[1].forEach((dep) => names.add(dep)));
    }
    if(names.size) snapshotLater(module.methods, pickValues(methodValues, names));
  }
}

// the methods of a class that live instances hold (bound, a listener) or that ran as one was made: a copy or what it
// made is in the instance. What the element registry took at define is held as well
function liveMethods(original: Function, next: Function) {
  const keys = new Set([...heldNames(original, next), ...constructionNames(original, next)]);
  if(typeof(HTMLElement) !== 'undefined' && next.prototype instanceof HTMLElement) ELEMENT_CALLBACKS.forEach((key) => keys.add(key));
  return keys;
}

// what the transform says of a method: never what Object.prototype answers to its name (`this.constructor` is held)
function ownEntry<T>(record: Record<string, T>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

// '' for the constructor and the field initializers, or the method of the live instances whose markup changed
function changedMarkup(before: Record<string, string>, after: Record<string, string>, original: Function, next: Function) {
  if(ownEntry(before, '') !== ownEntry(after, '')) return '';
  for(const key of liveMethods(original, next)) {
    if(ownEntry(before, key) !== ownEntry(after, key)) return key;
  }
}

function pickValues(values: Values, names: Set<string>): Values {
  return () => {
    const all = values();
    return Object.fromEntries([...names].map((name) => [name, all[name]]));
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// exports

/**
 * A module that accepts its own updates: its importers do not run again and keep its first evaluation's exports. A
 * class is patched in place and kept state is the same object; anything else the edit changed — a function, a table —
 * the importers would go on using in its old version, so the page reloads.
 */
export function keepExports(url: string, exports: () => Record<string, unknown>) {
  const module = moduleOf(url);
  const previous = module.exports;
  module.exports = exports;
  if(!previous) return;

  compareLater(url, previous, exports, (name) => `${name} changed, and the modules importing it hold the previous one`);
}
