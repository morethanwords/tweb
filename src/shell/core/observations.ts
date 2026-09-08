import {ShellLimits, type Observation, type TestRun} from './types';
import {interpolateText} from './values';

export type ObservationFacts = Pick<Observation, 'decision' | 'effect' | 'wait'>;

/** Called only at a committed block boundary. References in the checkpoint are immutable. */
export function observeBlock(run: TestRun, status: Observation['status'], outcome: string, facts: ObservationFacts = {}): TestRun {
  if(run.suppressObservations) return run;
  const blockId = run.document.steps[run.cursor.stepId].blockIds[run.cursor.blockIndex];
  if(!blockId) return run;
  if(run.observations.length >= ShellLimits.traceEntries) return {...run, phase: 'limited', error: 'Достигнут лимит наблюдений выполнения.'};
  const before = run.observationCheckpoint;
  const variables: Observation['variables'] = {};
  for(const id of new Set([...Object.keys(before.variables), ...Object.keys(run.variables)])) {
    const beforePresent = Object.hasOwn(before.variables, id), afterPresent = Object.hasOwn(run.variables, id);
    if(beforePresent !== afterPresent || JSON.stringify(before.variables[id]) !== JSON.stringify(run.variables[id])) {
      variables[id] = {beforePresent, afterPresent, before: before.variables[id] ?? null, after: run.variables[id] ?? null};
    }
  }
  const oldRows = new Map(before.tables.orders.map(row => [String(row.id), row]));
  const newRows = new Map(run.tables.orders.map(row => [String(row.id), row]));
  const orders: Observation['tables']['orders'] = {inserted: [], updated: [], deleted: []};
  for(const [id, row] of newRows) {
    const previous = oldRows.get(id);
    if(!previous) orders.inserted.push(row);
    else if(JSON.stringify(previous) !== JSON.stringify(row)) orders.updated.push({id, before: previous, after: row});
  }
  for(const [id, row] of oldRows) if(!newRows.has(id)) orders.deleted.push(row);
  const messages: Observation['messages'] = run.messages.slice(before.messageCount).flatMap(message => message.kind !== 'bot' ? [] : [{
    occurrenceId: message.id, messageId: message.messageId, frameId: message.frameId,
    text: interpolateText(run.document.content.messages[message.messageId], message.values),
    buttons: run.document.messages[message.messageId].rows.flatMap(row => row.buttonIds.map(buttonId => ({
      buttonId, label: interpolateText(run.document.content.buttons[buttonId], message.values), transition: run.document.buttons[buttonId].transition
    })))
  }]);
  const observation: Observation = structuredClone({sequence: run.observations.length + 1, at: run.now, kind: 'block',
    activationId: run.cursor.activationId, blockId, stepId: run.cursor.stepId, frameId: run.cursor.frameId, visitId: run.cursor.visitId, status, outcome,
    variables, tables: {orders}, messages, ...facts});
  if(run.captureByteLimit !== undefined && new TextEncoder().encode(JSON.stringify({document: run.document,
    variables: run.variables, tables: run.tables, messages: run.messages, trace: run.trace, eventFingerprints: run.eventFingerprints,
    observations: [...run.observations, observation], checkpoint: {variables: run.variables, tables: run.tables}})).byteLength > run.captureByteLimit) {
    return {...run, variables: before.variables, tables: before.tables, messages: run.messages.slice(0, before.messageCount),
      pending: null, phase: 'limited', error: 'Достигнут лимит памяти наблюдений выполнения.'};
  }
  return {...run, observations: [...run.observations, observation],
    observationCheckpoint: {variables: run.variables, tables: run.tables, messageCount: run.messages.length}};
}
