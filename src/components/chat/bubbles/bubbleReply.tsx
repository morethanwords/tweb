import {onMount} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import {Message} from '@layer';
import {MessageRender} from '@components/chat/messageRender';

/**
 * Bubble.Reply — renders the reply quote.
 * Self-contained: reads message.reply_to from context.
 */
export default function Reply() {
  const ctx = useBubble();
  const message = ctx.message();

  if(message._ !== 'message') {
    return ctx.register('reply', undefined);
  }

  const replyTo = message.reply_to;
  if(!replyTo) {
    return ctx.register('reply', undefined);
  }

  // only show reply for actual reply headers (not story headers in some cases)
  const hasReplyMid = message.reply_to_mid && replyTo._ === 'messageReplyHeader';
  const hasStoryReply = replyTo._ === 'messageReplyStoryHeader';
  const hasReplyFrom = !!(replyTo as any).reply_from;

  if(!hasReplyMid && !hasStoryReply && !hasReplyFrom) {
    return ctx.register('reply', undefined);
  }

  return ctx.register('reply', (() => {
    let ref: HTMLDivElement;

    onMount(async() => {
      const bubble = ref.closest('.bubble') as HTMLElement;
      if(!bubble) return;

      const bubbleContainer = bubble.querySelector('.bubble-content') as HTMLElement;
      if(!bubbleContainer) return;

      const container = await MessageRender.setReply({
        chat: ctx.chat,
        bubble,
        bubbleContainer,
        message: message as Message.message,
        appendCallback: (replyContainer) => {
          ref.replaceWith(replyContainer);
        },
        middleware: ctx.middleware,
        lazyLoadQueue: ctx.lazyLoadQueue,
        needUpdate: ctx.bubbles.needUpdate,
        isStandaloneMedia: ctx.isStandaloneMedia(),
        isOut: ctx.isOut()
      });
    });

    return <div ref={ref!} />;
  })());
}
