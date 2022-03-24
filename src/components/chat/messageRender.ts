/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { formatTime, getFullDate } from "../../helpers/date";
import formatNumber from "../../helpers/number/formatNumber";
import { Message } from "../../layer";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import { i18n, _i18n } from "../../lib/langPack";
import RichTextProcessor from "../../lib/richtextprocessor";
import { LazyLoadQueueIntersector } from "../lazyLoadQueue";
import PeerTitle from "../peerTitle";
import { wrapReply } from "../wrappers";
import Chat, { ChatType } from "./chat";
import ReactionsElement from "./reactions";
import RepliesElement from "./replies";

const NBSP = '&nbsp;';

const makeEdited = () => {
  const edited = document.createElement('i');
  edited.classList.add('edited');
  _i18n(edited, 'EditedMessage');
  return edited;
};

const makeSponsored = () => i18n('SponsoredMessage');

export namespace MessageRender {
  /* export const setText = () => {

  }; */

  export const setTime = (options: {
    chatType: ChatType, 
    message: Message.message | Message.messageService,
  }) => {
    const {chatType, message} = options;
    const date = new Date(message.date * 1000);
    const args: (HTMLElement | string)[] = [];
    
    let editedSpan: HTMLElement, sponsoredSpan: HTMLElement, reactionsElement: ReactionsElement, reactionsMessage: Message.message;
    
    const isSponsored = !!(message as Message.message).pFlags.sponsored;
    const isMessage = !('action' in message) && !isSponsored;
    let hasReactions: boolean;
    
    let time: HTMLElement = isSponsored ? undefined : formatTime(date);
    if(isMessage) {
      if(message.views) {
        const postAuthor = message.post_author || message.fwd_from?.post_author;
  
        const postViewsSpan = document.createElement('span');
        postViewsSpan.classList.add('post-views');
        postViewsSpan.innerHTML = formatNumber(message.views, 1);
  
        const channelViews = document.createElement('i');
        channelViews.classList.add('tgico-channelviews', 'time-icon');
  
        args.push(postViewsSpan, channelViews);
        if(postAuthor) {
          const span = document.createElement('span');
          span.innerHTML = RichTextProcessor.wrapEmojiText(postAuthor) + ',' + NBSP;
          args.push(span);
        }
      }

      if(message.edit_date && chatType !== 'scheduled' && !message.pFlags.edit_hide) {
        args.unshift(editedSpan = makeEdited());
      }
  
      if(chatType !== 'pinned' && message.pFlags.pinned) {
        const i = document.createElement('i');
        i.classList.add('tgico-pinnedchat', 'time-icon');
        args.unshift(i);
      }

      if(message.peer_id._ === 'peerUser'/*  && message.reactions?.results?.length */) {
        hasReactions = true;

        reactionsMessage = appMessagesManager.getGroupsFirstMessage(message);

        reactionsElement = new ReactionsElement();
        reactionsElement.init(reactionsMessage, 'inline', true);
        reactionsElement.render();
        args.unshift(reactionsElement);
      }
    } else if(isSponsored) {
      args.push(sponsoredSpan = makeSponsored());
    }
    
    if(time) {
      args.push(time);
    }

    let title = isSponsored ? undefined : getFullDate(date);
    if(isMessage) {
      title += (message.edit_date && !message.pFlags.edit_hide ? `\nEdited: ${getFullDate(new Date(message.edit_date * 1000))}` : '')
        + (message.fwd_from ? `\nOriginal: ${getFullDate(new Date(message.fwd_from.date * 1000))}` : '');
    }

    const timeSpan = document.createElement('span');
    timeSpan.classList.add('time', 'tgico');
    // if(title) timeSpan.title = title;
    timeSpan.append(...args);

    const inner = document.createElement('div');
    inner.classList.add('inner', 'tgico');
    if(title) inner.title = title;

    let clonedArgs = args;
    if(editedSpan) {
      clonedArgs[clonedArgs.indexOf(editedSpan)] = makeEdited();
    }
    if(sponsoredSpan) {
      clonedArgs[clonedArgs.indexOf(sponsoredSpan)] = makeSponsored();
    }
    if(reactionsElement) {
      const _reactionsElement = clonedArgs[clonedArgs.indexOf(reactionsElement)] = new ReactionsElement();
      _reactionsElement.init(reactionsMessage, 'inline');
      _reactionsElement.render();
    }
    clonedArgs = clonedArgs.map(a => a instanceof HTMLElement && !a.classList.contains('i18n') && !a.classList.contains('reactions') ? a.cloneNode(true) as HTMLElement : a);
    if(time) {
      clonedArgs[clonedArgs.length - 1] = formatTime(date); // clone time
    }
    inner.append(...clonedArgs);

    timeSpan.append(inner);

    return timeSpan;
  };

