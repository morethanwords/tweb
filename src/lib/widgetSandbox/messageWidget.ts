import type {Message, MessageMedia} from '@layer';
import type {ChatType, WidgetContext, WidgetData, WidgetRequest, WidgetRequestAnswer} from 'widget-sandbox/host/widget-host';
import type {AppManagers} from '@lib/managers';
import {toastNew} from '@components/toast';
import {copyTextToClipboard} from '@helpers/clipboard';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';
import apiManagerProxy from '@lib/apiManagerProxy';
import rootScope from '@lib/rootScope';

/**
 * What a widget message gives its widget beyond the HTML (docs/integration.md, "The widget's state and requests"): its
 * state, the server's flags, where it is and who looks at it, and the requests it sends the bot.
 */

/**
 * The widget's state as its message (an inline result, a test case) has it now: the chat state and the shared state,
 * none = null.
 */
export function getWidgetData(state: Partial<Pick<MessageMedia.messageMediaWidget, 'chat_data' | 'public_data'>>): Required<WidgetData> {
  return {chatData: state.chat_data ?? null, publicData: state.public_data ?? null};
}

/** The chat as the Bot API names its kind (`Chat.type`). */
function getWidgetChatType(peerId: PeerId): ChatType {
  if(peerId.isUser()) return 'private';
  const chat = apiManagerProxy.getChat(peerId.toChatId());
  if(chat?._ === 'channel') return chat.pFlags.broadcast ? 'channel' : 'supergroup';
  return 'group';
}

/**
 * The server's flags as they are, the chat's kind and the account's own user: the framework gives a copy no chat
 * type and a message without `can_query` no viewer. A message that is not of the chat's history (`historyEntry`: an
 * admin log's entry, a scheduled one) asks nothing: the server knows no message of the chat by it. No `wallet`: the
 * client has no Gram Wallet to pay or sign with yet (docs/sdk-v1.md §5.13), so `TelegramWidget.wallet` is null and the
 * framework refuses wallet calls.
 */
export function getWidgetContext(message: Message.message, media: MessageMedia.messageMediaWidget, historyEntry = true): WidgetContext {
  const {is_copy} = media.pFlags;
  const can_query = historyEntry && media.pFlags.can_query, background_query = historyEntry && media.pFlags.background_query;
  const self = can_query ? apiManagerProxy.getUser(rootScope.myId.toUserId()) : undefined;
  return {
    isCopy: !!is_copy,
    canQuery: !!can_query,
    backgroundQuery: !!background_query,
    chatType: getWidgetChatType(message.peerId),
    viewer: self && {
      id: +self.id,
      firstName: self.first_name,
      lastName: self.last_name,
      username: getPeerActiveUsernames(self)[0],
      isPremium: !!self.pFlags.premium
    }
  };
}

/**
 * Sends the widget's request in the message like a callback button's press, and turns the server's refusals into the
 * framework's: the bot's silence (15 s), a flood wait, anything else. The client's own 30 s deadline
 * (appWidgetsManager, 'TIMEOUT') is "anything else": docs/integration.md maps only WIDGET_RESPONSE_TIMEOUT to `timeout`.
 */
export function createWidgetRequestHandler(managers: AppManagers, peerId: PeerId, mid: number) {
  return async({data}: WidgetRequest): Promise<WidgetRequestAnswer> => {
    try {
      const answer = await managers.appWidgetsManager.getBotWidgetQueryAnswer(peerId, mid, data);
      return {result: answer.result ?? null};
    } catch(err) {
      const type = (err as ApiError)?.type;
      throw type === 'WIDGET_RESPONSE_TIMEOUT' ? 'TIMEOUT' : type?.startsWith('FLOOD_WAIT') ? 'RATE_LIMITED' : 'FAILED';
    }
  };
}

/** `TelegramWidget.copyText` (checked: on a tap, at most 256 characters): copied, and the toast says what. */
export function copyWidgetText(text: string) {
  copyTextToClipboard(text);
  const copied = document.createElement('span');
  setInnerHTML(copied, text);
  toastNew({langPackKey: 'Widget.Copied', langPackArguments: [copied]});
}
