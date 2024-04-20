/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type LazyLoadQueue from '../lazyLoadQueue';
import {formatFullSentTimeRaw, formatTime, getFullDate} from '../../helpers/date';
import setInnerHTML from '../../helpers/dom/setInnerHTML';
import {Middleware} from '../../helpers/middleware';
import formatNumber from '../../helpers/number/formatNumber';
import {Message, MessageReplyHeader} from '../../layer';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import {i18n, _i18n} from '../../lib/langPack';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import rootScope from '../../lib/rootScope';
import Icon from '../icon';
import PeerTitle from '../peerTitle';
import wrapReply from '../wrappers/reply';
import Chat, {ChatType} from './chat';
import RepliesElement from './replies';
import ChatBubbles from './bubbles';
import getFwdFromName from '../../lib/appManagers/utils/messages/getFwdFromName';

const NBSP = '&nbsp;';

const makeEdited = () => {
  const edited = document.createElement('i');
  edited.classList.add('time-edited', 'time-part');
  _i18n(edited, 'EditedMessage');
  return edited;
};

const makeTime = (date: Date, includeDate?: boolean) => {
  return includeDate ? formatFullSentTimeRaw(date.getTime() / 1000 | 0, {combined: true}).dateEl : formatTime(date);
};

// const makeSponsored = () => i18n('SponsoredMessage');

export namespace MessageRender {
  /* export const setText = () => {

  }; */

