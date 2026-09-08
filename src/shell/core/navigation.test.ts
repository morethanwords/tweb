import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {allStepIds, isTerminalStep, stepSummary} from './navigation';

describe('screen summaries', () => {
  it('uses actual entry and graph structure instead of sidebar position', () => {
    const document = createFixture();
    document.folderOrder.reverse();
    expect(stepSummary(document, 'start').isEntry).toBe(true);
    expect(stepSummary(document, 'menu').isEntry).toBe(false);
    expect(allStepIds(document).map(id => stepSummary(document, id).isTerminal)).toEqual([false, false, false, false, false, false, false]);
  });

  it('reports empty drafts separately and does not invent an ending for one', () => {
    const document = createFixture();
    document.messages['start-message'].rows = [];
    document.content.messages['start-message'] = ' \n ';
    const summary = stepSummary(document, 'start');
    expect(summary).toEqual({preview: 'Добавьте сообщение', isEntry: true, isTerminal: false, isEmpty: true, unassigned: 0});
    document.content.messages['start-message'] = 'Спасибо за внимание';
    expect(isTerminalStep(document, 'start')).toBe(true);
    expect(stepSummary(document, 'start').isTerminal).toBe(true);
  });

  it('counts only unassigned destinations and leaves other readiness reasons to buttonReadiness', () => {
    const document = createFixture();
    document.buttons['start-offer'].targetStepId = null;
    document.content.buttons['start-menu'] = '';
    expect(stepSummary(document, 'start').unassigned).toBe(1);
    expect(stepSummary(document, 'start').isTerminal).toBe(false);
  });

  it('collapses preview whitespace and limits the complete preview to 100 code points', () => {
    const document = createFixture();
    document.content.messages['start-message'] = '  Первая\n\nстрока\tи вторая  ';
    expect(stepSummary(document, 'start').preview).toBe('Первая строка и вторая');
    document.content.messages['start-message'] = '😀'.repeat(100);
    expect(stepSummary(document, 'start').preview).toBe('😀'.repeat(100));
    document.content.messages['start-message'] += 'X';
    expect(stepSummary(document, 'start').preview).toBe('😀'.repeat(99) + '…');
    expect(Array.from(stepSummary(document, 'start').preview)).toHaveLength(100);
  });

  it('rejects a missing selected screen explicitly', () => {
    expect(() => stepSummary(createFixture(), 'missing')).toThrow('Шаг больше не существует.');
  });
});
