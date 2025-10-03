/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {copyTextToClipboard} from '../../helpers/clipboard';
import cancelEvent from '../../helpers/dom/cancelEvent';
import htmlToDocumentFragment from '../../helpers/dom/htmlToDocumentFragment';
import toggleDisability from '../../helpers/dom/toggleDisability';
import {KeyboardButton, Message, ReplyMarkup, InlineQueryPeerType, RequestPeerType, Chat as MTChat} from '../../layer';
import {ChatRights} from '../../lib/appManagers/appChatsManager';
import hasRights from '../../lib/appManagers/utils/chats/hasRights';
import getPeerActiveUsernames from '../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import {i18n, join} from '../../lib/langPack';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import rootScope from '../../lib/rootScope';
import AppSelectPeers, {SelectSearchPeerType} from '../appSelectPeers';
import Chat from '../chat/chat';
import confirmationPopup from '../confirmationPopup';
import Icon from '../icon';
import PopupPickUser from '../popups/pickUser';
import {toast, toastNew} from '../toast';
import wrapPeerTitle from './peerTitle';

export default function wrapKeyboardButton({
  button,
  chat,
  message,
  noTextInject,
  replyMarkup
}: {
  button: KeyboardButton,
  chat: Chat,
  message?: Message.message,
  replyMarkup?: ReplyMarkup,
  noTextInject?: boolean
}) {
  let text: DocumentFragment | HTMLElement = wrapRichText(button.text, {noLinks: true, noLinebreaks: true});
  let buttonEl: HTMLButtonElement | HTMLAnchorElement;
  let buttonIcon: HTMLElement;
  let onClick: (e: Event) => void;

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

      buttonEl = htmlToDocumentFragment(r).firstElementChild as HTMLAnchorElement;
      buttonEl.classList.add('is-link');
      buttonIcon = Icon('arrow_next');

      break;
    }

    case 'keyboardButtonSwitchInline': {
      buttonEl = document.createElement('button');
      buttonEl.classList.add('is-switch-inline');
      buttonIcon = Icon('forward_filled');
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

          return PopupPickUser.createPicker(types, ['send_inline']);
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
        break;
      }

      buttonEl = document.createElement('button');
      buttonEl.classList.add('is-buy');
      buttonIcon = Icon('card');

      if(mediaInvoice?.receipt_msg_id) {
        text = i18n('Message.ReplyActionButtonShowReceipt');
        buttonEl.classList.add('is-receipt');
      }

      break;
    }

    case 'keyboardButtonUrlAuth': {
      buttonEl = document.createElement('button');
      buttonEl.classList.add('is-url-auth');

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
      buttonEl = document.createElement('button');
      buttonEl.classList.add('is-web-view');
      buttonIcon = Icon('webview');

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
      buttonEl = document.createElement('button');
      buttonEl.classList.add('is-request-phone');

      onClick = () => {
        chat.appImManager.requestPhone(peerId);
      };
      break;
    }

    case 'keyboardButtonCallback': {
      buttonEl = document.createElement('button');
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

    case 'keyboardButtonRequestPeer': {
      buttonEl = document.createElement('button');
      onClick = async() => {
        let filterPeerTypeBy: AppSelectPeers['filterPeerTypeBy'];
        const peerType = button.peer_type;

        const isRequestingUser = peerType._ === 'requestPeerTypeUser';
        const isRequestingChannel = peerType._ === 'requestPeerTypeBroadcast';
        const isRequestingGroup = peerType._ === 'requestPeerTypeChat';

        const _peerType: SelectSearchPeerType[] = ['dialogs'];
        if(isRequestingUser) {
          filterPeerTypeBy = (peer) => {
            if(peer._ !== 'user') {
              return false;
            }

            if(peerType.bot !== undefined && peerType.bot !== !!peer.pFlags.bot) {
              return false;
            }

            if(peerType.premium !== undefined && peerType.premium !== !!peer.pFlags.premium) {
              return false;
            }

            return true;
          };

          _peerType.push('contacts');
        } else {
          let commonChatIds: ChatId[];
          if(isRequestingGroup) {
            const messagesChats = await rootScope.managers.appUsersManager.getCommonChats(peerId, 100);
            commonChatIds = messagesChats.chats.map((chat) => chat.id);
          }

          filterPeerTypeBy = (peer) => {
            if(peer._ !== 'channel' && (isRequestingChannel ? true : peer._ !== 'chat')) {
              return false;
            }

            if(!!(peer as MTChat.channel).pFlags.broadcast !== isRequestingChannel) {
              return false;
            }

            if(peerType.pFlags.creator && !(peer as MTChat.chat).pFlags.creator) {
              return false;
            }

            if(peerType.has_username !== undefined && !!getPeerActiveUsernames(peer)[0] !== !!peerType.has_username) {
              return false;
            }

            if((peerType as RequestPeerType.requestPeerTypeChat).forum !== undefined &&
              (peerType as RequestPeerType.requestPeerTypeChat).forum !== !!(peer as MTChat.channel).pFlags.forum) {
              return false;
            }

            if(peerType.user_admin_rights) {
              for(const action in peerType.user_admin_rights.pFlags) {
                if(!hasRights(peer as MTChat.channel, action as ChatRights)) {
                  return false;
                }
              }
            }

            if((peerType as RequestPeerType.requestPeerTypeChat).pFlags.bot_participant) {
              if(!commonChatIds.includes(peer.id) && !hasRights(peer as MTChat.chat, 'invite_users')) {
                return false;
              }
            }

            // don't have bot's rights in particular channel
            // const botAdminRights = peerType.bot_admin_rights;
            // if(botAdminRights) {
            //   for(const action in botAdminRights.pFlags) {
            //     if(!hasRights(peer, action as ChatRights, botAdminRights)) {
            //       return false;
            //     }
            //   }
            // }

            return true;
          };
        }

        const requestedPeerIds = await PopupPickUser.createPicker2({
          peerType: _peerType,
          filterPeerTypeBy,
          multiSelect: true,
          limit: button.max_quantity,
          limitCallback: () => {
            toastNew({
              langPackKey: 'RequestPeer.MultipleLimit',
              langPackArguments: [
                i18n(
                  isRequestingUser ? 'RequestPeer.MultipleLimit.Users' : (isRequestingChannel ? 'RequestPeer.MultipleLimit.Channels' : 'RequestPeer.MultipleLimit.Groups'),
                  [button.max_quantity]
                )
              ]
            });
          },
          titleLangKey: isRequestingUser ? 'RequestPeer.Title.Users' : (isRequestingChannel ? 'RequestPeer.Title.Channels' : 'RequestPeer.Title.Groups')
        });

        if(!isRequestingUser) {
          type P = Parameters<typeof confirmationPopup>[0];
          const requestedPeerTitles = await Promise.all(requestedPeerIds.map((peerId) => wrapPeerTitle({peerId})));
          const joinedTitles = join(requestedPeerTitles, false);
          let joinedTitlesElement: HTMLElement;
          if(joinedTitles.length === 1) {
            joinedTitlesElement = joinedTitles[0] as HTMLElement;
          } else {
            joinedTitlesElement = document.createElement('span');
            joinedTitlesElement.append(...joinedTitles);
          }
          const descriptionLangArgs: P['descriptionLangArgs'] = [
            joinedTitlesElement,
            await wrapPeerTitle({peerId})
          ];

          const descriptionLangKey: P['descriptionLangKey'] = 'Chat.Service.PeerRequest.Confirm.Plain';

          // if(peerType.bot_admin_rights) {
          //   descriptionLangKey = 'Chat.Service.PeerRequest.Confirm.Permission';
          //   descriptionLangArgs.push(
          //     await wrapPeerTitle({peerId}),
          //     await wrapPeerTitle({peerId: requestedPeerId})
          //   );
          // }

          await confirmationPopup({
            descriptionLangKey,
            descriptionLangArgs,
            button: {
              langKey: 'Chat.Service.PeerRequest.Confirm.Ok'
            }
          });
        }

        rootScope.managers.appMessagesManager.sendBotRequestedPeer(
          peerId,
          messageMid,
          button.button_id,
          requestedPeerIds
        ).catch((err: ApiError) => {
          if(err.type === 'CHAT_ADMIN_INVITE_REQUIRED') {
            toastNew({
              langPackKey: isRequestingChannel ? 'Error.RequestPeer.NoRights.Channel' : 'Error.RequestPeer.NoRights.Group'
            });
          }
        });
      };

      break;
    }

    case 'keyboardButtonCopy': {
      buttonEl = document.createElement('button');
      buttonIcon = Icon('copy');

      onClick = () => {
        copyTextToClipboard(button.copy_text);
        toastNew({langPackKey: 'TextCopied'});
      };
      break;
    }

    default: {
      buttonEl = document.createElement('button');

      if(!message) {
        onClick = () => {
          rootScope.managers.appMessagesManager.sendText({peerId, text: button.text});
        };
      }

      break;
    }
  }

  if(buttonIcon) {
    buttonIcon.classList.add('reply-markup-button-icon');
  }

  if(!noTextInject) {
    buttonEl?.append(text);
  }

  return {text, buttonEl, buttonIcon, onClick};
}
