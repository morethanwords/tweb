import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import rootScope from "../../lib/rootScope";
import { cancelEvent } from "../../helpers/dom";
import appMediaPlaybackController from "../appMediaPlaybackController";
import DivAndCaption from "../divAndCaption";
import { formatDate } from "../wrappers";
import PinnedContainer from "./pinnedContainer";

export class ChatAudio extends PinnedContainer {
  private toggleEl: HTMLElement;

  constructor() {
    super('audio', new DivAndCaption('pinned-audio', (title: string, subtitle: string) => {
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
    this.toggleEl.addEventListener('click', (e) => {
      cancelEvent(e);
      appMediaPlaybackController.toggle();
    });

    this.wrapper.prepend(this.toggleEl);

    rootScope.on('audio_play', (e) => {
      const {doc, mid} = e.detail;

      let title: string, subtitle: string;
      const message = appMessagesManager.getMessage(mid);
      if(doc.type == 'voice' || doc.type == 'round') {
        title = appPeersManager.getPeerTitle(message.fromID, false, true);
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

    rootScope.on('audio_pause', () => {
      this.toggleEl.classList.remove('flip-icon');
    });
  }
}