/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appMediaPlaybackController, {AppMediaPlaybackController} from '../appMediaPlaybackController';
import DivAndCaption from '../divAndCaption';
import PinnedContainer from './pinnedContainer';
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
import Icon from '../icon';
import {replaceButtonIcon} from '../button';
import getFwdFromName from '../../lib/appManagers/utils/messages/getFwdFromName';
import toHHMMSS from '../../helpers/string/toHHMMSS';
import {PlaybackRateButton} from '../../components/playbackRateButton';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {doubleRaf} from '../../helpers/schedulers';
import ListenerSetter from '../../helpers/listenerSetter';
import SetTransition from '../singleTransition';
import {ChatType} from './chat';
import type {AppImManager} from '../../lib/appManagers/appImManager';
import findUpClassName from '../../helpers/dom/findUpClassName';

export default class ChatAudio extends PinnedContainer {
  private toggleEl: HTMLElement;
  private progressLine: MediaProgressLine;
  private volumeSelector: VolumeSelector;
  private playbackRateButton: ReturnType<typeof PlaybackRateButton>;
  private repeatEl: HTMLButtonElement;
  private time: HTMLElement;
  private duration: number;

  constructor(protected appImManager: AppImManager, protected managers: AppManagers) {
    super({
      topbar: undefined,
      chat: undefined,
      listenerSetter: new ListenerSetter(),
      className: 'audio',
      divAndCaption: new DivAndCaption(
        'pinned-audio',
        (options) => {
          replaceContent(this.divAndCaption.title, options.title);
          this.divAndCaption.subtitle.replaceChildren(
            this.time,
            ' • ',
            options.subtitle
          );
        }
      ),
      onClose: () => {
        appMediaPlaybackController.stop(undefined, true);
      },
      floating: true,
      height: 52
    });

    this.divAndCaption.border.remove();

    const prevEl = ButtonIcon('fast_rewind active', {noRipple: true});
    const nextEl = ButtonIcon('fast_forward active', {noRipple: true});

    this.time = document.createElement('span');
    this.time.classList.add('pinned-audio-time');

    const attachClick = (elem: HTMLElement, callback: (e: MouseEvent) => void) => {
      attachClickEvent(elem, (e) => {
        cancelEvent(e);
        callback(e);
      }, {listenerSetter: this.listenerSetter});
    };

    attachClick(prevEl, () => {
      appMediaPlaybackController.previous();
    });

    attachClick(nextEl, () => {
      appMediaPlaybackController.next();
    });

    attachClick(this.container, (e) => {
      if(
        findUpClassName(e.target, 'progress-line') ||
        findUpClassName(e.target, 'pinned-container-wrapper-utils') ||
        findUpClassName(e.target, 'btn-icon')
      ) {
        return;
      }

      const mid = +this.container.dataset.mid;
      const peerId = this.container.dataset.peerId.toPeerId();
      const searchContext = appMediaPlaybackController.getSearchContext();
      this.appImManager.setInnerPeer({
        peerId,
        lastMsgId: mid,
        type: searchContext.isScheduled ? ChatType.Scheduled : undefined,
        threadId: searchContext.threadId
      });
    });

    this.toggleEl = ButtonIcon('', {noRipple: true});
    this.toggleEl.classList.add('active', 'pinned-audio-ico');
    attachClick(this.toggleEl, () => {
      appMediaPlaybackController.toggle();
    });
    this.wrapper.prepend(this.wrapper.firstElementChild, prevEl, this.toggleEl, nextEl);

    this.volumeSelector = new VolumeSelector({listenerSetter: this.listenerSetter, vertical: true, useGlobalVolume: 'auto'});
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

    this.playbackRateButton = PlaybackRateButton({direction: 'bottom-left'});

    this.wrapperUtils.prepend(this.volumeSelector.btn, this.playbackRateButton.element, this.repeatEl);

    const progressWrapper = document.createElement('div');
    progressWrapper.classList.add('pinned-audio-progress-wrapper');

    this.progressLine = new MediaProgressLine({
      withTransition: true,
      useTransform: true,
      onTimeUpdate: (time) => {
        this.time.textContent = toHHMMSS(time, true)/*  + ' / ' + toHHMMSS(this.duration, true) */;
      }
    });
    this.progressLine.container.classList.add('pinned-audio-progress');
    progressWrapper.append(this.progressLine.container);
    this.wrapper.insertBefore(progressWrapper, this.wrapperUtils);

    const toggleActivity = (active: boolean) => {
      apiManagerProxy.invokeVoid('toggleUninteruptableActivity', {
        activity: 'PlayingMedia',
        active
      });
    };

    this.listenerSetter.add(appMediaPlaybackController)('play', () => {
      toggleActivity(true);
    });

    this.listenerSetter.add(appMediaPlaybackController)('pause', () => {
      toggleActivity(false);
    });
    this.listenerSetter.add(appMediaPlaybackController)('stop', () => {
      toggleActivity(false);
    });

    this.listenerSetter.add(appMediaPlaybackController)('play', this.onMediaPlay);
    this.listenerSetter.add(appMediaPlaybackController)('pause', this.onPause);
    this.listenerSetter.add(appMediaPlaybackController)('stop', this.onStop);
    this.listenerSetter.add(appMediaPlaybackController)('playbackParams', this.onPlaybackParams);

    const playingDetails = appMediaPlaybackController.getPlayingDetails();
    if(playingDetails) {
      this.onMediaPlay(playingDetails);
      this.onPlaybackParams(playingDetails.playbackParams);
    }

    this.container.classList.add('is-floating');
    this.container.classList.remove('hide');
  }

