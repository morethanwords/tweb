/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, JSX} from 'solid-js';
import appMediaPlaybackController, {AppMediaPlaybackController} from '@components/appMediaPlaybackController';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import PeerTitle from '@components/peerTitle';
import {i18n} from '@lib/langPack';
import {formatFullSentTime} from '@helpers/date';
import {DocumentAttribute} from '@layer';
import MediaProgressLine from '@components/mediaProgressLine';
import VolumeSelector from '@components/volumeSelector';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {AppManagers} from '@lib/managers';
import getFwdFromName from '@appManagers/utils/messages/getFwdFromName';
import toHHMMSS from '@helpers/string/toHHMMSS';
import {PlaybackRateButton} from '@components/playbackRateButton';
import apiManagerProxy from '@lib/apiManagerProxy';
import {doubleRaf} from '@helpers/schedulers';
import ListenerSetter from '@helpers/listenerSetter';
import SetTransition from '@components/singleTransition';
import {ChatType} from './chatType';
import type {AppImManager} from '@lib/appImManager';
import findUpClassName from '@helpers/dom/findUpClassName';
import toggleDisability from '@helpers/dom/toggleDisability';
import appSidebarRight from '../sidebarRight';
import AppSavedMusicTab from '../sidebarRight/tabs/savedMusic';
import TopbarPlate, {createTopbarPlate} from '@components/chat/topbarPlate';
import Button from '@components/buttonTsx';
import documentFragmentToNodes from '@helpers/dom/documentFragmentToNodes';
import RippleElement from '@components/rippleElement';

export type ChatAudioController = {
  container: HTMLElement,
  destroy: () => void
};

