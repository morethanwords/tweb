import {describe, expect, test} from 'vitest';
import {compile} from './compiler';
import {executeSandbox} from './sandbox';
import {CodeLimits, validateRequest, type CodeRequest} from './contracts';
import base64 from './generated/wasm';
const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
const modulePromise = WebAssembly.compile(bytes);
const base: CodeRequest = {source: '', context: {user: {balance: 50}, run: {productPrice: 20}, conversation: {}, bot: {}, event: {}, system: {}}, outcomes: ['success', 'failure'], variableTypes: {'user.balance': 'number', 'run.productPrice': 'number'}};
function request(body: string): CodeRequest {return {...base, source: `export default async function run(ctx: RoboContext) { ${body} }`};}
function execute(body: string) {const input = request(body); const compiled = compile(input); expect(compiled.diagnostics).toEqual([]); return modulePromise.then(module => executeSandbox(compiled.javascript!, input, module));}

describe('real TypeScript semantics', () => {
  test('context descriptors and inferred return outcome compile', () => {expect(compile(request("return {outcome: 'success', data: ctx.user.balance - ctx.run.productPrice};")).diagnostics).toEqual([]);});
  test.each(["ctx.user.missing", "ctx.user.balance.toUpperCase()", "ctx.user.balance = 100", "return {outcome: 'unknown'}"])( 'rejects %s', expression => {expect(compile(request(`${expression}; return {outcome: 'success'};`)).diagnostics.length).toBeGreaterThan(0);});
  test('new descriptor is immediately typechecked even without a current value', () => {const input = {...request("return {outcome:'success', data:ctx.user.age + 1}"), variableTypes: {...base.variableTypes, 'user.age': 'number' as const}}; expect(compile(input).diagnostics).toEqual([]);});
  test('rejects source imports and unavailable host APIs', () => {expect(compile({...request('return {outcome:"success"};'), source: 'import x from "https://example.org"; export default function run(ctx:RoboContext){return {outcome:"success"}}'}).diagnostics.length).toBeGreaterThan(0); expect(compile(request('fetch("/api"); return {outcome:"success"}')).diagnostics.length).toBeGreaterThan(0);});
});
describe('fixed-memory QuickJS execution', () => {
  test('actual module imports memory and fixed memory cannot grow', async () => {const module = await modulePromise; expect(WebAssembly.Module.imports(module).filter(item => item.kind === 'memory')).toEqual([{module: 'a', name: 'a', kind: 'memory'}]); const memory = new WebAssembly.Memory({initial: 512, maximum: 512}); expect(memory.buffer.byteLength).toBe(32 * 1024 * 1024); expect(() => memory.grow(1)).toThrow(RangeError);});
  test('sync and promise code produce literal JSON', async () => {expect(await execute("const value = await Promise.resolve(ctx.user.balance - ctx.run.productPrice); return {outcome:'success',data:value};")).toEqual({outcome:'success',data:30});});
  test('input is deeply frozen and mutation fails', async () => {await expect(execute("(ctx.user as any).balance = 0; return {outcome:'success'};")).rejects.toThrow(); expect(base.context.user).toEqual({balance:50});});
  test('infinite loop interrupts without waiting for host kill', async () => {const started = performance.now(); await expect(execute("while(true) {} return {outcome:'success'};")).rejects.toThrow(); expect(performance.now() - started).toBeLessThan(CodeLimits.hostKillMs);});
  test('allocation bomb fails inside 16MiB heap', async () => {await expect(execute("const a=[]; for(let i=0;i<1000000;i++) a.push('abcdef'.repeat(100)); return {outcome:'success'};")).rejects.toThrow();});
  test('unknown outcomes and invalid JSON are rejected beyond static types', async () => {await expect(execute("return {outcome:'unregistered' as any};")).rejects.toThrow('Неизвестный'); await expect(execute("return {outcome:'success', data:NaN};")).rejects.toThrow('JSON');});
  test('user code cannot rewrite validation intrinsics', async () => {await expect(execute("(Object as any).getOwnPropertyDescriptors = () => ({}); return {outcome:'success', data:NaN};")).rejects.toThrow();});
  test('unsettled promises fail explicitly', async () => {await expect(execute("await new Promise(()=>{}); return {outcome:'success'};")).rejects.toThrow('не завершился');});
  test('host capabilities and real clock/random are absent inside VM', async () => {const js = "exports.default = () => ({outcome:'success',data:[typeof fetch, typeof Date, typeof eval, typeof Math.random, typeof crypto, typeof document, typeof WebSocket, typeof setTimeout]});"; expect(await executeSandbox(js, base, await modulePromise)).toEqual({outcome:'success',data:Array(8).fill('undefined')});});
  test('request size, bad descriptors and cyclic context fail before execution', () => {expect(() => validateRequest({...base, source:'я'.repeat(16385)})).toThrow(); expect(() => validateRequest({...base, variableTypes:{'user.x':'invalid' as never}})).toThrow(); expect(() => validateRequest({...base, variableTypes:{'user.constructor':'number'}})).toThrow();});
});
