/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import {formatTime, ONE_DAY} from '../../helpers/date';
import htmlToSpan from '../../helpers/dom/htmlToSpan';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {wrapCallDuration} from './wrapDuration';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {ForumTopic, Message, MessageAction} from '../../layer';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import I18n, {FormatterArgument, FormatterArguments, i18n, join, langPack, LangPackKey, _i18n} from '../../lib/langPack';
import {GENERAL_TOPIC_ID} from '../../lib/mtproto/mtproto_config';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import wrapPlainText from '../../lib/richTextProcessor/wrapPlainText';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import rootScope from '../../lib/rootScope';
import topicAvatar from '../topicAvatar';
import {wrapCustomEmojiAwaited} from './customEmoji';
import getPeerTitle from './getPeerTitle';
import wrapJoinVoiceChatAnchor from './joinVoiceChatAnchor';
import {WrapMessageActionTextOptions} from './messageActionTextNew';
import wrapMessageForReply, {WrapMessageForReplyOptions} from './messageForReply';
import wrapPeerTitle from './peerTitle';

async function wrapLinkToMessage(options: WrapMessageForReplyOptions) {
  const wrapped = await wrapMessageForReply(options);

  if(options.plain) {
    return wrapped;
  }

  const a = document.createElement('i');
  a.dataset.savedFrom = (options.message as Message.message).peerId + '_' + (options.message as Message.message).mid;
  a.dir = 'auto';
  a.append(wrapped);
  return a;
}

function wrapSomeText(text: string, plain?: boolean) {
  return plain ? text : htmlToSpan(wrapEmojiText(text));
}

type WrapTopicIconOptions = {
  topic: Pick<ForumTopic.forumTopic, 'icon_color' | 'icon_emoji_id' | 'title' | 'id'>,
  plain?: boolean
} & WrapSomethingOptions;
export async function wrapTopicIcon<T extends WrapTopicIconOptions>(options: T): Promise<T['plain'] extends true ? string : HTMLElement | DocumentFragment> {
  const topic = options.topic;

  let iconEmojiId = topic?.icon_emoji_id;
  if(topic?.id === GENERAL_TOPIC_ID) {
    iconEmojiId = '5390854796011906616';
  }

  if(!iconEmojiId) {
    if(options.plain) return '' as any;

    // if(topic?.id === GENERAL_TOPIC_ID) {
    //   const span = document.createElement('span');
    //   span.innerHTML = `
    //   <svg class="topic-icon-general" width="22" height="22" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg">
    //     <path fill-rule="evenodd" clip-rule="evenodd" d="M11.2788 4.3654C11.4806 3.65912 11.0717 2.92299 10.3654 2.72119C9.65911 2.5194 8.92297 2.92836 8.72118 3.63464L7.85393 6.67H6C5.26546 6.67 4.67 7.26546 4.67 8C4.67 8.73454 5.26546 9.33 6 9.33H7.09393L6.13965 12.67H4C3.26546 12.67 2.67 13.2655 2.67 14C2.67 14.7345 3.26546 15.33 4 15.33H5.37965L4.72118 17.6346C4.51938 18.3409 4.92835 19.0771 5.63463 19.2788C6.3409 19.4806 7.07704 19.0717 7.27883 18.3654L8.14609 15.33H11.3796L10.7212 17.6346C10.5194 18.3409 10.9283 19.0771 11.6346 19.2788C12.3409 19.4806 13.077 19.0717 13.2788 18.3654L14.1461 15.33H16C16.7345 15.33 17.33 14.7345 17.33 14C17.33 13.2655 16.7345 12.67 16 12.67H14.9061L15.8604 9.33H18C18.7345 9.33 19.33 8.73454 19.33 8C19.33 7.26546 18.7345 6.67 18 6.67H16.6204L17.2788 4.3654C17.4806 3.65912 17.0717 2.92299 16.3654 2.72119C15.6591 2.5194 14.923 2.92836 14.7212 3.63464L13.8539 6.67H10.6204L11.2788 4.3654ZM9.86037 9.33L8.90609 12.67H12.1396L13.0939 9.33H9.86037Z"/>
    //   </svg>
    //   `;

    //   span.classList.add('topic-icon');

    //   return span as any;
    // }

    return topicAvatar(topic?.icon_color, topic?.title) as any;
  }

  return options.plain ?
    rootScope.managers.appEmojiManager.getCustomEmojiDocument(iconEmojiId).then((doc) => doc.stickerEmojiRaw) :
    wrapCustomEmojiAwaited({
      ...options,
      docIds: [iconEmojiId]
    }).then((fragment) => {
      fragment.lastElementChild.classList.add('topic-icon');
      return fragment;
    }) as any;
}

function wrapMessageActionTopicIcon(options: WrapMessageActionTextOptions) {
  const action = ((options.message as Message.messageService).action as MessageAction.messageActionTopicCreate);
  return wrapTopicIcon({
    ...options,
    topic: action as any as ForumTopic.forumTopic
  });
}

