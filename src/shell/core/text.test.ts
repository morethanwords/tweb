import {describe, expect, it} from 'vitest';
import {createFixture} from './fixture';
import {command, createEditor} from './editor';
import {activate, finishReply, messageText, sendText, startRun, classifyTestText, textReadiness, jumpRun, pendingMessageCount, isActiveBotMessage} from './simulator';
import {ShellLimits, type TestRun} from './types';

function pendingStep(run: TestRun) {
  if(run.pending?.kind !== 'step') throw new Error('Expected pending screen reply');
  return run.pending;
}

function finish(run: TestRun): TestRun {
  return finishReply(run, run.id, run.pending!.id, pendingStep(run).dueAt)!;
}

describe('literal visitor text and folder replies', () => {
  it('appends literal outgoing text and reserves a normal fallback screen without mutating the document', () => {
    const run = startRun(createFixture(), 'visitor', 0);
    const text = '  Привет!\n<script>alert(1)</script> 👋  ';
    const waiting = sendText(run, run.id, 'text-1', text, 10);
    expect(waiting.messages).toHaveLength(2);
    expect(waiting.messages[1]).toEqual({id: 'visitor:message:1', kind: 'text', stepId: 'start', text, clientMessageId: 'text-1', at: 10});
    expect(messageText(waiting, waiting.messages[1])).toBe(text);
    expect(waiting.document).toBe(run.document); expect(waiting.activeMessageId).toBe(run.activeMessageId);
    expect(waiting.pending).toMatchObject({kind: 'step', targetStepId: 'start-fallback', dueAt: 360});
    expect(waiting.phase).toBe('waiting'); expect(run.messages).toHaveLength(1);
    const replied = finish(waiting);
    expect(replied.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'start-fallback', messageId: 'start-fallback-message'});
    expect(messageText(replied, replied.messages.at(-1)!)).toBe(run.document.content.messages['start-fallback-message']);
    expect(isActiveBotMessage(replied, run.activeMessageId)).toBe(false);
    expect(activate(replied, replied.activeMessageId, 'start-fallback-back', 361).pending).toMatchObject({targetStepId: 'start'});
  });

  it('uses run and client-message identity; duplicates and conflicting retries cannot append again', () => {
    const run = startRun(createFixture(), 'visitor', 0);
    const accepted = sendText(run, run.id, 'stable-text-id', 'Привет', 1);
    expect(sendText(accepted, run.id, 'stable-text-id', 'Привет', 10)).toBe(accepted);
    const collision = sendText(accepted, run.id, 'stable-text-id', 'Другой текст', 10);
    expect(collision.messages).toBe(accepted.messages); expect(collision.error).toContain('другому сообщению');
    expect(sendText(accepted, 'old-run', 'new-text', 'Привет', 10)).toBe(accepted);
    const replied = finish(accepted);
    expect(sendText(replied, run.id, 'stable-text-id', 'Привет', 400)).toBe(replied);
    expect(finishReply(replied, run.id, accepted.pending!.id, 1000)).toBe(replied);
  });

  it('permits intentionally identical unknown messages after completion, including on the fallback itself', () => {
    const first = sendText(startRun(createFixture(), 'visitor', 0), 'visitor', 'text-1', 'Привет', 1);
    const replied = finish(first);
    const second = sendText(replied, replied.id, 'text-2', 'Привет', 400);
    expect(second.pending?.id).not.toBe(first.pending?.id);
    expect(pendingStep(second).targetStepId).toBe('start-fallback');
    const next = finish(second);
    expect(next.messages).toHaveLength(5);
    expect(new Set(next.messages.map(message => message.id)).size).toBe(5);
    expect(activate(next, replied.activeMessageId, 'start-fallback-back', 800)).toBe(next);
    expect(activate(next, next.activeMessageId, 'start-fallback-back', 800).phase).toBe('waiting');
  });

  it('text equal to a button label remains literal and never guesses a button transition', () => {
    const run = startRun(createFixture(), 'visitor', 0);
    const waiting = sendText(run, run.id, 'label', run.document.content.buttons['start-offer'], 0);
    expect(pendingStep(waiting).targetStepId).toBe('start-fallback');
    expect(waiting.messages.at(-1)?.kind).toBe('text');
    expect(finish(waiting).messages.at(-1)?.stepId).not.toBe('offer');
  });

  it.each(['Вопрос', '/unknown'])('rejects %s during typing and accepts the same client ID once after completion', text => {
    const run = startRun(createFixture(), 'visitor', 0);
    const waiting = activate(run, run.activeMessageId, 'start-menu', 0);
    const rejected = sendText(waiting, run.id, 'retry', text, 100);
    expect(rejected.messages).toBe(waiting.messages); expect(rejected.pending).toBe(waiting.pending);
    expect(rejected.error).toContain('Дождитесь'); expect(textReadiness(waiting, text)).toBe(rejected.error);
    const ready = finish(rejected);
    const accepted = sendText(ready, run.id, 'retry', text, 351);
    expect(accepted.pending).toMatchObject({targetStepId: 'menu-fallback'});
    expect(sendText(accepted, run.id, 'retry', text, 352)).toBe(accepted);
  });

  it('counts Unicode code points without truncating literal content', () => {
    const run = startRun(createFixture(), 'visitor', 0);
    const emoji = '😀'.repeat(ShellLimits.textCharacters);
    const accepted = sendText(run, run.id, 'emoji', emoji, 1);
    expect(accepted.messages).toHaveLength(2); expect(messageText(accepted, accepted.messages[1])).toBe(emoji);
    expect(sendText(run, run.id, 'over', emoji + 'a', 1).messages).toBe(run.messages);
    expect(sendText(run, run.id, 'over', 'a'.repeat(4097), 1).error).toContain('4096');
  });

  it('rejects blank input, invalid identity and time without changing accepted state', () => {
    const run = startRun(createFixture(), 'visitor', 100);
    for(const text of ['', ' \n\t ']) expect(sendText(run, run.id, 'empty', text, 100).error).toContain('Введите сообщение');
    expect(sendText(run, run.id, '', 'Текст', 100).error).toContain('идентификатор');
    for(const at of [99, NaN, Infinity, 100.5, Number.MAX_SAFE_INTEGER]) {
      const rejected = sendText(run, run.id, 'text', 'Текст', at);
      expect(rejected.messages).toBe(run.messages); expect(rejected.pending).toBeNull(); expect(rejected.error).toBeTruthy();
    }
  });

  it('responds after a terminal screen using the same folder, not an invented outcome', () => {
    const document = createFixture();
    document.messages['start-message'].rows = [];
    for(const id of ['start-offer', 'start-menu']) {delete document.buttons[id]; delete document.content.buttons[id];}
    const run = startRun(document, 'visitor', 0);
    expect(run.phase).toBe('ended');
    const waiting = sendText(run, run.id, 'thanks', 'Спасибо!', 1);
    expect(waiting.phase).toBe('waiting'); expect(finish(waiting).messages.at(-1)?.stepId).toBe('start-fallback');
  });

  it('reserves the entire normal response pair and never creates a half reply at 201 messages', () => {
    let run = startRun(createFixture(), 'capacity', 0);
    for(let index = 0; index < 198; index++) run = jumpRun(run, 'start', index);
    expect(run.messages).toHaveLength(199);
    const waiting = sendText(run, run.id, 'last', 'Вопрос', 200);
    expect(waiting.messages).toHaveLength(200); expect(pendingMessageCount(waiting)).toBe(1);
    expect(sendText(waiting, run.id, 'start-full', '/start', 201).messages).toBe(waiting.messages);
    const completed = finish(waiting);
    expect(completed.messages).toHaveLength(201); expect(completed.phase).toBe('limited');
    expect(sendText(completed, run.id, 'overflow', 'Ещё', 551).messages).toBe(completed.messages);
  });

  it('reserves a whole multi-message fallback and rejects it before adding outgoing text when it cannot fit', () => {
    const document = createFixture();
    document.steps['start-fallback'].blockIds.push('fallback-second', 'fallback-third');
    for(const id of ['fallback-second', 'fallback-third']) document.blocks[id] = {id, type: 'message', messageId: id};
    for(const id of ['fallback-second', 'fallback-third']) {document.messages[id] = {rows: []}; document.content.messages[id] = id;}
    let run = startRun(document, 'capacity', 0);
    for(let index = 0; index < 196; index++) run = jumpRun(run, 'start', index);
    const waiting = sendText(run, run.id, 'fits', 'Вопрос', 200);
    expect(pendingMessageCount(waiting)).toBe(3);
    expect(finish(waiting).messages).toHaveLength(201);
    const nearLimit = jumpRun(run, 'start', 200);
    expect(sendText(nearLimit, run.id, 'overflow', 'Не влезает', 201).messages).toBe(nearLimit.messages);
    expect(textReadiness(nearLimit, 'Не влезает')).toContain('лимит');
    expect(textReadiness(nearLimit, '/start')).toBeNull();
  });
});

