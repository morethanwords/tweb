/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import indexOfAndSplice from "../../helpers/array/indexOfAndSplice";
import { formatTime } from "../../helpers/date";
import htmlToSpan from "../../helpers/dom/htmlToSpan";
import setInnerHTML from "../../helpers/dom/setInnerHTML";
import formatCallDuration from "../../helpers/formatCallDuration";
import paymentsWrapCurrencyAmount from "../../helpers/paymentsWrapCurrencyAmount";
import { Message, MessageAction } from "../../layer";
import { MyMessage } from "../../lib/appManagers/appMessagesManager";
import getPeerId from "../../lib/appManagers/utils/peers/getPeerId";
import I18n, { FormatterArgument, FormatterArguments, i18n, join, langPack, LangPackKey, _i18n } from "../../lib/langPack";
import wrapEmojiText from "../../lib/richTextProcessor/wrapEmojiText";
import wrapPlainText from "../../lib/richTextProcessor/wrapPlainText";
import wrapRichText from "../../lib/richTextProcessor/wrapRichText";
import rootScope from "../../lib/rootScope";
import PeerTitle from "../peerTitle";
import getPeerTitle from "./getPeerTitle";
import wrapJoinVoiceChatAnchor from "./joinVoiceChatAnchor";
import wrapMessageForReply from "./messageForReply";

async function wrapLinkToMessage(message: Message.message | Message.messageService, plain?: boolean) {
  const a = document.createElement('i');
  a.dataset.savedFrom = message.peerId + '_' + message.mid;
  a.dir = 'auto';
  a.append(await wrapMessageForReply(message, undefined, undefined, plain as any));
  return a;
}

