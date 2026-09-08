import {allStepIds} from './core';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {createController} from './controller';
import {ShellLimits, type AiAdapter, type AiRequest, type ShellDocument} from './core/types';

function controlled() {
  const requests: {request: AiRequest; resolve: (value: {candidate: ShellDocument}) => void; reject: (error: Error) => void}[] = [];
  const adapter: AiAdapter = {apply: request => new Promise((resolve, reject) => requests.push({request, resolve, reject}))};
  return {requests, adapter};
}
afterEach(() => vi.useRealTimers());

describe('AI identity and effect lifecycle', () => {
  it('keeps freeform prompt inert with no adapter', async () => {
    const c = createController(); const before = c.editor().document;
    await c.applyAi('create anything', null);
    expect(c.editor().document).toBe(before);
    expect(c.notice()).toContain('не подключён'); c.dispose();
  });
  it.each(['edit', 'undo', 'cancel', 'test', 'timeout'] as const)('rejects late completion after %s', async action => {
    vi.useFakeTimers(); const {requests, adapter} = controlled();
    const c = createController({aiAdapter: adapter});
    c.mutate({type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Original'});
    const pending = c.applyAi('change', null);
    if(action === 'edit') c.beginText('start');
    if(action === 'undo') c.undo();
    if(action === 'cancel') c.cancelAi();
    if(action === 'test') c.startTest();
    if(action === 'timeout') vi.advanceTimersByTime(ShellLimits.aiTimeoutMs);
    const before = c.editor().document;
    const candidate = structuredClone(requests[0].request.document);
    candidate.content.messages['start-message'] = 'Stale answer';
    requests[0].resolve({candidate}); await pending;
    expect(c.editor().document).toBe(before);
    expect(requests[0].request.signal.aborted).toBe(true); c.dispose();
  });
  it('old completion never clears a newer request', async () => {
    const {requests, adapter} = controlled(); const c = createController({aiAdapter: adapter});
    const old = c.applyAi('one', null); c.cancelAi(); const current = c.applyAi('two', null);
    const newId = c.ai()!.id;
    requests[0].resolve({candidate: requests[0].request.document}); await old;
    expect(c.ai()?.id).toBe(newId);
    const candidate = structuredClone(requests[1].request.document); candidate.content.messages['start-message'] = 'New result';
    requests[1].resolve({candidate}); await current;
    expect(c.ai()).toBe(null); expect(c.editor().document.content.messages['start-message']).toBe('New result');
    expect(c.editor().history).toHaveLength(1); c.dispose();
  });
  it('rejects invalid candidate and document substitution atomically', async () => {
    for(const invalid of ['target', 'identity']) {
      const {requests, adapter} = controlled(); const c = createController({aiAdapter: adapter});
      const before = c.editor(); const promise = c.applyAi('bad', null);
      const candidate = structuredClone(requests[0].request.document);
      if(invalid === 'identity') candidate.id = 'another'; else candidate.buttons['start-offer'].transition = {type: 'screen', screenId: 'missing'};
      requests[0].resolve({candidate}); await promise;
      expect(c.editor().document).toBe(before.document); expect(c.editor().revision).toBe(before.revision);
      expect(c.notice()).not.toBe(''); c.dispose();
    }
  });
  it('adapter receives detached document without session or test state', async () => {
    const {requests, adapter} = controlled(); const c = createController({aiAdapter: adapter});
    const p = c.applyAi('copy', null);
    requests[0].request.document.content.messages['start-message'] = 'Adapter mutation';
    expect(c.editor().document.content.messages['start-message']).not.toBe('Adapter mutation');
    expect(Object.keys(requests[0].request).sort()).toEqual(['baseRevision', 'document', 'documentId', 'prompt', 'requestId', 'signal']);
    c.cancelAi(); requests[0].resolve({candidate: requests[0].request.document}); await p; c.dispose();
  });
  it('only explicit demos change the document and are undoable', async () => {
    const c = createController(); const count = allStepIds(c.editor().document).length;
    await c.applyAi('add details', 'detail'); expect(allStepIds(c.editor().document)).toHaveLength(count + 1);
    c.undo(); expect(allStepIds(c.editor().document)).toHaveLength(count); c.dispose();
  });
});

describe('UI intent ownership', () => {
  it('text callback follows accepted input; one completed undo per session', () => {
    const changed = vi.fn(); const c = createController({onMessageTextChange: changed});
    const original = c.editor().document.content.messages['start-message'];
    c.beginText('start'); c.inputText('One'); c.inputText('Two\nТри'); c.finishText();
    expect(changed).toHaveBeenLastCalledWith('start', 'Two\nТри', 'start-message');
    expect(c.editor().history).toHaveLength(1); c.undo();
    expect(c.editor().document.content.messages['start-message']).toBe(original); c.dispose();
  });
  it('cancelled and restarted typing cannot append to the next run', () => {
    vi.useFakeTimers(); vi.setSystemTime(1000); const c = createController();
    c.startTest(); const firstId = c.run()!.id;
    c.activate(c.run()!.activeMessageId, 'start-offer');
    c.activate(c.run()!.activeMessageId, 'start-offer');
    expect(c.run()!.messages).toHaveLength(2);
    c.startTest(); expect(c.run()!.id).not.toBe(firstId);
    vi.advanceTimersByTime(1000); expect(c.run()!.messages).toHaveLength(1);
    c.activate(c.run()!.activeMessageId, 'start-menu'); c.exitTest();
    vi.advanceTimersByTime(1000); expect(c.run()).toBe(null); c.dispose();
  });
  it('export captures completed text and does not mark later changes exported', () => {
    const c = createController(); c.beginText('start'); c.inputText('Export me');
    const first = c.exportSnapshot(); expect(c.editor().textEdit).toBe(null);
    c.beginText('start'); c.inputText('Later'); c.finishText();
    expect(JSON.parse(first.json).content.messages['start-message']).toBe('Export me');
    expect(c.exportRevision()).toBe(first.revision); expect(c.editor().revision).toBeGreaterThan(first.revision);
    c.dispose();
  });
  it('teardown invalidates pending AI and typing', async () => {
    vi.useFakeTimers(); const {requests, adapter} = controlled(); const c = createController({aiAdapter: adapter});
    const pending = c.applyAi('change', null); const before = c.editor(); c.dispose();
    requests[0].resolve({candidate: requests[0].request.document}); await pending;
    expect(c.editor()).toBe(before); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('document observers and shutdown boundaries', () => {
  it('notifies committed text for inputs, Escape, manual changes, AI and undo through the same boundary', async () => {
    const observed: {stepId: string; text: string; currentText: string; revision: number}[] = [];
    const {requests, adapter} = controlled();
    const c = createController({aiAdapter: adapter, onMessageTextChange: (stepId, text, messageId) => {
      observed.push({stepId, text, currentText: c.editor().document.content.messages[messageId], revision: c.editor().revision});
    }});
    const original = c.editor().document.content.messages['start-message'];
    c.beginText('start'); c.inputText('Временный текст'); c.finishText(true);
    expect(observed.map(value => value.text)).toEqual(['Временный текст', original]);
    c.mutate({type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Ручное изменение'});
    c.undo();
    expect(observed.slice(-2).map(value => value.text)).toEqual(['Ручное изменение', original]);
    const pending = c.applyAi('Change selected content', null);
    const candidate = structuredClone(requests[0].request.document);
    candidate.content.messages['start-message'] = 'Содержимое AI';
    candidate.content.messages['offer-message'] = 'Новое предложение';
    requests[0].resolve({candidate}); await pending;
    expect(observed.slice(-2).map(value => [value.stepId, value.text])).toEqual([
      ['start', 'Содержимое AI'], ['offer', 'Новое предложение']
    ]);
    expect(observed.every(value => value.currentText === value.text)).toBe(true);
    expect(observed.map(value => value.revision)).toEqual([1, 2, 3, 4, 5, 5]);
    c.dispose();
  });

  it('does not notify for selection, no-op copy changes, title-only changes or invalid input', () => {
    const changed = vi.fn(); const c = createController({onMessageTextChange: changed});
    const text = c.editor().document.content.messages['start-message'];
    c.select('offer'); c.select('start');
    c.beginText('start'); c.inputText(text); c.finishText();
    c.mutate({type: 'set_step_title', stepId: 'start', title: 'Новое название'});
    c.beginText('start'); c.inputText('x'.repeat(ShellLimits.documentBytes + 1));
    expect(c.editor().error).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
    expect(c.editor().document.content.messages['start-message']).toBe(text);
    c.dispose();
  });

  it('observer exceptions cannot roll back accepted input or prevent Escape and undo', () => {
    const changed = vi.fn(() => {throw new Error('Disconnected host observer');});
    const c = createController({onMessageTextChange: changed});
    const original = c.editor().document.content.messages['start-message'];
    c.beginText('start');
    expect(() => c.inputText('Рабочий текст')).not.toThrow();
    expect(c.editor().document.content.messages['start-message']).toBe('Рабочий текст');
    expect(c.notice()).toContain('обработчик');
    expect(() => c.finishText(true)).not.toThrow();
    expect(c.editor().document.content.messages['start-message']).toBe(original);
    expect(c.editor().textEdit).toBeNull();
    expect(c.editor().history).toHaveLength(0);
    c.mutate({type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Ещё одна правка'});
    expect(() => c.undo()).not.toThrow();
    expect(c.editor().document.content.messages['start-message']).toBe(original);
    expect(changed).toHaveBeenCalledTimes(4);
    c.dispose();
  });

  it('one failing observer does not suppress other changed steps and keeps its failure notice after AI acceptance', async () => {
    const {requests, adapter} = controlled();
    const changed = vi.fn((stepId: string) => {if(stepId === 'start') throw new Error('Host failed for first step');});
    const c = createController({aiAdapter: adapter, onMessageTextChange: changed});
    const pending = c.applyAi('Update two messages', null);
    const candidate = structuredClone(requests[0].request.document);
    candidate.content.messages['start-message'] = 'First accepted text';
    candidate.content.messages['offer-message'] = 'Second accepted text';
    requests[0].resolve({candidate}); await pending;
    expect(c.editor().document.content.messages['start-message']).toBe('First accepted text');
    expect(c.editor().document.content.messages['offer-message']).toBe('Second accepted text');
    expect(changed.mock.calls.map(call => call[0])).toEqual(['start', 'offer']);
    expect(c.editor().history).toHaveLength(1);
    expect(c.ai()).toBeNull();
    expect(c.notice()).toContain('обработчик');
    c.dispose();
  });

  it('dismisses a core error without changing text, revision or history', () => {
    const c = createController();
    c.mutate({type: 'delete_step', stepId: 'start'});
    expect(c.editor().error).toBeTruthy();
    c.setNotice('Older notice');
    const before = c.editor();
    c.dismissNotice();
    expect(c.notice()).toBe(''); expect(c.editor().error).toBeNull();
    expect(c.editor().document).toBe(before.document);
    expect(c.editor().revision).toBe(before.revision);
    expect(c.editor().history).toBe(before.history);
    c.dispose();
  });

  it('typing uses a monotonic clock even if the system clock jumps backwards', () => {
    vi.useFakeTimers(); vi.setSystemTime(10_000);
    const c = createController(); c.startTest();
    c.activate(c.run()!.activeMessageId, 'start-menu');
    const dueAt = (c.run()!.pending as {dueAt: number}).dueAt;
    vi.setSystemTime(0);
    vi.advanceTimersByTime(ShellLimits.typingMs);
    expect(c.run()!.phase).toBe('ready');
    expect(c.run()!.messages).toHaveLength(3);
    expect(c.run()!.messages[2].at).toBe(dueAt);
    expect(c.run()!.messages[2].at).toBeGreaterThanOrEqual(c.run()!.messages[1].at);
    c.dispose();
  });

  it('disposed controllers ignore queued user intents and cannot create new timers or observer calls', async () => {
    vi.useFakeTimers();
    const changed = vi.fn(); const {adapter, requests} = controlled();
    const c = createController({onMessageTextChange: changed, aiAdapter: adapter});
    c.dispose(); c.dispose();
    const before = c.editor(); const notice = c.notice();
    c.beginText('start'); c.inputText('Too late'); c.finishText();
    c.mutate({type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Late operation'});
    c.select('menu'); c.undo(); c.startTest();
    c.activate('run_1:message:0', 'start-menu');
    await c.applyAi('Late AI request', null);
    vi.runAllTimers();
    expect(c.editor()).toBe(before);
    expect(c.run()).toBeNull(); expect(c.ai()).toBeNull();
    expect(c.notice()).toBe(notice);
    expect(requests).toHaveLength(0);
    expect(changed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('observer-triggered teardown keeps an atomic accepted document but suppresses later observers and notices', async () => {
    const {requests, adapter} = controlled();
    let afterDisposeNotice: string | undefined;
    const changed = vi.fn(() => {
      c.dispose(); afterDisposeNotice = c.notice();
      throw new Error('Host disposed while handling committed content');
    });
    const c = createController({aiAdapter: adapter, onMessageTextChange: changed});
    const pending = c.applyAi('Update two messages', null);
    const candidate = structuredClone(requests[0].request.document);
    candidate.content.messages['start-message'] = 'First accepted';
    candidate.content.messages['offer-message'] = 'Second accepted';
    requests[0].resolve({candidate}); await pending;
    expect(c.editor().document.content.messages['start-message']).toBe('First accepted');
    expect(c.editor().document.content.messages['offer-message']).toBe('Second accepted');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(c.notice()).toBe(afterDisposeNotice);
    expect(c.ai()).toBeNull(); expect(c.run()).toBeNull();
  });

  it('a rejected provider promise after teardown does not resurrect notice or request state', async () => {
    const {requests, adapter} = controlled(); const c = createController({aiAdapter: adapter});
    const pending = c.applyAi('Update', null);
    c.dispose(); const before = c.editor(); const notice = c.notice();
    requests[0].reject(new Error('Late network-like adapter error')); await pending;
    expect(c.editor()).toBe(before); expect(c.notice()).toBe(notice);
    expect(c.ai()).toBeNull(); expect(requests[0].request.signal.aborted).toBe(true);
  });
});

describe('visitor text composer', () => {
  it('accepts literal text only in Test, preserves authoring state and never calls an AI adapter', () => {
    const {adapter, requests} = controlled(); const changed = vi.fn();
    const c = createController({aiAdapter: adapter, onMessageTextChange: changed});
    expect(c.sendText('Сообщение из редактора')).toBe(false);
    c.startTest(); const before = c.editor();
    expect(c.sendText('Добавь новый экран бота')).toBe(true);
    expect(c.editor()).toBe(before);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'text', text: 'Добавь новый экран бота'});
    expect((c.run()!.pending as {targetStepId: string})?.targetStepId).toBe('start-fallback');
    expect(requests).toHaveLength(0); expect(changed).not.toHaveBeenCalled();
    c.dispose();
  });

  it('signals rejection without consuming invalid input, then allows recovery', () => {
    const c = createController(); c.startTest(); const messages = c.run()!.messages;
    expect(c.sendText(' \n ')).toBe(false);
    expect(c.run()!.messages).toBe(messages); expect(c.run()!.error).toContain('Введите');
    expect(c.sendText('x'.repeat(ShellLimits.textCharacters + 1))).toBe(false);
    expect(c.run()!.messages).toBe(messages); expect(c.run()!.error).toContain('4096');
    expect(c.sendText('Теперь можно отправить')).toBe(true);
    expect(c.run()!.error).toBeNull(); c.dispose();
  });

  it('routes a typed button label to the folder fallback instead of guessing an action', () => {
    vi.useFakeTimers();
    const c = createController(); c.startTest();
    const originalMessageId = c.run()!.activeMessageId;
    expect(c.sendText('Посмотреть материал')).toBe(true);
    expect((c.run()!.pending as {targetStepId: string})?.targetStepId).toBe('start-fallback');
    vi.advanceTimersByTime(ShellLimits.typingMs);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'start-fallback'});
    c.activate(originalMessageId, 'start-offer');
    expect(c.run()!.messages).toHaveLength(3);
    c.activate(c.run()!.activeMessageId, 'start-fallback-back');
    vi.advanceTimersByTime(ShellLimits.typingMs);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'start'});
    expect(c.run()!.messages).toHaveLength(5); c.dispose();
  });

  it('does not cancel or reschedule the already accepted button reply when text arrives during typing', () => {
    vi.useFakeTimers(); const c = createController(); c.startTest();
    c.activate(c.run()!.activeMessageId, 'start-menu');
    const pending = c.run()!.pending;
    vi.advanceTimersByTime(100);
    expect(c.sendText('Вопрос до ответа')).toBe(false);
    expect(c.run()!.pending).toBe(pending); expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(ShellLimits.typingMs - 100);
    expect(c.run()!.messages).toHaveLength(3);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'menu'});
    expect(vi.getTimerCount()).toBe(0); c.dispose();
  });

  it('/start sends visibly, preserves the pinned transcript and replaces an old pending reply', () => {
    vi.useFakeTimers(); const c = createController(); c.startTest();
    const original = c.run()!; const pinnedText = original.document.content.messages['start-message'];
    c.activate(original.activeMessageId, 'start-menu');
    c.mutate({type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Новая авторская версия'});
    expect(c.sendText(' /start\n')).toBe(true);
    expect(c.run()!.id).toBe(original.id);
    expect(c.run()!.messages).toHaveLength(3);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'text', text: ' /start\n'});
    expect(c.run()!.document.content.messages['start-message']).toBe(pinnedText);
    vi.advanceTimersByTime(1000);
    expect(c.run()!.messages).toHaveLength(4);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'start'});
    expect(vi.getTimerCount()).toBe(0); c.dispose();
  });

  it('keeps other slash-prefixed text literal instead of guessing commands', () => {
    const c = createController(); c.startTest(); const runId = c.run()!.id;
    expect(c.sendText('/start details')).toBe(true);
    expect(c.run()!.id).toBe(runId);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'text', text: '/start details'});
    c.dispose();
  });

  it('caps literal transcript including /start and permits a fresh header restart', () => {
    vi.useFakeTimers(); const c = createController(); c.startTest();
    for(let index = 0; index < (ShellLimits.messages - 1) / 2; index++) {
      expect(c.sendText(`Сообщение ${index}`)).toBe(true);
      vi.advanceTimersByTime(ShellLimits.typingMs);
    }
    expect(c.run()!.messages).toHaveLength(ShellLimits.messages);
    expect(c.sendText('Не помещается')).toBe(false);
    expect(c.run()!.messages).toHaveLength(ShellLimits.messages);
    expect(c.sendText('/start')).toBe(false);
    expect(c.run()!.messages).toHaveLength(ShellLimits.messages);
    c.startTest();
    expect(c.run()!.messages).toHaveLength(1); expect(c.run()!.phase).toBe('ready');
    c.dispose();
  });

  it('cannot append text or restart after disposal', () => {
    vi.useFakeTimers(); const c = createController(); c.startTest(); c.dispose();
    expect(c.sendText('Позднее сообщение')).toBe(false);
    expect(c.sendText('/start')).toBe(false);
    expect(c.run()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  });
});

describe('configured response effects', () => {
  it('uses the response settings captured by the run, retains refused input and schedules each accepted reply once', () => {
    vi.useFakeTimers(); const c = createController();
    c.mutate({type: 'set_message_text', stepId: 'start-fallback', messageId: 'start-fallback-message', text: 'Нажмите кнопку ниже.'});
    c.startTest(); const activeId = c.run()!.activeMessageId;
    c.mutate({type: 'set_message_text', stepId: 'start-fallback', messageId: 'start-fallback-message', text: 'Новая версия'});
    expect(c.sendText('Вопрос')).toBe(true); expect(vi.getTimerCount()).toBe(1);
    expect(c.sendText('/unknown')).toBe(false); expect(vi.getTimerCount()).toBe(1);
    expect(c.run()!.messages).toHaveLength(2);
    vi.advanceTimersByTime(350);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'start-fallback'});
    expect(c.run()!.document.content.messages['start-fallback-message']).toBe('Нажмите кнопку ниже.');
    expect(c.run()!.activeMessageId).not.toBe(activeId);
    expect(c.sendText('/unknown')).toBe(true); expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(100);
    expect(c.sendText('/start@MYAIBOT')).toBe(true); expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(250);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'text', text: '/start@MYAIBOT'});
    vi.advanceTimersByTime(100);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'start'});
    expect(c.run()!.messages.filter(message => message.kind === 'bot' && message.stepId === 'start-fallback')).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0); c.dispose();
  });

  it('rejects stale modal or drag revisions without erasing a newer edit', () => {
    const c = createController(); const captured = c.editor().revision;
    c.mutate({type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Новая ручная правка'});
    const before = c.editor();
    c.mutate({type: 'set_message_text', stepId: 'start-fallback', messageId: 'start-fallback-message', text: 'Ответ'}, captured);
    expect(c.editor().document).toBe(before.document);
    expect(c.editor().error).toContain('изменился');
    expect(c.editor().document.content.messages['start-fallback-message']).toBe(before.document.content.messages['start-fallback-message']); c.dispose();
  });
});

