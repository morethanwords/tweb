// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {transformSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import {SourceMap} from 'node:module';
// @ts-ignore a dev server script, plain JavaScript
import {transformForHot, transformForHotWithMap} from '../../scripts/hot-module-transform.mjs';
import {beginEvaluation, endStatements, fingerprint, keepClasses, keepExports, keepFunctions, keepImports, keepNamespaces, keepStatement, keepValue, latestImport, setReloadHandler} from '@helpers/hotRegistry';

// what the dev server serves of a TypeScript module, standing in for its compile
const compile = (source: string) => transformSync(source, {loader: 'ts', format: 'esm', target: 'esnext', charset: 'utf8'}).code;
const transform = (source: string, served = compile(source)): string => transformForHot(source, served, {lang: 'ts'}) ?? served;

let modules = 0;
let reloaded: string[] = [];
beforeEach(() => {
  reloaded = [];
  setReloadHandler((path, reason) => reloaded.push(reason));
});
afterEach(() => setReloadHandler(undefined));
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Runs the served code of a module as the page would, under the registry, its exports through `globalThis.__out`: the
 * same URL each time, as a module run again by a hot update. (No imports in these sources.)
 */
function evaluator() {
  const url = `/src/transform-test-${++modules}.ts`;
  return (source: string, served?: string) => {
    const out = transform(source, served ?? compile(source))
    .replace(/^import \{[^}]*\} from "\/src\/helpers\/hotRegistry\.ts";const __hotUrl = import\.meta\.url;/, '')
    .replace(/^export /gm, '')
    // the transform has read the accept off the source; here it would be a module's own
    .replace(/import\.meta\.hot/g, 'undefined');
    expect(out).not.toMatch(/^\s*import /m);
    new Function('__hotKeep', '__hotClasses', '__hotExports', '__hotFunctions', '__hotNamespaces', '__hotStatement', '__hotStatements', '__hotBegin', '__hotImports', '__hotImport', '__hotUrl', out)(keepValue, keepClasses, keepExports, keepFunctions, keepNamespaces, keepStatement, endStatements, beginEvaluation, keepImports, latestImport, url);
    return (globalThis as any).__out;
  };
}

