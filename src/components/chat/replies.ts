import { formatNumber } from "../../helpers/number";
import { Message } from "../../layer";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import rootScope from "../../lib/rootScope";
import { ripple } from "../ripple";

rootScope.on('replies_updated', (e) => {
  const message = e.detail;
  (Array.from(document.querySelectorAll(`replies-footer-element[data-post-key="${message.peerId}_${message.mid}"]`)) as RepliesElement[]).forEach(element => {
    element.message = message;
    element.render();
  });
});

export default class RepliesElement extends HTMLElement {
  public message: Message.message;
  public type: 'footer' | 'beside';
  
  private updated = false;

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
    this.dataset.postKey = this.message.peerId + '_' + this.message.mid;
    this.classList.add('replies', 'replies-' + this.type);
  }

  public render() {
    const replies = this.message.replies;

    if(this.type === 'footer') {
      let leftHTML = '', lastStyle = '';
      if(replies.recent_repliers) {
        leftHTML += '<div class="replies-footer-avatars">'
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
  
      this.innerHTML = `${leftHTML}<span class="replies-footer-text" ${lastStyle}>${text}</span><span class="tgico-next"></span>`;

      const rippleContainer = document.createElement('div');
      this.append(rippleContainer);
      ripple(rippleContainer);
    } else {
      this.classList.add('bubble-beside-button');
      this.innerHTML = `<span class="tgico-commentssticker"></span><span class="replies-beside-text">${replies.replies ? formatNumber(replies.replies, 0) : ''}</span>`;
    }

    if(!this.updated) {
      appMessagesManager.subscribeRepliesThread(this.message.peerId, this.message.mid);
      appMessagesManager.updateMessage(this.message.peerId, this.message.mid, 'replies_updated');
      this.updated = true;
    }
  }
}

customElements.define('replies-element', RepliesElement);