describe('explicit Test message edit transaction', () => {
  it('updates the authored message and every pinned occurrence without duplicating transcript, then Escape restores both', () => {
    vi.useFakeTimers(); const changed = vi.fn(); const c = createController({onMessageTextChange: changed});
    c.startTest(); const first = c.run()!.messages[0];
    c.sendText('/start'); vi.advanceTimersByTime(350);
    const before = c.run()!; const original = before.document.content.messages['start-message'];
    expect(c.beginRunText(first.id)).toBe(true);
    expect(c.runTextEdit()).toEqual({runId: before.id, messageId: 'start-message', stepId: 'start', sourceOccurrenceId: first.id});
    c.inputText('Правка из теста');
    expect(c.editor().document.content.messages['start-message']).toBe('Правка из теста');
    expect(c.run()!.document.content.messages['start-message']).toBe('Правка из теста');
    expect(c.run()!.messages).toBe(before.messages); expect(c.run()!.activeMessageId).toBe(before.activeMessageId);
    expect(c.sendText('/start')).toBe(false);
    c.activate(before.activeMessageId, 'start-menu'); expect(c.run()!.pending).toBeNull();
    expect(changed).toHaveBeenLastCalledWith('start', 'Правка из теста', 'start-message');
    c.finishText(true);
    expect(c.editor().document.content.messages['start-message']).toBe(original);
    expect(c.run()!.document.content.messages['start-message']).toBe(original);
    expect(c.runTextEdit()).toBeNull(); expect(c.editor().history).toHaveLength(0); c.dispose();
  });

  it('commits one undo transaction and uses updated text for later replies while topology stays pinned', () => {
    vi.useFakeTimers(); const c = createController(); c.startTest();
    const document = c.run()!.document; const source = c.run()!.activeMessageId;
    c.activate(source, 'start-menu'); const pending = c.run()!.pending;
    expect(c.beginRunText(source)).toBe(true); c.inputText('Раз'); c.inputText('Два');
    vi.advanceTimersByTime(350);
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'menu'});
    expect(c.runTextEdit()?.sourceOccurrenceId).toBe(source);
    c.finishText(); expect(c.editor().history).toHaveLength(1); expect(c.runTextEdit()).toBeNull();
    expect(c.run()!.document.steps).toEqual(document.steps); expect(pending).not.toBeNull();
    c.sendText('/start'); vi.advanceTimersByTime(350);
    expect(c.run()!.document.content.messages['start-message']).toBe('Два');
    expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', messageId: 'start-message'}); c.dispose();
  });

  it('rejects stale or non-bot occurrences and keeps ordinary author edits isolated from the pinned run', () => {
    const c = createController(); c.startTest(); const source = c.run()!.activeMessageId;
    expect(c.beginRunText('missing')).toBe(false);
    c.sendText('Literal visitor text'); expect(c.beginRunText(c.run()!.messages.at(-1)!.id)).toBe(false);
    c.mutate({type: 'set_message_text', stepId: 'start', messageId: 'start-message', text: 'Newer author edit'});
    expect(c.run()!.document.content.messages['start-message']).not.toBe('Newer author edit');
    expect(c.beginRunText(source)).toBe(false); expect(c.editor().document.content.messages['start-message']).toBe('Newer author edit');
    c.startTest(); expect(c.beginRunText(source)).toBe(false); c.dispose();
  });

  it('finishes explicit editing before jump, restart or exit and cancels only replaced pending effects', () => {
    vi.useFakeTimers(); const c = createController(); c.startTest('offer');
    expect(c.run()!.messages[0].stepId).toBe('offer'); expect(c.run()!.document.entryStepId).toBe('start');
    const source = c.run()!.activeMessageId;
    c.activate(source, 'offer-menu'); expect(vi.getTimerCount()).toBe(1);
    c.beginRunText(source); c.inputText('Edited offer');
    expect(c.jumpTest('details')).toBe(true); expect(c.runTextEdit()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
    const messages = c.run()!.messages; vi.advanceTimersByTime(1000); expect(c.run()!.messages).toBe(messages);
    expect(c.run()!.document.content.messages['offer-message']).toBe('Edited offer');
    const last = c.run()!.activeMessageId; c.beginRunText(last); c.inputText('Edited details'); c.exitTest();
    expect(c.run()).toBeNull(); expect(c.runTextEdit()).toBeNull(); expect(c.editor().document.content.messages['details-message']).toBe('Edited details');
    c.startTest(); c.beginRunText(c.run()!.activeMessageId); c.inputText('Edited start'); c.startTest();
    expect(c.runTextEdit()).toBeNull(); expect(c.run()!.document.content.messages['start-message']).toBe('Edited start');
    c.dispose(); expect(c.beginRunText(last)).toBe(false); expect(c.jumpTest('start')).toBe(false);
  });
});

