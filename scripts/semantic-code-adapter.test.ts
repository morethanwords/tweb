import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdtemp, rm, writeFile, stat, chmod, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash, randomBytes} from 'node:crypto';
import {build} from 'vite';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {createNodeCodeAdapter} from './semantic-code-adapter';
import {localCapability} from './semantic-server';
import type {CodeRequest} from '../src/shell/code/contracts';
import {createSemanticApp} from '../src/shell/semantic/app';
import {createBlogSuite, createDefaultDocument} from '../src/shell/semantic/fixtures';
import {applyOperations} from '../src/shell/semantic/operations';
import {createCompanionServer} from '../src/shell/semantic/transport/server';
import type {CodeBlock} from '../src/shell/core/types';

let directory: string;
let workerUrl: URL;
let failedRuntimeUrl: URL;
const request = (source = 'export default function run(ctx: RoboContext) { return {outcome: "ok", data: ctx.user.name}; }'): CodeRequest => ({
  source, context: {user: {name: 'Ada'}, conversation: {}, run: {}, bot: {}, event: {}, system: {}}, outcomes: ['ok'], variableTypes: {'user.name': 'string'}
});

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'robochat-node-code-'));
  for(const broken of [false, true]) await build({configFile: false, logLevel: 'error', ssr: {noExternal: true},
    plugins: broken ? [{name: 'broken-runtime-fixture', load(id) {if(id.endsWith('/generated/wasm.ts')) return 'export default "AGFzbQEAAAA=";';}}] : [],
    build: {
    ssr: resolve('scripts/semantic-code-worker.ts'), outDir: join(directory, broken ? 'broken-runtime' : 'worker'), emptyOutDir: true,
    target: 'node22', minify: false, sourcemap: false,
    rolldownOptions: {output: {
      entryFileNames: 'semantic-code-worker.js',
      banner: 'import {createRequire as __nodeCreateRequire} from "node:module"; import {fileURLToPath as __nodeFileURLToPath} from "node:url"; import {dirname as __nodeDirname} from "node:path"; const require = __nodeCreateRequire(import.meta.url); const __filename = __nodeFileURLToPath(import.meta.url); const __dirname = __nodeDirname(__filename);'
    }}
  }});
  await writeFile(join(directory, 'package.json'), '{"type":"module"}');
  workerUrl = pathToFileURL(join(directory, 'worker', 'semantic-code-worker.js'));
  failedRuntimeUrl = pathToFileURL(join(directory, 'broken-runtime', 'semantic-code-worker.js'));
}, 30_000);
afterAll(async () => {await rm(directory, {recursive: true, force: true});});

