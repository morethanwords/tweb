import type LazyLoadQueue from '@components/lazyLoadQueue';
import isAnchoredEphemeralMessage from '@appManagers/utils/messages/isAnchoredEphemeralMessage';
import {formatDate, formatFullSentTimeRaw, formatTime} from '@helpers/date';
import {getFullDate} from '@helpers/date/getFullDate';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import {Middleware} from '@helpers/middleware';
import formatNumber from '@helpers/number/formatNumber';
import {AvailableEffect, Message, MessageReplyHeader} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import I18n, {i18n, _i18n, LangPackKey} from '@lib/langPack';
import apiManagerProxy from '@lib/apiManagerProxy';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import Icon from '@components/icon';
import {createPeerTitleElement} from '@components/peerTitle';
import wrapReply from '@components/wrappers/reply';
import Chat from '@components/chat/chat';
import {ChatType, isHistoryMessage} from './chatType';
import RepliesElement from '@components/chat/replies';
import ChatBubbles from '@components/chat/bubbles';
import getFwdFromName from '@appManagers/utils/messages/getFwdFromName';
import deferredPromise from '@helpers/cancellablePromise';
import wrapSticker from '@components/wrappers/sticker';
import cancelEvent from '@helpers/dom/cancelEvent';
import getStickerEffectThumb from '@appManagers/utils/stickers/getStickerEffectThumb';
import wrapStickerAnimation from '@components/wrappers/stickerAnimation';
import Scrollable from '@components/scrollable';
import appDownloadManager from '@lib/appDownloadManager';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import numberThousandSplitter, {numberThousandSplitterForStars} from '@helpers/number/numberThousandSplitter';
import {makeTime} from '@components/chat/utils';
import {useAppConfig} from '@stores/appState';
import {formatNanoton} from '@helpers/paymentsWrapCurrencyAmount';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {isWidgetRenderingEnabled} from '@lib/widgetSandbox/payload';
import withTimeout from '@helpers/schedulers/withTimeout';
import noop from '@helpers/noop';
import getGroupedText from '@appManagers/utils/messages/getGroupedText';

const NBSP = '&nbsp;';

const DAY = 86400;
const SCHEDULE_REPEAT_MAP: {period: number, key: LangPackKey, args?: any[]}[] = [
  {period: DAY, key: 'Schedule.Repeated.Daily'},
  {period: 7 * DAY, key: 'Schedule.Repeated.Weekly'},
  {period: 14 * DAY, key: 'Schedule.Repeated.Biweekly'},
  {period: 30 * DAY, key: 'Schedule.Repeated.Monthly'},
  {period: 91 * DAY, key: 'Schedule.Repeated.EveryMonth', args: [3]},
  {period: 182 * DAY, key: 'Schedule.Repeated.EveryMonth', args: [6]},
  {period: 365 * DAY, key: 'Schedule.Repeated.Yearly'}
];

const makeScheduleRepeatPeriod = (period: number) => {
  const entry = SCHEDULE_REPEAT_MAP.find((e) => e.period >= period) ?? SCHEDULE_REPEAT_MAP[SCHEDULE_REPEAT_MAP.length - 1];
  const span = document.createElement('span');
  span.classList.add('time-repeat', 'time-part');
  span.append(i18n(entry.key, entry.args));
  return span;
};

const makeEdited = () => {
  const edited = document.createElement('i');
  edited.classList.add('time-edited', 'time-part');
  _i18n(edited, 'EditedMessage');
  return edited;
};

// layer 229: an ordinary message an ephemeral one is standing in for says "updated" where an
// edited one would say "edited" (tdesktop's `Data::Flag::Updated`).
const makeUpdated = () => {
  const updated = document.createElement('i');
  updated.classList.add('time-edited', 'time-part');
  _i18n(updated, 'Ephemeral.Updated');
  return updated;
};

// * when the `message_primary_edited_date` app config flag is on, the edited badge is
// * replaced by the actual edit time ("edited at HH:MM" / "edited on <date> at HH:MM")
// * shown in place of the sent time — matches tdesktop's EditedPrimary behaviour.
const isSameDay = (a: Date, b: Date) => {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
};

const makeEditedTime = (sentDate: Date, editDate: Date) => {
  const timeEl = formatTime(editDate);
  const now = new Date();
  if(isSameDay(sentDate, now) && isSameDay(editDate, now)) {
    return i18n('EditedMessage.At', [timeEl]);
  }

  const dateEl = formatDate(editDate, {shortMonth: true});
  return i18n('EditedMessage.On', [dateEl, timeEl]);
};