  public toggle(hide?: boolean): void {
    const current = !this.container.classList.contains('is-visible');
    if((hide ??= !current) === current) return;

    SetTransition({
      element: this.container,
      duration: 250,
      className: 'is-visible',
      forwards: !hide,
      onTransitionStart: () => {
        doubleRaf().then(() => {
          document.body.classList.toggle('is-pinned-audio-shown', !hide);
        });
      }
    });
  }

  public destroy() {
    super.destroy();
    this.progressLine?.removeListeners();
  }

  private onPlaybackParams = (playbackParams: ReturnType<AppMediaPlaybackController['getPlaybackParams']>) => {
    this.playbackRateButton.setIcon();
    this.playbackRateButton.element.classList.toggle('active', playbackParams.playbackRate !== 1);

    this.repeatEl.querySelector('.button-icon').replaceWith(Icon(playbackParams.loop ? 'audio_repeat_single' : 'audio_repeat', 'button-icon'));
    this.repeatEl.classList.toggle('active', playbackParams.loop || playbackParams.round);
  };

  private setPlayIcon(paused: boolean) {
    replaceButtonIcon(this.toggleEl, paused ? 'play' : 'pause');
  }

  private onPause = () => {
    this.setPlayIcon(true);
  };

  private onStop = () => {
    this.toggle(true);
  };

  private onMediaPlay = ({doc, message, media, playbackParams}: ReturnType<AppMediaPlaybackController['getPlayingDetails']>) => {
    let title: string | HTMLElement | DocumentFragment, subtitle: string | HTMLElement | DocumentFragment;
    const isMusic = doc.type !== 'voice' && doc.type !== 'round';
    if(!isMusic) {
      title = new PeerTitle({peerId: message.fromId, fromName: getFwdFromName(message.fwd_from)}).element;

      // subtitle = 'Voice message';
      subtitle = formatFullSentTime(message.date);
    } else {
      const audioAttribute = doc.attributes.find((attr) => attr._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio;
      title = wrapEmojiText(audioAttribute?.title ?? doc.file_name);
      subtitle = audioAttribute?.performer ? wrapEmojiText(audioAttribute.performer) : i18n('AudioUnknownArtist');
    }

    // this.fasterEl.classList.toggle('hide', isMusic);
    this.repeatEl.classList.toggle('hide', !isMusic);

    this.onPlaybackParams(playbackParams);
    this.volumeSelector.setGlobalVolume();

    this.progressLine.setMedia({
      media,
      duration: this.duration = doc.duration
    });

    this.fill({
      title,
      subtitle,
      message
    });
    this.setPlayIcon(media.paused);
    this.toggle(false);
  };
}