export default function createChatAudio(
  appImManager: AppImManager,
  managers: AppManagers
): ChatAudioController {
  const listenerSetter = new ListenerSetter();
  let duration: number;

  // ───────────────────────── Reactive state ─────────────────────────

  const [title, setTitle] = createSignal<JSX.Element>();
  const [subtitle, setSubtitle] = createSignal<JSX.Element>();
  const [timeText, setTimeText] = createSignal('');
  const [playIcon, setPlayIcon] = createSignal<Icon>('play');
  const [repeatIcon, setRepeatIcon] = createSignal<Icon>('audio_repeat');

  // Refs to JSX-rendered buttons that need imperative classList toggles or
  // disability state changes after the initial render.
  let prevEl!: HTMLElement;
  let nextEl!: HTMLElement;
  let repeatEl!: HTMLElement;

  // ───────────────────────── Imperative widgets ─────────────────────────

  const playbackRateButton = PlaybackRateButton({direction: 'bottom-left'});

  const volumeSelector = new VolumeSelector({listenerSetter, vertical: true, useGlobalVolume: 'auto'});
  const volumeProgressLineContainer = document.createElement('div');
  volumeProgressLineContainer.classList.add('progress-line-container');
  volumeProgressLineContainer.append(volumeSelector.container);
  const tunnel = document.createElement('div');
  tunnel.classList.add('pinned-audio-volume-tunnel');
  volumeSelector.btn.classList.add('pinned-audio-volume', 'active');
  volumeSelector.btn.prepend(tunnel);
  volumeSelector.btn.append(volumeProgressLineContainer);

  const progressLine = new MediaProgressLine({
    withTransition: true,
    useTransform: true,
    onTimeUpdate: (t) => setTimeText(toHHMMSS(t, true))
  });
  progressLine.container.classList.add('pinned-audio-progress');

  // ───────────────────────── Plate ─────────────────────────

  // The audio plate uses its own visibility logic (`is-visible` + `body.is-pinned-audio-shown`)
  // wired below in `toggle()`. The default `hide` class would conflict with the SCSS
  // `:not(.is-visible) { display: none !important }` rule, so we keep the plate root unmarked.
  const plate = createTopbarPlate({
    modifier: 'audio',
    height: 48,
    initiallyHidden: false,
    render: () => (
      <>
        <TopbarPlate.Body>
          <Button.Icon
            ref={prevEl}
            icon="fast_rewind"
            class="active"
            noRipple
            onClick={(e) => { cancelEvent(e); appMediaPlaybackController.previous(); }}
          />
          <Button.Icon
            icon={playIcon()}
            class="active pinned-audio-ico"
            noRipple
            onClick={(e) => { cancelEvent(e); appMediaPlaybackController.toggle(); }}
          />
          <Button.Icon
            ref={nextEl}
            icon="fast_forward"
            class="active"
            noRipple
            onClick={(e) => { cancelEvent(e); appMediaPlaybackController.next(); }}
          />
          <TopbarPlate.Content class="hover-effect" ripple>
            <TopbarPlate.Title>{title()}</TopbarPlate.Title>
            <TopbarPlate.Subtitle>
              <span class="pinned-audio-time">{timeText()}</span>
              {' • '}
              {subtitle()}
            </TopbarPlate.Subtitle>
          </TopbarPlate.Content>
          <div class="pinned-container-wrapper-utils pinned-audio-wrapper-utils">
            {volumeSelector.btn}
            {playbackRateButton.element}
            <Button.Icon
              ref={repeatEl}
              icon={repeatIcon()}
              noRipple
              onClick={(e) => {
                cancelEvent(e);
                const params = appMediaPlaybackController.getPlaybackParams();
                if(!params.round) {
                  appMediaPlaybackController.round = true;
                } else if(params.loop) {
                  appMediaPlaybackController.round = false;
                  appMediaPlaybackController.loop = false;
                } else {
                  appMediaPlaybackController.loop = !appMediaPlaybackController.loop;
                }
              }}
            />
            <TopbarPlate.CloseButton
              onClick={() => appMediaPlaybackController.stop(undefined, true)}
            />
          </div>
        </TopbarPlate.Body>
        <div class="pinned-audio-progress-wrapper">
          {progressLine.container}
        </div>
      </>
    )
  });

  // Click on the plate (excluding progress, utils, btn-icon) → open the source chat /
  // saved music tab. Same filter list as the legacy ChatAudio container click.
  attachClickEvent(plate.container, (e) => {
    if(
      findUpClassName(e.target, 'progress-line') ||
      findUpClassName(e.target, 'pinned-container-wrapper-utils') ||
      findUpClassName(e.target, 'btn-icon')
    ) {
      return;
    }

    const mid = +plate.container.dataset.mid;
    const peerId = plate.container.dataset.peerId.toPeerId();
    const savedMusicDocId = plate.container.dataset.savedMusicDocId;
    if(savedMusicDocId) {
      const prevTab = appSidebarRight.getTab(AppSavedMusicTab);
      if(prevTab?.peerId === peerId) {
        appSidebarRight.toggleSidebar(true);
        return;
      }

      const tab = appSidebarRight.createTab(AppSavedMusicTab);
      tab.peerId = peerId;
      tab.open();
      appSidebarRight.toggleSidebar(true);
      if(prevTab) setTimeout(() => prevTab.close(), 300);
      return;
    }

    const searchContext = appMediaPlaybackController.getSearchContext();
    appImManager.setInnerPeer({
      peerId,
      lastMsgId: mid,
      type: searchContext.isScheduled ? ChatType.Scheduled : undefined,
      threadId: searchContext.threadId
    });
  }, {listenerSetter});

  // ───────────────────────── State / event handlers ─────────────────────────

  function toggle(hide?: boolean): void {
    const current = !plate.container.classList.contains('is-visible');
    if((hide ??= !current) === current) return;

    SetTransition({
      element: plate.container,
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

  const onPlaybackParams = (playbackParams: ReturnType<AppMediaPlaybackController['getPlaybackParams']>) => {
    playbackRateButton.setIcon();
    playbackRateButton.element.classList.toggle('active', playbackParams.playbackRate !== 1);
    setRepeatIcon(playbackParams.loop ? 'audio_repeat_single' : 'audio_repeat');
    repeatEl.classList.toggle('active', playbackParams.loop || playbackParams.round);
  };

  const onMediaPlay = ({doc, message, media, playbackParams, isSavedMusic}: ReturnType<AppMediaPlaybackController['getPlayingDetails']>) => {
    let titleVal: JSX.Element, subtitleVal: JSX.Element;
    const isMusic = doc.type !== 'voice' && doc.type !== 'round';
    if(!isMusic) {
      titleVal = new PeerTitle({peerId: message.fromId, fromName: getFwdFromName(message.fwd_from)}).element;
      subtitleVal = formatFullSentTime(message.date);
    } else {
      const audioAttribute = doc.attributes.find((attr) => attr._ === 'documentAttributeAudio') as DocumentAttribute.documentAttributeAudio;
      titleVal = wrapEmojiText(audioAttribute?.title ?? doc.file_name);
      subtitleVal = audioAttribute?.performer ? wrapEmojiText(audioAttribute.performer) : i18n('AudioUnknownArtist');
    }

    repeatEl.classList.toggle('hide', !isMusic);
    onPlaybackParams(playbackParams);
    volumeSelector.setMaxVolume(isMusic ? 1 : 2);
    volumeSelector.setGlobalVolume();

    progressLine.setMedia({media, duration: duration = doc.duration});
    toggleDisability([prevEl, nextEl], !message.peerId);

    plate.container.dataset.peerId = '' + message.peerId;
    plate.container.dataset.mid = '' + message.mid;
    if(isSavedMusic) {
      plate.container.dataset.savedMusicDocId = '' + doc.id;
    } else {
      delete plate.container.dataset.savedMusicDocId;
    }

    setTitle(titleVal);
    setSubtitle(subtitle instanceof DocumentFragment ? documentFragmentToNodes(subtitleVal as DocumentFragment) : subtitleVal);
    setPlayIcon(media.paused ? 'play' : 'pause');
    toggle(false);
  };

  const onPause = () => setPlayIcon('play');
  const onStop = () => toggle(true);

  const toggleActivity = (active: boolean) => {
    apiManagerProxy.invokeVoid('toggleUninteruptableActivity', {
      activity: 'PlayingMedia',
      active
    });
  };

  listenerSetter.add(appMediaPlaybackController)('play', () => toggleActivity(true));
  listenerSetter.add(appMediaPlaybackController)('pause', () => toggleActivity(false));
  listenerSetter.add(appMediaPlaybackController)('stop', () => toggleActivity(false));
  listenerSetter.add(appMediaPlaybackController)('play', onMediaPlay);
  listenerSetter.add(appMediaPlaybackController)('pause', onPause);
  listenerSetter.add(appMediaPlaybackController)('stop', onStop);
  listenerSetter.add(appMediaPlaybackController)('playbackParams', onPlaybackParams);

  const playingDetails = appMediaPlaybackController.getPlayingDetails();
  if(playingDetails) {
    onMediaPlay(playingDetails);
    onPlaybackParams(playingDetails.playbackParams);
  }

  return {
    container: plate.container,
    destroy: () => {
      progressLine?.removeListeners();
      listenerSetter.removeAll();
      plate.destroy();
    }
  };
}