const makeEffect = (props: {
  onlyElement?: boolean,
  docId?: DocId,
  middleware?: Middleware,
  loadPromises?: Promise<any>[]
}) => {
  const managers = bindManagersToSession(rootScope.managers);
  const span = document.createElement('span');
  span.classList.add('time-effect');
  if(props.onlyElement) {
    return span;
  }

  const deferred = deferredPromise<void>();

  span.dataset.effectId = '' + props.docId;

  managers.acknowledged.appReactionsManager.getAvailableEffect(props.docId)
  .then(async(result) => {
    if(!result.cached) {
      deferred.resolve();
    }

    const availableEffect = await result.result;
    if(!availableEffect) {
      deferred.resolve();
      return;
    }

    const loadPromises: Promise<any>[] = [];
    wrapSticker({
      doc: await managers.appDocsManager.getDoc(availableEffect.static_icon_id),
      div: span,
      middleware: props.middleware,
      loadPromises,
      width: 12,
      height: 12
    });

    Promise.all(loadPromises).then(async() => {
      if(result.cached) {
        deferred.resolve();
      }

      // * preload effect
      const {doc, thumb} = await getDocForEffect(availableEffect);
      appDownloadManager.downloadMedia({
        media: doc,
        thumb
      });
    });
  });

  props.loadPromises?.push(deferred);

  return span;
};

const getDocForEffect = async(availableEffect: AvailableEffect) => {
  const isPremiumEffect = !availableEffect.effect_animation_id;
  const doc = await rootScope.managers.appDocsManager.getDoc(isPremiumEffect ? availableEffect.effect_sticker_id : availableEffect.effect_animation_id);
  return {isPremiumEffect, doc, thumb: getStickerEffectThumb(doc)};
};

export const fireMessageEffect = ({e, isOut, element, middleware, scrollable, effectId}: {
  e?: Event,
  isOut?: boolean,
  element: HTMLElement,
  middleware: Middleware,
  scrollable?: Scrollable,
  effectId: DocId
}) => {
  if(element.dataset.playing) {
    e && cancelEvent(e);
    return;
  }

  element.dataset.playing = '1';

  rootScope.managers.appReactionsManager.getAvailableEffect(effectId).then(async(availableEffect) => {
    const {doc, thumb: fullThumb} = await getDocForEffect(availableEffect);
    if(!middleware()) return;

    // * the effect flies from the message's side of the chat toward the middle; RTL swaps the sides
    const isOnRight = !!isOut !== I18n.getIsRTL();
    const {animationDiv} = wrapStickerAnimation({
      doc,
      middleware,
      side: isOnRight ? 'right' : 'left',
      size: 240,
      target: element,
      play: true,
      scrollable,
      fullThumb: getStickerEffectThumb(doc),
      addOffsetX: 40,
      onUnmount: () => {
        delete element.dataset.playing;
      }
    });

    if(isOut !== undefined && !isOnRight) {
      animationDiv.classList.add('reflect-x');
    }
  });

  e && cancelEvent(e);
};

export const fireMessageEffectByBubble = ({timeEffect, bubble, e, scrollable}: {
  timeEffect: HTMLElement,
  bubble: HTMLElement,
  e?: Event,
  scrollable?: Scrollable
}) => {
  const effectId = timeEffect.dataset.effectId as DocId;
  return fireMessageEffect({
    element: timeEffect,
    isOut: bubble.classList.contains('is-out'),
    e,
    scrollable,
    effectId,
    middleware: bubble.middlewareHelper.get()
  });
};

// const makeSponsored = () => i18n('SponsoredMessage');

// * the refreshes of a bubble's reply quote asked for: the one put in is the one asked for last, whichever comes first
const replyRefreshes: WeakMap<HTMLElement, number> = new WeakMap();

// * how long a quote made anew waits to show all of itself before it is put in: the one shown stays till then
const REPLY_SWAP_TIMEOUT = 3000;