describe('folder context and start priority', () => {
  it('recognizes only exact /start or this bot username', () => {
    const document = createFixture();
    for(const text of ['/start', ' /start\n', '/start@MYAIBOT', '/start@myaibot']) expect(classifyTestText(document, text)).toBe('start');
    for(const text of ['/start payload', '/start@OtherBot', '/starter', '/START', ' /unknown']) expect(classifyTestText(document, text)).toBe('command');
    for(const text of ['message', 'message /start']) expect(classifyTestText(document, text)).toBe('message');
  });

  it('uses the active screen owner across explicit button transitions and author jumps', () => {
    const run = startRun(createFixture(), 'context', 0);
    const menu = finish(activate(run, run.activeMessageId, 'start-menu', 0));
    expect(pendingStep(sendText(menu, run.id, 'menu', '/help', 351)).targetStepId).toBe('menu-fallback');
    const details = jumpRun(menu, 'details', 351);
    expect(pendingStep(sendText(details, run.id, 'details', 'Вопрос', 352)).targetStepId).toBe('menu-fallback');
    const material = jumpRun(details, 'material', 352);
    expect(pendingStep(sendText(material, run.id, 'material', '/help', 353)).targetStepId).toBe('start-fallback');
  });

  it('/start is visibly sent, replaces pending fallback identity and preserves the transcript', () => {
    const run = startRun(createFixture(), 'start', 0, 'menu');
    const old = sendText(run, run.id, 'question', 'Вопрос', 0);
    const started = sendText(old, run.id, 'start-command', '/start', 100);
    expect(started.messages.slice(0, 2)).toEqual(old.messages);
    expect(messageText(started, started.messages.at(-1)!)).toBe('/start');
    expect(started.pending).toMatchObject({kind: 'step', targetStepId: 'start', dueAt: 450});
    expect(sendText(started, run.id, 'start-command', '/start', 150)).toBe(started);
    expect(finishReply(started, run.id, old.pending!.id, 400)).toBe(started);
    expect(finishReply(started, run.id, started.pending!.id, 449)).toBe(started);
    const completed = finish(started);
    expect(completed.messages).toHaveLength(4); expect(completed.messages.at(-1)).toMatchObject({kind: 'bot', stepId: 'start'});
    expect(completed.document.entryStepId).toBe('start');
    expect(finishReply(completed, run.id, started.pending!.id, 1000)).toBe(completed);
  });

  it('pins ownership and fallback content after an author moves a screen or edits its response', () => {
    const document = createFixture(); const run = startRun(document, 'pinned', 0, 'details');
    const original = createEditor(document);
    const moved = command(original, {type: 'move_step_to_folder', stepId: 'details', folderId: 'start-folder'}, 0);
    moved.document.content.messages['menu-fallback-message'] = 'Changed later';
    const waiting = sendText(run, run.id, 'question', 'Вопрос', 1);
    expect(pendingStep(waiting).targetStepId).toBe('menu-fallback');
    const completed = finish(waiting);
    expect(messageText(completed, completed.messages.at(-1)!)).toBe(document.content.messages['menu-fallback-message']);
    const fresh = startRun(moved.document, 'fresh', 0, 'details');
    expect(pendingStep(sendText(fresh, fresh.id, 'question', 'Вопрос', 1)).targetStepId).toBe('start-fallback');
  });

  it('rejects launch when any folder fallback batch is blank, even if the starting folder is ready', () => {
    const document = createFixture(); document.content.messages['menu-fallback-message'] = ' \n ';
    expect(() => startRun(document, 'blank', 0)).toThrow('Папка «Меню», ответ «Если непонятно»: Сообщение 1 на экране пустое. Добавьте текст.');
    expect(() => startRun(document, 'blank', 0, 'offer')).toThrow(/Если непонятно/);
  });

  it('revalidates a live-edited fallback before send and at pending completion without emitting blank messages', () => {
    const run = startRun(createFixture(), 'live', 0);
    const waiting = sendText(run, run.id, 'question', 'Вопрос', 1);
    const edited = {...waiting, document: structuredClone(waiting.document)};
    edited.document.content.messages['start-fallback-message'] = '';
    const stopped = finish(edited);
    expect(stopped.messages).toBe(waiting.messages); expect(stopped.pending).toBeNull();
    expect(stopped.error).toContain('Ответ не отправлен'); expect(stopped.activeMessageId).toBe(run.activeMessageId);
    expect(finishReply(stopped, run.id, waiting.pending!.id, 500)).toBe(stopped);
    expect(textReadiness(stopped, 'Вопрос')).toContain('Если непонятно');
    expect(textReadiness(stopped, '/start')).toBeNull();
  });

  it('replays late callbacks deterministically and invalidates old fallback replies after jumps/restart', () => {
    const run = startRun(createFixture(), 'replay', 0);
    const waiting = sendText(run, run.id, 'question', 'Вопрос', 1);
    expect(finishReply(waiting, run.id, waiting.pending!.id, 351)).toEqual(finishReply(waiting, run.id, waiting.pending!.id, 5000));
    const jumped = jumpRun(waiting, 'menu', 100);
    expect(finishReply(jumped, run.id, waiting.pending!.id, 500)).toBe(jumped);
    const restarted = startRun(createFixture(), 'next-run', 100);
    expect(finishReply(restarted, run.id, waiting.pending!.id, 500)).toBe(restarted);
    expect(finishReply(null, run.id, waiting.pending!.id, 500)).toBeNull();
  });
});
