import {copyTextToClipboard} from '@helpers/clipboard';
import cancelEvent from '@helpers/dom/cancelEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import toggleDisability from '@helpers/dom/toggleDisability';
import {KeyboardButton, KeyboardInlineButton, Message, ReplyMarkup, InlineQueryPeerType} from '@layer';
import {i18n} from '@lib/langPack';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import rootScope from '@lib/rootScope';
import isEphemeralMessageId from '@appManagers/utils/messageId/isEphemeralMessageId';
import Chat from '@components/chat/chat';
import {showPickUser3Popup} from '@components/popups/pickUser';
import selectRequestPeers from '@components/popups/requestPeer';
import {toast, toastNew} from '@components/toast';
import wrapCustomEmoji from '@components/wrappers/customEmoji';
import {makeMediaSize} from '@helpers/mediaSize';
import ReplyMarkupLayout from '@components/chat/bubbleParts/replyMarkupLayout';
import classNames from '@helpers/string/classNames';
import showCreateBotPopup from '@components/popups/createBot';
import confirmationPopup from '@components/confirmationPopup';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {wrapFormattedDuration} from './wrapDuration';
import formatDuration from '@helpers/formatDuration';
import {
  AnyButtonType,
  ButtonBackground,
  CHATLESS_BUTTON_TYPES,
  RichPageButton,
  getButtonBackground,
  getButtonTypeIcon
} from '@components/wrappers/buttonTypes';
import {copyUrlButtonAnchor, createUrlButtonAnchor} from '@components/wrappers/urlButtonAnchor';

export type AnyKeyboardButton = KeyboardButton | KeyboardInlineButton;

export type KeyboardButtonHandler = {
  text: DocumentFragment | HTMLElement,
  onClick?: (e: Event) => void,
  icon?: Icon,
  as: 'button' | 'a',
  classNames: string[],
  refCallbacks: ((ref: HTMLElement) => void)[],
  bg?: ButtonBackground
};

export type ButtonTypeHandler = Omit<KeyboardButtonHandler, 'text' | 'bg'> & {
  /** replaces the button's own label (a paid invoice shows its receipt) */
  text?: DocumentFragment | HTMLElement,
  /** needs a message the host does not have: drawn, but inert */
  unavailable?: boolean
};

async function openUserProfile(peerId: PeerId) {
  const [{default: appImManager}, {default: appSidebarRight}] = await Promise.all([
    import('@lib/appImManager'),
    import('@components/sidebarRight')
  ]);
  appImManager.setInnerPeer({peerId});
  appSidebarRight.toggleSidebar(true);
}

/**
 * What a button of this type does. The bot keyboards and the buttons laid out inside a rich
 * message share it; they differ only in the label and the style drawn around it. `label` is the
 * button's text as a string, for the places that need one (a web view's title, the reply
 * keyboard's plain button that sends its text).
 */