  export const renderReplies = ({bubble, bubbleContainer, message, messageDiv, loadPromises, lazyLoadQueue}: {
    bubble: HTMLElement,
    bubbleContainer: HTMLElement,
    message: Message.message,
    messageDiv: HTMLElement,
    loadPromises?: Promise<any>[],
    lazyLoadQueue?: LazyLoadQueueIntersector
  }) => {
    const isFooter = !bubble.classList.contains('sticker') && !bubble.classList.contains('emoji-big') && !bubble.classList.contains('round');
    const repliesFooter = new RepliesElement();
    repliesFooter.message = message;
    repliesFooter.type = isFooter ? 'footer' : 'beside';
    repliesFooter.loadPromises = loadPromises;
    repliesFooter.lazyLoadQueue = lazyLoadQueue;
    repliesFooter.init();
    bubbleContainer.prepend(repliesFooter);
    return isFooter;
  };

  export const setReply = ({chat, bubble, bubbleContainer, message}: {
    chat: Chat,
    bubble: HTMLElement,
    bubbleContainer?: HTMLElement,
    message: Message.message
  }) => {
    const isReplacing = !bubbleContainer;
    if(isReplacing) {
      bubbleContainer = bubble.querySelector('.bubble-content');
    }

    const currentReplyDiv = isReplacing ? bubbleContainer.querySelector('.reply') : null;
    if(!message.reply_to_mid) {
      if(currentReplyDiv) {
        currentReplyDiv.remove();
      }

      bubble.classList.remove('is-reply');
      return;
    }


    const replyToPeerId = message.reply_to.reply_to_peer_id ? chat.appPeersManager.getPeerId(message.reply_to.reply_to_peer_id) : chat.peerId;

    let originalMessage = chat.appMessagesManager.getMessageByPeer(replyToPeerId, message.reply_to_mid);
    let originalPeerTitle: string | HTMLElement;
    
    /////////this.log('message to render reply', originalMessage, originalPeerTitle, bubble, message);
    
    // need to download separately
    if(originalMessage._ === 'messageEmpty') {
      //////////this.log('message to render reply empty, need download', message, message.reply_to_mid);
      chat.appMessagesManager.wrapSingleMessage(replyToPeerId, message.reply_to_mid);
      chat.bubbles.needUpdate.push({replyToPeerId, replyMid: message.reply_to_mid, mid: message.mid});
      
      originalPeerTitle = i18n('Loading');
    } else {
      originalPeerTitle = new PeerTitle({
        peerId: originalMessage.fromId || originalMessage.fwdFromId,
        dialog: false,
        onlyFirstName: false,
        plainText: false
      }).element;
    }

    const wrapped = wrapReply(originalPeerTitle, undefined, originalMessage);
    if(currentReplyDiv) {
      currentReplyDiv.replaceWith(wrapped);
    } else {
      bubbleContainer.append(wrapped);
    }
    //bubbleContainer.insertBefore(, nameContainer);
    bubble.classList.add('is-reply');
  };
}