describe('readiness while a visible Test message is being edited', () => {
  it('rejects a now-empty pending entry, preserves the edit session and recovers after Escape', () => {
    vi.useFakeTimers(); const c = createController(); c.startTest();
    const source = c.run()!.activeMessageId;
    c.sendText('/start'); expect(c.beginRunText(source)).toBe(true); c.inputText('');
    const messages = c.run()!.messages;
    vi.advanceTimersByTime(350);
    expect(c.run()!.messages).toBe(messages); expect(c.run()!.pending).toBeNull();
    expect(c.run()!.error).toContain('Ответ не отправлен'); expect(c.runTextEdit()?.sourceOccurrenceId).toBe(source);
    expect(vi.getTimerCount()).toBe(0);
    c.finishText(true);
    expect(c.sendText('/start')).toBe(true); vi.advanceTimersByTime(350);
    expect(c.run()!.messages).toHaveLength(messages.length + 2); expect(c.run()!.error).toBeNull(); c.dispose();
  });
});

describe('new-message creation lifecycle', () => {
  it('discards an abandoned message before export or Test and makes a completed creation one undo', () => {
    const c = createController(); const original = c.exportSnapshot().json;
    expect(c.beginNewMessage('start', 'discarded')).toBe(true);
    c.inputText(' \n ');
    expect(c.exportSnapshot().json).toBe(original); expect(c.editor().history).toHaveLength(0);
    expect(c.editor().changed).toBe(false);
    expect(c.beginNewMessage('start', 'another-draft')).toBe(true); c.startTest();
    expect(c.run()!.messages).toHaveLength(1); expect(c.run()!.document.content.messages['another-draft']).toBeUndefined();
    expect(c.beginNewMessage('start', 'not-in-test')).toBe(false); c.exitTest();
    expect(c.beginNewMessage('start', 'kept')).toBe(true); c.inputText('Text'); c.inputText('Text with a second line\nMore'); c.finishText();
    expect(c.editor().history).toHaveLength(1); c.undo(); expect(c.exportSnapshot().json).toBe(original);
    c.dispose(); expect(c.beginNewMessage('start', 'disposed')).toBe(false);
  });

  it('preserves the export marker after abandoning the only change since a saved snapshot', () => {
    const c = createController(); c.mutate({type: 'set_step_title', stepId: 'start', title: 'Saved title'});
    const saved = c.exportSnapshot(); expect(c.editor().changed).toBe(true);
    c.beginNewMessage('start', 'temporary'); c.inputText('Text'); c.inputText(''); c.finishText();
    expect(c.editor().revision).toBeGreaterThan(saved.revision);
    expect(c.exportRevision()).toBe(c.editor().revision);
    expect(c.exportSnapshot().json).toBe(saved.json); c.dispose();
  });

  it('default mutations use the post-cleanup revision, but a supplied stale revision remains rejected', () => {
    const c = createController(); c.beginNewMessage('start', 'temporary');
    c.mutate({type: 'set_step_title', stepId: 'start', title: 'Accepted'});
    expect(c.editor().error).toBeNull(); expect(c.editor().document.content.messages.temporary).toBeUndefined();
    expect(c.editor().document.content.steps.start.title).toBe('Accepted');
    c.beginNewMessage('start', 'other'); const captured = c.editor().revision;
    c.mutate({type: 'set_step_title', stepId: 'start', title: 'Stale'}, captured);
    expect(c.editor().document.content.messages.other).toBeUndefined();
    expect(c.editor().document.content.steps.start.title).toBe('Accepted'); expect(c.editor().error).toContain('изменился'); c.dispose();
  });

  it('invalidates an older AI request even when the provisional message is later abandoned', async () => {
    const {adapter, requests} = controlled(); const c = createController({aiAdapter: adapter});
    const original = c.editor().document;
    const pending = c.applyAi('Update greeting', null);
    expect(c.beginNewMessage('start', 'temporary')).toBe(true); expect(requests[0].request.signal.aborted).toBe(true);
    c.finishText(); expect(c.editor().revision).toBeGreaterThan(requests[0].request.baseRevision);
    const candidate = structuredClone(requests[0].request.document); candidate.content.messages['start-message'] = 'Stale AI';
    requests[0].resolve({candidate}); await pending;
    expect(c.editor().document).toEqual(original); expect(c.editor().history).toHaveLength(0);
    expect(c.editor().changed).toBe(false); c.dispose();
  });
});

