import {createEffect} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import Icon from '@components/icon';

type SendingStatus = 'sending' | 'error' | 'sent' | 'read';

const STATUS_ICONS: Record<SendingStatus, Icon> = {
  error: 'sendingerror',
  sending: 'sending',
  sent: 'check',
  read: 'checks'
};

/**
 * Bubble.SendingStatus — renders the sending status icon (sending/sent/read/error).
 * Registers the result in the 'sendingStatus' slot.
 */
export default function SendingStatus() {
  const ctx = useBubble();

  const getStatus = (): SendingStatus | undefined => {
    const message = ctx.message();
    if(!ctx.isOut()) return undefined;

    if(message.error) return 'error';
    if(ctx.isOutgoing()) return 'sending';
    if(message.pFlags.unread || (message as any).pFlags.is_scheduled) return 'sent';
    return 'read';
  };

  return ctx.register('sendingStatus', (() => {
    let ref: HTMLSpanElement;

    createEffect(() => {
      const status = getStatus();
      if(!ref) return;

      ref.className = 'time-sending-status';
      if(status) {
        ref.replaceChildren(Icon(STATUS_ICONS[status]));
        ref.classList.add(`is-${status}`);
      } else {
        ref.replaceChildren();
      }
    });

    return <span ref={ref!} class="time-sending-status" />;
  })());
}