function getButtonTypeHandler({
  type,
  label,
  chat,
  message,
  replyMarkup
}: {
  type: AnyButtonType,
  label: string,
  chat?: Chat,
  message?: Message.message,
  replyMarkup?: ReplyMarkup
}): ButtonTypeHandler | undefined {
  let buttonEl: HTMLElement;
  const result: ButtonTypeHandler = {
    as: 'button',
    classNames: [],
    icon: getButtonTypeIcon(type),
    refCallbacks: [(ref) => {
      buttonEl = ref;
    }]
  };

  if(!chat && !CHATLESS_BUTTON_TYPES.has(type._)) {
    result.classNames.push('is-disabled');
    result.unavailable = true;
    return result;
  }

  const peerId = chat?.peerId;
  const messageMedia = message?.media;
  const messageMid = (replyMarkup as ReplyMarkup.replyKeyboardMarkup)?.mid || message?.mid;
  const botId = (replyMarkup as ReplyMarkup.replyKeyboardMarkup)?.fromId || message?.viaBotId || message?.fromId;

  switch(type._) {
    case 'inlineButtonTypeUrl': {
      const anchor = createUrlButtonAnchor(type.url);
      result.as = 'a';
      result.classNames.push('is-link', anchor.className);
      result.refCallbacks.push((ref) => copyUrlButtonAnchor(anchor, ref));
      break;
    }

    case 'inlineButtonTypeSwitchInline': {
      result.classNames.push('is-switch-inline');
      result.onClick = (e) => {
        cancelEvent(e);

        let promise: Promise<PeerId>;
        if(type.pFlags.same_peer) promise = Promise.resolve(peerId);
        else promise = rootScope.managers.appInlineBotsManager.checkSwitchReturn(botId).then((peerId) => {
          if(peerId) {
            return peerId;
          }

          let types: TelegramChoosePeerType[];
          if(type.peer_types) {
            const map: {[type in InlineQueryPeerType['_']]?: TelegramChoosePeerType} = {
              inlineQueryPeerTypePM: 'users',
              inlineQueryPeerTypeBotPM: 'bots',
              inlineQueryPeerTypeBroadcast: 'channels',
              inlineQueryPeerTypeChat: 'groups',
              inlineQueryPeerTypeMegagroup: 'groups'
            };

            types = type.peer_types.map((type) => map[type._]);
          }

          return showPickUser3Popup(types, ['send_inline']);
        });

        promise.then(async(chosenPeerId) => {
          const threadId = peerId === chosenPeerId ? chat.threadId : undefined;
          await chat.appImManager.setInnerPeer({peerId: chosenPeerId, threadId});
          rootScope.managers.appInlineBotsManager.switchInlineQuery(chosenPeerId, threadId, botId, type.query);
        });
      };
      break;
    }

    case 'inlineButtonTypeBuy': {
      const mediaInvoice = messageMedia?._ === 'messageMediaInvoice' ? messageMedia : undefined;
      if(mediaInvoice?.extended_media) {
        return;
      }

      result.classNames.push('is-buy');

      if(mediaInvoice?.receipt_msg_id) {
        result.text = i18n('Message.ReplyActionButtonShowReceipt');
        result.classNames.push('is-receipt');
      }

      break;
    }

    case 'inlineButtonTypeUrlAuth': {
      result.classNames.push('is-url-auth');

      const {url, button_id} = type;

      result.onClick = () => {
        const toggle = toggleDisability([buttonEl], true);
        chat.appImManager.handleUrlAuth({
          peerId,
          mid: messageMid,
          url,
          buttonId: button_id
        }).then(() => {
          toggle();
        });
      };
      break;
    }

    case 'buttonTypeSimpleWebView':
    case 'inlineButtonTypeWebView': {
      result.classNames.push('is-web-view');

      result.onClick = () => {
        const toggle = toggleDisability([buttonEl], true);
        chat.openWebApp({
          botId,
          url: type.url,
          isSimpleWebView: type._ === 'buttonTypeSimpleWebView',
          buttonText: label
        }).finally(() => {
          toggle();
        });
      };
      break;
    }

    case 'buttonTypeRequestPhone': {
      result.classNames.push('is-request-phone');

      result.onClick = () => {
        chat.appImManager.requestPhone(peerId);
      };
      break;
    }

    // Android's way: ask, then answer the keyboard's message with where we are. Desktop, having
    // no location to give, only says it cannot share one — a browser can.
    case 'buttonTypeRequestGeoLocation': {
      result.onClick = () => {
        chat.appImManager.requestLocation({
          peerId,
          threadId: chat.threadId,
          replyToMsgId: messageMid
        });
      };
      break;
    }

    // `quiz` both picks the kind of poll and locks it: the bot asked for exactly that one.
    case 'buttonTypeRequestPoll': {
      result.onClick = () => {
        chat.input.openPollCreation({quiz: type.quiz});
      };
      break;
    }

    case 'inlineButtonTypeCallback': {
      result.onClick = () => {
        rootScope.managers.appInlineBotsManager.callbackButtonClick(peerId, messageMid, type.data)
        .then((callbackAnswer) => {
          if(typeof callbackAnswer.message === 'string' && callbackAnswer.message.length) {
            if(callbackAnswer.pFlags.alert) {
              confirmationPopup({
                description: wrapRichText(callbackAnswer.message, {noLinks: true}),
                button: {langKey: 'OK', isCancel: true}
              }).catch(() => {});
            } else {
              toast(wrapRichText(callbackAnswer.message, {noLinks: true, noLinebreaks: true}));
            }
          } else if(typeof callbackAnswer.url === 'string' && callbackAnswer.url.length) {
            chat.appImManager.openUrl(callbackAnswer.url, true);
          }
        });
      };

      break;
    }

    case 'inlineButtonTypeGame': {
      result.classNames.push('is-game');

      result.onClick = () => {
        if(!message) return;
        // Inline-sent game messages are not re-rendered after the server confirms.
        // The bubble's data-mid is patched in place — re-read it so we use the
        // server mid instead of the captured temp one.
        const bubble = findUpClassName(buttonEl, 'bubble');
        const currentMid = bubble && +bubble.dataset.mid;
        const target = (currentMid && currentMid !== message.mid ?
          chat.getMessageByPeer(message.peerId, currentMid) as Message.message :
          undefined) || message;
        chat.appImManager.playGame(target);
      };

      break;
    }

    case 'buttonTypeRequestPeer': {
      result.onClick = async() => {
        const peerType = type.peer_type;

        if(peerType._ === 'requestPeerTypeCreateBot') {
          showCreateBotPopup({
            requestingPeerId: peerId,
            suggestedBotName: peerType.suggested_name,
            suggestedUsername: peerType.suggested_username,
            onCreate: async({name, username}) => {
              try {
                const createBotResult = await rootScope.managers.appBotsManager.createManagedBot({
                  managerId: peerId,
                  botName: name,
                  username: username
                });

                if(createBotResult.status === 'wait') {
                  toastNew({
                    langPackKey: 'CreateBot.TooManyBotsCreated',
                    langPackArguments: [wrapFormattedDuration(formatDuration(createBotResult.waitTime))]
                  });
                  return true; // Close it, wait time is long
                }

                if(createBotResult.status === 'error') {
                  toastNew({
                    langPackKey: 'CreateBot.FailedToCreate',
                    langPackArguments: []
                  });
                  return false;
                }

                const user = createBotResult.user;

                await rootScope.managers.appMessagesManager.sendBotRequestedPeer(
                  peerId,
                  type.button_id,
                  [user.id.toPeerId()],
                  {mid: messageMid}
                );

                return true;
              } catch{
                return false;
              }
            },
            HotReloadGuard: SolidJSHotReloadGuardProvider
          });
          return;
        }

        let requestedPeerIds: PeerId[];
        try {
          requestedPeerIds = await selectRequestPeers({button: type, requestingPeerId: peerId});
        } catch{
          return;
        }

        rootScope.managers.appMessagesManager.sendBotRequestedPeer(
          peerId,
          type.button_id,
          requestedPeerIds,
          {mid: messageMid}
        ).catch((err: ApiError) => {
          if(err.type === 'CHAT_ADMIN_INVITE_REQUIRED') {
            toastNew({
              langPackKey: peerType._ === 'requestPeerTypeBroadcast' ? 'Error.RequestPeer.NoRights.Channel' : 'Error.RequestPeer.NoRights.Group'
            });
          }
        });
      };

      break;
    }

    case 'inlineButtonTypeUserProfile': {
      result.classNames.push('is-user-profile');
      result.onClick = () => {
        openUserProfile(type.user_id.toPeerId(false));
      };
      break;
    }

    case 'inlineButtonTypeCopy': {
      result.onClick = () => {
        copyTextToClipboard(type.copy_text);
        toastNew({langPackKey: 'TextCopied'});
      };
      break;
    }

    case 'inlineButtonTypeDisabled': {
      result.classNames.push('is-disabled');
      break;
    }

    case 'buttonTypeDefault': {
      if(!message) {
        // a keyboard an ephemeral message brought answers its bot privately: the press replies
        // to that message, which makes the send an ephemeral reply (desktop replies to the
        // keyboard's message in groups for the same reason)
        const replyToEphemeral = isEphemeralMessageId(messageMid) ? {replyToMsgId: messageMid} : undefined;
        result.onClick = () => {
          rootScope.managers.appMessagesManager.sendText({
            ...chat.input?.getEphemeralSendingSnapshot(),
            ...replyToEphemeral,
            peerId,
            text: label
          });
        };
      }

      break;
    }
  }

  // a welcome message is only a template until someone joins, and its id is no message's id: a
  // button that needs no message still works, anything that would ask a bot about "this
  // message" must not fire (desktop's `api_bot.cpp` guard)
  if(message?.pFlags.welcome_template && !CHATLESS_BUTTON_TYPES.has(type._)) {
    result.onClick = undefined;
  }

  return result;
}