describe('the hot transform: what it keeps', () => {
  it('keeps state, makes tables and functions again', () => {
    const out = transform(`
const cache = new Map<string, number>();
const SIZES = {inline: 14, block: 20};
const PENDING: number[] = [];
const ORDER = [3, 1, 2];
const format = (x: number) => x * 2;
function sortIt() { ORDER.sort(); }
export const store = createStore();
declare function createStore(): object;
`);
    // (a compiler's /* @__PURE__ */ before the initializer stays where it was: nothing shakes the dev server's code)
    expect(out).toMatch(/const cache = (\/\* @__PURE__ \*\/ )?__hotKeep\(__hotUrl, "cache", \(\) => \(new Map\(\)\), /);
    expect(out).toContain('const SIZES = { inline: 14, block: 20 };');
    // an empty container is filled later, a table the module sorts is changed: state
    expect(out).toContain('const PENDING = __hotKeep(__hotUrl, "PENDING", () => ([])');
    expect(out).toContain('const ORDER = __hotKeep(__hotUrl, "ORDER"');
    expect(out).toContain('const format = (x) => x * 2;');
    expect(out).toContain('const store = __hotKeep(__hotUrl, "store", () => (createStore())');
  });

  it('keeps what solid-refresh made of a context, and leaves its components alone', () => {
    const source = `
import {createContext} from 'solid-js';
export const Ctx = createContext(1);
export const Button = (props: {}) => 1;
export function showButton() { return Button({}); }
`;
    const served = `import { createContext } from 'solid-js';
import { $$registry as _$$registry, $$component as _$$component, $$context as _$$context, $$refresh as _$$refresh } from "/@solid-refresh";
const _REGISTRY = _$$registry();
export const Ctx = _$$context(_REGISTRY, "Ctx", createContext(1));
export const Button = _$$component(_REGISTRY, "Button", (props) => 1);
export function showButton() { return Button({}); }
if (import.meta.hot) {
  _$$refresh("vite", import.meta.hot, _REGISTRY);
  import.meta.hot.accept();
}
`;
    const out = transform(source, served);
    // the context is kept, its registration runs every evaluation: solid-refresh invalidates for a missing one
    expect(out).toContain('const Ctx = _$$context(_REGISTRY, "Ctx", __hotKeep(__hotUrl, "Ctx", () => (createContext(1))');
    expect(out).toContain('const Button = _$$component(');
    // what the compiler declared is none of the author's
    expect(out).toContain('const _REGISTRY = _$$registry();');
    // solid-refresh made it accept its own updates: the importers hold its exports. A component is a proxy that renders
    // the latest version - no code of it to compare, in the function that renders it either
    expect(out).toContain('__hotExports(__hotUrl, () => ({Ctx, Button, showButton}));');
    expect(out).toMatch(/__hotFunctions\(__hotUrl, \(\) => \(\{showButton\}\), \{"showButton":\["[^"]+",\[\]\]\}\);/);
  });

  it('leaves out of what it compares the imports a type alone used', () => {
    const out = transform(`
import {Foo, render} from './foo';
const holder = new Map<string, Foo>([['a', render()]]);
`);
    expect(out).toMatch(/__hotKeep\(__hotUrl, "holder", .*, \(\) => \(\{render\}\)\)/);
    expect(out).not.toMatch(/\[Foo/);
  });

  it('keeps the lines where they were', () => {
    const source = `const label = 'Привет 👋';
const cache = new Map();
let count = 0;
export function inc() { return ++count; }
export class A { run() { return cache; } }
`;
    const served = compile(source);
    const out = transform(source, served);
    // the calls at the end are the only new line
    expect(out.split('\n').length).toBe(served.split('\n').length + 1);
    expect(out.split('\n')[0]).toContain('const label = "Привет 👋";');
    expect(out.split('\n')[1]).toMatch(/const cache = .*__hotKeep\(__hotUrl, "cache", \(\) => \(new Map\(\)\)/);
  });

  it('leaves a top-level await where it is', () => {
    const out = transform('const data = await fetch("/x");\nexport {data};');
    expect(out).not.toContain('__hotKeep(');
  });

  // an edit may remove the last statement acting on kept state together with that state
  it('counts the statements of a module that keeps nothing', () => {
    expect(transform('export const LIMIT = 1;')).toContain('__hotStatements(__hotUrl, 0);');
  });

  it('keeps no other name for a table, and keeps a table changed through one', () => {
    const out = transform(`
const MESSAGE_ITEMS = {views: 'Views'};
const STORY_ITEMS = MESSAGE_ITEMS;
const Versions: {[v: string]: {[e: string]: number}} = {'': {}, '14': {a: 1}};
const Emoji = Versions[''];
Object.assign(Emoji, Versions['14']);
export function read() { return [STORY_ITEMS, Emoji]; }
`);
    expect(out).toContain('const STORY_ITEMS = MESSAGE_ITEMS;');
    expect(out).toContain('const MESSAGE_ITEMS = { views: "Views" };');
    expect(out).toContain('const Emoji = Versions[""];');
    expect(out).toMatch(/const Versions = __hotKeep\(__hotUrl, "Versions"/);
  });

  it('calls a function in a cell without the cell for a receiver', () => {
    const out = transform('let callback = function() { return this; };\nexport function run() { return [callback(), callback?.(), String.raw`${1}`]; }\nexport function tag() { return callback`x`; }\n');
    expect(out).toContain('(0, __hotLet$callback.v)()');
    expect(out).toContain('(0, __hotLet$callback.v)?.()');
    expect(out).toContain('(0, __hotLet$callback.v)`x`');
    // a module is strict: a bare call's `this` is undefined, and stays so
    const body = '"use strict";' + out.replace(/^import .*?;const __hotUrl = import\.meta\.url;/, '').replace(/^export /gm, '') + '\nreturn run();';
    expect(new Function('__hotKeep', '__hotClasses', '__hotExports', '__hotFunctions', '__hotNamespaces', '__hotStatement', '__hotStatements', '__hotBegin', '__hotUrl', body)(keepValue, keepClasses, keepExports, keepFunctions, keepNamespaces, keepStatement, endStatements, beginEvaluation, '/src/cell-callee.ts')[0]).toBeUndefined();
  });

  it('makes a let a function uses a cell, through every use, and leaves the others', () => {
    const out = transform(`
let count = 0, other = 1;
let local = 1;
local = 2;
let pair: number;
export function inc() { return ++count; }
export function read() { return {count, other}; }
export function assign(o: {count: number, pair: number}) { ({count, pair} = o); [count] = [o.count]; }
export let exported = 1;
export function bump() { exported++; }
`);
    expect(out).toContain('let __hotLet$count = __hotKeep(__hotUrl, "let count", () => ({v: (0)})');
    expect(out).toContain('++__hotLet$count.v');
    expect(out).toContain('{ count: __hotLet$count.v, other: __hotLet$other.v }');
    expect(out).toContain('({ count: __hotLet$count.v, pair: __hotLet$pair.v } = o)');
    expect(out).toContain('[__hotLet$count.v] = [o.count]');
    expect(out).toContain('let __hotLet$pair = __hotKeep(__hotUrl, "let pair", () => ({v: undefined})');
    // a parameter of the same name is another variable (served as written: esbuild would rename it)
    const shadowed = 'let count = 0;\nexport function inc() { return ++count; }\nexport function shadow(count) { return count; }\n';
    expect(transform(shadowed, shadowed)).toContain('export function shadow(count) { return count; }');
    // only top-level code uses it: nothing to share
    expect(out).toContain('let local = 1;');
    // an exported let would export the cell
    expect(out).toContain('let exported = 1;');
  });

  it('leaves a destructuring let alone, its uses too, and keeps a default in a destructured assignment', () => {
    const destructured = transform('let {x} = {x: 1};\nexport function read() { return x; }\n');
    expect(destructured).not.toContain('__hotLet$x');
    const defaulted = transform('let count = 0;\nexport function reset(v: {count?: number}) { ({count = 3} = v); }\n');
    expect(defaulted).toContain('({ count: __hotLet$count.v = 3 } = v)');
    // and what comes out is code
    expect(() => new Function(defaulted.replace(/^import .*?;const __hotUrl = import\.meta\.url;/, '').replace(/^export /gm, ''))).not.toThrow();
  });

  it('checks what a self-accepting module hands on of other modules', () => {
    const out = transform(`
export {getGiftAssetName, default as Gift} from './gift';
export * from './stars';
export * as ton from './ton';
export type {Something} from './types';
export const local = () => 1;
if(import.meta.hot) import.meta.hot.accept();
`);
    // compiled as esbuild does: a named re-export becomes an import the module exports, `export *` stays
    const check = out.match(/__hotExports\(__hotUrl, \(\) => \(\{(.*)\}\)\);/)[1];
    expect(check).toContain('"Gift": default2');
    expect(check).toContain('getGiftAssetName');
    expect(check).toContain('ton');
    expect(check).toContain('"*./stars": __hotReexport$0');
    expect(out).toContain('import * as __hotReexport$0 from "./stars";');
    expect(out).not.toContain('"./types"');
    // served as written: the re-exports keep their source
    const written = 'export {getGiftAssetName} from "./gift";\nexport * as ton from "./ton";\nif(import.meta.hot) import.meta.hot.accept();\n';
    const kept = transform(written, written);
    expect(kept).toContain('import * as __hotReexport$0 from "./gift";');
    expect(kept).toContain('__hotExports(__hotUrl, () => ({"getGiftAssetName": __hotReexport$0["getGiftAssetName"], "ton": __hotReexport$1}));');
  });

  it('tells the registry what each method reads of the module', () => {
    const out = transform(`
import {getDefaultOptions} from './options';
function local() { return 1; }
export class Topbar {
  createSubmenu() { return getDefaultOptions() + local(); }
  plain() { return 1; }
}
`);
    const match = out.match(/__hotClasses\(__hotUrl, \{Topbar\}, \{\}, undefined, undefined, (\{.*?\}\}), \(\) => \(\{getDefaultOptions\}\)\);/);
    expect(match).not.toBeNull();
    const methods = JSON.parse(match[1]);
    expect(Object.keys(methods.Topbar)).toEqual(['createSubmenu']);
    expect(methods.Topbar.createSubmenu[1]).toEqual(['getDefaultOptions']);
  });

  it('tells the registry the methods a class calls as it makes an instance', () => {
    const out = transform(`
export class Tab {
  element = this.make();
  constructor(el: HTMLElement) {
    this._constructor();
    el.addEventListener('click', () => this.later());
  }
  make() { return 1; }
  _constructor() {}
  later() {}
}
`);
    expect(out).toMatch(/__hotClasses\(__hotUrl, \{Tab\}, \{\}, undefined, \{"Tab":\["(make","_constructor|_constructor","make)"\]\}\);/);
  });

  it('keeps a static field that does something as it is made, as served or in a static block', () => {
    const source = `
export class Store {
  static storage = new Map<string, number>();
  static flag = false;
  static run = () => 1;
}
`;
    const out = transform(source);
    expect(out).toMatch(/static storage = (\/\* @__PURE__ \*\/ )?__hotKeep\(__hotUrl, "Store\.storage", \(\) => \(new Map\(\)\)/);
    expect(out).toContain('static flag = false;');
    // a compiler without define semantics puts it in a static block
    const blocks = 'export class Store {\n  static {\n    this.storage = new Map();\n  }\n  static {\n    this.flag = false;\n  }\n}\n';
    const fromBlocks = transform(source, blocks);
    expect(fromBlocks).toMatch(/this\.storage = __hotKeep\(__hotUrl, "Store\.storage", \(\) => \(new Map\(\)\)/);
    expect(fromBlocks).toContain('this.flag = false;');
  });

  // a dynamic import loads by the URL its run named, stamped by Vite before any later edit: code that run made would load
  // the module as it was then
  it('has every dynamic import load what the latest run names', async() => {
    const out = transform(`
export const Tab = scaffold({title: 'Privacy', getComponentModule: () => import('./privacy')});
export class Topbar { onFilters = () => import(\`./filters\`).then((module) => module.default); open() { return import('./privacy'); } }
declare function scaffold(options: object): object;
`);
    expect(out).toContain('__hotBegin(__hotUrl);__hotImports(__hotUrl, {"./privacy": () => import("./privacy"), "./filters": () => import("./filters")});');
    expect(out).toContain('getComponentModule: () => __hotImport(__hotUrl, "./privacy")');
    expect(out).toContain('onFilters = () => __hotImport(__hotUrl, "./filters").then(');
    expect(out).toContain('return __hotImport(__hotUrl, "./privacy");');

    // a closure of the first run, after a second run registered its imports
    const module = `/src/transform-test-${++modules}.ts`;
    const loads: string[] = [];
    const open = () => latestImport(`${module}?t=1`, './privacy');
    for(const stamp of ['1', '2']) {
      keepImports(`${module}?t=${stamp}`, {'./privacy': async() => loads.push(stamp)});
      await open();
    }
    expect(loads).toEqual(['1', '2']);
  });

  // run again, defineSolidElement swaps the component into the element class it registered first
  it('runs a factory that takes the update itself again', () => {
    const out = transform(`
import defineSolidElement from '@lib/solidjs/defineSolidElement';
const Spinner = defineSolidElement({name: 'tweb-spinner', component: () => 1});
export default Spinner;
`);
    expect(out).toContain('const Spinner = defineSolidElement(');
    expect(out).not.toContain('__hotKeep(__hotUrl, "Spinner"');
  });

  it('does not keep what the module hands itself over through import.meta.hot.data', () => {
    const out = transform('const previous = import.meta.hot?.data?.store;\nexport const store = previous ?? new Map();\n');
    expect(out).not.toContain('"previous"');
  });

  it('registers the classes with what they hold, and a self-accepting module\'s exports', () => {
    const version = (helper: string, method: string) => transform(`
function helper() { return ${helper}; }
function unrelated() { return 1; }
function createAudio() { return {}; }
export class A {
  onClick = () => helper();
  audio: object;
  construct() { this.audio = createAudio(); unrelated(); }
  run() { return ${method}; }
}
export const format = () => 1;
if(import.meta.hot) import.meta.hot.accept();
`);
    // the functions the classes hold, each by its own hash
    const hashOf = (out: string) => JSON.parse(out.match(/__hotClasses\(__hotUrl, \{A\}, (\{[^}]*\})/)[1]);
    const base = version('1', '1');
    expect(base).toContain('__hotExports(__hotUrl, () => ({A, format}));');
    // a method is patched in place: no change to what the class holds
    expect(hashOf(version('1', '2'))).toEqual(hashOf(base));
    // the helper its field calls is held, and the factory a method stores the product of; a function a method only
    // calls is not
    expect(Object.keys(hashOf(base))).toEqual(['createAudio', 'helper']);
    expect(hashOf(version('2', '1')).helper).not.toBe(hashOf(base).helper);
  });
});

describe('the hot transform, run twice as a hot update does', () => {
  it('shares state and a let with the previous evaluation', async() => {
    const run = evaluator();
    const source = `
const cache = new Map<string, number>();
let count = 0;
function inc() { return ++count; }
globalThis.__out = {cache, inc, read: () => count};
`;
    const first = run(source);
    first.cache.set('a', 1);
    first.inc();
    first.inc();
    const second = run(source);
    expect(second.cache).toBe(first.cache);
    expect(second.inc()).toBe(3);
    // the old closure and the new one count together
    expect(first.inc()).toBe(4);
    expect(second.read()).toBe(4);
    await settled();
    expect(reloaded).toEqual([]);
  });

  it('patches the live instances, and reloads for what they cannot take', async() => {
    const run = evaluator();
    const version = (value: number, field = 1, helper = 1) => `
function helper() { return ${helper}; }
class A {
  field = ${field};
  onClick = () => helper();
  get() { return ${value}; }
}
globalThis.__out = {A};
`;
    const {A} = run(version(1));
    const live = new A();
    run(version(2));
    expect(live.get()).toBe(2);
    await settled();
    expect(reloaded).toEqual([]);
    run(version(2, 2));
    expect(reloaded.length).toBe(1);
    expect(reloaded[0]).toMatch(/field initializer/);

    const again = evaluator();
    again(version(1));
    again(version(1, 1, 2));
    await settled();
    expect(reloaded[1]).toMatch(/^helper changed/);
  });

  it('reloads for an export whose local helper changed, though its own code did not', async() => {
    const run = evaluator();
    const version = (value: number) => `
function helper() { return ${value}; }
export function format() { return helper(); }
globalThis.__out = {format};
if(import.meta.hot) import.meta.hot.accept();
`;
    run(version(1));
    run(version(1));
    await settled();
    expect(reloaded).toEqual([]);
    run(version(2));
    await settled();
    expect(reloaded).toEqual(['format changed, and the modules importing it hold the previous one']);
  });

  it('follows a held function into the module it imports from', async() => {
    // the module a held function lives in and the one it calls into, two evaluations each, as a hot update of the
    // second makes them: the first runs again with its code unchanged
    const inner = (value: number) => {
      const read = function read() {
        return value;
      };
      keepFunctions('/src/deep-inner.ts', () => ({read}), {read: [`read v${value}`, []]});
      return read;
    };
    const outer = (read: Function) => {
      const format = function format() {
        return read();
      };
      keepFunctions('/src/deep-outer.ts', () => ({format}), {format: ['format', ['read']]}, () => ({read}));
      return format;
    };
    const holder = '/src/deep-holder.ts';
    const first = outer(inner(1));
    keepValue(holder, 'store', () => ({}), 'code', () => ({format: first}));
    const same = outer(inner(1));
    keepValue(holder, 'store', () => ({}), 'code', () => ({format: same}));
    await settled();
    expect(reloaded).toEqual([]);
    const changed = outer(inner(2));
    keepValue(holder, 'store', () => ({}), 'code', () => ({format: changed}));
    await settled();
    expect(reloaded).toEqual(['store: format, which it was made with, changed']);
  });

  it('gives a function the same fingerprint whichever function of a cycle the walk starts from', () => {
    const a: Function = function a() {
      return b() + c();
    };
    const b: Function = function b() {
      return a();
    };
    const c: Function = function c() {
      return b();
    };
    keepFunctions('/src/cycle-order.ts', () => ({a, b, c}), {a: ['a', ['b', 'c']], b: ['b', ['a']], c: ['c', ['b']]}, () => ({a, b, c}));
    const inOrder = (fns: Function[]) => {
      const walk = {seen: new Set<object>(), memo: new Map<Function, string>(), data: new Map<object, string>()};
      return new Map(fns.map((fn) => [fn, fingerprint(fn, walk)]));
    };
    const forward = inOrder([a, b, c]);
    const backward = inOrder([c, b, a]);
    for(const fn of [a, b, c]) expect(forward.get(fn)).toBe(backward.get(fn));
  });

  it('compares functions that call each other the same whichever is walked first, and kept state by identity', async() => {
    // two evaluations of one module whose exported functions call each other and read a kept registry
    const evaluation = () => {
      const registry = keepValue('/src/cycle.ts', 'registry', () => ({entries: [] as number[]}), 'code');
      const a: Function = function a() {
        return b();
      };
      const b: Function = function b() {
        return a() + registry.entries.length;
      };
      keepFunctions('/src/cycle.ts', () => ({a, b}), {a: ['a', ['b']], b: ['b', ['a', 'registry']]}, () => ({a, b, registry}));
      return {a, b, registry};
    };
    const first = evaluation();
    first.registry.entries.push(1);
    const holder = '/src/cycle-holder.ts';
    keepValue(holder, 'store', () => ({}), 'code', () => ({b: first.b, a: first.a}));
    const second = evaluation();
    // the registry the functions read changed at runtime, and it is the same object
    second.registry.entries.push(2);
    keepValue(holder, 'store', () => ({}), 'code', () => ({b: second.b, a: second.a}));
    await settled();
    expect(reloaded).toEqual([]);
  });

  it('reloads for the last export of a self-accepting module that an edit removed', async() => {
    const run = evaluator();
    run('export const SIZES = {inline: 14};\nif(import.meta.hot) import.meta.hot.accept();\nglobalThis.__out = {};');
    run('const SIZES = {inline: 14};\nif(import.meta.hot) import.meta.hot.accept();\nglobalThis.__out = {SIZES};');
    await settled();
    expect(reloaded).toEqual(['SIZES changed, and the modules importing it hold the previous one']);
  });

  it('reloads when a module with a namespace that holds state runs again, not for one of functions', async() => {
    const run = evaluator();
    const source = `
namespace Strings {
  export let lang = 'en';
  export function set(value: string) { lang = value; }
}
namespace Format {
  export const SIZES = [1, 2];
  export function bold(text: string) { return text; }
}
globalThis.__out = {Strings, Format};
`;
    run(source);
    await settled();
    expect(reloaded).toEqual([]);
    run(source);
    expect(reloaded).toEqual(['namespace Strings: its state cannot be kept, and live code holds the previous one']);
  });

  it('compares a regular expression a module makes again by what it says', async() => {
    const holder = '/src/regexp-holder.ts';
    keepValue(holder, 'store', () => ({}), 'code', () => ({SPACES: /\s+/g}));
    keepValue(holder, 'store', () => ({}), 'code', () => ({SPACES: /\s+/g}));
    await settled();
    expect(reloaded).toEqual([]);
    keepValue(holder, 'store', () => ({}), 'code', () => ({SPACES: /\s*/g}));
    await settled();
    expect(reloaded.length).toBe(1);
  });

  it('tells imports swapped under their names apart', async() => {
    const a: Function = function a() {
      return 1;
    };
    const b: Function = function b() {
      return 2;
    };
    keepFunctions('/src/swap-lib.ts', () => ({a, b}), {a: ['a', []], b: ['b', []]});
    const compute = (left: Function, right: Function) => {
      const fn = function compute() {
        return 0;
      };
      keepFunctions('/src/swap.ts', () => ({compute: fn}), {compute: ['compute', ['a', 'b']]}, () => ({a: left, b: right}));
      return fn;
    };
    const holder = '/src/swap-holder.ts';
    const first = compute(a, b);
    keepValue(holder, 'store', () => ({}), 'code', () => ({compute: first}));
    const swapped = compute(b, a);
    keepValue(holder, 'store', () => ({}), 'code', () => ({compute: swapped}));
    await settled();
    expect(reloaded).toEqual(['store: compute, which it was made with, changed']);
  });

  it('runs a statement that acts on kept state once, and reloads for one changed or added', async() => {
    const run = evaluator();
    const source = (extra = '') => `
let pending = {resolved: 0, resolve() { this.resolved++; }};
pending.resolve();
${extra}
function read() { return pending; }
globalThis.__out = {pending: read()};
`;
    const first = run(source());
    expect(first.pending.resolved).toBe(1);
    // run again: the kept state is not acted on twice
    const second = run(source());
    expect(second.pending).toBe(first.pending);
    expect(first.pending.resolved).toBe(1);
    await settled();
    expect(reloaded).toEqual([]);
    // a statement the module did not have: the state was made without it
    run(source('pending.resolve();'));
    expect(reloaded).toEqual(['statement 1: a statement acting on kept state is new, and the state was made without it']);
  });

  it('keeps a setup in a block with the state, and reloads for an edit of it or its removal', async() => {
    const run = evaluator();
    const source = (guard: string, extra = 'pending.resolve();') => `
const SERVICE = new Set<string>(['message']);
if(${guard}) {
  SERVICE.add('phoneCall');
}
let pending = {resolved: 0, resolve() { this.resolved++; }};
${extra}
function read() { return [SERVICE, pending]; }
globalThis.__out = {read};
`;
    run(source('true'));
    run(source('true'));
    await settled();
    expect(reloaded).toEqual([]);
    run(source('false'));
    expect(reloaded).toEqual(['statement 0: a statement acting on kept state changed']);

    const again = evaluator();
    again(source('true'));
    // the last statement taken out: its effect is still in the kept state
    again(source('true', ''));
    expect(reloaded[1]).toBe('a statement acting on kept state was removed, and its effect is in the state');
  });

  it('registers a default export with no name of its own, by what it reaches', () => {
    // served as the dev server's compiler leaves it (esbuild would name it itself)
    const written = 'const LIMIT = 3;\nexport default function() { return LIMIT; }\n';
    const out = transform(written, written);
    expect(out).toContain('export default function __hotDefault(');
    expect(out).toMatch(/__hotFunctions\(__hotUrl, \(\) => \(\{__hotDefault\}\), \{"__hotDefault":\["[^"]+",\["LIMIT"\]\]\}/);
    const arrow = transform('export default () => 1;\n', 'export default () => 1;\n');
    expect(arrow).toContain('const __hotDefault = () => 1;export default __hotDefault;');
  });

  it('follows the functions of a table into what they call', async() => {
    const run = evaluator();
    const source = (value: number) => `
function helper() { return ${value}; }
const callbacks = {run: () => helper()};
const kept = new Map([['value', callbacks.run()]]);
globalThis.__out = {kept};
`;
    run(source(1));
    run(source(2));
    expect(reloaded).toEqual(['kept: the code that made it changed']);
  });

  it('keeps a table a kept statement changes through another name', async() => {
    const run = evaluator();
    const source = `
const LANGUAGES: {[key: string]: string[]} = {JavaScript: ['js'], Python: ['py']};
const ALIASES: {[key: string]: string} = {};
for(const language in LANGUAGES) {
  const aliases = LANGUAGES[language];
  aliases.unshift(language.toLowerCase());
  for(const alias of aliases) ALIASES[alias] = language;
}
function read() { return [LANGUAGES, ALIASES]; }
globalThis.__out = {read};
`;
    const [languages] = run(source).read();
    expect(languages.JavaScript).toEqual(['javascript', 'js']);
    const [again] = run(source).read();
    // the table the loop changed is the one the new code reads
    expect(again).toBe(languages);
    await settled();
    expect(reloaded).toEqual([]);
  });

  it('wraps a method of a kept class once, not again on every run', async() => {
    const run = evaluator();
    const source = `
const Tab = makeTab();
function makeTab() { return class { init() { return 'init'; } }; }
const originalInit = Tab.prototype.init;
Tab.prototype.init = function() { return 'wrapped ' + originalInit.call(this); };
function read() { return new Tab().init(); }
globalThis.__out = {read};
`;
    expect(run(source).read()).toBe('wrapped init');
    expect(run(source).read()).toBe('wrapped init');
    await settled();
    expect(reloaded).toEqual([]);
  });

  it('reloads for kept state made with a static method of the module\'s own class, or with what that calls', async() => {
    const run = evaluator();
    const source = (value: number, other = 1) => `
function base() { return ${other}; }
class Factory { static make() { return {value: ${value} + base()}; } }
const state = Factory.make();
globalThis.__out = {state};
`;
    run(source(1));
    await settled();
    run(source(1));
    await settled();
    expect(reloaded).toEqual([]);
    run(source(2));
    await settled();
    expect([...new Set(reloaded)]).toEqual(['state: Factory, which it was made with, changed (its static methods)']);

    const again = evaluator();
    reloaded = [];
    again(source(1));
    await settled();
    again(source(1, 2));
    await settled();
    expect([...new Set(reloaded)]).toEqual(['state: Factory, which it was made with, changed (its static methods)']);
  });

  it('reloads for instances built with a static method of the module\'s own class, not for one their superclass has', async() => {
    const source = (cache: number, base: number) => `
class Cache { static make() { return ${cache}; } }
class Player { value = 0; constructor() { this.value = Cache.make(); } }
class Base { static helper() { return ${base}; } }
class Sub extends Base {}
const player = new Player();
const sub = new Sub();
globalThis.__out = {player, sub};
`;
    const run = evaluator();
    run(source(1, 1));
    await settled();
    run(source(1, 2));
    await settled();
    expect(reloaded).toEqual([]);
    run(source(2, 2));
    await settled();
    // (the first reload is the page's: the classes after it are left to it)
    expect(reloaded[0]).toBe('Cache changed, and the live instances hold or were built with the previous one (its static methods)');
  });

  // the classes past one that cannot be patched are left to the reload: their compare is no reason of its own
  it('asks for one reload a run', async() => {
    const run = evaluator();
    const source = `
class Attributes { #lines = 0; count() { return this.#lines; } }
class Parser { attributes = null; constructor() { this.attributes = new Attributes(); } }
const parser = new Parser();
globalThis.__out = {parser};
`;
    run(source);
    await settled();
    run(source);
    await settled();
    expect(reloaded).toEqual(['Attributes: it has private members, which a method of another evaluation cannot read on a live instance']);
  });

  it('runs once what changes kept state through Object.assign or another name for it, and reloads for an edit of it', async() => {
    for(const [statement, edited] of [
      ['Object.assign(state, {a: 1, b: 1});', 'Object.assign(state, {a: 2});'],
      ['same.count = 1;', 'same.count = 2;']
    ]) {
      reloaded = [];
      const run = evaluator();
      const source = (line: string) => `const state: Record<string, number> = {};\nconst same = state;\n${line}\nglobalThis.__out = {state};`;
      const {state} = run(source(statement));
      const snapshot = {...state};
      expect(run(source(statement)).state).toBe(state);
      await settled();
      expect(reloaded).toEqual([]);
      run(source(edited));
      await settled();
      expect(reloaded).toEqual(['statement 0: a statement acting on kept state changed']);
      // the state keeps what the first run did (an edit the page did not reload for would show here)
      expect(state).toEqual(snapshot);
    }
  });

  it('reloads for what an instance keeps of a static factory the edit changed', async() => {
    const run = evaluator();
    const source = (size: number) => `
class Emoji { static create() { return {size: ${size}}; } }
class Reaction { emoji = null; render() { this.emoji = Emoji.create(); } }
const reaction = new Reaction();
function render() { reaction.render(); }
globalThis.__out = {reaction, render};
`;
    run(source(1)).render();
    await settled();
    run(source(2));
    await settled();
    expect(reloaded[0]).toBe('Emoji changed, and the live instances hold or were built with the previous one (its static methods)');
  });

  // Solid hoists a JSX expression's markup out of the code that makes it: an edit of the markup alone leaves the
  // constructor's code as it was
  it('reloads for the markup the live instances were built with, or that a method they hold makes', async() => {
    const source = `
class Section { form = ''; onRow = null; constructor() { this.form = ''; this.onRow = this.row.bind(this); } row() { return ''; } footer() { return ''; } }
const section = new Section();
globalThis.__out = {section};
`;
    const served = (form: string, row: string, footer: string) => `var _tmpl$ = template(\`<form class=${form}>\`), _tmpl$2 = template(\`<div class=${row}>\`), _tmpl$3 = template(\`<p class=${footer}>\`);
function template(html) { return () => html; }
class Section { form = ''; onRow = null; constructor() { this.form = _tmpl$(); this.onRow = this.row.bind(this); } row() { return _tmpl$2(); } footer() { return _tmpl$3(); } }
const section = new Section();
globalThis.__out = {section};
`;
    for(const [edit, expected] of [
      [['a', 'a', 'b'], undefined],
      [['b', 'a', 'a'], 'Section: the markup its constructor or a field initializer makes changed, which the live instances were built with'],
      [['a', 'b', 'a'], 'Section: the markup row makes changed, and it is held by the live instances or made them']
    ] as const) {
      reloaded = [];
      const run = evaluator();
      run(source, served('a', 'a', 'a'));
      await settled();
      const [form, row, footer] = edit;
      const {section} = run(source, served(form, row, footer));
      await settled();
      expect(reloaded[0]).toBe(expected);
      // a method no instance holds takes the new markup from its next call
      if(!expected) expect(section.footer()).toBe('<p class=b>');
    }
  });

  it('reloads when the code that made kept state changed', () => {
    const run = evaluator();
    run('const cache = new Map<string, number>([["a", 1]]);\nglobalThis.__out = {cache};');
    run('const cache = new Map<string, number>([["a", 2]]);\nglobalThis.__out = {cache};');
    expect(reloaded).toEqual(['cache: the code that made it changed']);
  });
});

describe('the hot transform\'s source map', () => {
  // a cell's `.v` and a kept value's wrapper move what follows them along the line
  it('maps what it moved along a line back to where it was', () => {
    const source = 'let count = 0;\nexport function next(callback: () => number) { return count + callback(); }\n';
    const served = compile(source);
    const {code, map} = transformForHotWithMap(source, served, {lang: 'ts', id: '/src/next.ts'});
    const at = (text: string) => {
      const lines = text.split('\n');
      const line = lines.findIndex((each) => each.includes('callback()'));
      return [line, lines[line].indexOf('callback()')];
    };
    const [line, column] = at(code);
    expect(code.split('\n')[line]).toContain('__hotLet$count.v');
    const entry = new SourceMap(JSON.parse(map.toString())).findEntry(line, column) as {originalLine: number, originalColumn: number};
    expect([entry.originalLine, entry.originalColumn]).toEqual(at(served));
  });

  // most modules: the prelude after the first import and the calls after the last line move nothing, and the code's own
  // map stays right as it is
  it('lays no map over a module whose own code it moves nowhere', () => {
    const source = 'import {read} from \'./read\';\nexport function next() { return read(); }\n';
    const served = compile(source);
    const {code, map} = transformForHotWithMap(source, served, {lang: 'ts', id: '/src/next.ts'});
    expect(map).toBeNull();
    const before = served.trimEnd().split('\n'), after = code.split('\n');
    expect(after[0].startsWith(before[0])).toBe(true);
    expect(after[0]).toContain('__hotBegin(__hotUrl);');
    expect(after.slice(1, before.length)).toEqual(before.slice(1));
    expect(code).toContain('__hotFunctions(__hotUrl, () => ({next})');
  });

  it('starts a module that begins with code with the prelude, and maps that', () => {
    const source = 'const ready = true;\nexport function next() { return ready; }\n';
    const {code, map} = transformForHotWithMap(source, compile(source), {lang: 'ts', id: '/src/next.ts'});
    expect(code.startsWith('import {keepValue as __hotKeep')).toBe(true);
    const entry = new SourceMap(JSON.parse(map.toString())).findEntry(0, code.indexOf('const ready')) as {originalLine: number, originalColumn: number};
    expect([entry.originalLine, entry.originalColumn]).toEqual([0, 0]);
  });
});

describe('the hot registry', () => {
  it('imports nothing and never names import.meta.hot: worker code imports it, and Vite\'s client cannot run there', () => {
    const code = readFileSync('src/helpers/hotRegistry.ts', 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    // a dynamic import of anything but a literal makes Vite import its client to rewrite it
    expect(code).not.toMatch(/^\s*import\s|\bimport\(|import\.meta\.hot/m);
  });
});
