import {describe, expect, it} from 'vitest';
import {createFixture} from './core/fixture';
import {summarizeReport} from './companion-report';

describe('specific test feedback', () => {
  it('shows a missing message count and links to the expected screen even without observations', () => {
    const summary = summarizeReport({reportId: 'report', assertions: [{id: 'material', passed: false,
      expected: {type: 'message', messageId: 'material-message', contains: null, min: 1, max: 1}, actual: 0}], observations: [], error: null, nextOffset: 20}, createFixture());
    expect(summary.failed[0]).toMatchObject({expected: '1', actual: '0', stepId: 'material'});
    expect(summary.failed[0].title).toContain('Сообщение');
    expect(summary.rows[0].stepId).toBe('material'); expect(summary.nextOffset).toBe(20);
  });
  it('preserves runtime error code and specific message when there are no failed assertions', () => {
    const summary = summarizeReport({reportId: 'report', assertions: [], observations: [], error: {code: 'BOT_RUNTIME_ERROR', details: {message: 'Недостаточно средств'}}, nextOffset: null}, createFixture());
    expect(summary.error).toBe('BOT_RUNTIME_ERROR · Недостаточно средств'); expect(summary.failed).toEqual([]);
  });
  it('formats expected and actual variable/receipt results, bounds long values and omits passed checks', () => {
    const summary = summarizeReport({reportId: 'report', assertions: [
      {id: 'balance', passed: false, expected: {type: 'variable', variableId: 'user.balance', operator: 'gte', value: 0}, actual: -500},
      {id: 'accepted', passed: false, expected: {type: 'receipt', actionIndex: 1, disposition: 'accepted', code: null}, actual: {disposition: 'rejected', code: 'BUTTON_INACTIVE'}},
      {id: 'large', passed: false, expected: {type: 'variable', variableId: 'user.name', operator: 'eq', value: 'x'.repeat(10000)}, actual: 'y'.repeat(10000)},
      {id: 'passed', passed: true, expected: {type: 'stop', reason: 'ended'}, actual: 'ended'}
    ], error: null}, createFixture());
    expect(summary.failed[0]).toMatchObject({expected: '≥ 0', actual: '-500'});
    expect(summary.failed[1]).toMatchObject({title: 'Действие 2', expected: 'принято', actual: 'отклонено · BUTTON_INACTIVE'});
    expect(summary.failed[2].actual.length).toBeLessThan(200); expect(summary.failed).toHaveLength(3);
  });
});
