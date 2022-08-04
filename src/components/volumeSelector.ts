/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import ListenerSetter from '../helpers/listenerSetter';
import rootScope from '../lib/rootScope';
import appMediaPlaybackController from './appMediaPlaybackController';
import RangeSelector from './rangeSelector';

export default class VolumeSelector extends RangeSelector {
  private static ICONS = ['volume_off', 'volume_mute', 'volume_down', 'volume_up'];
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

    const className = 'player-volume';
    const btn = this.btn = document.createElement('div');
    btn.classList.add('btn-icon', className);
    const icon = this.icon = document.createElement('span');
    icon.classList.add(className + '__icon');

    btn.append(icon, this.container);

    attachClickEvent(icon, this.onMuteClick, {listenerSetter: this.listenerSetter});
    this.listenerSetter.add(appMediaPlaybackController)('playbackParams', this.setVolume);

    this.setVolume();
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

    VolumeSelector.ICONS.forEach((icon) => this.icon.classList.remove('tgico-' + icon));
    this.icon.classList.add('tgico-' + VolumeSelector.ICONS[iconIndex]);

    if(!this.mousedown) {
      this.setProgress(muted ? 0 : volume);
    }
  };
}
