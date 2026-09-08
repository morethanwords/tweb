import type {JsonValue, ShellDocument, TestRun, CodeRequest} from '../core/types';
import type {Fixture, TestAction, InputReceipt, Observation} from '../core/headless';
export type {Fixture, TestAction, InputReceipt, Observation};

export type Outcome = 'passed' | 'failed' | 'blocked' | 'observed';
export interface Principal {id: string; botIds: string[]; scopes: string[]}
export type AssertionPredicate =
  | {type: 'variable'; variableId: string; operator: 'eq' | 'neq' | 'gte' | 'lte' | 'exists'; value: JsonValue}
  | {type: 'message'; messageId: string; contains: string | null; min: number; max: number | null}
  | {type: 'screen'; stepId: string; min: number; max: number | null}
  | {type: 'effect'; blockId: string; min: number; max: number | null}
  | {type: 'table'; table: 'orders'; where: Record<string, JsonValue>; min: number; max: number | null}
  | {type: 'receipt'; actionIndex: number; disposition: InputReceipt['disposition']; code: string | null}
  | {type: 'stop'; reason: string};
export interface TestAssertion {id: string; when: 'at_end' | 'after_step' | 'always'; afterStep: number | null; scope: 'segment' | 'whole_run'; until: number | null; predicate: AssertionPredicate}
export interface TestCase {id: string; title: string; given: Fixture; steps: TestAction[]; expect: TestAssertion[]}
export interface RequiredSuite {id: string; version: number; cases: TestCase[]}
export interface TestContract {origin: 'required_suite' | 'ad_hoc'; suite: RequiredSuite; engineBuild: string; fixturePolicy: 'explicit-v1'; hash: string}
export type Target = {kind: 'revision'; revision: string | null} | {kind: 'change'; changeId: string};
export interface AssertionResult {id: string; passed: boolean; checkedAt: number; observationSequence: number; expected: unknown; actual: unknown}
export interface CaseReport {
  reportId: string; runId: string; runVersion: number; caseId: string; title: string;
  candidateHash: string; testContractHash: string; caseDefinitionHash: string; origin: 'required_suite' | 'ad_hoc'; kind: 'simulation'; outcome: Outcome; complete: boolean; stepsApplied: number; attemptedStepCount: number; evidenceTruncated: boolean;
  fromObservationSeq: number; toObservationSeq: number; startAt: number; endAt: number;
  receipts: InputReceipt[]; assertions: AssertionResult[]; observations: Observation[];
  stopReason: string; error: {code: string; details: unknown} | null; resultHash: string; expiresAt: number;
}
export interface CaseResult {candidateHash: string; testContractHash: string; caseDefinitionHash: string; origin: 'required_suite' | 'ad_hoc'; caseId: string; title: string; runId: string; runVersion: number; reportId: string; outcome: Outcome; complete: boolean; stepsApplied: number; attemptedStepCount: number; resultHash: string; expiresAt: number; error: CaseReport['error']}
export interface BatchResult {operationId: string; batchId: string; candidateHash: string; testContractHash: string; outcome: Outcome; complete: boolean; cases: CaseResult[]; expiresAt: number}
export type CodeExecution = (request: CodeRequest, signal: AbortSignal) => Promise<{ok: true; outcome: string; data: JsonValue} | {ok: false; error: string; infrastructure?: boolean}>;
export interface RunCheckpoint {run: TestRun; document: ShellDocument; contract: TestContract; caseId: string; title: string; version: number; owner: string; createdAt: number; accessedAt: number; candidateHash: string; caseDefinitionHash: string}
