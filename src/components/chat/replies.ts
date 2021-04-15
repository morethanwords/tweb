/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { formatNumber } from "../../helpers/number";
import { Message } from "../../layer";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import rootScope from "../../lib/rootScope";
import { ripple } from "../ripple";
import AvatarElement from "../avatar";

const TAG_NAME = 'replies-element';

rootScope.on('replies_updated', (e) => {
  const message = e;
  (Array.from(document.querySelectorAll(TAG_NAME + `[data-post-key="${message.peerId}_${message.mid}"]`)) as RepliesElement[]).forEach(element => {
    element.message = message;
    element.render();
  });
});

export default class RepliesElement extends HTMLElement {
  public message: Message.message;
  public type: 'footer' | 'beside';
  public loadPromises: Promise<any>[];
  
  private updated = false;

  constructor() {
    super();
  }

  public init() {
    this.render();
    this.dataset.postKey = this.message.peerId + '_' + this.message.mid;
    this.classList.add('replies', 'replies-' + this.type);
  }

  public render() {
    const replies = this.message.replies;

    /* if(this.firstChild) {
      this.innerHTML = '';
    } */

    if(this.type === 'footer') {
      let leftPart: HTMLElement;
      if(this.firstElementChild) {
        leftPart = this.firstElementChild as HTMLElement;
      }

      if(replies?.recent_repliers) {
        if(leftPart && !leftPart.classList.contains('replies-footer-avatars')) {
          this.innerHTML = '';
          leftPart = null;
        }

        if(!leftPart) {
          leftPart = document.createElement('div');
          leftPart.classList.add('replies-footer-avatars');
        }

        replies.recent_repliers.slice().reverse().forEach((peer, idx) => {
          let avatarElem = leftPart.children[idx] as AvatarElement;
          if(!avatarElem) {
            avatarElem = new AvatarElement();
            avatarElem.setAttribute('dialog', '0');
            avatarElem.classList.add('avatar-30');
            
            if(this.loadPromises) {
              avatarElem.loadPromises = this.loadPromises;
            }
          }
          
          avatarElem.setAttribute('peer', '' + appPeersManager.getPeerId(peer));
          
          if(!avatarElem.parentNode) {
            leftPart.append(avatarElem);
          }
        });

        // if were 3 and became 2
        (Array.from(leftPart.children) as HTMLElement[]).slice(replies.recent_repliers.length).forEach(el => el.remove());
      } else {
        if(leftPart && !leftPart.classList.contains('tgico-comments')) {
          leftPart.remove();
          leftPart = null;
        }

        if(!leftPart) {
          leftPart = document.createElement('span');
          leftPart.classList.add('tgico-comments');
        }
      }

      if(!leftPart.parentElement) {
        this.append(leftPart);
      }
  
      let text: string;
      if(replies) {
        if(replies.replies) {
          text = replies.replies + ' ' + (replies.replies > 1 ? 'Comments' : 'Comment');
        } else {
          text = 'Leave a Comment';
        }
      } else {
        text = 'View in chat';
      }

      if(replies) {
        const historyStorage = appMessagesManager.getHistoryStorage(-replies.channel_id);
        this.classList.toggle('is-unread', replies.read_max_id < replies.max_id && (!historyStorage.readMaxId || historyStorage.readMaxId < replies.max_id));
      }

      let textSpan = this.children[1] as HTMLElement;
      if(!textSpan) {
        textSpan = document.createElement('span');
        textSpan.classList.add('replies-footer-text');

        const iconSpan = document.createElement('span');
        iconSpan.classList.add('tgico-next');

        const rippleContainer = document.createElement('div');
        ripple(rippleContainer);

        this.append(textSpan, iconSpan, rippleContainer);
      }

      textSpan.innerHTML = text;
    } else {
      this.classList.add('bubble-beside-button');
      this.innerHTML = `<span class="tgico-commentssticker"></span><span class="replies-beside-text">${replies?.replies ? formatNumber(replies.replies, 0) : ''}</span>`;
    }

    if(replies && !this.updated && !this.message.pFlags.is_outgoing) {
      appMessagesManager.subscribeRepliesThread(this.message.peerId, this.message.mid);
      appMessagesManager.updateMessage(this.message.peerId, this.message.mid, 'replies_updated');
      this.updated = true;
    }

    if(this.loadPromises) {
      this.loadPromises = undefined;
    }
  }
}

customElements.define(TAG_NAME, RepliesElement);
