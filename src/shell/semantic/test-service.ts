import {createHeadlessRun, HeadlessError, performTestAction, stopReason} from '../core/headless';
import type {ShellDocument, TestRun} from '../core/types';
import type {AssertionResult, BatchResult, CaseReport, CaseResult, CodeExecution, Principal, RunCheckpoint, TestAction, TestAssertion, TestCase, TestContract} from './contracts';
import {DomainError, SemanticLimits, bytes, canonical, checkHandle, errorCode, freeze, handle, hash, requireThat} from './common';
import {evaluateAssertion, hasPositiveAssertion, intermediateRuns, validateAssertionReferences} from './assertions';
import type {Operation} from './registry';
import {actionSchema, assertionSchema, casesSchema} from './test-schemas';
import {setImmediate as yieldToHost} from 'node:timers/promises';

interface ReportRecord {report: CaseReport; owner: string; botId: string}
interface AttemptEvidence {run: TestRun; attemptedStepCount: number; receipts: CaseReport['receipts']; assertions: AssertionResult[]}
type DetailKind = 'assertion' | 'receipt' | 'observation';
interface DetailEntry {kind: DetailKind; index: number; value: unknown}
const metadataReserve = 4096;
// A run may outlive the revision/candidate cache that supplied its immutable document.
// Charge that snapshot here; only run.document is the same reference within this record.
const checkpointBytes = (checkpoint: RunCheckpoint) => bytes({...checkpoint, run: {...checkpoint.run, document: null}});
export class TestService {
  private runs = new Map<string, RunCheckpoint>();
  private reports = new Map<string, ReportRecord>();
  private leases = new Map<string, string>();
  constructor(readonly epoch: string, readonly now: () => number, private executeCode: CodeExecution, private ensureCapacity: (extra: number) => void = () => {}) {}
  sweep(): void {
    const now=this.now();
    for(const [id,record] of this.runs) if(!this.leases.has(id)&&(now-record.accessedAt>=SemanticLimits.idleMs||now-record.createdAt>=SemanticLimits.lifetimeMs)) this.runs.delete(id);
    for(const [id,record] of this.reports) if(now>=record.report.expiresAt) this.reports.delete(id);
  }
  retainedBytes(): number {
    return [...this.runs.values()].reduce((sum,item)=>sum+checkpointBytes(item),0)+[...this.reports.values()].reduce((sum,item)=>sum+bytes(item),0);
  }
  private run(id:string,principal:Principal):RunCheckpoint {
    checkHandle(this.epoch,id);this.sweep();const record=this.runs.get(id);
    requireThat(record,'RUN_EXPIRED');requireThat(record.owner===principal.id&&principal.botIds.includes(record.document.id),'NOT_FOUND');
    return record;
  }
  private reportRecord(id: string, principal: Principal): ReportRecord {
    checkHandle(this.epoch, id); this.sweep(); const record = this.reports.get(id);
    requireThat(record, 'REPORT_EXPIRED');
    requireThat(record.owner === principal.id && principal.botIds.includes(record.botId), 'NOT_FOUND');
    return record;
  }
  /** One cursor covers every detail kind; failed assertions are first. */
  report(id: string, principal: Principal, offset = 0, limit = 20): unknown {
    requireThat(Number.isSafeInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1 && limit <= 20, 'INVALID_PAGE');
    const {observations, receipts, assertions, ...header} = this.reportRecord(id, principal).report;
    const assertionEntries: DetailEntry[] = assertions.map((value, index) => ({kind: 'assertion', index, value}));
    const details: DetailEntry[] = [
      ...assertionEntries.filter(item => !(item.value as AssertionResult).passed),
      ...assertionEntries.filter(item => (item.value as AssertionResult).passed),
      ...receipts.map((value, index): DetailEntry => ({kind: 'receipt', index, value})),
      ...observations.map((value, index): DetailEntry => ({kind: 'observation', index, value}))
    ];
    const page = {assertions: [] as unknown[], receipts: [] as unknown[], observations: [] as unknown[],
      oversizedDetails: [] as {kind: DetailKind; index: number; bytes: number}[]};
    const detailCounts = {assertions: assertions.length, receipts: receipts.length, observations: observations.length, total: details.length};
    const ceiling = SemanticLimits.responseBytes - metadataReserve;
    let cursor = Math.min(offset, details.length);
    const response = () => ({...header, ...page, detailCounts, nextOffset: cursor < details.length ? cursor : null});
    requireThat(bytes(response()) <= ceiling, 'DETAIL_HEADER_TOO_LARGE');
    for(let consumed = 0; cursor < details.length && consumed < limit; consumed++) {
      const item = details[cursor];
      const array = item.kind === 'assertion' ? page.assertions : item.kind === 'receipt' ? page.receipts : page.observations;
      array.push(item.value);
      if(bytes(response()) > ceiling) {
        array.pop();
        if(page.assertions.length || page.receipts.length || page.observations.length || page.oversizedDetails.length) break;
        page.oversizedDetails.push({kind: item.kind, index: item.index, bytes: bytes(item.value)});
      }
      cursor++;
    }
    return response();
  }
  rawReport(id: string, principal: Principal): CaseReport {
    return structuredClone(this.reportRecord(id, principal).report);
  }
  reportFragment(id: string, principal: Principal, detail: {kind: DetailKind; index: number; offset: number}): unknown {
    const report = this.reportRecord(id, principal).report;
    requireThat(['assertion', 'receipt', 'observation'].includes(detail.kind) && Number.isSafeInteger(detail.index) && detail.index >= 0 && Number.isSafeInteger(detail.offset) && detail.offset >= 0, 'INVALID_DETAIL');
    const source = detail.kind === 'assertion' ? report.assertions : detail.kind === 'receipt' ? report.receipts : report.observations;
    requireThat(detail.index < source.length, 'DETAIL_NOT_FOUND');
    const value = source[detail.index], serialized = canonical(value);
    requireThat(detail.offset <= serialized.length, 'INVALID_OFFSET');
    const content = serialized.slice(detail.offset, detail.offset + 6000);
    const next = detail.offset + content.length;
    return {reportId: id, kind: detail.kind, index: detail.index, offset: detail.offset, nextOffset: next < serialized.length ? next : null,
      totalCharacters: serialized.length, contentHash: hash(value), representation: 'json_fragment', content};
  }
  private summarize(report:CaseReport):CaseResult {
    const {candidateHash,testContractHash,caseDefinitionHash,origin,caseId,title,runId,runVersion,reportId,outcome,complete,stepsApplied,attemptedStepCount,resultHash,expiresAt,error}=report;
    const characters = [...title];
    const compactTitle = characters.length > 80 ? characters.slice(0, 80).join('') + '…' : title;
    const compactError = error && bytes(error.details) > 128 ? {...error, details: {truncated: true}} : error;
    return {candidateHash,testContractHash,caseDefinitionHash,origin,caseId,title:compactTitle,runId,runVersion,reportId,outcome,complete,stepsApplied,attemptedStepCount,resultHash,expiresAt,error:compactError};
  }
  async batch(document:ShellDocument,contract:TestContract,cases:TestCase[],principal:Principal,operation:Operation,onCase?:(result:CaseResult)=>void):Promise<BatchResult> {
    requireThat(casesSchema.safeParse(cases).success, 'INVALID_TEST_CASES');
    if(contract.origin === 'required_suite') for(const item of cases) {
      const required = contract.suite.cases.find(candidate => candidate.id === item.id);
      requireThat(required && hash(required) === hash(item), 'CASE_DEFINITION_MISMATCH');
    }
    const candidateHash=hash(document),batchId=handle(this.epoch,'batch'),results:CaseResult[]=[];
    for(const testCase of cases) {
      const runId=handle(this.epoch,'run');const at=this.now();let checkpoint:RunCheckpoint|undefined;
      try {
        if(operation.controller.signal.aborted) throw new DomainError('CANCELLED');
        const internalId='sim-'+hash({candidateHash,contract:contract.hash,caseId:testCase.id,given:testCase.given}).slice(0,24);
        const run=createHeadlessRun(document,internalId,testCase.given);run.document=document;
        checkpoint={run,document,contract,caseId:testCase.id,title:testCase.title,version:0,owner:principal.id,createdAt:at,accessedAt:at,candidateHash,caseDefinitionHash:hash(testCase)};
        requireThat(checkpointBytes(checkpoint) <= SemanticLimits.caseBytes, 'RESOURCE_LIMIT');
        this.ensureCapacity(checkpointBytes(checkpoint));
        this.runs.set(runId,checkpoint);
        const report=await this.segment(runId,checkpoint,testCase.steps,testCase.expect,operation,true);
        const summary=this.summarize(report);results.push(summary);onCase?.(summary);
      } catch(cause) {
        const report=this.blocked(runId,checkpoint,testCase,document,contract,cause,hash(testCase));
        this.storeReport(report,principal.id,document.id);const summary=this.summarize(report);results.push(summary);onCase?.(summary);
      }
    }
    const outcome=results.some(item=>item.outcome==='blocked')?'blocked':results.some(item=>item.outcome==='failed')?'failed':results.some(item=>item.outcome==='observed')?'observed':'passed';
    return {operationId:operation.id,batchId,candidateHash,testContractHash:contract.hash,outcome,complete:results.every(item=>item.complete),cases:results,expiresAt:this.now()+SemanticLimits.lifetimeMs};
  }
  async continue(runId:string,version:number,steps:TestAction[],expect:TestAssertion[],principal:Principal,operation:Operation):Promise<CaseResult> {
    const checkpoint=this.run(runId,principal);
    requireThat(checkpoint.version===version,'RUN_VERSION_CONFLICT');
    requireThat(!this.leases.has(runId),'RUN_BUSY');
    return this.summarize(await this.segment(runId,checkpoint,steps,expect,operation));
  }
  private blocked(runId: string, checkpoint: RunCheckpoint | undefined, testCase: Pick<TestCase, 'id' | 'title'> & Partial<Pick<TestCase, 'given'>>,
    document: ShellDocument, contract: TestContract, cause: unknown, caseDefinitionHash = checkpoint?.caseDefinitionHash ?? '', evidence?: AttemptEvidence, certifying = true): CaseReport {
    const code = errorCode(cause);
    let details = cause && typeof cause === 'object' && 'details' in cause ? cause.details : null;
    if(cause instanceof HeadlessError) details = {message: cause.message};
    if(bytes(details) > 1024) details = {truncated: true, bytes: bytes(details)};
    const from = checkpoint?.run.observations.length ?? 0;
    const run = evidence?.run ?? checkpoint?.run;
    const report: CaseReport = {reportId: handle(this.epoch, 'report'), runId, runVersion: checkpoint?.version ?? 0, caseId: testCase.id, title: testCase.title,
      candidateHash: hash(document), testContractHash: contract.hash, caseDefinitionHash, origin: certifying ? contract.origin : 'ad_hoc', kind: 'simulation',
      outcome: 'blocked', complete: false, stepsApplied: 0, attemptedStepCount: evidence?.attemptedStepCount ?? 0, evidenceTruncated: false,
      fromObservationSeq: from, toObservationSeq: run?.observations.length ?? from, startAt: checkpoint?.run.now ?? testCase.given?.startAt ?? 0,
      endAt: run?.now ?? testCase.given?.startAt ?? 0, receipts: [], assertions: [], observations: [],
      stopReason: run ? stopReason(run) : 'not_started', error: {code, details}, resultHash: '', expiresAt: this.now() + SemanticLimits.lifetimeMs};
    let used = bytes(report) + metadataReserve;
    const capture = <T>(target: T[], values: T[]): void => {
      for(const value of values) {
        const extra = bytes(value) + 1;
        if(used + extra > SemanticLimits.caseBytes) {report.evidenceTruncated = true; break;}
        target.push(value); used += extra;
      }
    };
    const assertions = evidence?.assertions ?? [];
    capture(report.assertions, [...assertions.filter(item => !item.passed), ...assertions.filter(item => item.passed)]);
    capture(report.receipts, evidence?.receipts ?? []);
    capture(report.observations, run?.observations.slice(from) ?? []);
    report.resultHash = this.resultHash(report, run);
    return report;
  }
  private resultHash(report: CaseReport, run?: TestRun): string {
    return hash({candidateHash: report.candidateHash, contractHash: report.testContractHash, caseDefinitionHash: report.caseDefinitionHash,
      caseId: report.caseId, outcome: report.outcome, observations: report.observations, assertions: report.assertions, receipts: report.receipts,
      attemptedStepCount: report.attemptedStepCount, evidenceTruncated: report.evidenceTruncated, error: report.error,
      state: run ? {variables: run.variables, tables: run.tables, now: run.now, stopReason: report.stopReason} : null});
  }
  private storeReport(report: CaseReport, owner: string, botId: string): void {
    const record = {report, owner, botId};
    requireThat(bytes(record) <= SemanticLimits.caseBytes, 'RESOURCE_LIMIT'); this.ensureCapacity(bytes(record));
    this.reports.set(report.reportId, {report: freeze(report), owner, botId});
  }
  private async segment(runId: string, checkpoint: RunCheckpoint, steps: TestAction[], expect: TestAssertion[], operation: Operation, certifying = false): Promise<CaseReport> {
    requireThat(!this.leases.has(runId), 'RUN_BUSY');
    requireThat(steps.length > 0 && steps.length <= SemanticLimits.actions && steps.every(item => actionSchema.safeParse(item).success), 'INVALID_TEST_ACTIONS');
    requireThat(expect.length <= 100 && expect.every(item => assertionSchema.safeParse(item).success), 'INVALID_ASSERTIONS');
    validateAssertionReferences(checkpoint.document, expect, steps.length);
    requireThat(checkpoint.version === 0 || !expect.some(item => item.when === 'always' && item.scope === 'whole_run'), 'ASSERTION_HISTORY_UNAVAILABLE');
    for(const assertion of expect) requireThat(assertion.scope !== 'segment' || assertion.until === null || assertion.until >= checkpoint.run.now, 'ASSERTION_HORIZON_BEFORE_SEGMENT');
    const lease = handle(this.epoch, 'lease'); this.leases.set(runId, lease);
    const signal = operation.controller.signal;
    const invalidate = () => {if(this.leases.get(runId) === lease) this.leases.delete(runId);};
    signal.addEventListener('abort', invalidate, {once: true});
    let working = structuredClone(checkpoint.run); working.document = checkpoint.document;
    const from = working.observations.length, receipts: CaseReport['receipts'] = [], checked: AssertionResult[] = [];
    let attemptedStepCount = 0, checkedBytes = 2, receiptsBytes = 2;
    let runtimeBytes = checkpointBytes({...checkpoint, run: working}) + bytes(working.observations.slice(from));
    const always = expect.filter(item => item.when === 'always');
    const stillOwns = () => !signal.aborted && this.leases.get(runId) === lease && this.runs.get(runId) === checkpoint;
    const recordAssertion = (result: AssertionResult): void => {
      const extra = bytes(result) + 1;
      requireThat(runtimeBytes + checkedBytes + extra + receiptsBytes + metadataReserve <= SemanticLimits.caseBytes, 'RESOURCE_LIMIT');
      checked.push(result); checkedBytes += extra;
    };
    try {
      requireThat(stillOwns(), 'CANCELLED');
      for(const assertion of always) recordAssertion(evaluateAssertion(assertion, working, from, receipts));
      for(let index = 0; index < steps.length; index++) {
        const before = working; attemptedStepCount = index + 1;
        const next = await performTestAction(working, steps[index], {signal, executeCode: this.executeCode});
        requireThat(stillOwns(), 'CANCELLED'); working = next.run;
        runtimeBytes = checkpointBytes({...checkpoint, run: working}) + bytes(working.observations.slice(from));
        const receiptBytes = bytes(next.receipt) + 1;
        requireThat(runtimeBytes + checkedBytes + receiptsBytes + receiptBytes + metadataReserve <= SemanticLimits.caseBytes, 'RESOURCE_LIMIT');
        receipts.push(next.receipt); receiptsBytes += receiptBytes;
        const expectedDisposition = expect.some(item => item.predicate.type === 'receipt' && item.predicate.actionIndex === index &&
          item.predicate.disposition === next.receipt.disposition && (item.predicate.code === null || item.predicate.code === next.receipt.code));
        if(next.receipt.disposition !== 'accepted' && !expectedDisposition) throw new DomainError('INPUT_NOT_CONSUMED', 'INPUT_NOT_CONSUMED', {actionIndex: index, receipt: next.receipt});
        for(const point of intermediateRuns(before, working)) for(const assertion of always) recordAssertion(evaluateAssertion(assertion, point, from, receipts));
        // Inputs and pure time advances can change variables without another committed block.
        for(const assertion of always) recordAssertion(evaluateAssertion(assertion, working, from, receipts));
        for(const assertion of expect.filter(item => item.when === 'after_step' && item.afterStep === index)) recordAssertion(evaluateAssertion(assertion, working, from, receipts));
        // Resolved promises alone do not admit HTTP cancellation or the host deadline timer.
        await yieldToHost(); requireThat(stillOwns(), 'CANCELLED');
      }
      for(const assertion of expect.filter(item => item.when === 'at_end')) recordAssertion(evaluateAssertion(assertion, working, from, receipts));
      const outcome = working.phase === 'failed' || checked.some(item => !item.passed) ? 'failed' : hasPositiveAssertion(expect) ? 'passed' : 'observed';
      const report: CaseReport = {reportId: handle(this.epoch, 'report'), runId, runVersion: checkpoint.version + 1, caseId: checkpoint.caseId, title: checkpoint.title,
        candidateHash: checkpoint.candidateHash, testContractHash: checkpoint.contract.hash, caseDefinitionHash: checkpoint.caseDefinitionHash,
        origin: certifying ? checkpoint.contract.origin : 'ad_hoc', kind: 'simulation', outcome, complete: true, stepsApplied: steps.length,
        attemptedStepCount, evidenceTruncated: false, fromObservationSeq: from, toObservationSeq: working.observations.length,
        startAt: checkpoint.run.now, endAt: working.now, receipts, assertions: checked, observations: working.observations.slice(from), stopReason: stopReason(working),
        error: working.phase === 'failed' ? {code: 'BOT_RUNTIME_ERROR', details: null} : null, resultHash: '', expiresAt: this.now() + SemanticLimits.lifetimeMs};
      report.resultHash = this.resultHash(report, working);
      const nextCheckpoint: RunCheckpoint = {...checkpoint, run: working, version: checkpoint.version + 1, accessedAt: this.now()};
      const record = {report, owner: checkpoint.owner, botId: checkpoint.document.id};
      requireThat(checkpointBytes(nextCheckpoint) + bytes(record) <= SemanticLimits.caseBytes, 'RESOURCE_LIMIT');
      this.ensureCapacity(bytes(record) + checkpointBytes(nextCheckpoint) - checkpointBytes(checkpoint));
      requireThat(stillOwns(), 'CANCELLED');
      this.reports.set(report.reportId, {...record, report: freeze(report)});
      this.runs.set(runId, nextCheckpoint);
      return report;
    } catch(cause) {
      const evidenceRun = cause instanceof HeadlessError && cause.run ? cause.run : working;
      const report = this.blocked(runId, checkpoint, {id: checkpoint.caseId, title: checkpoint.title}, checkpoint.document, checkpoint.contract,
        cause, checkpoint.caseDefinitionHash, {run: evidenceRun, attemptedStepCount, receipts, assertions: checked}, certifying);
      this.storeReport(report, checkpoint.owner, checkpoint.document.id); return report;
    } finally {invalidate(); signal.removeEventListener('abort', invalidate);}
  }
}
