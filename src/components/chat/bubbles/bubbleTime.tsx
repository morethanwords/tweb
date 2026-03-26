import {onMount} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import {MessageRender} from '@components/chat/messageRender';
import isRTL, {endsWithRTL} from '@helpers/string/isRTL';
import I18n from '@lib/langPack';
import {Message} from '@layer';

/**
 * Bubble.Time — renders the message time/metadata footer.
 * Self-contained: reads all data from BubbleContext.
 */
export default function Time() {
  const ctx = useBubble();
  const message = ctx.message();

  // sponsored messages have no time
  if((message as any).pFlags?.sponsored) {
    return ctx.register('time', undefined);
  }

  return ctx.register('time', (() => {
    let ref: HTMLSpanElement;

    onMount(() => {
      const timeEl = MessageRender.setTime({
        chat: ctx.chat,
        chatType: ctx.chat.type,
        message,
        groupedMessagesCount: ctx.groupedMessages()?.length,
        reactionsMessage: ctx.reactionsMessage(),
        isOut: ctx.isOut(),
        middleware: ctx.middleware,
        loadPromises: ctx.loadPromises
      });

      // floating time for standalone media or invertMedia with no webPage
      const isFloatingTime = (ctx.isMessageEmpty() && !ctx.messageMedia()) || ctx.invertMedia();
      if(isFloatingTime) {
        timeEl.classList.add('is-floating');
        const bubble = ref.closest('.bubble');
        bubble?.classList.add('has-floating-time');
      }

      // RTL block time
      const messageText = message._ === 'message' ? message.message : '';
      if(messageText) {
        const haveRTLChar = isRTL(messageText, true);
        if(I18n.getIsRTL() ? !endsWithRTL(messageText) : haveRTLChar) {
          timeEl.classList.add('is-block');
        }
      }

      ref.replaceWith(timeEl);
    });

    return <span ref={ref!} />;
  })());
}
