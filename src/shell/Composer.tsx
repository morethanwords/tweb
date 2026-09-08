import {createEffect, createSignal, type JSX} from 'solid-js';

export interface ComposerProps {
  /** Returns true when the text was accepted; the field is cleared only then. */
  onSend: (text: string) => boolean;
  /** Changing this value discards the current draft. */
  resetKey?: unknown;
  disabled?: boolean;
  /** A note under the field; receives the current draft. */
  caption?: (text: string) => string | undefined;
  leading?: JSX.Element;
}

/** One chat-style input for both walking the bot and authoring its messages. */
export function Composer(props: ComposerProps) {
  const [text, setText] = createSignal('');
  const [composing, setComposing] = createSignal(false);
  let input!: HTMLTextAreaElement;
  let previousKey: unknown = Symbol('initial');
  function resize() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
  }
  createEffect(() => {
    const key = props.resetKey;
    if(key !== previousKey) {previousKey = key; setText(''); setComposing(false); if(input) resize();}
  });
  function send() {
    if(composing() || props.disabled || !text().trim()) return;
    if(props.onSend(text())) {setText(''); resize(); input.focus();}
  }
  return <footer class="chat-composer-panel">
    <div class="chat-composer">
      {props.leading}
      <textarea ref={element => {input = element;}} aria-label="Сообщение" placeholder="Сообщение" value={text()} rows={1} disabled={props.disabled}
        onInput={event => {setText(event.currentTarget.value); resize();}}
        onCompositionStart={() => setComposing(true)}
        onCompositionEnd={event => {setComposing(false); setText(event.currentTarget.value); resize();}}
        onKeyDown={event => {if(event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing()) {event.preventDefault(); send();}}}
      />
      <button type="button" class="send-message" aria-label="Отправить сообщение" disabled={props.disabled || !text().trim() || composing()} onClick={send}>
        <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 2.5a1 1 0 0 0-1.3 1.2L5 10.5l9.5 1.5L5 13.5l-2.9 6.8a1 1 0 0 0 1.3 1.2l18-8.6a1 1 0 0 0 0-1.8l-18-8.6Z" /></svg>
      </button>
    </div>
    {/* Always rendered so a caption never shifts the chat above it. */}
    <span class="composer-caption" role="status">{props.caption?.(text()) ?? ''}</span>
  </footer>;
}
