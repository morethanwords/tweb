import type {Message} from '@layer';

/**
 * Whether a forward of the message keeps its author and the captions, whatever was chosen: a rich message's author is
 * hidden only by one who may (`canDropRichAuthor`: Premium), a widget's never — it always shows which bot it is from
 * (widget-sandbox docs/sdk-v1.md §5.11)
 */
export default function forwardKeepsAuthor(message: Message.message, canDropRichAuthor: boolean) {
  return (!canDropRichAuthor && !!message.rich_message) || message.media?._ === 'messageMediaWidget';
}