export default async function wrapMessageActionTextNewUnsafe(message: MyMessage, plain?: boolean) {
  const element: HTMLElement = plain ? undefined : document.createElement('span');
  const action = 'action' in message && message.action;

  // this.log('message action:', action);

  if((action as MessageAction.messageActionCustomAction).message) {
    const unsafeMessage = (action as MessageAction.messageActionCustomAction).message;
    if(plain) {
      return wrapPlainText(unsafeMessage);
    } else {
      setInnerHTML(element, wrapRichText(unsafeMessage, {noLinebreaks: true}));
      return element;
    }
  } else {
    let _ = action._;
    //let suffix = '';
    let langPackKey: LangPackKey;
    let args: Array<FormatterArgument | Promise<FormatterArgument>>;

    const managers = rootScope.managers;

    const getNameDivHTML = async(peerId: PeerId, plain: boolean) => {
      return plain ? getPeerTitle(peerId, plain) : (new PeerTitle({peerId})).element;
    };

    switch(action._) {
      case 'messageActionPhoneCall': {
        _ += '.' + (action as any).type;

        args = [formatCallDuration(action.duration, plain)];
        break;
      }

      case 'messageActionGroupCall': {
        _ += '.' + (action as any).type;

        args = [];
        if(!_.endsWith('You') && !message.pFlags.post) {
          args.push(getNameDivHTML(message.fromId, plain));
        }

        if(action.duration !== undefined) {
          args.push(formatCallDuration(action.duration, plain));
        } else {
          args.push(wrapJoinVoiceChatAnchor(message as any));
        }

        break;
      }

      case 'messageActionInviteToGroupCall': {
        const peerIds = [message.fromId, action.users[0].toPeerId()];
        let a = 'Chat.Service.VoiceChatInvitation';
        const myId = rootScope.myId;
        if(peerIds[0] === myId) a += 'ByYou';
        else if(peerIds[1] === myId) a += 'ForYou';
        indexOfAndSplice(peerIds, myId);

        langPackKey = a as LangPackKey;
        args = peerIds.map((peerId) => getNameDivHTML(peerId, plain));
        args.push(wrapJoinVoiceChatAnchor(message as any));
        break;
      }

      case 'messageActionGroupCallScheduled': {
        const today = new Date();
        const date = new Date(action.schedule_date * 1000);
        const daysToStart = (date.getTime() - today.getTime()) / 86400e3;
        const tomorrowDate = new Date(today);
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);

        const isBroadcast = await managers.appPeersManager.isBroadcast(message.peerId);
        langPackKey = isBroadcast ? 'ChatList.Service.VoiceChatScheduled.Channel' : 'ChatList.Service.VoiceChatScheduled';
        args = [];
        const myId = rootScope.myId;
        if(message.fromId === myId) {
          langPackKey += 'You';
        } else if(!isBroadcast) {
          args.push(getNameDivHTML(message.fromId, plain));
        }

        let k: LangPackKey, _args: FormatterArguments = [];
        if(daysToStart < 1 && date.getDate() === today.getDate()) {
          k = 'TodayAtFormattedWithToday';
        } else if(daysToStart < 2 && date.getDate() === tomorrowDate.getDate()) {
          k = 'Time.TomorrowAt';
        } else {
          k = 'formatDateAtTime';
          _args.push(new I18n.IntlDateElement({
            date, 
            options: {
              day: '2-digit',
              month: '2-digit',
              year: '2-digit'
            }
          }).element);
        }

        _args.push(formatTime(date));
        const t = i18n(k, _args);
        args.push(t);

        break;
      }

      case 'messageActionChatCreate': {
        const myId = rootScope.myId;
        if(message.fromId === myId) {
          _ += 'You';
        } else {
          args = [getNameDivHTML(message.fromId, plain)];
        }
        
        break;
      }

      case 'messageActionPinMessage': {
        const peerId = message.peerId;
        const pinnedMessage = await managers.appMessagesManager.getMessageByPeer(peerId, message.reply_to_mid);

        args = [
          getNameDivHTML(message.fromId, plain),
        ];
        
        if(!pinnedMessage/*  || true */) {
          langPackKey = 'ActionPinnedNoText';

          if(message.reply_to_mid) { // refresh original message
            managers.appMessagesManager.fetchMessageReplyTo(message);
          }
        } else {
          args.push(wrapLinkToMessage(pinnedMessage, plain));
        }

        break;
      }

      case 'messageActionChatJoinedByRequest': {
        const isBroadcast = await managers.appPeersManager.isBroadcast(message.peerId);
        if(message.pFlags.out) {
          langPackKey = isBroadcast ? 'RequestToJoinChannelApproved' : 'RequestToJoinGroupApproved';
        } else {
          langPackKey = isBroadcast ? 'ChatService.UserJoinedChannelByRequest' : 'ChatService.UserJoinedGroupByRequest';
          args = [getNameDivHTML(message.fromId, plain)];
        }
        break;
      }

      case 'messageActionContactSignUp':
      case 'messageActionChatReturn':
      case 'messageActionChatLeave':
      case 'messageActionChatJoined':
      case 'messageActionChatEditPhoto':
      case 'messageActionChatDeletePhoto':
      case 'messageActionChatEditVideo':
      case 'messageActionChatJoinedByLink':
      case 'messageActionChannelEditVideo':
      case 'messageActionChannelDeletePhoto': {
        args = [getNameDivHTML(message.fromId, plain)];
        break;
      }

      case 'messageActionChannelEditTitle':
      case 'messageActionChatEditTitle': {
        args = [];
        if(action._ === 'messageActionChatEditTitle') {
          args.push(getNameDivHTML(message.fromId, plain));
        }

        args.push(plain ? action.title : htmlToSpan(wrapEmojiText(action.title)));
        break;
      }

      case 'messageActionChatDeleteUser':
      case 'messageActionChatAddUsers':
      case 'messageActionChatAddUser': {
        const users = (action as MessageAction.messageActionChatAddUser).users 
          || [(action as MessageAction.messageActionChatDeleteUser).user_id];

        args = [getNameDivHTML(message.fromId, plain)];

        if(users.length > 1) {
          const joined = join(
            await Promise.all(users.map((userId: UserId) => getNameDivHTML(userId.toPeerId(), plain))),
            false,
            plain
          );
          
          if(plain) {
            args.push(...joined);
          } else {
            const fragment = document.createElement('span');
            fragment.append(...joined);
            args.push(fragment);
          }
        } else {
          args.push(getNameDivHTML(users[0].toPeerId(), plain));
        }

        break;
      }

      case 'messageActionBotAllowed': {
        const anchorHTML = wrapRichText(action.domain, {
          entities: [{
            _: 'messageEntityUrl',
            length: action.domain.length,
            offset: 0
          }]
        });

        const node = htmlToSpan(anchorHTML);

        args = [node];
        break;
      }

      case 'messageActionPaymentSent': {
        langPackKey = 'PaymentSuccessfullyPaidNoItem';
        const price = paymentsWrapCurrencyAmount(action.total_amount, action.currency);
        args = [price, getNameDivHTML(message.peerId, plain)];

        if(message.reply_to_mid) {
          const invoiceMessage = await managers.appMessagesManager.getMessageByPeer(
            message.reply_to?.reply_to_peer_id ? getPeerId(message.reply_to.reply_to_peer_id) : message.peerId, 
            message.reply_to_mid
          );
          
          if(!invoiceMessage) {
            managers.appMessagesManager.fetchMessageReplyTo(message);
          } else {
            langPackKey = 'PaymentSuccessfullyPaid';
            args.push(wrapLinkToMessage(invoiceMessage, plain).then((el) => {
              el.classList.add('is-receipt-link');
              return el;
            }));
          }
        }

        break;
      }

      default:
        langPackKey = (langPack[_] || `[${action._}]`) as any;
        break;
    }

    if(!langPackKey) {
      langPackKey = langPack[_];
      if(langPackKey === undefined) {
        langPackKey = '[' + _ + ']' as any;
      }
    }

    const waited = args && await Promise.all(args);

    if(plain) {
      return I18n.format(langPackKey, true, waited);
    } else {
      return _i18n(element, langPackKey, waited);
    }

    //str = !langPackKey || langPackKey[0].toUpperCase() === langPackKey[0] ? langPackKey : getNameDivHTML(message.fromId) + langPackKey + (suffix ? ' ' : '');
  }
}
