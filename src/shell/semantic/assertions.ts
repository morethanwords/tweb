import type {TestRun, JsonValue, ShellDocument} from '../core/types';
import {stopReason} from '../core/headless';
import {OrdersColumns, valueMatches} from '../core/values';
import type {TestAssertion, AssertionResult, InputReceipt, Observation} from './contracts';
import {canonical, requireThat} from './common';

export function hasPositiveAssertion(assertions: TestAssertion[]): boolean {
  return assertions.some(({predicate: p}) => 'min' in p ? p.min > 0 : p.type === 'variable' ? p.operator === 'eq' || p.operator === 'exists' : p.type === 'receipt' ? p.disposition === 'accepted' : p.type === 'stop');
}
export function validateAssertionReferences(document: ShellDocument, assertions: TestAssertion[], actionCount: number): void {
  requireThat(assertions.length <= 100 && new Set(assertions.map(item => item.id)).size === assertions.length, 'INVALID_ASSERTIONS');
  for(const assertion of assertions) {
    const p=assertion.predicate;
    requireThat(assertion.when !== 'always' || p.type === 'variable' || p.type === 'table', 'ASSERTION_TYPE_MISMATCH');
    requireThat(assertion.until === null || ['message', 'screen', 'effect'].includes(p.type), 'ASSERTION_TYPE_MISMATCH');
    requireThat((assertion.when === 'after_step') === (assertion.afterStep !== null), 'ASSERTION_REFERENCE_UNKNOWN');
    if(p.type==='variable') {
      requireThat(Object.hasOwn(document.variables,p.variableId),'ASSERTION_REFERENCE_UNKNOWN',p.variableId);
      const definition = document.variables[p.variableId];
      if(p.operator === 'gte' || p.operator === 'lte') requireThat(definition.valueType === 'number' && typeof p.value === 'number', 'ASSERTION_TYPE_MISMATCH', p.variableId);
      else if(p.operator !== 'exists') requireThat(valueMatches(p.value, definition.valueType), 'ASSERTION_TYPE_MISMATCH', p.variableId);
    }
    if(p.type === 'table') for(const [id, value] of Object.entries(p.where)) {
      const column = OrdersColumns.find(item => item.id === id);
      requireThat(column, 'ASSERTION_REFERENCE_UNKNOWN', id);
      requireThat(typeof value === column.valueType, 'ASSERTION_TYPE_MISMATCH', id);
    }
    if(p.type==='message') requireThat(Object.hasOwn(document.messages,p.messageId),'ASSERTION_REFERENCE_UNKNOWN',p.messageId);
    if(p.type==='screen') requireThat(Object.hasOwn(document.steps,p.stepId),'ASSERTION_REFERENCE_UNKNOWN',p.stepId);
    if(p.type==='effect') requireThat(document.blocks[p.blockId]?.type === 'action','ASSERTION_REFERENCE_UNKNOWN',p.blockId);
    if(p.type==='receipt') requireThat(p.actionIndex<actionCount,'ASSERTION_REFERENCE_UNKNOWN',p.actionIndex);
    requireThat(assertion.afterStep===null||Number.isInteger(assertion.afterStep)&&assertion.afterStep>=0&&assertion.afterStep<actionCount,'ASSERTION_REFERENCE_UNKNOWN');
  }
}
function matches(actual: JsonValue | undefined, operator: string, expected: JsonValue): boolean {
  if(operator==='exists') return actual!==undefined && actual!==null;
  if(actual===undefined) return false;
  if(operator==='eq') return canonical(actual)===canonical(expected);
  if(operator==='neq') return canonical(actual)!==canonical(expected);
  return typeof actual==='number'&&typeof expected==='number'&&(operator==='gte'?actual>=expected:actual<=expected);
}
export function evaluateAssertion(assertion: TestAssertion, run: TestRun, from: number, receipts: InputReceipt[], observations: Observation[] = run.observations): AssertionResult {
  requireThat(assertion.until===null || assertion.until<=run.now,'ASSERTION_HORIZON_NOT_REACHED');
  const rows=observations.filter((item,index)=>(assertion.scope==='whole_run'||index>=from)&&(assertion.until===null||item.at<=assertion.until));
  const p=assertion.predicate; let actual: unknown; let passed=false;
  if(p.type==='variable') {actual=run.variables[p.variableId]??null; passed=matches(run.variables[p.variableId],p.operator,p.value);}
  else if(p.type==='receipt') {actual=receipts[p.actionIndex]??null; const receipt=receipts[p.actionIndex]; passed=!!receipt&&receipt.disposition===p.disposition&&(p.code===null||receipt.code===p.code);}
  else if(p.type==='stop') {actual=stopReason(run);passed=actual===p.reason;}
  else {
    let count=0;
    if(p.type==='message') count=rows.flatMap(item=>item.messages).filter(item=>item.messageId===p.messageId&&(p.contains===null||item.text.includes(p.contains))).length;
    if(p.type==='screen') count=new Set(rows.filter(item=>item.stepId===p.stepId).map(item=>item.visitId)).size;
    if(p.type==='effect') count=rows.filter(item=>item.blockId===p.blockId&&item.status==='succeeded'&&run.document.blocks[item.blockId]?.type==='action').length;
    if(p.type==='table') count=run.tables.orders.filter(row=>Object.entries(p.where).every(([key,value])=>row[key]!==undefined&&canonical(row[key])===canonical(value))).length;
    actual=count;passed=count>=p.min&&(p.max===null||count<=p.max);
  }
  return {id:assertion.id,passed,checkedAt:run.now,observationSequence:observations.length,expected:p,actual};
}
/** Observe committed intermediate deltas without directing or short-circuiting bot execution. */
export function* intermediateRuns(before: TestRun, after: TestRun): Generator<TestRun> {
  // Deltas are relative to the last committed observation, not the latest input.
  // Rejected answers and clock-only actions can change state without emitting a block.
  let variables=structuredClone(before.observationCheckpoint.variables), orders=structuredClone(before.observationCheckpoint.tables.orders);
  for(let index=before.observations.length;index<after.observations.length;index++) {
    const observation=after.observations[index];
    for(const [key,change] of Object.entries(observation.variables)) {if(change.afterPresent) variables[key]=structuredClone(change.after);else delete variables[key];}
    const change=observation.tables.orders;
    orders=orders.filter(row=>!change.deleted.some(deleted=>deleted.id===row.id));
    for(const updated of change.updated) orders=orders.map(row=>row.id===updated.id?structuredClone(updated.after):row);
    orders.push(...structuredClone(change.inserted));
    yield {...after,now:observation.at,variables:structuredClone(variables),tables:{orders:structuredClone(orders)},observations:after.observations.slice(0,index+1)};
  }
}
