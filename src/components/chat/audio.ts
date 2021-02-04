import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type { AppPeersManager } from "../../lib/appManagers/appPeersManager";
import type ChatTopbar from "./topbar";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import rootScope from "../../lib/rootScope";
import { attachClickEvent, cancelEvent } from "../../helpers/dom";
import appMediaPlaybackController from "../appMediaPlaybackController";
import DivAndCaption from "../divAndCaption";
import { formatDate } from "../wrappers";
import PinnedContainer from "./pinnedContainer";
import Chat from "./chat";

export default class ChatAudio extends PinnedContainer {
  private toggleEl: HTMLElement;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected appMessagesManager: AppMessagesManager, protected appPeersManager: AppPeersManager) {
    super(topbar, chat, topbar.listenerSetter, 'audio', new DivAndCaption('pinned-audio', (title: string, subtitle: string) => {
      this.divAndCaption.title.innerHTML = title;
      this.divAndCaption.subtitle.innerHTML = subtitle;
    }), () => {
      if(this.toggleEl.classList.contains('flip-icon')) {
        appMediaPlaybackController.toggle();
      }
    });

    this.divAndCaption.border.remove();

    this.toggleEl = document.createElement('button');
    this.toggleEl.classList.add('pinned-audio-ico', 'tgico', 'btn-icon');
    attachClickEvent(this.toggleEl, (e) => {
      cancelEvent(e);
      appMediaPlaybackController.toggle();
    }, {listenerSetter: this.topbar.listenerSetter});

    this.wrapper.prepend(this.toggleEl);

    this.topbar.listenerSetter.add(rootScope, 'audio_play', (e) => {
      const {doc, mid, peerId} = e;

      let title: string, subtitle: string;
      const message = appMessagesManager.getMessageByPeer(peerId, mid);
      if(doc.type === 'voice' || doc.type === 'round') {
        title = appPeersManager.getPeerTitle(message.fromId, false, true);
        //subtitle = 'Voice message';
        subtitle = formatDate(message.date, false, false);
      } else {
        title = doc.audioTitle || doc.file_name;
        subtitle = doc.audioPerformer ? RichTextProcessor.wrapPlainText(doc.audioPerformer) : 'Unknown Artist';
      }

      this.fill(title, subtitle, message);
      this.toggleEl.classList.add('flip-icon');
      this.toggle(false);
    });

    this.topbar.listenerSetter.add(rootScope, 'audio_pause', () => {
      this.toggleEl.classList.remove('flip-icon');
    });
  }
}