export function getKeyboardButtonHandler({
  button,
  chat,
  message,
  replyMarkup,
  wrapOptions,
  className
}: {
  button: AnyKeyboardButton,
  chat: Chat,
  message?: Message.message,
  replyMarkup?: ReplyMarkup,
  wrapOptions?: WrapSomethingOptions,
  className?: string
}): KeyboardButtonHandler | undefined {
  const typeHandler = getButtonTypeHandler({
    type: button.type,
    label: button.text,
    chat,
    message,
    replyMarkup
  });
  if(!typeHandler) return;

  const text = typeHandler.text || wrapRichText(button.text, {noLinks: true, noLinebreaks: true});
  const classNamesArr: string[] = [className, ...typeHandler.classNames].filter(Boolean);

  const bg = getButtonBackground(button.style);
  if(bg) {
    classNamesArr.push(
      'reply-markup-button-bg',
      `reply-markup-button-bg-${bg}`
    );
  }

  if(button.style?.icon) {
    let customEmojiSize = wrapOptions?.customEmojiSize;
    if(customEmojiSize) {
      customEmojiSize = makeMediaSize(
        customEmojiSize.width - 2,
        customEmojiSize.height - 2
      );
    }

    text.prepend(
      wrapCustomEmoji({
        docIds: [button.style.icon],
        ...wrapOptions,
        textColor: bg ? 'white' : wrapOptions.textColor,
        customEmojiSize
      }),
      ' '
    );
  }

  return {
    text,
    onClick: typeHandler.onClick,
    icon: typeHandler.icon,
    as: typeHandler.as,
    classNames: classNamesArr,
    refCallbacks: typeHandler.refCallbacks,
    bg
  };
}

/**
 * A button inside a rich message or a page. Its label is drawn by the page (it is rich text), so
 * only the action comes from here. `chat` and `message` are the message the page is shown in;
 * without them only the types that need no message work.
 */
export function getRichPageButtonHandler({
  button,
  label,
  chat,
  message
}: {
  button: RichPageButton,
  label: string,
  chat?: Chat,
  message?: Message.message
}) {
  return getButtonTypeHandler({type: button.type, label, chat, message});
}

export default function wrapKeyboardButton(options: {
  button: AnyKeyboardButton,
  chat: Chat,
  message?: Message.message,
  replyMarkup?: ReplyMarkup,
  wrapOptions?: WrapSomethingOptions,
  onClick?: () => void,
  className?: string
}) {
  const handler = getKeyboardButtonHandler(options);
  if(!handler) return;

  const {onClick: _onClick} = options;
  return ReplyMarkupLayout.Button({
    children: handler.text,
    class: classNames(...handler.classNames),
    onClick: _onClick ? (e) => (_onClick(), handler.onClick?.(e)) : handler.onClick,
    icon: handler.icon,
    ref: (ref) => {
      handler.refCallbacks.forEach((cb) => cb(ref));
    },
    as: handler.as
  });
}
