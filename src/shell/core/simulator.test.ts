import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {activate, buttonReadiness, finishReply, messageText, startRun} from './simulator';
import {ShellLimits} from './types';
import type {TestRun} from './types';

function pendingStep(run: TestRun) {
  if(run.pending?.kind !== 'step') throw new Error('Expected pending screen reply');
  return run.pending;
}

function choose(run: TestRun, buttonId: string, at: number): TestRun {
  const waiting = activate(run, run.activeMessageId, buttonId, at);
  expect(waiting.pending).not.toBeNull();
  return finishReply(waiting, waiting.id, waiting.pending!.id, pendingStep(waiting).dueAt)!;
}

describe('local visitor runtime', () => {
  it('starts one bot occurrence with a detached version and no authoring mutation', () => {
    const document = createFixture();
    const run = startRun(document, 'visitor-1', 1000);
    expect(run.messages).toMatchObject([{id: 'visitor-1:message:0', kind: 'bot', stepId: 'start', messageId: 'start-message', at: 1000}]);
    expect(run.phase).toBe('ready');
    document.content.messages['start-message'] = 'Owner changed after Test started';
    expect(messageText(run, run.messages[0])).not.toContain('Owner changed');
  });

  it('atomically accepts one occurrence activation even before UI renders a disabled button', () => {
    const run = startRun(createFixture(), 'visitor-1', 1000);
    const waiting = activate(run, run.activeMessageId, 'start-offer', 1100);
    expect(waiting.messages).toHaveLength(2);
    expect(waiting.phase).toBe('waiting');
    expect(pendingStep(waiting).dueAt).toBe(1450);
    expect(waiting.messages[1]).toMatchObject({kind: 'user', buttonId: 'start-offer', stepId: 'start'});
    expect(activate(waiting, run.activeMessageId, 'start-offer', 1100)).toBe(waiting);
    expect(activate(waiting, run.activeMessageId, 'start-menu', 1101)).toBe(waiting);
    expect(run.messages).toHaveLength(1);
  });

  it('finishes an exact pending reply once; early, mismatched and repeated timers are inert', () => {
    const start = startRun(createFixture(), 'visitor-1', 1000);
    const waiting = activate(start, start.activeMessageId, 'start-offer', 1100);
    expect(finishReply(waiting, waiting.id, waiting.pending!.id, 1449)).toBe(waiting);
    expect(finishReply(waiting, 'other-run', waiting.pending!.id, 2000)).toBe(waiting);
    expect(finishReply(waiting, waiting.id, 'other-reply', 2000)).toBe(waiting);
    const ready = finishReply(waiting, waiting.id, waiting.pending!.id, 2000)!;
    expect(ready.messages).toHaveLength(3);
    expect(ready.messages[2]).toMatchObject({id: 'visitor-1:message:2', kind: 'bot', stepId: 'offer', messageId: 'offer-message', at: 1450});
    expect(ready.phase).toBe('ready');
    expect(ready.pending).toBeNull();
    expect(finishReply(ready, waiting.id, waiting.pending!.id, 2001)).toBe(ready);
  });

  it('old keyboard activation stays rejected after a new reply and after returning to the same step', () => {
    const start = startRun(createFixture(), 'visitor-1', 0);
    const menu = choose(start, 'start-menu', 0);
    expect(activate(menu, start.activeMessageId, 'start-offer', 350)).toBe(menu);
    const returned = choose(menu, 'menu-start', 350);
    expect(returned.messages[4]).toMatchObject({kind: 'bot', stepId: 'start'});
    expect(returned.activeMessageId).not.toBe(start.activeMessageId);
    expect(activate(returned, start.activeMessageId, 'start-menu', 700)).toBe(returned);
    const repeated = activate(returned, returned.activeMessageId, 'start-menu', 700);
    expect(repeated.phase).toBe('waiting');
    expect(repeated.pending?.id).not.toBe(activate(start, start.activeMessageId, 'start-menu', 0).pending?.id);
  });

  it('does not accept a button from a different step or a fabricated message', () => {
    const run = startRun(createFixture(), 'visitor-1', 1000);
    expect(activate(run, run.activeMessageId, 'menu-start', 1000)).toBe(run);
    expect(activate(run, 'fabricated', 'start-offer', 1000)).toBe(run);
    expect(activate(run, run.activeMessageId, 'missing', 1000)).toBe(run);
  });

  it('late completion after exit or restart cannot append a message', () => {
    const run = startRun(createFixture(), 'visitor-1', 1000);
    const waiting = activate(run, run.activeMessageId, 'start-offer', 1000);
    expect(finishReply(null, waiting.id, waiting.pending!.id, 2000)).toBeNull();
    const restarted = startRun(createFixture(), 'visitor-2', 1500);
    expect(finishReply(restarted, waiting.id, waiting.pending!.id, 2000)).toBe(restarted);
  });

  it('late callback from an earlier choice cannot complete a later pending reply', () => {
    const start = startRun(createFixture(), 'visitor-1', 0);
    const firstPending = activate(start, start.activeMessageId, 'start-menu', 0);
    const menu = finishReply(firstPending, firstPending.id, firstPending.pending!.id, 350)!;
    const secondPending = activate(menu, menu.activeMessageId, 'menu-start', 350);
    expect(finishReply(secondPending, firstPending.id, firstPending.pending!.id, 700)).toBe(secondPending);
  });

  it('keeps answer copy and all future navigation on the pinned version after edits', () => {
    const document = createFixture();
    const start = startRun(document, 'visitor-1', 0);
    document.content.buttons['start-offer'] = 'Edited label';
    document.buttons['start-offer'].transition = {type: 'screen', screenId: 'menu'};
    document.content.messages['offer-message'] = 'Edited offer';
    const ready = choose(start, 'start-offer', 0);
    expect(messageText(ready, ready.messages[1])).toBe('Посмотреть материал');
    expect(ready.messages[2]).toMatchObject({stepId: 'offer'});
    expect(messageText(ready, ready.messages[2])).not.toBe('Edited offer');
  });

  it('keeps incomplete target/label visible as an error and appends no fake user message', () => {
    const document = createFixture();
    document.buttons['start-offer'].transition = null;
    const run = startRun(document, 'visitor-1', 0);
    const rejected = activate(run, run.activeMessageId, 'start-offer', 0);
    expect(rejected.error).toMatch(/не выбран переход/);
    expect(rejected.messages).toBe(run.messages);
    expect(rejected.phase).toBe('ready');
    const recovered = activate(rejected, rejected.activeMessageId, 'start-menu', 0);
    expect(recovered.error).toBeNull();
    expect(recovered.phase).toBe('waiting');
    const blank = createFixture();
    blank.content.buttons['start-offer'] = '  ';
    expect(activate(startRun(blank, 'visitor-2', 0), 'visitor-2:message:0', 'start-offer', 0).error).toMatch(/нет подписи/);
  });

  it('uses exactly the same readiness reason for UI and direct activation of empty destinations', () => {
    const document = createFixture();
    document.content.messages['offer-message'] = ' \n ';
    const run = startRun(document, 'visitor-empty', 0);
    const issue = buttonReadiness(run.document, 'start-offer');
    expect(issue).toContain('Сообщение 1 на экране пустое');
    const rejected = activate(run, run.activeMessageId, 'start-offer', 0);
    expect(rejected.error).toBe(`${issue}. Вернитесь к редактированию.`);
    expect(rejected.messages).toBe(run.messages);
    expect(rejected.pending).toBeNull();
    expect(buttonReadiness(run.document, 'start-menu')).toBeNull();
  });

  it('stops at a terminal step without fabricating outcomes or a next button', () => {
    const document = createFixture();
    document.messages['material-message'].rows = [];
    delete document.buttons['material-menu'];
    delete document.content.buttons['material-menu'];
    const start = startRun(document, 'visitor-1', 0);
    const offer = choose(start, 'start-offer', 0);
    const done = choose(offer, 'offer-material', 350);
    expect(done.phase).toBe('ended');
    expect(done.messages).toHaveLength(5);
    expect(activate(done, done.activeMessageId, 'material-menu', 700)).toBe(done);
    expect(Object.keys(done)).not.toContain('result');
  });

  it('handles an initially terminal step with a single message', () => {
    const document = createFixture();
    document.messages['start-message'].rows = [];
    delete document.buttons['start-offer'];
    delete document.buttons['start-menu'];
    delete document.content.buttons['start-offer'];
    delete document.content.buttons['start-menu'];
    const run = startRun(document, 'visitor-1', 0);
    expect(run.phase).toBe('ended');
    expect(run.messages).toHaveLength(1);
  });

  it('rejects an empty entry message before creating a visitor run', () => {
    const document = createFixture();
    document.content.messages['start-message'] = ' \n ';
    expect(() => startRun(document, 'visitor-empty', 0)).toThrow('Начальный экран: Сообщение 1 на экране пустое. Добавьте текст.');
  });

  it('reserves a whole choice/reply pair at transcript limit without dropping history', () => {
    let run = startRun(createFixture(), 'visitor-1', 0);
    let at = 0;
    for(let turn = 0; turn < 100; turn++) {
      run = choose(run, turn % 2 === 0 ? 'start-menu' : 'menu-start', at);
      at += ShellLimits.typingMs;
    }
    expect(run.messages).toHaveLength(ShellLimits.messages);
    expect(run.messages[0].id).toBe('visitor-1:message:0');
    expect(run.messages[200].kind).toBe('bot');
    expect(run.phase).toBe('limited');
    expect(run.pending).toBeNull();
    expect(activate(run, run.activeMessageId, 'start-menu', at)).toBe(run);
  });

  it('replays the same inputs with identical output independently of timer lateness', () => {
    const document = createFixture();
    const startA = startRun(document, 'stable-run', 500);
    const startB = startRun(document, 'stable-run', 500);
    const waitingA = activate(startA, startA.activeMessageId, 'start-menu', 700);
    const waitingB = activate(startB, startB.activeMessageId, 'start-menu', 700);
    expect(finishReply(waitingA, waitingA.id, waitingA.pending!.id, 1050))
      .toEqual(finishReply(waitingB, waitingB.id, waitingB.pending!.id, 10_000));
  });

  it('rejects invalid or backwards time without corrupting current state', () => {
    expect(() => startRun(createFixture(), '', 0)).toThrow();
    expect(() => startRun(createFixture(), 'visitor', NaN)).toThrow();
    const run = startRun(createFixture(), 'visitor', 1000);
    for(const at of [999, NaN, Infinity, 1000.5, Number.MAX_SAFE_INTEGER]) {
      const rejected = activate(run, run.activeMessageId, 'start-offer', at);
      expect(rejected.error).toBeTruthy();
      expect(rejected.messages).toBe(run.messages);
      expect(rejected.phase).toBe('ready');
    }
  });
});
