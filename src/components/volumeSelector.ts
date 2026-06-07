import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import ListenerSetter from '@helpers/listenerSetter';
import safeAssign from '@helpers/object/safeAssign';
import {_tgico} from '@helpers/tgico';
import appMediaPlaybackController from '@components/appMediaPlaybackController';
import {replaceButtonIcon} from '@components/button';
import RangeSelector from '@components/rangeSelector';

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
    maxVolume?: number,
    onVolumeChange?: VolumeSelector['onVolumeChange']
  }) {
    super({
      step: 0.01,
      min: 0,
      max: options.maxVolume ?? 1,
      vertical: options.vertical
    }, 1);

    safeAssign(this, options);

    this.setListeners();
    this.setHandlers({
      onScrub: (_value) => {
        const value = Math.max(Math.min(_value, this.max), 0);

        if(this.useGlobalVolume) {
          this.modifyGlobal(() => {
            appMediaPlaybackController.muted = false;
            this.writeGlobalVolume(value);
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
      if(!findUpClassName(e.target, className + '__icon') && e.target !== this.btn) {
        return;
      }

      this.onMuteClick(e);
    }, {listenerSetter: this.listenerSetter});

    if(this.useGlobalVolume) {
      this.listenerSetter.add(appMediaPlaybackController)('playbackParams', (params) => {
        if(this.ignoreGlobalEvents) {
          return;
        }

        this.setVolume({volume: this.readGlobalVolume(), muted: params.muted, eventType: 'global'});
      });

      if(this.useGlobalVolume === 'no-init') {
        this.setVolume({volume: this.readGlobalVolume(), muted: this.media.muted});
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
    const {volume, muted} = this.media ?? {};

    if(this.useGlobalVolume) {
      this.modifyGlobal(() => {
        appMediaPlaybackController.muted = !globalMuted;
      });
    }

    this.setVolume({
      volume: volume ?? this.readGlobalVolume(),
      muted: !(muted ?? globalMuted),
      eventType: 'click'
    });
  }

  /**
   * Read the global volume this selector tracks. A selector bound to a concrete media
   * element (the video player) always follows the shared master `volume`. The global-only
   * selector (pinned audio plate) follows the playing media: for voice that's `volume +
   * boost` (its 0–200% range), so the boost shows on the slider without leaking elsewhere.
   */
  protected readGlobalVolume() {
    return this.media ? appMediaPlaybackController.volume : appMediaPlaybackController.getGlobalSliderVolume();
  }

  /**
   * Write a slider value back to the controller. With a local media element it sets the
   * shared master directly; the global-only selector routes through the controller, which
   * splits a voice value into shared master (0–100%) + voice-only boost (100–200%).
   */
  protected writeGlobalVolume(value: number) {
    if(this.media) {
      appMediaPlaybackController.volume = value;
    } else {
      appMediaPlaybackController.setGlobalSliderVolume(value);
    }
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
      // HTMLMediaElement only accepts [0, 1]; the master volume is already clamped, but a
      // boosted voice value (or a stale persisted >1) must never reach the element directly.
      this.media.volume = Math.min(volume, 1);
      this.media.muted = muted;
    }

    if(!this.mousedown) {
      this.setProgress(muted ? 0 : volume);
    }

    eventType && this.onVolumeChange?.(eventType);
  };

  public setGlobalVolume = (eventType?: Parameters<VolumeSelector['setVolume']>[0]['eventType']) => {
    const volume = this.readGlobalVolume();
    const muted = appMediaPlaybackController.muted;
    return this.setVolume({volume, muted, eventType});
  };

  public setMaxVolume = (max: number) => {
    if(this.max === max) return;
    this.max = max;
    this.seek.max = '' + max;
    this.setFilled(+this.seek.value);
  };
}
