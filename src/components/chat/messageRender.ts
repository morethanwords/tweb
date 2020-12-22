import { getFullDate } from "../../helpers/date";
import { formatNumber } from "../../helpers/number";
import { Message } from "../../layer";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import RichTextProcessor from "../../lib/richtextprocessor";
import rootScope from "../../lib/rootScope";
import { ripple } from "../ripple";
import Chat from "./chat";

export namespace MessageRender {
  /* export const setText = () => {

  }; */

  export const setTime = (chat: Chat, message: any, bubble: HTMLElement, bubbleContainer: HTMLElement, messageDiv: HTMLElement) => {
    const date = new Date(message.date * 1000);
    let time = ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2);

    if(message.views) {
      const postAuthor = message.post_author || message.fwd_from?.post_author;

      bubble.classList.add('channel-post');
      time = formatNumber(message.views, 1) + ' <i class="tgico-channelviews"></i> ' + (postAuthor ? RichTextProcessor.wrapEmojiText(postAuthor) + ', ' : '') + time;
  
      if(!message.savedFrom) {
        const forward = document.createElement('div');
        forward.classList.add('bubble-beside-button', 'forward');
        forward.innerHTML = `
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" preserveAspectRatio="xMidYMid meet" viewBox="0 0 24 24">
          <defs>
            <path d="M13.55 3.24L13.64 3.25L13.73 3.27L13.81 3.29L13.9 3.32L13.98 3.35L14.06 3.39L14.14 3.43L14.22 3.48L14.29 3.53L14.36 3.59L14.43 3.64L22.23 10.85L22.36 10.99L22.48 11.15L22.57 11.31L22.64 11.48L22.69 11.66L22.72 11.85L22.73 12.04L22.71 12.22L22.67 12.41L22.61 12.59L22.53 12.76L22.42 12.93L22.29 13.09L22.23 13.15L14.43 20.36L14.28 20.48L14.12 20.58L13.95 20.66L13.77 20.72L13.58 20.76L13.4 20.77L13.22 20.76L13.03 20.73L12.85 20.68L12.68 20.61L12.52 20.52L12.36 20.4L12.22 20.27L12.16 20.2L12.1 20.13L12.05 20.05L12.01 19.98L11.96 19.9L11.93 19.82L11.89 19.73L11.87 19.65L11.84 19.56L11.83 19.47L11.81 19.39L11.81 19.3L11.8 19.2L11.8 16.42L11 16.49L10.23 16.58L9.51 16.71L8.82 16.88L8.18 17.09L7.57 17.33L7.01 17.6L6.48 17.91L5.99 18.26L5.55 18.64L5.14 19.05L4.77 19.51L4.43 19.99L4.29 20.23L4.21 20.35L4.11 20.47L4 20.57L3.88 20.65L3.75 20.72L3.62 20.78L3.48 20.82L3.33 20.84L3.19 20.84L3.04 20.83L2.9 20.79L2.75 20.74L2.62 20.68L2.53 20.62L2.45 20.56L2.38 20.5L2.31 20.43L2.25 20.36L2.2 20.28L2.15 20.19L2.11 20.11L2.07 20.02L2.04 19.92L2.02 19.83L2.01 19.73L2 19.63L2.04 17.99L2.19 16.46L2.46 15.05L2.85 13.75L3.35 12.58L3.97 11.53L4.7 10.6L5.55 9.8L6.51 9.12L7.59 8.56L8.77 8.13L10.07 7.83L11.48 7.65L11.8 7.63L11.8 4.8L11.91 4.56L12.02 4.35L12.14 4.16L12.25 3.98L12.37 3.82L12.48 3.68L12.61 3.56L12.73 3.46L12.85 3.38L12.98 3.31L13.11 3.27L13.24 3.24L13.37 3.23L13.46 3.23L13.55 3.24Z" id="b13RmHDQtl"></path>
          </defs>
          <use xlink:href="#b13RmHDQtl" opacity="1" fill="#fff" fill-opacity="1"></use>
        </svg>`;
        bubbleContainer.append(forward);
        bubble.classList.add('with-beside-button');
      }
    }

    if(message.edit_date) {
      bubble.classList.add('is-edited');
      time = '<i class="edited">edited</i> ' + time;
    }

    if(chat.type != 'pinned' && message.pFlags.pinned) {
      bubble.classList.add('is-pinned');
      time = '<i class="tgico tgico-pinnedchat"></i>' + time;
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

  export const renderReplies = ({bubble, bubbleContainer, message, messageDiv}: {
    bubble: HTMLElement,
    bubbleContainer: HTMLElement,
    message: any,
    messageDiv: HTMLElement
  }) => {
    const isFooter = !bubble.classList.contains('sticker') && !bubble.classList.contains('emoji-big');
    const repliesFooter = new RepliesFooterElement();
    
    if(isFooter) {
      repliesFooter.message = message;
      repliesFooter.type = 'footer';
      bubbleContainer.prepend(repliesFooter);
    }
  };
}

rootScope.on('replies_updated', (e) => {
  const message = e.detail;
  (Array.from(document.querySelectorAll(`replies-footer-element[data-post-key="${message.peerId}_${message.mid}"]`)) as RepliesFooterElement[]).forEach(element => {
    element.message = message;
    element.render();
  });
});

class RepliesFooterElement extends HTMLElement {
  public message: Message.message;
  public type: 'footer' | 'beside';
  
  private updated = false;

  constructor() {
    super();

    this.classList.add('replies-footer');
  }

  connectedCallback() {
    this.render();
    this.dataset.postKey = this.message.peerId + '_' + this.message.mid;
  }

  public render() {
    const replies = this.message.replies;

    let leftHTML = '', lastStyle = '';
    if(replies.recent_repliers) {
      leftHTML += '<div class="replies-footer-avatars">'
      /**
       * MACOS, ANDROID - без реверса
       * WINDOWS DESKTOP - реверс
       * все приложения накладывают аватарку первую на вторую, а в макете зато вторая на первую, ЛОЛ!
       */
      let l: string[] = [];
      replies.recent_repliers/* .slice().reverse() */.forEach((peer, idx) => {
        lastStyle = idx == 0 ? '' : `style="transform: translateX(-${idx * 12}px);"`;
        l.push(`<avatar-element class="avatar-32" dialog="0" peer="${appPeersManager.getPeerId(peer)}" ${lastStyle}></avatar-element>`);
      });
      leftHTML += l.reverse().join('') + '</div>';
    } else {
      leftHTML = '<span class="tgico-comments"></span>';
    }

    let text: string;
    if(replies.replies) {
      text = replies.replies + ' ' + (replies.replies > 1 ? 'Comments' : 'Comment');
    } else {
      text = 'Leave a Comment';
    }

    const historyStorage = appMessagesManager.getHistoryStorage(-replies.channel_id);
    if(replies.read_max_id < replies.max_id && (!historyStorage.readMaxId || historyStorage.readMaxId < replies.max_id)) {
      this.classList.add('is-unread');
    }

    if(!this.updated) {
      appMessagesManager.subscribeRepliesThread(this.message.peerId, this.message.mid);
      appMessagesManager.updateMessage(this.message.peerId, this.message.mid, 'replies_updated');
      this.updated = true;
    }

    this.innerHTML = `${leftHTML}<span class="replies-footer-text" ${lastStyle}>${text}</span><span class="tgico-next"></span>`;

    const rippleContainer = document.createElement('div');
    this.append(rippleContainer);
    ripple(rippleContainer);
  }
}

customElements.define('replies-footer-element', RepliesFooterElement);