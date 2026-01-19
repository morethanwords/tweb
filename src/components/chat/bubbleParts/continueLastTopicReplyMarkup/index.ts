import {Message} from '@layer';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import type Chat from '@components/chat/chat';
import {BubbleElementAddons} from '@components/chat/types';
import ContinueLastTopicReplyMarkupContent from '@components/chat/bubbleParts/continueLastTopicReplyMarkup/content';


type Args = {
  chat: Chat;
  message: Message.message;
  bubble: HTMLElement;
  contentWrapper: HTMLElement;
};

export default function addContinueLastTopicReplyMarkup({chat, message, bubble, contentWrapper}: Args) {
  if(!chat.isBotforum || chat.threadId) return;

  const container = new ContinueLastTopicReplyMarkupContent;
  container.HotReloadGuard = SolidJSHotReloadGuardProvider;
  container.feedProps({message, chat, bubble, visible: false});

  const addons = bubble as BubbleElementAddons;
  addons.continueLastTopicReplyMarkup = container;

  contentWrapper.append(container);
}
