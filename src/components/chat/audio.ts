/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatTopbar from './topbar';
import appMediaPlaybackController, {AppMediaPlaybackController} from '../appMediaPlaybackController';
import DivAndCaption from '../divAndCaption';
import PinnedContainer from './pinnedContainer';
import Chat from './chat';
import cancelEvent from '../../helpers/dom/cancelEvent';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import replaceContent from '../../helpers/dom/replaceContent';
import PeerTitle from '../peerTitle';
import {i18n} from '../../lib/langPack';
import {formatFullSentTime} from '../../helpers/date';
import ButtonIcon from '../buttonIcon';
import {DocumentAttribute} from '../../layer';
import MediaProgressLine from '../mediaProgressLine';
import VolumeSelector from '../volumeSelector';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';
import {AppManagers} from '../../lib/appManagers/managers';

export default class ChatAudio extends PinnedContainer {
  private toggleEl: HTMLElement;
  private progressLine: MediaProgressLine;
  private volumeSelector: VolumeSelector;
  private fasterEl: HTMLElement;
  private repeatEl: HTMLButtonElement;

  constructor(protected topbar: ChatTopbar, protected chat: Chat, protected managers: AppManagers) {
    super({
      topbar,
      chat,
      listenerSetter: topbar.listenerSetter,
      className: 'audio',
      divAndCaption: new DivAndCaption(
        'pinned-audio',
        (options) => {
          replaceContent(this.divAndCaption.title, options.title);
          replaceContent(this.divAndCaption.subtitle, options.subtitle);
        }
      ),
      onClose: () => {
        appMediaPlaybackController.stop(undefined, true);
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

    this.repeatEl = ButtonIcon('audio_repeat', {noRipple: true});
    attachClick(this.repeatEl, () => {
      const params = appMediaPlaybackController.getPlaybackParams();
      if(!params.round) {
        appMediaPlaybackController.round = true;
      } else if(params.loop) {
        appMediaPlaybackController.round = false;
        appMediaPlaybackController.loop = false;
      } else {
        appMediaPlaybackController.loop = !appMediaPlaybackController.loop;
      }
    });

    const fasterEl = this.fasterEl = ButtonIcon('playback_2x', {noRipple: true});
    attachClick(fasterEl, () => {
      appMediaPlaybackController.playbackRate = fasterEl.classList.contains('active') ? 1 : 1.75;
    });

    this.wrapperUtils.prepend(this.volumeSelector.btn, fasterEl, this.repeatEl);

    const progressWrapper = document.createElement('div');
    progressWrapper.classList.add('pinned-audio-progress-wrapper');

    this.progressLine = new MediaProgressLine({
      withTransition: true,
      useTransform: true
    });
    this.progressLine.container.classList.add('pinned-audio-progress');
    progressWrapper.append(this.progressLine.container);
    this.wrapper.insertBefore(progressWrapper, this.wrapperUtils);

    this.topbar.listenerSetter.add(appMediaPlaybackController)('play', this.onMediaPlay);
    this.topbar.listenerSetter.add(appMediaPlaybackController)('pause', this.onPause);
    this.topbar.listenerSetter.add(appMediaPlaybackController)('stop', this.onStop);
    this.topbar.listenerSetter.add(appMediaPlaybackController)('playbackParams', this.onPlaybackParams);

    const playingDetails = appMediaPlaybackController.getPlayingDetails();
    if(playingDetails) {
      this.onMediaPlay(playingDetails);
      this.onPlaybackParams(playingDetails.playbackParams);
    }
  }

  public destroy() {
    if(this.progressLine) {
      this.progressLine.removeListeners();
    }
  }

  private onPlaybackParams = (playbackParams: ReturnType<AppMediaPlaybackController['getPlaybackParams']>) => {
    this.fasterEl.classList.toggle('active', playbackParams.playbackRate > 1);

    this.repeatEl.classList.remove('tgico-audio_repeat', 'tgico-audio_repeat_single');
    this.repeatEl.classList.add(playbackParams.loop ? 'tgico-audio_repeat_single' : 'tgico-audio_repeat');
    this.repeatEl.classList.toggle('active', playbackParams.loop || playbackParams.round);
  };

  private onPause = () => {
    this.toggleEl.classList.remove('flip-icon');
  };

  private onStop = () => {
    this.toggle(true);
  };

  private onMediaPlay = ({doc, message, media, playbackParams}: ReturnType<AppMediaPlaybackController['getPlayingDetails']>) => {
    let title: string | HTMLElement | DocumentFragment, subtitle: string | HTMLElement | DocumentFragment;
    const isMusic = doc.type !== 'voice' && doc.type !== 'round';
    if(!isMusic) {
      title = new PeerTitle({peerId: message.fromId, fromName: message.fwd_from?.from_name}).element;

      // subtitle = 'Voice message';
      subtitle = formatFullSentTime(message.date);
    } else {
      const audioAttribute = doc.attributes.find((attr) => attr._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio;
      title = wrapEmojiText(audioAttribute?.title ?? doc.file_name);
      subtitle = audioAttribute?.performer ? wrapEmojiText(audioAttribute.performer) : i18n('AudioUnknownArtist');
    }

    this.fasterEl.classList.toggle('hide', isMusic);
    this.repeatEl.classList.toggle('hide', !isMusic);

    this.onPlaybackParams(playbackParams);
    this.volumeSelector.setVolume();

    this.progressLine.setMedia({
      media,
      duration: doc.duration
    });

    this.fill({
      title,
      subtitle,
      message
    });
    // this.toggleEl.classList.add('flip-icon');
    this.toggleEl.classList.toggle('flip-icon', !media.paused);
    this.toggle(false);
  };
}