/** what a reply quote is made from: the reply's header and the message it replies to, as the mirror has them */
type ReplySource = {
  replyTo: MessageReplyHeader,
  original: ReturnType<typeof apiManagerProxy.getMessageByPeer>,
  // * the caption of its album, which a quote of any of the album's messages shows, whichever of them holds it
  // * (`wrapMessageForReply`)
  caption?: Message.message
};
// * what each quote put in was made from (`setReply`)
const replySources: WeakMap<HTMLElement, ReplySource> = new WeakMap();
// * what a quote does not show, and a download of the same message renews anyway: the references of its files
const REPLY_SOURCE_RENEWED_KEYS = new Set<string>(['file_reference']);
// * and the dates of the message, of its forward header and of its files, in the clock of the moment
// * (`getServerTimeOffset`); a date anywhere else, such as one its text shows (`messageEntityFormattedDate`), counts
const REPLY_SOURCE_DATE_KEYS = new Set<string>(['date', 'edit_date', 'saved_date']);
const REPLY_SOURCE_DATED_TYPES = new Set<string>(['message', 'messageService', 'messageFwdHeader', 'photo', 'document']);
// * and of the message replied to itself: its counters (a post is downloaded anew for its comments', `RepliesElement`)
// * and its flags
const REPLY_SOURCE_COUNTER_KEYS = new Set<string>(['views', 'forwards', 'replies', 'reactions', 'pFlags']);

function getReplySourceKey(source: ReplySource) {
  const {caption} = source;
  try {
    return JSON.stringify({
      ...source,
      caption: caption && [caption.message, caption.totalEntities]
    }, function(this: any, key: string, value: any) {
      if(
        REPLY_SOURCE_RENEWED_KEYS.has(key) ||
        (REPLY_SOURCE_DATE_KEYS.has(key) && REPLY_SOURCE_DATED_TYPES.has(this?._)) ||
        (this === source.original && REPLY_SOURCE_COUNTER_KEYS.has(key))
      ) return;
      return value;
    });
  } catch(err) {}
}

/** the quote shown is made from what a refresh would make it from: the mirror's message is a new copy at every save */
function isSameReplySource(shown: ReplySource, source: ReplySource) {
  if(!shown) return false;
  if(shown.replyTo === source.replyTo && shown.original === source.original && shown.caption === source.caption) {
    return true;
  }

  const key = getReplySourceKey(source);
  return key !== undefined && key === getReplySourceKey(shown);
}

export namespace MessageRender {
  /* export const setText = () => {

  }; */