async function wrapMessageActionTopicIconAndName(options: WrapMessageActionTextOptions) {
  const action = ((options.message as Message.messageService).action as MessageAction.messageActionTopicCreate);
  const span = document.createElement('span');
  span.classList.add('topic-name');
  span.append(await wrapMessageActionTopicIcon(options), wrapSomeText(action.title, options.plain));
  return span;
}

export default async function wrapMessageActionTextNewUnsafe(options: WrapMessageActionTextOptions) {
  const {plain, message, noLinks} = options;
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
    // let suffix = '';
    let langPackKey: LangPackKey;
    let args: Array<FormatterArgument | Promise<FormatterArgument>>;

    const managers = rootScope.managers;

    const getNameDivHTML = (peerId: PeerId, plain: boolean) => {
      return plain ? getPeerTitle({peerId, plainText: plain}) : wrapPeerTitle({peerId});
    };

    switch(action._) {
      case 'messageActionPhoneCall': {
        _ += '.' + (action as any).type;

        args = [wrapCallDuration(action.duration, plain)];
        break;
      }

      case 'messageActionGroupCall': {
        _ += '.' + (action as any).type;

        args = [];
        if(!_.endsWith('You') && !message.pFlags.post) {
          args.push(getNameDivHTML(message.fromId, plain));
        }

        if(action.duration !== undefined) {
          args.push(wrapCallDuration(action.duration, plain));
        } else if(noLinks) {
          args.push('');
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
        args.push(noLinks ? '' : wrapJoinVoiceChatAnchor(message as any));
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

        let k: LangPackKey;
        const _args: FormatterArguments = [];
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
          getNameDivHTML(message.fromId, plain)
        ];

        if(!pinnedMessage/*  || true */) {
          langPackKey = 'ActionPinnedNoText';

          if(message.reply_to_mid) { // refresh original message
            managers.appMessagesManager.fetchMessageReplyTo(message);
          }
        } else {
          args.push(wrapLinkToMessage({
            ...options,
            message: pinnedMessage
          }));
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

        args.push(wrapSomeText(action.title, plain));
        break;
      }

      case 'messageActionChatDeleteUser':
      case 'messageActionChatAddUsers':
      case 'messageActionChatAddUser': {
        const users = (action as MessageAction.messageActionChatAddUser).users ||
          [(action as MessageAction.messageActionChatDeleteUser).user_id];

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
        if(action.pFlags?.attach_menu) {
          langPackKey = 'ActionAttachMenuBotAllowed';
          break;
        } else if(!action.domain) {
          break;
        }

        const anchorHTML = wrapRichText(action.domain, {
          entities: [{
            _: 'messageEntityUrl',
            length: action.domain.length,
            offset: 0
          }],
          noLinks
        });

        const node = htmlToSpan(anchorHTML);

        args = [node];
        break;
      }

      case 'messageActionPaymentSent': {
        const isRecurringInit = action.pFlags.recurring_init;
        const isRecurringUsed = action.pFlags.recurring_used;
        langPackKey = isRecurringUsed ? 'Chat.Service.PaymentSentRecurringUsedNoTitle' : (isRecurringInit ? 'Chat.Service.PaymentSentRecurringInitNoTitle' : 'Chat.Service.PaymentSent1NoTitle');
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
            langPackKey = isRecurringUsed ? 'Chat.Service.PaymentSentRecurringUsed' : (isRecurringInit ? 'Chat.Service.PaymentSentRecurringInit' : 'Chat.Service.PaymentSent1');
            args.push(wrapLinkToMessage({
              ...options,
              message: invoiceMessage
            }).then((el) => {
              if(el instanceof HTMLElement) {
                el.classList.add('is-receipt-link');
              }

              return el;
            }));
          }
        }

        break;
      }

      case 'messageActionSetMessagesTTL': {
        args = [];

        const isBroadcast = await managers.appPeersManager.isBroadcast(message.peerId);
        if(action.period) {
          if(isBroadcast) {
            langPackKey = 'ActionTTLChannelChanged';
          } else if(message.fromId === rootScope.myId) {
            langPackKey = 'ActionTTLYouChanged';
          } else {
            langPackKey = 'ActionTTLChanged';
            args.push(getNameDivHTML(message.fromId, plain));
          }

          let duration: ReturnType<typeof wrapCallDuration>;
          if(action.period > 1814400) {
            let key: LangPackKey;
            const args: FormatterArguments = [];
            const year = 31536000;
            if(action.period >= year) {
              key = 'Years';
              args.push(action.period / year | 0);
            } else {
              key = 'Months';
              args.push(action.period / (ONE_DAY * 30) | 0);
            }

            duration = plain ? I18n.format(key, true, args) : i18n(key, args);
          } else {
            duration = wrapCallDuration(action.period, plain);
          }

          args.push(duration);
        } else {
          if(isBroadcast) {
            langPackKey = 'ActionTTLChannelDisabled';
          } else if(message.fromId === rootScope.myId) {
            langPackKey = 'ActionTTLYouDisabled';
          } else {
            langPackKey = 'ActionTTLDisabled';
            args.push(getNameDivHTML(message.fromId, plain));
          }
        }
        break;
      }

      case 'messageActionTopicEdit': {
        let iconElement: (typeof args)[0];
        let titleElement: typeof iconElement;
        let authorElement: ReturnType<typeof getNameDivHTML>;
        const isMe = !!message.pFlags.out;
        const isIconChanged = action.icon_emoji_id !== undefined;
        const isIconRemoved = isIconChanged && !+action.icon_emoji_id;
        const isTitleChanged = action.title !== undefined;
        const isHiddenChanged = action.hidden !== undefined;

        if(!isMe) {
          authorElement = getNameDivHTML(message.fromId, plain);
        }

        if(isTitleChanged) {
          titleElement = wrapSomeText(action.title, plain);
        }

        if(isIconChanged && !isIconRemoved) {
          iconElement = wrapMessageActionTopicIcon(options);
        }

        args = authorElement ? [authorElement] : [];

        if(action.closed) {
          langPackKey = isMe ? 'Chat.Service.Group.TopicEdited.You.Paused' : 'Chat.Service.Group.TopicEdited.Paused';
        } else if(action.closed === false) {
          langPackKey = isMe ? 'Chat.Service.Group.TopicEdited.You.Resumed' : 'Chat.Service.Group.TopicEdited.Resumed';
        } else if(isIconRemoved && isTitleChanged) {
          langPackKey = isMe ? 'Chat.Service.TopicEdited.You.Mixed.IconRemoved' : 'Chat.Service.TopicEdited.Mixed.IconRemoved';
          args.push(titleElement);
        } else if(isIconChanged && isTitleChanged) {
          langPackKey = isMe ? 'Chat.Service.TopicEdited.You.Mixed' : 'Chat.Service.TopicEdited.Mixed';
          args.push(wrapMessageActionTopicIconAndName(options));
        } else if(isIconRemoved) {
          langPackKey = isMe ? 'Chat.Service.Group.TopicEdited.You.Icon.Removed' : 'Chat.Service.Group.TopicEdited.Icon.Removed';
        } else if(isTitleChanged) {
          langPackKey = isMe ? 'Chat.Service.Group.TopicEdited.You.Title' : 'Chat.Service.Group.TopicEdited.Title';
          args.push(titleElement);
        } else if(isIconChanged) {
          langPackKey = isMe ? 'Chat.Service.Group.TopicEdited.You.Icon' : 'Chat.Service.Group.TopicEdited.Icon';
          args.push(iconElement);
        } else if(isHiddenChanged) {
          langPackKey = isMe ?
            (action.hidden ? 'Chat.Service.Group.TopicEdited.You.Hided' : 'Chat.Service.Group.TopicEdited.You.Unhided') :
            (action.hidden ? 'Chat.Service.Group.TopicEdited.Hided' : 'Chat.Service.Group.TopicEdited.Unhided');
        }

        break;
      }

      case 'messageActionTopicCreate': {
        args = [wrapMessageActionTopicIconAndName(options)];
        langPackKey = 'TopicWasCreatedAction';
        break;
      }

      case 'messageActionSetChatTheme': {
        const isMe = !!message.pFlags.out;
        let authorElement: ReturnType<typeof getNameDivHTML>;
        if(!isMe) {
          authorElement = getNameDivHTML(message.fromId, plain);
        }

        args = authorElement ? [authorElement] : [];

        if(action.emoticon) {
          args.push(wrapSomeText(action.emoticon, plain));
          langPackKey = isMe ? 'ChatThemeChangedYou' : 'ChatThemeChangedTo';
        } else {
          langPackKey = isMe ? 'ChatThemeDisabledYou' : 'ChatThemeDisabled';
        }
        break;
      }

      case 'messageActionGiftPremium': {
        const isMe = !!message.pFlags.out;
        let authorElement: ReturnType<typeof getNameDivHTML>;
        if(!isMe) {
          authorElement = getNameDivHTML(message.fromId, plain);
        }

        args = authorElement ? [authorElement] : [];

        args.push(paymentsWrapCurrencyAmount(action.amount, action.currency, false, true));

        langPackKey = isMe ? 'ActionGiftOutbound' : 'ActionGiftInbound';

        break;
      }

      case 'messageActionWebViewDataSent': {
        langPackKey = 'ActionBotWebViewData';
        args = [wrapSomeText(action.text, plain)];
        break;
      }

      case 'messageActionRequestedPeer': {
        langPackKey = 'Chat.Service.PeerRequested';
        args = [getNameDivHTML(getPeerId(action.peer), plain), getNameDivHTML(message.peerId, plain)];
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
      // if(waited && noLinks) {
      //   waited = waited.map((arg) => arg instanceof HTMLAnchorElement ? arg.textContent : arg);
      // }

      return _i18n(element, langPackKey, waited);
    }

    // str = !langPackKey || langPackKey[0].toUpperCase() === langPackKey[0] ? langPackKey : getNameDivHTML(message.fromId) + langPackKey + (suffix ? ' ' : '');
  }
}