  export const setTime = (options: {
    chat: Chat,
    chatType: ChatType,
    message: Message.message | Message.messageService,
    reactionsMessage?: Message.message,
    isOut: boolean
  }) => {
    const {chatType, message} = options;
    const isMessage = !('action' in message)/*  && !isSponsored */;
    const includeDate = message.peerId === rootScope.myId && (!options.isOut/*  || !!options.chat.threadId */);
    const args: (HTMLElement | string)[] = [];

    let timestamp = message.date;
    if(includeDate && isMessage && message.fwd_from) {
      const fwdTime = message.fwd_from.saved_date || message.fwd_from.date;
      timestamp = fwdTime || timestamp;
    }
    const date = new Date(timestamp * 1000);

    let editedSpan: HTMLElement;
    // sponsoredSpan: HTMLElement;
    // reactionsElement: ReactionsElement,
    // reactionsMessage: Message.message;

    // const isSponsored = !!(message as Message.message).pFlags.sponsored;
    // let hasReactions: boolean;

    const fwdFrom = isMessage && message.fwd_from;
    const time: HTMLElement = /* isSponsored ? undefined :  */makeTime(date, includeDate);
    if(isMessage) {
      if(message.views) {
        const postViewsSpan = document.createElement('span');
        postViewsSpan.classList.add('post-views');
        postViewsSpan.textContent = formatNumber(message.views, 1);

        const channelViews = Icon('channelviews', 'time-icon', 'time-part', 'time-icon-views');

        args.push(postViewsSpan, channelViews);
      }

      const postAuthor = options.chat.getPostAuthor(message);
      if(postAuthor) {
        const span = document.createElement('span');
        span.classList.add('post-author');
        setInnerHTML(span, wrapEmojiText(postAuthor));
        span.insertAdjacentHTML('beforeend', '<span class="post-author-comma">,' + NBSP + '</span>');
        args.push(span);
      }

      if(message.edit_date && chatType !== ChatType.Scheduled && !message.pFlags.edit_hide) {
        args.unshift(editedSpan = makeEdited());
      }

      if(chatType !== ChatType.Pinned && message.pFlags.pinned) {
        const i = Icon('pinnedchat', 'time-icon', 'time-pinned', 'time-part');
        args.unshift(i);
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

    if(time) {
      args.push(time);
    }

    let title = /* isSponsored ? undefined :  */getFullDate(new Date(message.date * 1000));
    if(isMessage) {
      title += (message.edit_date && !message.pFlags.edit_hide ? `\nEdited: ${getFullDate(new Date(message.edit_date * 1000))}` : '') +
        (fwdFrom ? `\nOriginal: ${getFullDate(new Date(fwdFrom.saved_date || fwdFrom.date * 1000))}` : '');
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
      clonedArgs[clonedArgs.indexOf(editedSpan)] = makeEdited();
    }
    // if(sponsoredSpan) {
    //   clonedArgs[clonedArgs.indexOf(sponsoredSpan)] = makeSponsored();
    // }
    // if(reactionsElement) {
    //   const _reactionsElement = clonedArgs[clonedArgs.indexOf(reactionsElement)] = new ReactionsElement();
    //   _reactionsElement.init(reactionsMessage, 'inline');
    //   _reactionsElement.render();
    // }
    clonedArgs = clonedArgs.map((a) => {
      return a instanceof HTMLElement && !a.classList.contains('i18n') && !a.classList.contains('reactions') ?
        a.cloneNode(true) as HTMLElement :
        a;
    });
    if(time) {
      clonedArgs[clonedArgs.length - 1] = makeTime(date, includeDate); // clone time
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
    const isFooter = !bubble.classList.contains('sticker') && !bubble.classList.contains('emoji-big') && !bubble.classList.contains('round');
    const repliesFooter = new RepliesElement();
    repliesFooter.message = message;
    repliesFooter.type = isFooter ? 'footer' : 'beside';
    repliesFooter.loadPromises = loadPromises;
    repliesFooter.lazyLoadQueue = lazyLoadQueue;
    repliesFooter.middlewareHelper = middleware.create();
    repliesFooter.init();
    bubbleContainer.prepend(repliesFooter);
    return isFooter;
  };

  export const setReply = async({chat, bubble, bubbleContainer, message, appendCallback, middleware, lazyLoadQueue, needUpdate, isStandaloneMedia, isOut}: {
    chat: Chat,
    bubble: HTMLElement,
    bubbleContainer?: HTMLElement,
    message: Message.message,
    appendCallback?: (container: HTMLElement) => void,
    middleware: Middleware,
    lazyLoadQueue: LazyLoadQueue,
    needUpdate: ChatBubbles['needUpdate'],
    isStandaloneMedia: boolean,
    isOut: boolean
  }) => {
    const isReplacing = !bubbleContainer;
    if(isReplacing) {
      bubbleContainer = bubble.querySelector('.bubble-content');
    }

    const currentReplyDiv = isReplacing ? bubbleContainer.querySelector('.reply') : null;
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
          chat.peerId
      );

    const originalMessage = !isStoryReply && apiManagerProxy.getMessageByPeer(replyToPeerId, message.reply_to_mid);
    const originalStory = isStoryReply && await rootScope.managers.acknowledged.appStoriesManager.getStoryById(replyToPeerId, replyTo.story_id);
    let originalPeerTitle: string | HTMLElement | DocumentFragment;

    let isReplyFromAnotherPeer = false;
    let titlePeerId: PeerId, setColorPeerId: PeerId;
    if(isStoryReply) {
      if(!originalStory.cached) {
        needUpdate.push({replyToPeerId, replyStoryId: replyTo.story_id, mid: message.mid});
        rootScope.managers.appMessagesManager.fetchMessageReplyTo(message);

        originalPeerTitle = i18n('Loading');
      } else {
        titlePeerId = replyToPeerId;
        originalPeerTitle = new PeerTitle({
          peerId: titlePeerId,
          dialog: false,
          onlyFirstName: false,
          plainText: false
        }).element;
      }
    } else if(!originalMessage) {
      // from different peer
      if(replyTo.reply_from) {
        isReplyFromAnotherPeer = true;
        titlePeerId = getPeerId(replyTo.reply_from?.from_id || replyTo.reply_to_peer_id);
        originalPeerTitle = new PeerTitle({
          peerId: titlePeerId || undefined,
          dialog: false,
          onlyFirstName: false,
          plainText: false,
          fromName: getFwdFromName(replyTo.reply_from)
        }).element;
      } else {
        needUpdate.push({replyToPeerId, replyMid: message.reply_to_mid, mid: message.mid});
        rootScope.managers.appMessagesManager.fetchMessageReplyTo(message);

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
      originalPeerTitle = new PeerTitle({
        peerId: titlePeerId,
        dialog: false,
        onlyFirstName: false,
        plainText: false,
        fromName: !titlePeerId ? getFwdFromName((originalMessage as Message.message).fwd_from) : undefined
      }).element;
    }

    if(!isStoryReply && replyTo.reply_from) {
      const fragment = document.createDocumentFragment();
      let icon: HTMLElement;
      if(replyTo.reply_from.channel_post) {
        fragment.append(icon = Icon('newchannel_filled', 'with-margin'), originalPeerTitle);
      } else if(replyTo.reply_to_peer_id) {
        const groupPeerTitle = new PeerTitle({
          peerId: getPeerId(replyTo.reply_to_peer_id),
          dialog: false,
          onlyFirstName: false,
          plainText: false
        }).element;

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
      canTranslate: originalMessage && !isReplyFromAnotherPeer ? !originalMessage.pFlags.out : undefined
    });

    await fillPromise;
    if(currentReplyDiv) {
      if(currentReplyDiv.classList.contains('floating-part')) {
        container.classList.add('floating-part');
      }
      currentReplyDiv.replaceWith(container);
    } else {
      appendCallback(container);
    }
    // bubbleContainer.insertBefore(, nameContainer);
    bubble.classList.add('is-reply');

    return container;
  };
}
