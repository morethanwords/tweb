import {onMount} from 'solid-js';
import {useBubble} from '@components/chat/bubbles/context';
import {Message} from '@layer';
import {createInlineReplyMarkup} from '@components/chat/bubbleParts/replyMarkupLayout';

/**
 * Bubble.ReplyMarkup — renders inline keyboard buttons.
 * Self-contained: reads reply_markup from message in context.
 */
export default function ReplyMarkup() {
  const ctx = useBubble();
  const message = ctx.message();

  if(message._ !== 'message') {
    return ctx.register('replyMarkup', undefined);
  }

  const replyMarkup = message.reply_markup;
  if(replyMarkup?._ !== 'replyInlineMarkup') {
    return ctx.register('replyMarkup', undefined);
  }

  return ctx.register('replyMarkup', (() => {
    let ref: HTMLDivElement;

    onMount(() => {
      const containerDiv = createInlineReplyMarkup({
        rows: replyMarkup.rows,
        chat: ctx.chat,
        message: message as Message.message,
        wrapOptions: ctx.wrapOptions
      });

      if(containerDiv.childElementCount) {
        ref.replaceWith(containerDiv);
      }
    });

    return <div ref={ref!} />;
  })());
}
