/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Message} from '../../layer';
import rootScope from '../../lib/rootScope';
import ripple from '../ripple';
import I18n from '../../lib/langPack';
import replaceContent from '../../helpers/dom/replaceContent';
import StackedAvatars from '../stackedAvatars';
import formatNumber from '../../helpers/number/formatNumber';
import {AppManagers} from '../../lib/appManagers/managers';
import getPeerId from '../../lib/appManagers/utils/peers/getPeerId';
import type LazyLoadQueue from '../lazyLoadQueue';
import {MiddlewareHelper} from '../../helpers/middleware';
import {_tgico} from '../../helpers/tgico';
import Icon from '../icon';

const TAG_NAME = 'replies-element';

rootScope.addEventListener('replies_updated', (message) => {
  (Array.from(document.querySelectorAll(TAG_NAME + `[data-post-key="${message.peerId}_${message.mid}"]`)) as RepliesElement[]).forEach((element) => {
    element.message = message;
    element.render();
  });
});

export default class RepliesElement extends HTMLElement {
  public message: Message.message;
  public type: 'footer' | 'beside';
  public loadPromises: Promise<any>[];
  public lazyLoadQueue: LazyLoadQueue;
  public stackedAvatars: StackedAvatars;
  public text: I18n.IntlElement;
  public managers: AppManagers;
  public middlewareHelper: MiddlewareHelper;

  private updated = false;

  constructor() {
    super();
    this.managers = rootScope.managers;
  }

  public init() {
    this.render();
    this.dataset.postKey = this.message.peerId + '_' + this.message.mid;
    this.classList.add('replies', 'replies-' + this.type);
  }

  public render() {
    const replies = this.message.replies;

    if(this.type === 'footer') {
      let leftPart: HTMLElement;
      if(this.firstElementChild) {
        leftPart = this.firstElementChild as HTMLElement;
      }

      if(replies?.recent_repliers) {
        if(leftPart && !leftPart.classList.contains('replies-footer-avatars')) {
          this.replaceChildren();
          leftPart = null;
        }

        if(!this.stackedAvatars) {
          this.stackedAvatars = new StackedAvatars({
            lazyLoadQueue: this.lazyLoadQueue,
            avatarSize: 30,
            middleware: this.middlewareHelper.get()
          });

          this.stackedAvatars.container.classList.add('replies-footer-avatars');
        }

        leftPart = this.stackedAvatars.container;

        this.stackedAvatars.render(replies.recent_repliers.map((peer) => getPeerId(peer)), this.loadPromises);
      } else {
        if(leftPart && !leftPart.classList.contains(_tgico('comments'))) {
          leftPart.remove();
          leftPart = null;
        }

        if(!leftPart) {
          leftPart = Icon('comments', 'replies-footer-icon', 'replies-footer-icon-comments');
        }
      }

      if(!leftPart.parentElement) {
        this.prepend(leftPart);
      }

      if(!this.text) {
        this.text = new I18n.IntlElement();
      }

      const text = this.text;
      if(replies) {
        if(replies.replies) {
          text.compareAndUpdate({key: 'Comments', args: [replies.replies]});
        } else {
          text.compareAndUpdate({key: 'LeaveAComment'});
        }
      } else {
        text.compareAndUpdate({key: 'ViewInChat'});
      }

      if(replies) {
        // const historyStorage = appMessagesManager.getHistoryStorage(replies.channel_id.toPeerId(true));
        let isUnread = false;
        if(replies.replies) {
          if(replies.read_max_id !== undefined && replies.max_id !== undefined) {
            isUnread = replies.read_max_id < replies.max_id;
          }/*  else {
            isUnread = !historyStorage.readMaxId || historyStorage.readMaxId < (replies.max_id || 0);
          } */
        }
        this.classList.toggle('is-unread', isUnread);
      }

      let textSpan = this.children[1] as HTMLElement;
      if(!textSpan) {
        textSpan = document.createElement('span');
        textSpan.classList.add('replies-footer-text');

        const iconSpan = Icon('next', 'replies-footer-icon', 'replies-footer-icon-next');

        const rippleContainer = document.createElement('div');
        ripple(rippleContainer);

        this.append(textSpan, iconSpan, rippleContainer);
      }

      replaceContent(textSpan, text.element);
    } else {
      this.classList.add('bubble-beside-button');
      this.innerHTML = `<span class="replies-beside-text">${replies?.replies ? formatNumber(replies.replies, 0) : ''}</span>`;
      this.prepend(Icon('commentssticker'));
    }

    if(replies && !this.updated && !this.message.pFlags.is_outgoing) {
      this.managers.appMessagesManager.subscribeRepliesThread(this.message.peerId, this.message.mid);
      this.managers.appMessagesManager.updateMessage(this.message.peerId, this.message.mid, 'replies_updated');
      this.updated = true;
    }

    if(this.loadPromises) {
      this.loadPromises = undefined;
    }
  }
}

customElements.define(TAG_NAME, RepliesElement);