describe('fresh Node Code worker using the shared compiler and QuickJS VM', () => {
  it('validates and executes the exact read-only Code contract', async () => {
    const check = createNodeCodeAdapter({workerUrl});
    expect(await check(request(), 'validate')).toEqual({ok: true, diagnostics: []});
    expect(await check(request(), 'execute')).toEqual({ok: true, diagnostics: [], result: {outcome: 'ok', data: 'Ada'}});
  });

  it('keeps declared guest compile errors separate from worker infrastructure errors', async () => {
    const check = createNodeCodeAdapter({workerUrl});
    const guest = await check(request('export default function run(ctx: RoboContext) { return {outcome: "wrong"}; }'));
    expect(guest).toMatchObject({ok: false, kind: 'guest_error', code: 'COMPILE_ERROR'});
    expect(guest.diagnostics.length).toBeGreaterThan(0);
    const broken = createNodeCodeAdapter({workerUrl: pathToFileURL(join(directory, 'missing.js'))});
    expect(await broken(request(), 'execute')).toMatchObject({ok: false, kind: 'infrastructure_error', code: 'WORKER_ERROR'});
  });

  it('classifies VM initialization failure as infrastructure before guest code runs', async () => {
    const broken = createNodeCodeAdapter({workerUrl: failedRuntimeUrl});
    expect(await broken(request(), 'execute')).toMatchObject({ok: false, kind: 'infrastructure_error', code: 'SANDBOX_INIT'});
  });

  it('rejects concurrent work and releases its slot only after aborted worker terminates', async () => {
    const check = createNodeCodeAdapter({workerUrl});
    const abort = new AbortController();
    const pending = check({...request(), signal: abort.signal}, 'execute');
    expect(await check(request())).toMatchObject({ok: false, kind: 'infrastructure_error', code: 'BUSY'});
    abort.abort();
    expect(await pending).toMatchObject({ok: false, kind: 'infrastructure_error', code: 'ABORTED'});
    expect(await check(request(), 'execute')).toMatchObject({ok: true, result: {outcome: 'ok', data: 'Ada'}});
  });

  it('enforces host deadline on a worker that never replies and can run again afterwards', async () => {
    const hanging = join(directory, 'hanging.js');
    await writeFile(hanging, 'import {parentPort} from "node:worker_threads"; parentPort.on("message", () => {});');
    const check = createNodeCodeAdapter({workerUrl: pathToFileURL(hanging)});
    const started = performance.now();
    expect(await check(request(), 'execute')).toMatchObject({ok: false, kind: 'infrastructure_error', code: 'HOST_TIMEOUT'});
    expect(performance.now() - started).toBeGreaterThanOrEqual(1900);
    const abort = new AbortController(); abort.abort();
    expect(await check({...request(), signal: abort.signal})).toMatchObject({ok: false, code: 'ABORTED'});
  });

  it('interrupts guest loops within the VM budget without terminating the server', async () => {
    const check = createNodeCodeAdapter({workerUrl});
    expect(await check(request('export default function run(ctx: RoboContext) { while(true) {} return {outcome: "ok"}; }'), 'execute')).toMatchObject({ok: false, kind: 'guest_error', code: 'EXECUTION_ERROR'});
    expect(await check(request(), 'execute')).toMatchObject({ok: true});
  });
});

describe('local bearer capability file', () => {
  it('creates a mode0600 capability and reuses it without rotation', async () => {
    const path = join(directory, 'private', 'capability');
    const token = await localCapability(path);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await localCapability(path)).toBe(token);
    await chmod(path, 0o644);
    await expect(localCapability(path)).rejects.toThrow('0600');
  });

  it('rejects symlink capabilities', async () => {
    const path = join(directory, 'symlink-token');
    await symlink('/etc/hosts', path);
    await expect(localCapability(path)).rejects.toThrow();
  });
});

