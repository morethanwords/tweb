/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { AppMessagesManager } from "../../lib/appManagers/appMessagesManager";
import type ChatTopbar from "./topbar";
import rootScope from "../../lib/rootScope";
import appMediaPlaybackController from "../appMediaPlaybackController";
import DivAndCaption from "../divAndCaption";
import PinnedContainer from "./pinnedContainer";
import Chat from "./chat";
import { cancelEvent } from "../../helpers/dom/cancelEvent";
import { attachClickEvent } from "../../helpers/dom/clickEvent";
import replaceContent from "../../helpers/dom/replaceContent";
import PeerTitle from "../peerTitle";
import { i18n } from "../../lib/langPack";
import { formatFullSentTime } from "../../helpers/date";
import { MediaProgressLine, VolumeSelector } from "../../lib/mediaPlayer";
import ButtonIcon from "../buttonIcon";

export default class ChatAudio extends PinnedContainer {
  private toggleEl: HTMLElement;
  private progressLine: MediaProgressLine;
  private volumeSelector: VolumeSelector;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected appMessagesManager: AppMessagesManager) {
    super({
      topbar, 
      chat, 
      listenerSetter: topbar.listenerSetter, 
      className: 'audio', 
      divAndCaption: new DivAndCaption(
        'pinned-audio', 
        (title: string | HTMLElement | DocumentFragment, subtitle: string | HTMLElement | DocumentFragment) => {
          replaceContent(this.divAndCaption.title, title);
          replaceContent(this.divAndCaption.subtitle, subtitle);
        }
      ), 
      onClose: () => {
        appMediaPlaybackController.stop();
      },
      floating: true
    });

    this.divAndCaption.border.remove();

    const prevEl = ButtonIcon('fast_rewind active', {noRipple: true});
    const nextEl = ButtonIcon('fast_forward active', {noRipple: true});

    const attachClick = (elem: HTMLElement, callback: () => void) => {
      attachClickEvent(elem, (e) => {
        cancelEvent(e);
        callback();
      }, {listenerSetter: this.topbar.listenerSetter});
    };

    attachClick(prevEl, () => {
      appMediaPlaybackController.previous();
    });

    attachClick(nextEl, () => {
      appMediaPlaybackController.next();
    });

    this.toggleEl = ButtonIcon('', {noRipple: true});
    this.toggleEl.classList.add('active', 'pinned-audio-ico', 'tgico');
    attachClick(this.toggleEl, () => {
      appMediaPlaybackController.toggle();
    });
    this.wrapper.prepend(this.wrapper.firstElementChild, prevEl, this.toggleEl, nextEl);

    this.volumeSelector = new VolumeSelector(this.listenerSetter, true);
    const volumeProgressLineContainer = document.createElement('div');
    volumeProgressLineContainer.classList.add('progress-line-container');
    volumeProgressLineContainer.append(this.volumeSelector.container);
    const tunnel = document.createElement('div');
    tunnel.classList.add('pinned-audio-volume-tunnel');
    this.volumeSelector.btn.classList.add('pinned-audio-volume', 'active');
    this.volumeSelector.btn.prepend(tunnel);
    this.volumeSelector.btn.append(volumeProgressLineContainer);
    this.wrapperUtils.prepend(this.volumeSelector.btn);

    const progressWrapper = document.createElement('div');
    progressWrapper.classList.add('pinned-audio-progress-wrapper');

    this.progressLine = new MediaProgressLine(undefined, undefined, true, true);
    this.progressLine.container.classList.add('pinned-audio-progress');
    progressWrapper.append(this.progressLine.container);
    this.wrapper.insertBefore(progressWrapper, this.wrapperUtils);

    this.topbar.listenerSetter.add(rootScope)('media_play', ({doc, message, media}) => {
      let title: string | HTMLElement, subtitle: string | HTMLElement | DocumentFragment;
      if(doc.type === 'voice' || doc.type === 'round') {
        title = new PeerTitle({peerId: message.fromId}).element;

        //subtitle = 'Voice message';
        subtitle = formatFullSentTime(message.date);
      } else {
        title = doc.audioTitle || doc.fileName;
        subtitle = doc.audioPerformer || i18n('AudioUnknownArtist');
      }

      this.progressLine.setMedia(media);

      this.fill(title, subtitle, message);
      this.toggleEl.classList.add('flip-icon');
      this.toggle(false);
    });

    this.topbar.listenerSetter.add(rootScope)('media_pause', () => {
      this.toggleEl.classList.remove('flip-icon');
    });

    this.topbar.listenerSetter.add(rootScope)('media_stop', () => {
      this.toggle(true);
    });
  }
}