  export const setTime = (options: {
    chat: Chat,
    chatType: ChatType,
    message: Message.message | Message.messageService,
    groupedMessagesCount?: number,
    reactionsMessage?: Message.message | Message.messageService,
    isOut: boolean,
    middleware: Middleware,
    loadPromises?: Promise<any>[]
  }) => {
    const {chatType, message, groupedMessagesCount} = options;
    const isMessage = !('action' in message)/*  && !isSponsored */;
    const includeDate = message.peerId === rootScope.myId && (!options.isOut/*  || !!options.chat.threadId */);
    const args: (HTMLElement | string)[] = [];

    let timestamp = message.date;
    if(includeDate && isMessage && message.fwd_from) {
      const fwdTime = message.fwd_from.saved_date || message.fwd_from.date;
      timestamp = fwdTime || timestamp;
    }
    const date = new Date(timestamp * 1000);

    let editedSpan: HTMLElement,
      effectSpan: HTMLElement;
    // sponsoredSpan: HTMLElement;
    // reactionsElement: ReactionsElement,
    // reactionsMessage: Message.message;

    // const isSponsored = !!(message as Message.message).pFlags.sponsored;
    // let hasReactions: boolean;

    const fwdFrom = isMessage && message.fwd_from;

    // * when enabled by app config, an edited message shows its actual edit time in place of the
    // * sent time (and drops the separate "edited" badge) — but not when the footer is already
    // * showing a forwarded/saved date (matches tdesktop's EditedPrimary && !ForwardedDate).
    const editDate = isMessage && (message as Message.message).edit_date;
    const editedPrimary = isMessage &&
      !!useAppConfig().message_primary_edited_date &&
      !!editDate &&
      chatType !== ChatType.Scheduled &&
      !(message as Message.message).pFlags.edit_hide &&
      !(includeDate && !!fwdFrom);

    const time: HTMLElement = /* isSponsored ? undefined :  */editedPrimary ?
      makeEditedTime(date, new Date(editDate * 1000)) :
      makeTime(date, includeDate);

    let title = /* isSponsored ? undefined :  */getFullDate(new Date(message.date * 1000));
    if(isMessage) {
      title += (message.edit_date && !message.pFlags.edit_hide ? `\nEdited: ${getFullDate(new Date(message.edit_date * 1000))}` : '') +
        (fwdFrom ? `\nOriginal: ${getFullDate(new Date(fwdFrom.saved_date || fwdFrom.date * 1000))}` : '');

      const messageMedia = message.media;
      if(messageMedia?._ === 'messageMediaDice' && messageMedia.game_outcome) {
        const span = document.createElement('span');
        span.classList.add('time-dice');
        span.textContent = formatNanoton(messageMedia.game_outcome.stake_ton_amount);

        const icon = Icon('gram_filled', 'time-icon', 'time-part');

        args.push(span, icon);
      }

      // the network marker (docs/integration.md): a tap on this widget may send data to the bot's server; a message
      // that is not of the chat's history asks nothing (bubbles.ts)
      if(
        messageMedia?._ === 'messageMediaWidget' &&
        messageMedia.pFlags.can_query &&
        isHistoryMessage(chatType, message) &&
        isWidgetRenderingEnabled()
      ) {
        const marker = Icon('web_filled', 'time-icon', 'time-part', 'time-widget-network');
        const explanation = I18n.format('Widget.NetworkMarker', true);
        marker.removeAttribute('aria-hidden');
        marker.setAttribute('role', 'img');
        marker.setAttribute('aria-label', explanation);
        args.push(marker);
        title += '\n' + explanation;
      }

      if(message.views) {
        const postViewsSpan = document.createElement('span');
        postViewsSpan.classList.add('post-views');
        postViewsSpan.textContent = formatNumber(message.views, 1);

        const channelViews = Icon('channelviews_filled', 'time-icon', 'time-part', 'time-icon-views');

        title += '\n' + I18n.format('ViewsTooltip', true, [numberThousandSplitter(message.views)]);
        if(message.forwards) {
          title += '\n' + I18n.format('SharesTooltip', true, [numberThousandSplitter(message.forwards)]);
        }

        args.push(postViewsSpan, channelViews);
      }

      const postAuthor = options.chat.getPostAuthor(message);
      if(postAuthor) {
        const span = document.createElement('span');
        span.classList.add('time-post-author');
        setInnerHTML(span, wrapEmojiText(postAuthor));
        span.insertAdjacentHTML('beforeend', '<span class="time-post-author-comma">,' + NBSP + '</span>');
        args.push(span);
      }

      if(message.via_business_bot_id) {
        const bot = apiManagerProxy.getUser(message.via_business_bot_id as UserId);
        const botName = [bot?.first_name, bot?.last_name].filter(Boolean).join(' ') || bot?.username || 'Bot';
        const span = document.createElement('span');
        span.classList.add('time-post-author', 'time-business-bot');
        span.title = I18n.format('ChatAutomation.ViaBotTooltip', true);
        span.append(wrapEmojiText(botName));
        span.insertAdjacentHTML('beforeend', '<span class="time-post-author-comma">,' + NBSP + '</span>');
        args.push(span);
      }

      if(isAnchoredEphemeralMessage(message)) {
        args.unshift(editedSpan = makeUpdated());
      } else if(!editedPrimary && message.edit_date && chatType !== ChatType.Scheduled && !message.pFlags.edit_hide) {
        args.unshift(editedSpan = makeEdited());
      }

      if(chatType !== ChatType.Pinned && message.pFlags.pinned) {
        const i = Icon('pinnedchat_filled', 'time-icon', 'time-pinned', 'time-part');
        args.unshift(i);
      }

      if(message.effect) {
        effectSpan = makeEffect({onlyElement: true});
        args.push(effectSpan);
      }

      if(message.paid_message_stars && options.chat.isAnyGroup) {
        const inlineStars = document.createElement('span');
        inlineStars.classList.add('inline-stars', 'bubble-meta-inline-stars');
        inlineStars.append(
          numberThousandSplitterForStars(+message.paid_message_stars * Math.max(groupedMessagesCount || 0, 1)),
          Icon('star', 'inline-stars-icon')
        );
        args.push(inlineStars)
      }

      // if(USER_REACTIONS_INLINE && message.peer_id._ === 'peerUser'/*  && message.reactions?.results?.length */) {
      //   hasReactions = true;

      //   reactionsMessage = options.reactionsMessage;
      //   reactionsElement = new ReactionsElement();
      //   reactionsElement.init(reactionsMessage, 'inline', true);
      //   reactionsElement.render();
      //   args.unshift(reactionsElement);
      // }
    }/*  else if(isSponsored) {
      args.push(sponsoredSpan = makeSponsored());
    } */

    let repeatSpan: HTMLElement;
    if(isMessage && message.schedule_repeat_period) {
      repeatSpan = makeScheduleRepeatPeriod(message.schedule_repeat_period);
      args.push(repeatSpan);
    }

    if(time) {
      args.push(time);
    }

    const timeSpan = document.createElement('span');
    timeSpan.classList.add('time');
    // if(title) timeSpan.title = title;
    timeSpan.append(...args);

    const inner = document.createElement('div');
    inner.classList.add('time-inner');
    if(title) inner.title = title;

    let clonedArgs = args;
    if(editedSpan) {
      clonedArgs[clonedArgs.indexOf(editedSpan)] = isAnchoredEphemeralMessage(message) ?
        makeUpdated() :
        makeEdited();
    }
    // if(sponsoredSpan) {
    //   clonedArgs[clonedArgs.indexOf(sponsoredSpan)] = makeSponsored();
    // }
    // if(reactionsElement) {
    //   const _reactionsElement = clonedArgs[clonedArgs.indexOf(reactionsElement)] = new ReactionsElement();
    //   _reactionsElement.init(reactionsMessage, 'inline');
    //   _reactionsElement.render();
    // }
    if(repeatSpan) {
      clonedArgs[clonedArgs.indexOf(repeatSpan)] = makeScheduleRepeatPeriod((message as Message.message).schedule_repeat_period);
    }
    if(effectSpan) {
      clonedArgs[clonedArgs.indexOf(effectSpan)] = makeEffect({
        docId: (message as Message.message).effect,
        middleware: options.middleware,
        loadPromises: options.loadPromises
      });
    }
    clonedArgs = clonedArgs.map((a) => {
      return a instanceof HTMLElement &&
        !a.classList.contains('i18n') &&
        !a.classList.contains('reactions') &&
        !a.classList.contains('time-effect') ?
          a.cloneNode(true) as HTMLElement :
          a;
    });
    if(time) {
      clonedArgs[clonedArgs.length - 1] = editedPrimary ? // clone time
        makeEditedTime(date, new Date(editDate * 1000)) :
        makeTime(date, includeDate);
    }
    inner.append(...clonedArgs);

    timeSpan.append(inner);

    return timeSpan;
  };

