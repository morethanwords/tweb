/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import {formatTime, ONE_DAY} from '../../helpers/date';
import htmlToSpan from '../../helpers/dom/htmlToSpan';
import setInnerHTML, {setDirection} from '../../helpers/dom/setInnerHTML';
import {wrapCallDuration} from './wrapDuration';
import paymentsWrapCurrencyAmount from '../../helpers/paymentsWrapCurrencyAmount';
import {ForumTopic, Message, MessageAction, MessageEntity, MessageMedia, MessageReplyHeader, StarGift, TextWithEntities} from '../../layer';
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
import shouldDisplayGiftCodeAsGift from '../../helpers/shouldDisplayGiftCodeAsGift';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import Icon from '../icon';
import formatStarsAmount from '../../lib/appManagers/utils/payments/formatStarsAmount';
import {getPriceChangedActionMessageLangParams} from '../../lib/lang';
import {numberThousandSplitterForStars} from '../../helpers/number/numberThousandSplitter';

async function wrapLinkToMessage(options: WrapMessageForReplyOptions) {
  const wrapped = await wrapMessageForReply(options);

  if(options.plain) {
    return wrapped;
  }

  const a = document.createElement('i');
  a.dataset.savedFrom = (options.message as Message.message).peerId + '_' + (options.message as Message.message).mid;
  a.append(wrapped);
  setDirection(a);
  return a;
}

function wrapSomeText(text: string, plain: boolean, entities?: MessageEntity[]) {
  return plain ? text : htmlToSpan(wrapEmojiText(text, false, entities));
}

function joinTexts(texts: (string | HTMLElement)[], params: {
  delimiter: string,
  wrap?: (text: string | HTMLElement) => string | HTMLElement,
  prepend?: string,
  append?: string
}) {
  const {delimiter, prepend, append} = params
  const fragment = document.createDocumentFragment()
  let first = true
  for(const it of texts) {
    if(first) {
      first = false
    } else {
      fragment.append(delimiter)
    }

    if(prepend) {
      fragment.append(prepend)
    }
    if(params.wrap) {
      fragment.append(params.wrap(it));
    } else {
      fragment.append(it);
    }
    if(append) {
      fragment.append(append)
    }
  }
  return fragment
}

const TODO_JOIN_OPTIONS: Parameters<typeof joinTexts>[1] = {
  delimiter: ', ',
  prepend: '"',
  append: '"',
  wrap: el => {
    const b = document.createElement('b');
    b.append(el);
    return b;
  }
}

type WrapTopicIconOptions = {
  topic: Pick<ForumTopic.forumTopic, 'icon_color' | 'icon_emoji_id' | 'title' | 'id'>,
  plain?: boolean
} & WrapSomethingOptions;

export async function wrapTopicIcon(options: WrapTopicIconOptions & {plain: true}): Promise<string>;
export async function wrapTopicIcon(options: WrapTopicIconOptions & {plain?: false}): Promise<HTMLElement | DocumentFragment>;
export async function wrapTopicIcon(options: WrapTopicIconOptions): Promise<string | HTMLElement | DocumentFragment>;

export async function wrapTopicIcon(options: WrapTopicIconOptions): Promise<string | HTMLElement | DocumentFragment> {
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
    });
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

export function wrapMessageGiveawayResults(action: MessageAction.messageActionGiveawayResults | MessageMedia.messageMediaGiveawayResults, plain?: boolean) {
  let langPackKey: LangPackKey = 'Giveaway.Results';
  let args: FormatterArguments = [action.winners_count];

  const setCombined = (addLangPackKey: LangPackKey, addArgs?: FormatterArguments) => {
    args = [
      plain ?
        I18n.format(langPackKey, true, args as FormatterArguments) :
        i18n(langPackKey, args as FormatterArguments)
    ];

    langPackKey = 'Giveaway.Results.Combined';
    args.push(
      plain ?
        I18n.format(addLangPackKey, true, addArgs) :
        i18n(addLangPackKey, addArgs)
    );
  };

  if(!action.winners_count) {
    langPackKey = (action as MessageAction.messageActionGiveawayResults).pFlags.stars ? 'Giveaway.Results.NoWinners.Stars' : 'Giveaway.Results.NoWinners';
    args = [action.unclaimed_count];
  } else if(action.unclaimed_count) {
    setCombined('Giveaway.Results.Unclaimed', [action.unclaimed_count]);
  }

  return {langPackKey, args};
}

