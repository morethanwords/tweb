import appImManager from "../../lib/appManagers/appImManager";
import appMessagesManager from "../../lib/appManagers/appMessagesManager";
import appPeersManager from "../../lib/appManagers/appPeersManager";
import { RichTextProcessor } from "../../lib/richtextprocessor";
import { cancelEvent, $rootScope } from "../../lib/utils";
import appMediaPlaybackController from "../appMediaPlaybackController";
import { formatDate } from "../wrappers";

export class ChatAudio {
  public container: HTMLElement;
  private toggle: HTMLElement;
  private title: HTMLElement;
  private subtitle: HTMLElement;
  private close: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.classList.add('pinned-audio', 'pinned-container');
    this.container.style.display = 'none';

    this.toggle = document.createElement('div');
    this.toggle.classList.add('pinned-audio-ico', 'tgico');
    
    this.title = document.createElement('div');
    this.title.classList.add('pinned-audio-title');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('pinned-audio-subtitle');

    this.close = document.createElement('button');
    this.close.classList.add('pinned-audio-close', 'btn-icon', 'tgico-close');

    this.container.append(this.toggle, this.title, this.subtitle, this.close);

    this.close.addEventListener('click', (e) => {
      cancelEvent(e);
      this.container.style.display = 'none';
      this.container.parentElement.classList.remove('is-audio-shown');
      if(this.toggle.classList.contains('flip-icon')) {
        appMediaPlaybackController.toggle();
      }
    });

    this.toggle.addEventListener('click', (e) => {
      cancelEvent(e);
      appMediaPlaybackController.toggle();
    });

    $rootScope.$on('audio_play', (e: CustomEvent) => {
      const {doc, mid} = e.detail;

      let title: string, subtitle: string;
      if(doc.type == 'voice' || doc.type == 'round') {
        const message = appMessagesManager.getMessage(mid);
        title = appPeersManager.getPeerTitle(message.fromID, false, true);
        //subtitle = 'Voice message';
        subtitle = formatDate(message.date, false, false);
      } else {
        title = doc.audioTitle || doc.file_name;
        subtitle = doc.audioPerformer ? RichTextProcessor.wrapPlainText(doc.audioPerformer) : 'Unknown Artist';
      }

      this.title.innerHTML = title;
      this.subtitle.innerHTML = subtitle;
      this.toggle.classList.add('flip-icon');
      
      this.container.dataset.mid = '' + mid;
      if(this.container.style.display) {
        const scrollTop = appImManager.scrollable.scrollTop;
        this.container.style.display = '';
        this.container.parentElement.classList.add('is-audio-shown');
        appImManager.scrollable.scrollTop = scrollTop;
      }
    });

    $rootScope.$on('audio_pause', () => {
      this.toggle.classList.remove('flip-icon');
    });
  }
}