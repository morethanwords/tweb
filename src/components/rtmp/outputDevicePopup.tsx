import {Show, render} from 'solid-js/web';
import PopupElement from '../popups';
import {RadioFormFromValues} from '../row';

import './outputDevicePopup.css';
import {Transition} from 'solid-transition-group';
import {i18n} from '../../lib/langPack';
import wrapEmojiText from '../../lib/richTextProcessor/wrapEmojiText';

export class OutputDevicePopup extends PopupElement {
  protected _dispose: () => void;

  constructor(readonly video: HTMLVideoElement) {
    super('rtmp-output-popup', {
      overlayClosable: true,
      title: true,
      body: true,
      buttons: [{
        langKey: 'OK',
        callback: () => {
          video.setSinkId(chosenDeviceId);
        }
      }]
    });

    const currentSinkId = video.sinkId || 'default';
    let chosenDeviceId = currentSinkId;

    this.title.append(i18n('Rtmp.OutputPopup.Title'));
    // if(!document.documentElement.classList.contains('night')) {
    //   this.element.classList.remove('night');
    // }

    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const outputs = devices.filter((device) => device.kind === 'audiooutput');
      const form = RadioFormFromValues(
        outputs.map((device) => ({
          textElement: wrapEmojiText(device.label),
          value: device.deviceId,
          checked: device.deviceId === currentSinkId
        })),
        (id) => {
          chosenDeviceId = id;
        }
      );

      this._dispose = render(() => <>
        <Transition name="fade" mode="outin">
          <Show when={outputs.length === 0} fallback={form}>
            {
              RadioFormFromValues(
                [{
                  textElement: i18n('Rtmp.OutputPopup.Default'),
                  value: '',
                  // @ts-ignore
                  checked: true
                }],
                (id) => {}
              )
            }
          </Show>
        </Transition>
      </>, this.body);
    });
  }

  cleanup() {
    this._dispose();
  }
}
