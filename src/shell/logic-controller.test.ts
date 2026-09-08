import {afterEach, expect, it, vi} from 'vitest';
import {createController} from './controller';
import type {CodeRequest, JsonValue} from './core/types';

afterEach(() => vi.useRealTimers());
function deferredCode() {
  const calls: {request: CodeRequest; signal: AbortSignal; resolve(result: {outcome: string; data?: JsonValue}): void}[] = [];
  const controller = createController({now: () => 1000, executeCode: (request, signal) => new Promise(resolve => calls.push({request, signal, resolve}))});
  controller.mutate({type: 'add_block', stepId: 'start', afterBlockId: 'start-message', messageText: null, block: {
    id: 'eligibility', type: 'code', name: 'Eligibility', source: 'export default function run(ctx: RoboContext) {return {outcome:"success"};}',
    outcomes: [{id: 'yes', name: 'success', transition: {type: 'continue'}}], resultVariableId: null
  }});
  controller.mutate({type: 'add_block', stepId: 'start', afterBlockId: 'eligibility', messageText: null, block: {
    id: 'debit', type: 'action', action: {type: 'increment', variableId: 'user.balance', amount: -1000}, success: {type: 'end'}, error: null
  }});
  expect(controller.editor().error).toBeNull();
  return {controller, calls};
}
it('restart retires the old worker before a late result can debit the new run or clear its pending state', async () => {
  const {controller: c, calls} = deferredCode();
  try {
    c.startTest(); const first = c.run()!.id;
    c.startTest(); const second = c.run()!.id;
    expect(first).not.toBe(second); expect(calls).toHaveLength(2); expect(calls[0].signal.aborted).toBe(true);
    const pending = c.run()!.pending;
    calls[0].resolve({outcome: 'success'}); await Promise.resolve(); await Promise.resolve();
    expect(c.run()!.id).toBe(second); expect(c.run()!.pending).toBe(pending); expect(c.run()!.variables['user.balance']).toBe(1500);
    calls[1].resolve({outcome: 'success'}); await Promise.resolve(); await Promise.resolve();
    expect(c.run()!.variables['user.balance']).toBe(500); expect(c.run()!.pending).toBeNull();
    expect(c.run()!.trace.filter(item => item.blockId === 'debit' && item.status === 'succeeded')).toHaveLength(1);
  } finally {c.dispose();}
});
it('leaving Test aborts execution and a late completion cannot resurrect a transcript', async () => {
  const {controller: c, calls} = deferredCode();
  try {
    c.startTest(); c.exitTest(); expect(calls[0].signal.aborted).toBe(true);
    calls[0].resolve({outcome: 'success'}); await Promise.resolve(); await Promise.resolve();
    expect(c.run()).toBeNull(); expect(c.editor().document.blocks.debit.type).toBe('action');
  } finally {c.dispose();}
});
it('test data edits affect the next snapshot and reject incompatible values', () => {
  const {controller: c} = deferredCode();
  try {
    c.startTest(); c.setTestVariable('user.balance', 500);
    expect(c.run()!.variables['user.balance']).toBe(1500); expect(c.testSeed().variables['user.balance']).toBe(500);
    c.setTestVariable('user.balance', 'invalid'); expect(c.testSeed().variables['user.balance']).toBe(500);
    c.startTest(); expect(c.run()!.variables['user.balance']).toBe(500);
  } finally {c.dispose();}
});