export default async function wrapMessageActionTextNewUnsafe(options: WrapMessageActionTextOptions) {
  const {plain, message, noLinks} = options;
  const element: HTMLElement = plain ? undefined : document.createElement('span');
  const action = 'action' in message && message.action;

  // this.log('message action:', action);

  if(action._ === 'messageActionCustomAction' && action.message) {
    const unsafeMessage = action.message;
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
    let icon: HTMLElement | undefined;
    let args: Array<FormatterArgument | Promise<FormatterArgument>>;

    const managers = rootScope.managers;

    const getNameDivHTML = (peerId: PeerId, plain: boolean) => {
      return plain ? getPeerTitle({peerId, plainText: plain}) : wrapPeerTitle({peerId});
    };

    const getSeveralNameDivHTML = async(peerIds: PeerId[], plain: boolean) => {
      if(peerIds.length === 1) {
        return getNameDivHTML(peerIds[0], plain);
      }

      const joined = join(
        await Promise.all(peerIds.map((peerId) => getNameDivHTML(peerId, plain))),
        false,
        plain
      );

      if(plain) {
        return Array.isArray(joined) ? joined.join('') : joined;
      } else {
        const fragment = document.createElement('span');
        fragment.append(...joined);
        args.push(fragment);
        return fragment;
      }
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

      case 'messageActionGiveawayLaunch': {
        langPackKey = action.stars ? 'BoostingStarsGiveawayJustStarted' : 'BoostingGiveawayJustStarted';
        args = [getNameDivHTML(message.fromId, plain)];

        if(action.stars) {
          args.unshift(+action.stars);
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

        const peerIds = users.map((userId) => userId.toPeerId(false));
        args.push(getSeveralNameDivHTML(peerIds, plain));
        break;
      }

      case 'messageActionBotAllowed': {
        if(action.pFlags?.attach_menu) {
          langPackKey = 'ActionAttachMenuBotAllowed';
          break;
        } else if(action.pFlags?.from_request) {
          langPackKey = 'ActionBotAllowedRequest';
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
        const price = paymentsWrapCurrencyAmount(action.total_amount, action.currency, undefined, undefined, plain);
        args = [price, getNameDivHTML(message.peerId, plain)];

        if(message.reply_to_mid) {
          const replyTo = message.reply_to as MessageReplyHeader.messageReplyHeader;
          const invoiceMessage = await managers.appMessagesManager.getMessageByPeer(
            replyTo?.reply_to_peer_id ? getPeerId(replyTo.reply_to_peer_id) : message.peerId,
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

      case 'messageActionPaymentRefunded': {
        const price = paymentsWrapCurrencyAmount(action.total_amount, action.currency, undefined, undefined, plain);
        args = [getNameDivHTML(message.fromId, plain), price];
        langPackKey = 'Chat.Service.Refund';
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

      case 'messageActionPrizeStars': {
        langPackKey = 'BoostingReceivedGiftNoName';
        break;
      }

      case 'messageActionGiftStars':
      case 'messageActionGiftCode':
      case 'messageActionGiftPremium': {
        const isGiftCode = action._ === 'messageActionGiftCode';
        if(isGiftCode && !shouldDisplayGiftCodeAsGift(action)) {
          langPackKey = 'BoostingReceivedGiftNoName';
          if(action.boost_peer) {
            langPackKey = 'BoostingReceivedGiftFrom';
            args = [getNameDivHTML(getPeerId(action.boost_peer), plain)];
          }

          break;
        }

        const isMe = !!message.pFlags.out && !isGiftCode;
        let authorElement: ReturnType<typeof getNameDivHTML>;
        if(!isMe) {
          authorElement = getNameDivHTML(message.fromId, plain);
        }

        args = authorElement ? [authorElement] : [];

        args.push(paymentsWrapCurrencyAmount(action.amount, action.currency, false, true, plain));

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
        args = [
          getSeveralNameDivHTML(action.peers.map((peer) => getPeerId(peer)), plain),
          getNameDivHTML(message.peerId, plain)
        ];
        break;
      }

      case 'messageActionGiveawayResults': {
        const r = wrapMessageGiveawayResults(action, plain);
        langPackKey = r.langPackKey;
        args = r.args;
        break;
      }

      case 'messageActionSetChatWallPaper': {
        const isUser = message.peerId.isUser();
        args = [
          getNameDivHTML(isUser ? message.peerId : message.fromId, plain)
        ];

        if(isUser) {
          if(message.pFlags.out) {
            langPackKey = action.pFlags.for_both ?
              'ActionSetWallpaperForThisChatSelfBoth' : (
                action.pFlags.same ?
                  'ActionSetSameWallpaperForThisChatSelf' :
                  'ActionSetWallpaperForThisChatSelf'
              );
          } else {
            langPackKey = action.pFlags.for_both ?
              'ActionSetWallpaperForThisChatBoth' : (
                action.pFlags.same ?
                  'ActionSetSameWallpaperForThisChat' :
                  'ActionSetWallpaperForThisChat'
              );
          }

          break;
        }

        const isBroadcast = await managers.appPeersManager.isBroadcast(message.peerId);
        if(isBroadcast) {
          langPackKey = 'ActionSetWallpaperForThisChannel';
          break;
        }

        langPackKey = message.fromId === message.peerId ?
          'ActionSetWallpaperForThisGroup' :
          'ActionSetWallpaperForThisGroupByUser';

        break;
      }

      case 'messageActionPaidMessagesPrice': {
        const isBroadcast = await managers.appChatsManager.isBroadcast(message.fromId?.toChatId());
        const result = await getPriceChangedActionMessageLangParams(action, isBroadcast, () => getNameDivHTML(message.fromId, plain));
        langPackKey = result.langPackKey;
        args = result.args;
        break;
      }

      case 'messageActionPaidMessagesRefunded': {
        langPackKey = 'PaidMessages.StarsRefundedShort';
        args = [+action.stars];
        break;
      }
      case 'messageActionStarGift':
        if(message.peerId === rootScope.myId) {
          langPackKey = 'StarGiftSentMessageSelf';
          args = [(action.gift as StarGift.starGift).stars];
        } else if(message.pFlags.out) {
          langPackKey = 'StarGiftSentMessageOutgoing';
          args = [(action.gift as StarGift.starGift).stars];
        } else {
          langPackKey = 'StarGiftSentMessageIncoming';
          args = [getNameDivHTML(message.fromId, plain), (action.gift as StarGift.starGift).stars];
        }
        break;
      case 'messageActionStarGiftUnique':
        if(!message.pFlags.out && action.resale_amount) {
          langPackKey = 'StarGiftSentMessageSelf';
          args = [formatStarsAmount(action.resale_amount)];
        } else if(message.peerId === rootScope.myId) {
          langPackKey = action.pFlags.upgrade ? 'ActionGiftUpgradedSelf' : 'ActionGiftTransferredSelf';
        } else {
          if(action.pFlags.upgrade) {
            langPackKey = message.pFlags.out ? 'ActionGiftUpgradedOutbound' : 'ActionGiftUpgradedInbound'
          } else {
            langPackKey = message.pFlags.out ? 'ActionGiftTransferredOutbound' : 'ActionGiftTransferredInbound'
          }
          args = [getNameDivHTML(message.peerId, plain)];
        }
        break;

      case 'messageActionTodoAppendTasks': {
        let listMsg = await managers.appMessagesManager.getMessageByPeer(message.peerId, message.reply_to_mid);
        if(!listMsg) {
          listMsg = await managers.appMessagesManager.fetchMessageReplyTo(message) as Message.message;
        }

        icon = Icon('checklist_add');

        if(listMsg?._ === 'message' && listMsg.media._ === 'messageMediaToDo') {
          if(action.list.length === 1) {
            langPackKey = `ChecklistAddedTask${message.pFlags.out ? 'You' : ''}`;
            args = [
              message.pFlags.out ? undefined : getNameDivHTML(message.fromId, plain),
              wrapSomeText(action.list[0].title.text, plain, action.list[0].title.entities),
              wrapSomeText(listMsg.media.todo.title.text, plain, listMsg.media.todo.title.entities)
            ];
          } else {
            langPackKey = `ChecklistAddedTaskMany${message.pFlags.out ? 'You' : ''}`;
            args = [
              message.pFlags.out ? undefined : getNameDivHTML(message.fromId, plain),
              joinTexts(action.list.map((it) => wrapSomeText(it.title.text, plain, it.title.entities)), TODO_JOIN_OPTIONS),
              wrapSomeText(listMsg.media.todo.title.text, plain, listMsg.media.todo.title.entities)
            ];
          }
        }
        break;
      }
      case 'messageActionTodoCompletions': {
        let listMsg = await managers.appMessagesManager.getMessageByPeer(message.peerId, message.reply_to_mid);
        if(!listMsg) {
          listMsg = await managers.appMessagesManager.fetchMessageReplyTo(message) as Message.message;
        }

        if(listMsg?._ === 'message' && listMsg.media._ === 'messageMediaToDo') {
          const list = listMsg.media.todo;
          const itemsMap = new Map<number, TextWithEntities>();
          for(const it of list.list) {
            itemsMap.set(it.id, it.title);
          }

          const completed = action.completed.map((it) => itemsMap.get(it)).filter(Boolean);
          const incompleted = action.incompleted.map((it) => itemsMap.get(it)).filter(Boolean);

          if(completed.length === 0) {
            icon = Icon('checklist_undone');
            langPackKey = `ChecklistMarkedUndone${message.pFlags.out ? 'You' : ''}`;
            args = [
              message.pFlags.out ? undefined : getNameDivHTML(message.fromId, plain),
              joinTexts(incompleted.map((it) => wrapSomeText(it.text, plain, it.entities)), TODO_JOIN_OPTIONS)
            ];
            break;
          }

          if(incompleted.length === 0) {
            icon = Icon('checklist_done');
            langPackKey = `ChecklistMarkedDone${message.pFlags.out ? 'You' : ''}`;
            args = [
              message.pFlags.out ? undefined : getNameDivHTML(message.fromId, plain),
              joinTexts(completed.map((it) => wrapSomeText(it.text, plain, it.entities)), TODO_JOIN_OPTIONS)
            ];
            break;
          }

          icon = Icon('checklist_done');
          langPackKey = `ChecklistMarkedMixed${message.pFlags.out ? 'You' : ''}`;
          args = [
            message.pFlags.out ? undefined : getNameDivHTML(message.fromId, plain),
            joinTexts(completed.map((it) => wrapSomeText(it.text, plain, it.entities)), TODO_JOIN_OPTIONS),
            joinTexts(incompleted.map((it) => wrapSomeText(it.text, plain, it.entities)), TODO_JOIN_OPTIONS)
          ];
        }

        break;
      }
      case 'messageActionChannelCreate': {
        const chat = message?.peerId ? apiManagerProxy.getChat(message.peerId) : undefined;

        if(chat?._ === 'channel' && chat?.pFlags?.monoforum) langPackKey = 'ActionCreateDirectMessages';

        break;
      }
      case 'messageActionSuggestedPostApproval': {
        if(action.pFlags.balance_too_low) {
          langPackKey = 'SuggestedPosts.BalanceTooLow';
          args = [wrapEmojiText('❌')]
        } else if(action.pFlags.rejected) {
          langPackKey = 'SuggestedPosts.GenericRejectedPost';
          args = [wrapEmojiText('❌')]
        } else {
          langPackKey = 'SuggestedPosts.AgreementReached';
          args = [wrapEmojiText('🤝')];
        }
        break;
      }
      case 'messageActionSuggestedPostSuccess': {
        langPackKey = 'SuggestedPosts.PostSuccess';
        args = [wrapEmojiText('✅'), i18n('Stars', [numberThousandSplitterForStars(action.price.amount)])];
        break;
      }
      case 'messageActionSuggestedPostRefund': {
        langPackKey = 'SuggestedPosts.GenericRefund';
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

      const res = _i18n(element, langPackKey, waited);
      if(icon) {
        icon.classList.add('message-action-icon')
        res.prepend(icon);
      }
      return res;
    }

    // str = !langPackKey || langPackKey[0].toUpperCase() === langPackKey[0] ? langPackKey : getNameDivHTML(message.fromId) + langPackKey + (suffix ? ' ' : '');
  }
}
