/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import findUpClassName from '../helpers/dom/findUpClassName';
import ListenerSetter from '../helpers/listenerSetter';
import safeAssign from '../helpers/object/safeAssign';
import {_tgico} from '../helpers/tgico';
import appMediaPlaybackController from './appMediaPlaybackController';
import {replaceButtonIcon} from './button';
import RangeSelector from './rangeSelector';

const className = 'player-volume';

export default class VolumeSelector extends RangeSelector {
  private static ICONS: Icon[] = ['volume_off', 'volume_mute', 'volume_down', 'volume_up'];
  public btn: HTMLElement;
  protected icon: HTMLSpanElement;
  protected listenerSetter: ListenerSetter;
  protected vertical: boolean;
  protected media: HTMLMediaElement;
  protected useGlobalVolume: 'auto' | 'no-init';
  protected onVolumeChange: (type: 'global' | 'click') => void;
  protected ignoreGlobalEvents: boolean;

  constructor(options: {
    listenerSetter: ListenerSetter,
    useGlobalVolume?: VolumeSelector['useGlobalVolume'],
    vertical?: boolean,
    media?: HTMLMediaElement,
    onVolumeChange?: VolumeSelector['onVolumeChange']
  }) {
    super({
      step: 0.01,
      min: 0,
      max: 1,
      vertical: options.vertical
    }, 1);

    safeAssign(this, options);

    this.setListeners();
    this.setHandlers({
      onScrub: (_value) => {
        const value = Math.max(Math.min(_value, 1), 0);

        if(this.useGlobalVolume) {
          this.modifyGlobal(() => {
            appMediaPlaybackController.muted = false;
            appMediaPlaybackController.volume = value;
          });
        }

        this.setVolume({volume: value, muted: false, eventType: 'click'});
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

    if(this.useGlobalVolume) {
      this.listenerSetter.add(appMediaPlaybackController)('playbackParams', (params) => {
        if(this.ignoreGlobalEvents) {
          return;
        }

        this.setVolume({...params, eventType: 'global'});
      });

      if(this.useGlobalVolume === 'no-init') {
        this.setVolume({volume: appMediaPlaybackController.volume, muted: this.media.muted});
      } else {
        this.setGlobalVolume();
      }
    } else if(this.media) {
      this.setVolume({volume: this.media.volume, muted: this.media.muted});
    }

    btn.append(this.container);
  }

  public removeListeners() {
    super.removeListeners();
    this.onVolumeChange = undefined;
  }

  private modifyGlobal(callback: () => void) {
    this.ignoreGlobalEvents = true;
    callback();
    this.ignoreGlobalEvents = false;
  }

  private onMuteClick(e?: Event) {
    e && cancelEvent(e);

    const globalMuted = appMediaPlaybackController.muted;

    if(this.useGlobalVolume) {
      this.modifyGlobal(() => {
        appMediaPlaybackController.muted = !globalMuted;
      });
    }

    this.setVolume({
      volume: this.media?.volume ?? appMediaPlaybackController.volume,
      muted: !(this.media?.muted ?? globalMuted),
      eventType: 'click'
    });
  }

  public setVolume = ({volume, muted, eventType}: {volume: number, muted: boolean, eventType?: 'global' | 'click'}) => {
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

    if(this.media) {
      this.media.volume = volume;
      this.media.muted = muted;
    }

    if(!this.mousedown) {
      this.setProgress(muted ? 0 : volume);
    }

    eventType && this.onVolumeChange?.(eventType);
  };

  public setGlobalVolume = (eventType?: Parameters<VolumeSelector['setVolume']>[0]['eventType']) => {
    const {volume, muted} = appMediaPlaybackController;
    return this.setVolume({volume, muted, eventType});
  };
}
