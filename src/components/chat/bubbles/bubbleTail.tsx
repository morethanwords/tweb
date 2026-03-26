import {Show} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import {generateTail} from '@components/chat/utils';

/**
 * Bubble.Tail — conditionally renders the message bubble tail.
 */
export default function Tail() {
  const ctx = useBubble();

  return ctx.register('tail', (
    <Show when={ctx.canHaveTail()}>
      {generateTail()}
    </Show>
  ));
}
