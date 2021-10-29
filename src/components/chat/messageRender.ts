/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { getFullDate } from "../../helpers/date";
import { formatNumber } from "../../helpers/number";
import { i18n } from "../../lib/langPack";
import RichTextProcessor from "../../lib/richtextprocessor";
import { LazyLoadQueueIntersector } from "../lazyLoadQueue";
import PeerTitle from "../peerTitle";
import { wrapReply } from "../wrappers";
import Chat from "./chat";
import RepliesElement from "./replies";

export namespace MessageRender {
  /* export const setText = () => {

  }; */

  export const setTime = (chat: Chat, message: any, bubble: HTMLElement, bubbleContainer: HTMLElement, messageDiv: HTMLElement) => {
    const date = new Date(message.date * 1000);
    let time = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);

    if(message.views) {
      const postAuthor = message.post_author || message.fwd_from?.post_author;

      bubble.classList.add('channel-post');
      time = '<span class="post-views">' + formatNumber(message.views, 1) + '</span> <i class="tgico-channelviews time-icon"></i> ' + (postAuthor ? RichTextProcessor.wrapEmojiText(postAuthor) + ', ' : '') + time;
    }

    if(message.edit_date && chat.type !== 'scheduled' && !message.pFlags.edit_hide) {
      bubble.classList.add('is-edited');
      time = '<i class="edited">edited</i> ' + time;
    }

    if(chat.type !== 'pinned' && message.pFlags.pinned) {
      bubble.classList.add('is-pinned');
      time = '<i class="tgico-pinnedchat time-icon"></i>' + time;
    }

    const title = getFullDate(date) 
      + (message.edit_date ? `\nEdited: ${getFullDate(new Date(message.edit_date * 1000))}` : '')
      + (message.fwd_from ? `\nOriginal: ${getFullDate(new Date(message.fwd_from.date * 1000))}` : '');

    const timeSpan = document.createElement('span');
    timeSpan.classList.add('time', 'tgico');
    timeSpan.title = title;
    timeSpan.innerHTML = `${time}<div class="inner tgico" title="${title}">${time}</div>`;

    messageDiv.append(timeSpan);

    return timeSpan;
  };

  export const renderReplies = ({bubble, bubbleContainer, message, messageDiv, loadPromises, lazyLoadQueue}: {
    bubble: HTMLElement,
    bubbleContainer: HTMLElement,
    message: any,
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
    message: any
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
