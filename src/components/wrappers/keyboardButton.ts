import {copyTextToClipboard} from '@helpers/clipboard';
import cancelEvent from '@helpers/dom/cancelEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import htmlToDocumentFragment from '@helpers/dom/htmlToDocumentFragment';
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

export type AnyKeyboardButton = KeyboardButton | KeyboardInlineButton;

export type KeyboardButtonHandler = {
  text: DocumentFragment | HTMLElement,
  onClick?: (e: Event) => void,
  icon?: Icon,
  as: 'button' | 'a',
  classNames: string[],
  refCallbacks: ((ref: HTMLElement) => void)[],
  bg?: 'success' | 'danger' | 'primary'
};

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
  let text: DocumentFragment | HTMLElement = wrapRichText(button.text, {noLinks: true, noLinebreaks: true});
  let buttonEl: HTMLElement;
  let icon: Icon;
  let onClick: (e: Event) => void;
  let as: 'button' | 'a' = 'button';
  const refCallbacks: ((ref: HTMLElement) => void)[] = [(ref) => {
    buttonEl = ref;
  }];
  const classNamesArr: string[] = [className].filter(Boolean);

  const {peerId} = chat;
  const messageMedia = message?.media;
  const messageMid = (replyMarkup as ReplyMarkup.replyKeyboardMarkup)?.mid || message?.mid;
  const botId = (replyMarkup as ReplyMarkup.replyKeyboardMarkup)?.fromId || message?.viaBotId || message?.fromId;

  const buttonType = button.type;

  switch(buttonType._) {
    case 'inlineButtonTypeUrl': {
      const r = wrapRichText(' ', {
        entities: [{
          _: 'messageEntityTextUrl',
          length: 1,
          offset: 0,
          url: buttonType.url
        }]
      });

      const anchor = htmlToDocumentFragment(r).firstElementChild as HTMLAnchorElement;
      as = 'a';
      classNamesArr.push('is-link', anchor.className);
      icon = 'arrow_next';

      refCallbacks.push((ref) => {
        anchor.getAttributeNames().forEach((name) => {
          if(name !== 'class') {
            ref.setAttribute(name, anchor.getAttribute(name));
          }
        });
      });

      break;
    }

    case 'inlineButtonTypeSwitchInline': {
      classNamesArr.push('is-switch-inline');
      icon = 'forward_filled';
      onClick = (e) => {
        cancelEvent(e);

        let promise: Promise<PeerId>;
        if(buttonType.pFlags.same_peer) promise = Promise.resolve(peerId);
        else promise = rootScope.managers.appInlineBotsManager.checkSwitchReturn(botId).then((peerId) => {
          if(peerId) {
            return peerId;
          }

          let types: TelegramChoosePeerType[];
          if(buttonType.peer_types) {
            const map: {[type in InlineQueryPeerType['_']]?: TelegramChoosePeerType} = {
              inlineQueryPeerTypePM: 'users',
              inlineQueryPeerTypeBotPM: 'bots',
              inlineQueryPeerTypeBroadcast: 'channels',
              inlineQueryPeerTypeChat: 'groups',
              inlineQueryPeerTypeMegagroup: 'groups'
            };

            types = buttonType.peer_types.map((type) => map[type._]);
          }

          return showPickUser3Popup(types, ['send_inline']);
        });

        promise.then(async(chosenPeerId) => {
          const threadId = peerId === chosenPeerId ? chat.threadId : undefined;
          await chat.appImManager.setInnerPeer({peerId: chosenPeerId, threadId});
          rootScope.managers.appInlineBotsManager.switchInlineQuery(chosenPeerId, threadId, botId, buttonType.query);
        });
      };
      break;
    }

    case 'inlineButtonTypeBuy': {
      const mediaInvoice = messageMedia._ === 'messageMediaInvoice' ? messageMedia : undefined;
      if(mediaInvoice?.extended_media) {
        return;
      }

      classNamesArr.push('is-buy');
      icon = 'card_filled';

      if(mediaInvoice?.receipt_msg_id) {
        text = i18n('Message.ReplyActionButtonShowReceipt');
        classNamesArr.push('is-receipt');
      }

      break;
    }

    case 'inlineButtonTypeUrlAuth': {
      classNamesArr.push('is-url-auth');

      const {url, button_id} = buttonType;

      onClick = () => {
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
      classNamesArr.push('is-web-view');
      icon = 'webview';

      onClick = () => {
        const toggle = toggleDisability([buttonEl], true);
        chat.openWebApp({
          botId,
          url: buttonType.url,
          isSimpleWebView: buttonType._ === 'buttonTypeSimpleWebView',
          buttonText: button.text
        }).finally(() => {
          toggle();
        });
      };
      break;
    }

    case 'buttonTypeRequestPhone': {
      classNamesArr.push('is-request-phone');

      onClick = () => {
        chat.appImManager.requestPhone(peerId);
      };
      break;
    }

    case 'inlineButtonTypeCallback': {
      onClick = () => {
        rootScope.managers.appInlineBotsManager.callbackButtonClick(peerId, messageMid, buttonType.data)
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
      classNamesArr.push('is-game');
      icon = 'play_filled';

      onClick = () => {
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
      onClick = async() => {
        const peerType = buttonType.peer_type;

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
                  buttonType.button_id,
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
          requestedPeerIds = await selectRequestPeers({button: buttonType, requestingPeerId: peerId});
        } catch{
          return;
        }

        rootScope.managers.appMessagesManager.sendBotRequestedPeer(
          peerId,
          buttonType.button_id,
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

    case 'inlineButtonTypeCopy': {
      icon = 'copy';

      onClick = () => {
        copyTextToClipboard(buttonType.copy_text);
        toastNew({langPackKey: 'TextCopied'});
      };
      break;
    }

    case 'inlineButtonTypeDisabled': {
      classNamesArr.push('is-disabled');
      break;
    }

    default: {
      if(!message) {
        // a keyboard an ephemeral message brought answers its bot privately: the press replies
        // to that message, which makes the send an ephemeral reply (desktop replies to the
        // keyboard's message in groups for the same reason)
        const replyToEphemeral = isEphemeralMessageId(messageMid) ? {replyToMsgId: messageMid} : undefined;
        onClick = () => {
          rootScope.managers.appMessagesManager.sendText({
            ...chat.input?.getEphemeralSendingSnapshot(),
            ...replyToEphemeral,
            peerId,
            text: button.text
          });
        };
      }

      break;
    }
  }

  // a welcome message is only a template until someone joins, and its id is no message's id: a
  // link or a copy button still works, anything that would ask a bot about "this message" must
  // not fire (desktop's `api_bot.cpp` guard)
  if(message?.pFlags.welcome_template && buttonType._ !== 'inlineButtonTypeUrl' && buttonType._ !== 'inlineButtonTypeCopy') {
    onClick = undefined;
  }

  let bg: 'success' | 'danger' | 'primary';
  if(button.style) {
    if(button.style.pFlags.bg_success) bg = 'success';
    else if(button.style.pFlags.bg_danger) bg = 'danger';
    else if(button.style.pFlags.bg_primary) bg = 'primary';

    if(bg) {
      classNamesArr.push(
        'reply-markup-button-bg',
        `reply-markup-button-bg-${bg}`
      );
    }
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
    onClick,
    icon,
    as,
    classNames: classNamesArr,
    refCallbacks,
    bg
  };
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
    onClick: _onClick ? (e) => (_onClick(), handler.onClick(e)) : handler.onClick,
    icon: handler.icon,
    ref: (ref) => {
      handler.refCallbacks.forEach((cb) => cb(ref));
    },
    as: handler.as
  });
}
