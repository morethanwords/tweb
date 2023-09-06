/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import findUpClassName from '../helpers/dom/findUpClassName';
import ListenerSetter from '../helpers/listenerSetter';
import {_tgico} from '../helpers/tgico';
import appMediaPlaybackController from './appMediaPlaybackController';
import {replaceButtonIcon} from './button';
import RangeSelector from './rangeSelector';

const className = 'player-volume';

export default class VolumeSelector extends RangeSelector {
  private static ICONS: Icon[] = ['volume_off', 'volume_mute', 'volume_down', 'volume_up'];
  public btn: HTMLElement;
  protected icon: HTMLSpanElement;

  constructor(protected listenerSetter: ListenerSetter, protected vertical = false) {
    super({
      step: 0.01,
      min: 0,
      max: 1,
      vertical
    }, 1);

    this.setListeners();
    this.setHandlers({
      onScrub: currentTime => {
        const value = Math.max(Math.min(currentTime, 1), 0);

        // console.log('volume scrub:', currentTime, value);

        appMediaPlaybackController.muted = false;
        appMediaPlaybackController.volume = value;
      }

      /* onMouseUp: (e) => {
        cancelEvent(e.event);
      } */
    });

    const btn = this.btn = document.createElement('div');
    btn.classList.add('btn-icon', className);

    attachClickEvent(btn, (e) => {
      if(!findUpClassName(e.target, className + '__icon')) {
        return;
      }

      this.onMuteClick(e);
    }, {listenerSetter: this.listenerSetter});
    this.listenerSetter.add(appMediaPlaybackController)('playbackParams', this.setVolume);

    this.setVolume();
    btn.append(this.container);
  }

  private onMuteClick = (e?: Event) => {
    e && cancelEvent(e);
    appMediaPlaybackController.muted = !appMediaPlaybackController.muted;
  };

  public setVolume = () => {
    // const volume = video.volume;
    const {volume, muted} = appMediaPlaybackController;
    let d: string;
    let iconIndex: number;
    if(!volume || muted) {
      iconIndex = 0;
    } else if(volume > .5) {
      iconIndex = 3;
    } else if(volume > 0 && volume < .25) {
      iconIndex = 1;
    } else {
      iconIndex = 2;
    }

    const newIcon = replaceButtonIcon(this.btn, VolumeSelector.ICONS[iconIndex]);
    newIcon.classList.add(className + '__icon');

    if(!this.mousedown) {
      this.setProgress(muted ? 0 : volume);
    }
  };
}