describe('explicit Test keyboard edits and title changes', () => {
  it('adds and removes a message keyboard atomically in author and run, including terminal/ready phase changes', () => {
    const c = createController();
    c.mutate({type: 'set_keyboard', stepId: 'start', messageId: 'start-message', keyboard: {rows: [], buttons: {}, labels: {}}});
    c.startTest(); expect(c.run()!.phase).toBe('ended');
    const before = c.editor(); const runBefore = c.run()!; const source = runBefore.activeMessageId;
    const keyboard = {rows: [{id: 'new-row', buttonIds: ['new-button']}], buttons: {'new-button': {transition: {type: 'screen' as const, screenId: 'offer'}, color: 'green' as const}}, labels: {'new-button': 'Открыть предложение'}};
    expect(c.applyRunKeyboard(source, keyboard, before.revision)).toBe(true);
    expect(c.run()!.phase).toBe('ready'); expect(c.run()!.messages).toBe(runBefore.messages);
    expect(c.editor().document.messages['start-message']).toEqual(c.run()!.document.messages['start-message']);
    expect(c.run()!.document.buttons['new-button']).toEqual(keyboard.buttons['new-button']);
    expect(c.editor().history.length).toBe(before.history.length + 1);
    expect(c.applyRunKeyboard(source, keyboard, before.revision)).toBe(false);
    expect(c.editor().history.length).toBe(before.history.length + 1);
    expect(c.applyRunKeyboard(source, {rows: [], buttons: {}, labels: {}}, c.editor().revision)).toBe(true);
    expect(c.run()!.phase).toBe('ended'); expect(c.run()!.document.buttons['new-button']).toBeUndefined();
    c.exitTest(); c.undo(); expect(c.editor().document.buttons['new-button']).toEqual(keyboard.buttons['new-button']); c.dispose();
  });

  it('does not change an accepted pending target or outgoing history when editing its source keyboard', () => {
    vi.useFakeTimers(); const c = createController(); c.startTest();
    const source = c.run()!.activeMessageId; c.activate(source, 'start-offer');
    const pending = c.run()!.pending; const user = c.run()!.messages.at(-1)!;
    expect(user).toMatchObject({kind: 'user', text: 'Посмотреть материал'});
    const changed = {rows: [{id: 'changed-row', buttonIds: ['start-offer']}], buttons: {'start-offer': {transition: {type: 'screen' as const, screenId: 'details'}, color: 'red' as const}}, labels: {'start-offer': 'Другой текст'}};
    expect(c.applyRunKeyboard(source, changed, c.editor().revision)).toBe(true);
    expect(c.run()!.pending).toBe(pending); expect(c.run()!.phase).toBe('waiting'); expect(vi.getTimerCount()).toBe(1);
    expect(c.run()!.messages.at(-1)).toBe(user); expect(c.run()!.document.content.buttons['start-offer']).toBe('Другой текст');
    vi.advanceTimersByTime(350); expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'offer'});
    expect(c.applyRunKeyboard(source, {rows: [], buttons: {}, labels: {}}, c.editor().revision)).toBe(true);
    expect(c.run()!.messages[1]).toMatchObject({kind: 'user', text: 'Посмотреть материал'}); c.dispose();
  });

  it('rejects mismatched owner baselines, absent pinned destinations and stale run occurrences without partial edits', () => {
    const c = createController(); c.startTest(); const source = c.run()!.activeMessageId;
    const keyboard = {rows: [{id: 'new-row', buttonIds: ['new-button']}], buttons: {'new-button': {transition: {type: 'screen' as const, screenId: 'offer'}, color: 'blue' as const}}, labels: {'new-button': 'Next'}};
    c.mutate({type: 'set_keyboard', stepId: 'start', messageId: 'start-message', keyboard});
    const before = c.editor().document; const pinned = c.run()!.document;
    expect(c.applyRunKeyboard(source, {rows: [], buttons: {}, labels: {}}, c.editor().revision)).toBe(false);
    expect(c.editor().document).toBe(before); expect(c.run()!.document).toBe(pinned);
    c.startTest(); expect(c.applyRunKeyboard(source, keyboard, c.editor().revision)).toBe(false);
    const current = c.run()!.activeMessageId;
    c.mutate({type: 'add_step', stepId: 'new-target', messageId: 'new-text', afterStepId: 'start', content: {title: 'New target', text: 'Only in author'}});
    const afterAdd = c.editor().document; const newDestination = {...keyboard, buttons: {'new-button': {transition: {type: 'screen' as const, screenId: 'new-target'}, color: 'blue' as const}}};
    expect(c.applyRunKeyboard(current, newDestination, c.editor().revision)).toBe(false);
    expect(c.editor().document).toBe(afterAdd); expect(c.run()!.document.buttons['new-button'].transition?.type === 'screen' ? (c.run()!.document.buttons['new-button'].transition as {screenId: string}).screenId : null).toBe('offer');
    c.dispose();
  });

  it('renames a screen in both metadata layers with one undo and leaves pending identity and content unchanged', () => {
    vi.useFakeTimers(); const changed = vi.fn(); const c = createController({onMessageTextChange: changed}); c.startTest();
    c.activate(c.run()!.activeMessageId, 'start-offer');
    const pending = c.run()!.pending; const messages = c.run()!.messages; const before = c.editor();
    expect(c.renameStep('offer', 'Новое предложение', before.revision)).toBe(true);
    expect(c.editor().document.content.steps.offer.title).toBe('Новое предложение');
    expect(c.run()!.document.content.steps.offer.title).toBe('Новое предложение');
    expect(c.run()!.pending).toBe(pending); expect(c.run()!.messages).toBe(messages);
    expect(c.run()!.document.content.messages).toEqual(before.document.content.messages);
    expect(changed).not.toHaveBeenCalled(); expect(c.editor().history).toHaveLength(1);
    expect(c.renameStep('offer', 'Stale', before.revision)).toBe(false);
    vi.advanceTimersByTime(350); expect(c.run()!.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'offer'});
    c.exitTest(); c.undo(); expect(c.editor().document.content.steps.offer.title).toBe(before.document.content.steps.offer.title); c.dispose();
  });
});
