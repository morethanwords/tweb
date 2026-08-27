import type {Message} from '@layer';
import type {AdminLog} from '@appManagers/appChatsManager';
import type Chat from '@components/chat/chat';
import forEachReverse from '@helpers/array/forEachReverse';
import getMessageThreadId from '@appManagers/utils/messages/getMessageThreadId';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import apiManagerProxy from '@lib/apiManagerProxy';
import type {BubbleElementAddons} from '@components/chat/types';
import ChatThreadSeparator from '@components/chat/bubbleParts/chatThreadSeparator';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';

type SeparatorItem = {
  bubble: HTMLElement,
  message: Message.message | Message.messageService | AdminLog
};

type SeparatorChat = Pick<Chat,
  'hashtagType' |
  'isMonoforum' |
  'canManageDirectMessages' |
  'monoforumThreadId' |
  'isBotforum' |
  'threadId' |
  'isAllMessagesForum' |
  'isOutMessage' |
  'peerId' |
  'bubbles'
>;

function removeSeparator(item: SeparatorItem) {
  item.bubble.classList.remove('has-chat-thread-separator');
  (item.bubble as BubbleElementAddons).chatThreadSeparator?.remove();
}

export default function updateChatThreadSeparators(items: SeparatorItem[], chat: SeparatorChat) {
  const isMyMessagesSearch = chat.hashtagType === 'my';
  const isMonoforum = !isMyMessagesSearch && chat.isMonoforum && chat.canManageDirectMessages && !chat.monoforumThreadId;
  const isBotforum = !isMyMessagesSearch && chat.isBotforum && !chat.threadId;
  const isForum = !isMyMessagesSearch && chat.isAllMessagesForum;

  const canHaveSeparators = isMyMessagesSearch || isMonoforum || isBotforum || isForum;

  if(!canHaveSeparators) {
    items.forEach(removeSeparator);
    return;
  }

  let prevKey: number | string;

  forEachReverse(items, (item, i) => {
    const message = item.message;
    if(message._ === 'channelAdminLogEvent') {
      removeSeparator(item);
      return;
    }

    let peerId: PeerId;
    let threadId: number;
    let targetPeerId: PeerId;
    let targetThreadId: number;
    let targetMonoforumThreadId: PeerId;
    let key: number | string;

    if(isMyMessagesSearch) {
      if(message._ !== 'message' || !chat.isOutMessage(message)) {
        removeSeparator(item);
        return;
      }

      peerId = message.peerId;
      const isResultForum = apiManagerProxy.isForum(peerId);
      const isResultBotforum = apiManagerProxy.isBotforum(peerId);
      const isResultMonoforum = apiManagerProxy.isMonoforum(peerId);
      const savedPeerId = getPeerId(message.saved_peer_id);

      threadId = savedPeerId || (isResultForum || isResultBotforum || isResultMonoforum ? getMessageThreadId(message, {
        isForum: isResultForum,
        isBotforum: isResultBotforum
      }) : undefined);
      targetPeerId = peerId;
      if(isResultMonoforum) {
        targetMonoforumThreadId = threadId as PeerId;
      } else {
        targetThreadId = threadId;
      }
      key = `${peerId}_${threadId || ''}`;
    } else {
      const savedPeerId = isMonoforum ? getPeerId(message.saved_peer_id) : undefined;
      threadId = isBotforum ?
        getMessageThreadId(message, {isBotforum: true}) :
        isForum ? getMessageThreadId(message, {isForum: true}) : undefined;

      peerId = savedPeerId || chat.peerId;
      key = savedPeerId || threadId;
      targetPeerId = isMonoforum ? chat.peerId : peerId;
      targetThreadId = isMonoforum ? undefined : threadId;
      targetMonoforumThreadId = isMonoforum ? savedPeerId : undefined;
    }

    if(!key) {
      removeSeparator(item);
      return;
    }

    const bubbleAddons = item.bubble as BubbleElementAddons;

    if(prevKey === key) {
      removeSeparator(item);
      return;
    }

    prevKey = key;

    if(bubbleAddons.chatThreadSeparator) {
      bubbleAddons.chatThreadSeparator.feedProps<false>({
        peerId,
        threadId,
        targetPeerId,
        targetThreadId,
        targetMonoforumThreadId,
        index: -i
      });
      item.bubble.classList.add('has-chat-thread-separator');
      if(bubbleAddons.chatThreadSeparator.parentElement !== item.bubble) {
        item.bubble.prepend(bubbleAddons.chatThreadSeparator);
      }
      return;
    }

    bubbleAddons.chatThreadSeparator = new ChatThreadSeparator;
    bubbleAddons.chatThreadSeparator.HotReloadGuard = SolidJSHotReloadGuardProvider;
    bubbleAddons.chatThreadSeparator.feedProps({
      bubbles: chat.bubbles,
      peerId,
      threadId,
      targetPeerId,
      targetThreadId,
      targetMonoforumThreadId,
      index: -i
    });
    item.bubble.classList.add('has-chat-thread-separator');
    item.bubble.prepend(bubbleAddons.chatThreadSeparator);
  });
}
