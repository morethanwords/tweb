import {performance} from 'node:perf_hooks';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {boundaryButtonId, boundaryMessageId, boundaryStepId, createBoundaryDocument, explicitBoundaryFixture} from '../src/shell/core/boundary-fixture';
import {documentBytes, validateDocument} from '../src/shell/core/document';
import {createHeadlessRun, performTestAction, type HeadlessOptions, type TestAction} from '../src/shell/core/headless';
import {ShellLimits} from '../src/shell/core/types';
import {compileSemantic, searchSemantic} from '../src/shell/semantic/compiler';
import {OperationRegistry} from '../src/shell/semantic/registry';
import {TestService} from '../src/shell/semantic/test-service';
import {bytes, hash, SemanticLimits} from '../src/shell/semantic/common';
import type {Principal, TestCase, TestContract} from '../src/shell/semantic/contracts';

/** Observed local measurements, not latency promises or process-memory peak claims. */
export async function measureSemanticBoundary(engineBuild = 'measurement-only') {
  const timings: Record<string, number> = {}, samples: {phase: string; rss: number; heapUsed: number}[] = [];
  const sample = (phase: string) => {const memory = process.memoryUsage(); samples.push({phase, rss: memory.rss, heapUsed: memory.heapUsed});};
  const timed = <T>(name: string, work: () => T): T => {
    const begin = performance.now(); const value = work(); timings[name] = performance.now() - begin; sample(name); return value;
  };
  const timedAsync = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
    const begin = performance.now(); const value = await work(); timings[name] = performance.now() - begin; sample(name); return value;
  };
  sample('before');
  const document = timed('createDocumentMs', () => createBoundaryDocument());
  timed('validateMs', () => validateDocument(document));
  const semantic = timed('compileMs', () => compileSemantic(document));
  const hits = timed('searchMs', () => searchSemantic(semantic, 'Boundary', 20));
  const given = explicitBoundaryFixture(document);
  let run = timed('createRunMs', () => createHeadlessRun(document, 'boundary-run', given));
  let codeCalls = 0;
  const options: HeadlessOptions = {signal: new AbortController().signal, executeCode: async () => {codeCalls++; return {ok: false, error: 'This boundary workload has no Code blocks', infrastructure: true};}};
  const actions: TestAction[] = [{type: 'send_text', clientMessageId: 'start', text: '/start'},
    ...Array.from({length: 32}, (_, index): TestAction => ({type: 'click', messageId: boundaryMessageId(index), buttonId: boundaryButtonId(index), occurrence: 'latest_active'}))];
  await timedAsync('headless33ActionsMs', async () => {
    for(const action of actions) {
      const result = await performTestAction(run, action, options);
      if(result.receipt.disposition !== 'accepted') throw new Error(`Boundary action rejected: ${result.receipt.code}`);
      run = result.run; sample('headlessAction');
    }
  });
  const overflow: TestAction = {type: 'click', messageId: boundaryMessageId(32), buttonId: boundaryButtonId(32), occurrence: 'latest_active'};
  const rejected = await performTestAction(run, overflow, options);
  if(rejected.receipt.disposition !== 'rejected' || rejected.receipt.code !== 'BUTTON_NOT_READY' || rejected.run.messages.length !== 198) throw new Error('Boundary overflow was not atomic');
  const item: TestCase = {id: 'boundary-path', title: '100 screens, 500 buttons, 500 messages, near 1 MiB', given, steps: [...actions, overflow], expect: [
    {id: 'reached-screen-33', when: 'at_end', afterStep: null, scope: 'segment', until: null, predicate: {type: 'screen', stepId: boundaryStepId(32), min: 1, max: 1}},
    {id: 'atomic-overflow', when: 'at_end', afterStep: null, scope: 'segment', until: null, predicate: {type: 'receipt', actionIndex: 33, disposition: 'rejected', code: 'BUTTON_NOT_READY'}}
  ]};
  const contractData = {origin: 'ad_hoc' as const, suite: {id: 'boundary', version: 1, cases: [item]}, engineBuild, fixturePolicy: 'explicit-v1' as const};
  const contract: TestContract = {...contractData, hash: hash(contractData)};
  const principal: Principal = {id: 'measurement', botIds: [document.id], scopes: ['bot:read', 'simulation:run', 'simulation:read']};
  const registry = new OperationRegistry('measurement', () => 0);
  const service = new TestService('measurement', () => 0, options.executeCode);
  const operation = registry.claim(principal, document.id, 'test', 'boundary', {caseHash: hash(item)}).operation;
  const batch = await timedAsync('service34ActionsMs', () => service.batch(document, contract, [item], principal, operation));
  if(batch.outcome !== 'passed') throw new Error(`Boundary scenario did not pass: ${JSON.stringify(batch.cases[0].error)}`);
  const report = service.rawReport(batch.cases[0].reportId, principal);
  let maxResponseBytes = 0, pages = 0, oversizedFacts = 0;
  timed('readAllReportPagesMs', () => {
    let offset: number | null = 0;
    do {
      const page = service.report(report.reportId, principal, offset, 20) as {nextOffset: number | null; oversizedDetails: unknown[]};
      maxResponseBytes = Math.max(maxResponseBytes, bytes({ok: true, data: page})); oversizedFacts += page.oversizedDetails.length;
      offset = page.nextOffset; pages++;
      if(pages > 1000) throw new Error('Pagination did not terminate');
    } while(offset !== null);
  });
  if(maxResponseBytes > SemanticLimits.responseBytes) throw new Error('Report response exceeded its byte budget');
  const result = {
    schemaVersion: 1, engineBuild, node: process.versions.node, platform: process.platform, architecture: process.arch,
    workload: {screens: Object.keys(document.steps).length, blocks: Object.keys(document.blocks).length, messages: Object.keys(document.messages).length,
      buttons: Object.keys(document.buttons).length, documentBytes: documentBytes(document), documentByteLimit: ShellLimits.documentBytes,
      acceptedHeadlessActions: actions.length, serviceActions: item.steps.length, transcriptMessages: run.messages.length, observationCount: run.observations.length,
      overflowRejectedAtomically: rejected.run === run, codeCalls},
    timingsMs: Object.fromEntries(Object.entries(timings).map(([key, value]) => [key, Math.round(value * 100) / 100])),
    serializedBytes: {semanticIndex: bytes(semantic), runtimeWithDocument: bytes(run), runtimeWithoutDocument: bytes({...run, document: null}), report: bytes(report), retainedService: service.retainedBytes(), maxReportResponseEnvelope: maxResponseBytes},
    semantic: {entities: semantic.entities.length, edges: semantic.edges.length, diagnostics: semantic.diagnostics.length, searchHits: hits.length},
    reports: {outcome: batch.outcome, pages, oversizedFacts, resultHash: report.resultHash},
    processMemory: {measurement: 'sampled process values; uncontrolled GC; not peak memory', before: samples[0], after: samples.at(-1),
      maxSampledHeapUsed: Math.max(...samples.map(item => item.heapUsed)), maxSampledRss: Math.max(...samples.map(item => item.rss)), sampleCount: samples.length}
  };
  return result;
}

if(process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = process.argv[2] ?? 'semantic-artifacts/measurement.json';
  let engineBuild = 'measurement-only';
  try {engineBuild = JSON.parse(await readFile('semantic-dist/runtime-manifest.json', 'utf8')).engineBuild;} catch { /* Standalone measurements declare their missing build binding. */ }
  const result = await measureSemanticBoundary(engineBuild);
  await mkdir(dirname(output), {recursive: true}); await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({measurement: output, ...result}));
}
