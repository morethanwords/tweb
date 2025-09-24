import {Message} from '../../../layer';
import SolidJSHotReloadGuardProvider from '../../../lib/solidjs/hotReloadGuardProvider';
import type Chat from '../chat';


export function canHaveSuggestedPostReplyMarkup(message: Message.message): boolean {
  return !message.reply_markup && message.suggested_post && !message.suggested_post.pFlags.accepted && !message.suggested_post.pFlags.rejected;
}

type Args = {
  chat: Chat;
  message: Message.message;
  bubble: HTMLElement;
  contentWrapper: HTMLElement;
};

export default function addSuggestedPostReplyMarkup({chat, message, bubble, contentWrapper}: Args) {
  if(!canHaveSuggestedPostReplyMarkup(message)) return;

  return (async() => {
    const {default: SuggestedPostReplyMarkupContent} = await import('./suggestedPostReplyMarkupContent');
    const container = new SuggestedPostReplyMarkupContent;
    container.HotReloadGuard = SolidJSHotReloadGuardProvider;
    container.feedProps({message, chat});

    bubble.classList.add('with-reply-markup');
    contentWrapper.append(container);
  })();
}
