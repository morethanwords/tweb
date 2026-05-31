import {copyTextToClipboard} from '@helpers/clipboard';
import cancelEvent from '@helpers/dom/cancelEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import htmlToDocumentFragment from '@helpers/dom/htmlToDocumentFragment';
import toggleDisability from '@helpers/dom/toggleDisability';
import {KeyboardButton, Message, ReplyMarkup, InlineQueryPeerType} from '@layer';
import {i18n} from '@lib/langPack';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import rootScope from '@lib/rootScope';
import Chat from '@components/chat/chat';
import {showPickUser3Popup} from '@components/popups/pickUser';
import selectRequestPeers from '@components/popups/requestPeer';
import {toast, toastNew} from '@components/toast';
import wrapCustomEmoji from '@components/wrappers/customEmoji';
import {makeMediaSize} from '@helpers/mediaSize';
import ReplyMarkupLayout from '@components/chat/bubbleParts/replyMarkupLayout';
import classNames from '@helpers/string/classNames';
import showCreateBotPopup from '@components/popups/createBot';
import SolidJSHotReloadGuardProvider from '@lib/solidjs/hotReloadGuardProvider';
import {wrapFormattedDuration} from './wrapDuration';
import formatDuration from '@helpers/formatDuration';

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
  button: KeyboardButton,
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

  switch(button._) {
    case 'keyboardButtonUrl': {
      const r = wrapRichText(' ', {
        entities: [{
          _: 'messageEntityTextUrl',
          length: 1,
          offset: 0,
          url: button.url
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

    case 'keyboardButtonSwitchInline': {
      classNamesArr.push('is-switch-inline');
      icon = 'forward_filled';
      onClick = (e) => {
        cancelEvent(e);

        let promise: Promise<PeerId>;
        if(button.pFlags.same_peer) promise = Promise.resolve(peerId);
        else promise = rootScope.managers.appInlineBotsManager.checkSwitchReturn(botId).then((peerId) => {
          if(peerId) {
            return peerId;
          }

          let types: TelegramChoosePeerType[];
          if(button.peer_types) {
            const map: {[type in InlineQueryPeerType['_']]?: TelegramChoosePeerType} = {
              inlineQueryPeerTypePM: 'users',
              inlineQueryPeerTypeBotPM: 'bots',
              inlineQueryPeerTypeBroadcast: 'channels',
              inlineQueryPeerTypeChat: 'groups',
              inlineQueryPeerTypeMegagroup: 'groups'
            };

            types = button.peer_types.map((type) => map[type._]);
          }

          return showPickUser3Popup(types, ['send_inline']);
        });

        promise.then(async(chosenPeerId) => {
          const threadId = peerId === chosenPeerId ? chat.threadId : undefined;
          await chat.appImManager.setInnerPeer({peerId: chosenPeerId, threadId});
          rootScope.managers.appInlineBotsManager.switchInlineQuery(chosenPeerId, threadId, botId, button.query);
        });
      };
      break;
    }

    case 'keyboardButtonBuy': {
      const mediaInvoice = messageMedia._ === 'messageMediaInvoice' ? messageMedia : undefined;
      if(mediaInvoice?.extended_media) {
        return;
      }

      classNamesArr.push('is-buy');
      icon = 'card';

      if(mediaInvoice?.receipt_msg_id) {
        text = i18n('Message.ReplyActionButtonShowReceipt');
        classNamesArr.push('is-receipt');
      }

      break;
    }

    case 'keyboardButtonUrlAuth': {
      classNamesArr.push('is-url-auth');

      const {url, button_id} = button;

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

    case 'keyboardButtonSimpleWebView':
    case 'keyboardButtonWebView': {
      classNamesArr.push('is-web-view');
      icon = 'webview';

      onClick = () => {
        const toggle = toggleDisability([buttonEl], true);
        chat.openWebApp({
          botId,
          url: button.url,
          isSimpleWebView: button._ === 'keyboardButtonSimpleWebView',
          buttonText: button.text
        }).finally(() => {
          toggle();
        });
      };
      break;
    }

    case 'keyboardButtonRequestPhone': {
      classNamesArr.push('is-request-phone');

      onClick = () => {
        chat.appImManager.requestPhone(peerId);
      };
      break;
    }

    case 'keyboardButtonCallback': {
      onClick = () => {
        rootScope.managers.appInlineBotsManager.callbackButtonClick(peerId, messageMid, button)
        .then((callbackAnswer) => {
          if(typeof callbackAnswer.message === 'string' && callbackAnswer.message.length) {
            toast(wrapRichText(callbackAnswer.message, {noLinks: true, noLinebreaks: true}));
          }
        });
      };

      break;
    }

    case 'keyboardButtonGame': {
      classNamesArr.push('is-game');
      icon = 'play';

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

    case 'keyboardButtonRequestPeer': {
      onClick = async() => {
        const peerType = button.peer_type;

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
                  button.button_id,
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
          requestedPeerIds = await selectRequestPeers({button, requestingPeerId: peerId});
        } catch{
          return;
        }

        rootScope.managers.appMessagesManager.sendBotRequestedPeer(
          peerId,
          button.button_id,
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

    case 'keyboardButtonCopy': {
      icon = 'copy';

      onClick = () => {
        copyTextToClipboard(button.copy_text);
        toastNew({langPackKey: 'TextCopied'});
      };
      break;
    }

    default: {
      if(!message) {
        onClick = () => {
          rootScope.managers.appMessagesManager.sendText({peerId, text: button.text});
        };
      }

      break;
    }
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
  button: KeyboardButton,
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
