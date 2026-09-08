import {Show, createEffect, createSignal} from 'solid-js';
import type {Controller} from './controller';
import {ShellLimits} from './core/types';
import {textReadiness, pendingMessageCount} from './core';

export function TestComposer(props: {controller: Controller}) {
  const c = props.controller;
  const [text, setText] = createSignal('');
  const [composing, setComposing] = createSignal(false);
  let input!: HTMLTextAreaElement;
  let previousRunId: string | undefined;
  const full = () => !!c.run() && c.run()!.messages.length + pendingMessageCount(c.run()!) >= ShellLimits.messages;
  const issue = () => c.run() && text().trim() ? textReadiness(c.run()!, text()) : null;
  function resize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }
  createEffect(() => {
    const runId = c.run()?.id;
    if(runId !== previousRunId) {previousRunId = runId; setText(''); setComposing(false); if(input) resize();}
  });
  function send() {
    if(composing() || !text().trim()) return;
    if(c.sendText(text())) {setText(''); resize(); input.focus();}
  }
  return <footer class="test-input-panel">
    <div class="test-composer">
      <textarea ref={element => {input = element;}} aria-label="Сообщение" placeholder="Сообщение" value={text()} rows={1}
        onInput={event => {setText(event.currentTarget.value); resize();}}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={event => {setComposing(false); setText(event.currentTarget.value); resize();}}
        onKeyDown={event => {if(event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing()) {event.preventDefault(); send();}}}
      />
      <button type="button" class="send-message" aria-label="Отправить сообщение" disabled={!text().trim() || composing()} onClick={send}>
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 2.5a1 1 0 0 0-1.3 1.2L5 10.5l9.5 1.5L5 13.5l-2.9 6.8a1 1 0 0 0 1.3 1.2l18-8.6a1 1 0 0 0 0-1.8l-18-8.6Z" /></svg>
      </button>
    </div>
    <Show when={full()} fallback={<Show when={issue()}><span class="composer-caption">{issue()}</span></Show>}><span class="composer-caption">Лимит разговора достигнут. Нажмите «Начать заново» над чатом.</span></Show>
  </footer>;
}