describe('SDK to domain to real Code worker integration', () => {
  it('discovers eight tools, prepares and certifies Code, then applies the same candidate', async () => {
    const check = createNodeCodeAdapter({workerUrl});
    const code: CodeBlock = {id: 'material-code', type: 'code', name: 'Material data',
      source: 'export default function run(ctx: RoboContext) { return {outcome: "ok", data: "before"}; }',
      outcomes: [{id: 'material-code-ok', name: 'ok', transition: {type: 'continue'}}], resultVariableId: 'run.result'};
    const document = applyOperations(createDefaultDocument(), [{type: 'add_block', stepId: 'material', afterBlockId: null, block: code, messageText: null}]).document;
    const suite = createBlogSuite();
    for(const scenario of suite.cases) if(['material', 'details'].includes(scenario.id)) scenario.expect.push({id: 'code-result-present', when: 'at_end', afterStep: null, scope: 'segment', until: null,
      predicate: {type: 'variable', variableId: 'run.result', operator: 'exists', value: null}});
    const actualResults: unknown[] = [];
    const app = createSemanticApp({document, suite, epoch: 'real-mcp-code', engineBuild: 'real-worker-fixture',
      executeCode: async (request, signal) => {
        const reply = await check({...request, signal}, 'execute');
        if(reply.ok && reply.result) {actualResults.push(reply.result); return {ok: true, outcome: reply.result.outcome, data: reply.result.data ?? null};}
        return {ok: false, error: reply.ok ? 'MISSING_RESULT' : reply.code, infrastructure: reply.ok || reply.kind === 'infrastructure_error'};
      },
      validateCode: async (request, signal) => {
        const reply = await check({...request, signal}, 'validate');
        return {valid: reply.ok, infrastructure: !reply.ok && reply.kind === 'infrastructure_error', diagnostics: reply.diagnostics};
      }
    });
    const artifactRoot = join(directory, 'integration-ui');
    const {mkdir} = await import('node:fs/promises');
    await mkdir(artifactRoot);
    const html = '<!doctype html><title>Local companion test</title>';
    await writeFile(join(artifactRoot, 'index.html'), html);
    await writeFile(join(artifactRoot, 'build-manifest.json'), JSON.stringify({schemaVersion: 1, files: [{path: '/index.html', bytes: Buffer.byteLength(html), sha256: createHash('sha256').update(html).digest('hex')}]}));
    const token = randomBytes(32).toString('base64url');
    const companion = await createCompanionServer({app, token, artifactRoot, port: 0});
    const origin = await companion.listen();
    const client = new Client({name: 'real-code-test', version: '1.0.0'}, {versionNegotiation: {mode: {pin: '2026-07-28'}}});
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {requestInit: {headers: {Authorization: `Bearer ${token}`}}}));
      expect((await client.listTools()).tools.map(tool => tool.name)).toEqual(['bot_context', 'bot_search', 'bot_inspect', 'bot_prepare_change', 'bot_apply_change', 'bot_validate', 'bot_test', 'execution_explain']);
      const contextResult = await client.callTool({name: 'bot_context', arguments: {}});
      const context = contextResult.structuredContent as {ok: true; data: {botId: string; revision: string}};
      expect(context.ok).toBe(true);
      const newSource = 'export default function run(ctx: RoboContext) { return {outcome: "ok", data: "after"}; }';
      const prepared = await client.callTool({name: 'bot_prepare_change', arguments: {botId: context.data.botId, baseRevision: context.data.revision, requestKey: 'code-change',
        operations: [{type: 'set_block', stepId: 'material', block: {...code, source: newSource}, messageText: null}]}});
      expect(prepared.isError).toBe(false);
      const change = prepared.structuredContent as {ok: true; data: {state: string; changeId: string; candidateHash: string; tests: {complete: boolean; outcome: string}[]}};
      expect(change.ok).toBe(true); expect(change.data.state).toBe('ready');
      expect(change.data.tests).toHaveLength(5);
      expect(change.data.tests.every(item => item.complete && item.outcome === 'passed')).toBe(true);
      expect(actualResults.length).toBeGreaterThanOrEqual(2);
      expect(actualResults.every(result => JSON.stringify(result) === JSON.stringify({outcome: 'ok', data: 'after'}))).toBe(true);
      expect((app.documents.document.blocks['material-code'] as CodeBlock).source).toBe(code.source);
      const applyArgs = {botId: context.data.botId, baseRevision: context.data.revision, changeId: change.data.changeId, requestKey: 'apply-code'};
      const applied = await client.callTool({name: 'bot_apply_change', arguments: applyArgs});
      expect(applied.isError).toBe(false);
      expect(applied.structuredContent).toMatchObject({ok: true, data: {candidateHash: change.data.candidateHash, revisionNumber: 1}});
      expect((await client.callTool({name: 'bot_apply_change', arguments: applyArgs})).structuredContent).toEqual(applied.structuredContent);
      expect((app.documents.document.blocks['material-code'] as CodeBlock).source).toBe(newSource);
      expect(app.documents.revisionNumber).toBe(1);
    } finally {await client.close(); await companion.close();}
  }, 15_000);
});
