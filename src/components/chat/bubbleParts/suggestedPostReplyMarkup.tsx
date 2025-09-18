import {Message} from '../../../layer';
import SolidJSHotReloadGuardProvider from '../../../lib/solidjs/hotReloadGuardProvider';
import SuggestedPostReplyMarkupContent from './suggestedPostReplyMarkupContent';


type Args = {
  message: Message.message;
  bubble: HTMLElement;
  contentWrapper: HTMLElement;
};

export function canHaveSuggestedPostReplyMarkup(message: Message.message): boolean {
  return !message.reply_markup && message.suggested_post && !message.suggested_post.pFlags.accepted && !message.suggested_post.pFlags.rejected;
}

type Props = {
  message: Message.message;
};


export default function addSuggestedPostReplyMarkup({message, bubble, contentWrapper}: Args) {
  if(!canHaveSuggestedPostReplyMarkup(message)) return;

  const container = new SuggestedPostReplyMarkupContent;
  container.HotReloadGuard = SolidJSHotReloadGuardProvider;
  container.feedProps({message});

  bubble.classList.add('with-reply-markup');
  contentWrapper.append(container);
}