  export const renderReplies = ({bubble, bubbleContainer, message, messageDiv, loadPromises, lazyLoadQueue, middleware}: {
    bubble: HTMLElement,
    bubbleContainer: HTMLElement,
    message: Message.message,
    messageDiv: HTMLElement,
    loadPromises?: Promise<any>[],
    lazyLoadQueue?: LazyLoadQueue,
    middleware: Middleware
  }) => {
    const isFooter = !bubble.classList.contains('sticker') &&
      !bubble.classList.contains('emoji-big') &&
      !bubble.classList.contains('round') &&
      !bubble.classList.contains('is-unsupported');
    const repliesFooter = RepliesElement.create();
    repliesFooter.message = message;
    repliesFooter.type = isFooter ? 'footer' : 'beside';
    repliesFooter.loadPromises = loadPromises;
    repliesFooter.lazyLoadQueue = lazyLoadQueue;
    repliesFooter.middlewareHelper = middleware.create();
    repliesFooter.init();
    bubbleContainer.append(repliesFooter);
    return isFooter;
  };

  export const setReply = async({chat, bubble, bubbleContainer, message, logId, appendCallback, middleware, lazyLoadQueue, needUpdate, isStandaloneMedia, isOut, fromUpdate, loadPromises, swap = (callback) => callback()}: {
    chat: Chat,
    bubble: HTMLElement,
    bubbleContainer?: HTMLElement,
    message: Message.message,
    logId?: string | number,
    appendCallback?: (container: HTMLElement) => void,
    middleware: Middleware,
    lazyLoadQueue: LazyLoadQueue,
    needUpdate: ChatBubbles['needUpdate'],
    isStandaloneMedia: boolean,
    isOut: boolean,
    fromUpdate?: boolean,
    /** the bubble's render's loads: a quote put in with the bubble is laid out with its names already in it */
    loadPromises?: Promise<any>[],
    /** puts the quote made in place of the one shown: at once, or as a change of the bubble the caller shows */
    swap?: (callback: () => void) => void
  }) => {
    const managers = bindManagersToSession(rootScope.managers);
    const isReplacing = !bubbleContainer;
    if(isReplacing) {
      bubbleContainer = bubble.querySelector('.bubble-content');
    }

    const currentReplyDiv = isReplacing ? bubbleContainer.querySelector('.reply') as HTMLElement : null;
    const refresh = (replyRefreshes.get(bubble) ?? 0) + 1;
    if(currentReplyDiv) replyRefreshes.set(bubble, refresh);
    const replyTo = message.reply_to;
    if(!replyTo) {
      currentReplyDiv?.remove();
      bubble.classList.remove('is-reply');
      return;
    }

    const isStoryReply = replyTo._ === 'messageReplyStoryHeader';

    const replyToPeerId = isStoryReply ?
      getPeerId(replyTo.peer) :
      (
        replyTo.reply_to_peer_id ?
          getPeerId(replyTo.reply_to_peer_id) :
          message.peerId
      );

    const originalMessage = !isStoryReply && apiManagerProxy.getMessageByPeer(replyToPeerId, message.reply_to_mid);
    const groupedId = (originalMessage as Message.message)?.grouped_id;
    const source: ReplySource = {
      replyTo,
      original: originalMessage || undefined,
      caption: groupedId ? getGroupedText(apiManagerProxy.getMessagesByGroupedId(groupedId)) : undefined
    };
    // * a refresh with nothing new to show leaves the quote shown as it is, rather than shown changing into itself: the
    // * message replied to, downloaded anew, says the same
    if(fromUpdate && currentReplyDiv && !isStoryReply && isSameReplySource(replySources.get(currentReplyDiv), source)) {
      return currentReplyDiv;
    }

    const originalStory = isStoryReply && await managers.acknowledged.appStoriesManager.getStoryById(replyToPeerId, replyTo.story_id);
    let originalPeerTitle: string | HTMLElement | DocumentFragment;
    // * what the quote waits for to show all of itself before it goes in place of the one shown
    const replyLoadPromises: Promise<any>[] = [];
    // * its names come after an await, and a quote taller than its least height grows a line when they do: a quote put
    // * in with the bubble is waited for by the bubble's render, one put in place of the one shown waits for them itself
    const titleLoadPromises = currentReplyDiv ? replyLoadPromises : loadPromises;

    let isReplyFromAnotherPeer = false;
    let titlePeerId: PeerId, setColorPeerId: PeerId, forUpdate: typeof needUpdate[0];

    if(!fromUpdate) {
      if(isStoryReply) {
        needUpdate.push(forUpdate = {replyToPeerId, replyStoryId: replyTo.story_id, mid: message.mid, peerId: message.peerId, logId});
      } else {
        needUpdate.push(forUpdate = {replyToPeerId, replyMid: message.reply_to_mid, mid: message.mid, peerId: message.peerId, logId});
      }

      middleware.onClean(() => {
        indexOfAndSplice(needUpdate, forUpdate);
      });
    }

    if(isStoryReply) {
      if(!originalStory.cached) {
        managers.appMessagesManager.fetchMessageReplyTo(message);
        // needUpdate.push(forUpdate = {replyToPeerId, replyStoryId: replyTo.story_id, mid: message.mid, peerId: message.peerId});
        originalPeerTitle = i18n('Loading');
      } else {
        titlePeerId = replyToPeerId;
        originalPeerTitle = createPeerTitleElement({
          peerId: titlePeerId,
          dialog: false,
          onlyFirstName: false,
          plainText: false
        }, titleLoadPromises);
      }
    } else if(!originalMessage) {
      // from different peer
      if(replyTo.reply_from) {
        isReplyFromAnotherPeer = true;
        titlePeerId = getPeerId(replyTo.reply_from?.from_id || replyTo.reply_to_peer_id);
        originalPeerTitle = createPeerTitleElement({
          peerId: titlePeerId || undefined,
          dialog: false,
          onlyFirstName: false,
          plainText: false,
          fromName: getFwdFromName(replyTo.reply_from)
        }, titleLoadPromises);
      } else if(replyTo.reply_to_msg_deleted) {
        originalPeerTitle = i18n('DeletedMessage');
      } else {
        // needUpdate.push(forUpdate = {replyToPeerId, replyMid: message.reply_to_mid, mid: message.mid, peerId: message.peerId});
        managers.appMessagesManager.fetchMessageReplyTo(message);

        originalPeerTitle = i18n('Loading');
      }
    } else {
      isReplyFromAnotherPeer = !!replyTo.reply_from;
      const originalMessageFwdFromId = (originalMessage as Message.message).fwdFromId;
      titlePeerId = message.fwdFromId && message.fwdFromId === originalMessageFwdFromId ?
        message.fwdFromId :
        originalMessageFwdFromId || originalMessage.fromId;
      setColorPeerId = message.fwdFromId && message.fwdFromId === originalMessageFwdFromId ?
        undefined :
        originalMessage.fromId;
      originalPeerTitle = createPeerTitleElement({
        peerId: titlePeerId,
        dialog: false,
        onlyFirstName: false,
        plainText: false,
        fromName: !titlePeerId ? getFwdFromName((originalMessage as Message.message).fwd_from) : undefined
      }, titleLoadPromises);
    }

    if(!isStoryReply && replyTo.reply_from) {
      const fragment = document.createDocumentFragment();
      let icon: HTMLElement;
      if(replyTo.reply_from.channel_post) {
        fragment.append(icon = Icon('newchannel_filled', 'with-margin'), originalPeerTitle);
      } else if(replyTo.reply_to_peer_id) {
        const groupPeerTitle = createPeerTitleElement({
          peerId: getPeerId(replyTo.reply_to_peer_id),
          dialog: false,
          onlyFirstName: false,
          plainText: false
        }, titleLoadPromises);

        fragment.append(originalPeerTitle, ' ', icon = Icon('group_filled'), ' ', groupPeerTitle);
      } else {
        fragment.append(icon = Icon('newprivate_filled', 'with-margin'), originalPeerTitle);
      }

      if(icon) {
        icon.classList.add('inline-icon', 'reply-title-icon');
        originalPeerTitle = fragment;
      }
    }

    const isStoryExpired = isStoryReply && originalStory.cached && !(await originalStory.result);
    const {container, fillPromise} = wrapReply({
      title: originalPeerTitle,
      animationGroup: chat.animationGroup,
      message: originalMessage || (isReplyFromAnotherPeer ? {
        _: 'message',
        pFlags: {},
        id: 0,
        date: 0,
        message: '',
        peer_id: undefined,
        media: (replyTo as MessageReplyHeader.messageReplyHeader).reply_media
      } : undefined),
      isStoryExpired,
      storyItem: originalStory?.cached && await originalStory.result,
      setColorPeerId: setColorPeerId || titlePeerId,
      textColor: 'primary-text-color',
      isQuote: !isStoryReply ? replyTo.pFlags.quote : undefined,
      middleware,
      lazyLoadQueue,
      replyHeader: replyTo,
      useHighlightingColor: isStandaloneMedia,
      colorAsOut: isOut,
      canTranslate: originalMessage && !isReplyFromAnotherPeer ? !originalMessage.pFlags.out : undefined,
      loadPromises: replyLoadPromises
    });
    replySources.set(container, source);

    await fillPromise;
    if(currentReplyDiv) {
      // * put in once it shows all of itself: its text comes after its custom emoji (`TranslatableMessage`), and a bubble
      // * measured around a quote with no text yet is shown changing to a size it does not end at (`bubbleTransitions`)
      await withTimeout(Promise.all(replyLoadPromises).catch(noop), REPLY_SWAP_TIMEOUT);
      if(!middleware()) return;
      swap(() => {
        // * the quote shown by then: another refresh, asked for earlier, put in its own in place of the one this one
        // * started from; one asked for later puts in its own
        if(replyRefreshes.get(bubble) !== refresh) return;
        const shown = bubbleContainer.querySelector<HTMLElement>('.reply') ?? currentReplyDiv;
        const saveClassNames = ['floating-part', 'mb-shorter'];
        const classList = shown.classList;
        saveClassNames.forEach((className) => {
          if(classList.contains(className)) {
            container.classList.add(className);
          }
        });
        shown.replaceWith(container);
        bubble.classList.add('is-reply');
      });
    } else {
      appendCallback(container);
      // bubbleContainer.insertBefore(, nameContainer);
      bubble.classList.add('is-reply');
    }

    return container;
  };
}
