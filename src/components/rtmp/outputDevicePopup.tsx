import {createEffect, createSignal, createUniqueId, For, onCleanup, onMount, Show} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {i18n, LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import RadioFieldTsx from '@components/radioFieldTsx';
import Row from '@components/rowTsx';

import '@components/rtmp/outputDevicePopup.scss';
import Section from '@components/section';

// Generic device picker. Originally the RTMP livestream popup for choosing an
// audio output; now also the picker used by the in-call settings sheet and
// the Speakers-and-Camera settings tab.
//
// `kind` decides which `enumerateDevices()` slice we offer, `currentId` is the
// currently-selected device id (empty string = OS default), and `onPick` fires
// with the new id once the user confirms.
export type OutputDevicePopupOptions = {
  kind: MediaDeviceKind,
  currentId?: string,
  titleLangKey?: LangPackKey,
  onPick: (deviceId: string) => void,
  // Fires when `currentId` is set but missing from the live enumerateDevices
  // list (e.g. the user unplugged the device since picking it). Callers wire
  // this to clear the matching `appSettings.callDevices.*` field so the
  // picker UI and the persisted state agree on "Default is now selected".
  onStaleCurrentId?: () => void
};

export default function showOutputDevicePopup(options: OutputDevicePopupOptions): void {
  createPopup(() => {
    const radioName = createUniqueId();
    const [chosenDeviceId, setChosenDeviceId] = createSignal(options.currentId || '');
    // Guard against firing `onStaleCurrentId` more than once per popup
    // lifecycle (it's an idempotent prune, but repeated calls would still
    // shadow follow-up user picks made before the popup closes).
    let prunedStaleId = false;

    const [devices, setDevices] = createSignal<MediaDeviceInfo[] | undefined>(undefined);

    const refresh = () => {
      navigator.mediaDevices.enumerateDevices().then((list) => {
        const filtered = list.filter((d) => d.kind === options.kind);
        setDevices(filtered);

        // If the persisted id is set but the device is gone, fall back to
        // Default in the UI and notify the caller so it can clear the
        // stored id — otherwise the radio list shows nothing selected and
        // the next call attempt would still try the dead id.
        if(
          !prunedStaleId &&
          chosenDeviceId() &&
          !filtered.some((d) => d.deviceId === chosenDeviceId())
        ) {
          prunedStaleId = true;
          setChosenDeviceId('');
          options.onStaleCurrentId?.();
        }
      }).catch(() => setDevices([]));
    };

    onMount(() => {
      refresh();
      // Re-enumerate if the user plugs/unplugs a device while the picker is
      // open — keeps the radio list in sync without forcing a reopen.
      navigator.mediaDevices.addEventListener?.('devicechange', refresh);
      onCleanup(() => navigator.mediaDevices.removeEventListener?.('devicechange', refresh));
    });

    const renderForm = () => {
      const list = devices();
      if(!list) return;

      // Drop placeholder entries Chrome returns before media permission is
      // granted — they share an empty/`'default'` deviceId with our own
      // "Default" sentinel below and would otherwise render as a duplicate.
      const filtered = list.filter((d) => d.deviceId && d.deviceId !== 'default');

      const values = [
        {
          label: i18n('Rtmp.OutputPopup.Default'),
          value: ''
        },
        ...filtered.map((device) => ({
          label: wrapEmojiText(device.label || device.deviceId),
          value: device.deviceId
        }))
      ];

      return (
        <form>
          <For each={values}>{({label, value}) => (
            <Row>
              <Row.RadioField>
                <RadioFieldTsx
                  class="disable-hover"
                  checked={chosenDeviceId() === value}
                  name={radioName}
                  value={value}
                  onChange={(checked) => checked && setChosenDeviceId(value)}
                />
              </Row.RadioField>
              <Row.Title>{label}</Row.Title>
            </Row>
          )}</For>
        </form>
      );
    };

    const [show, setShow] = createSignal(false);
    createEffect(() => {
      if(devices()) {
        setShow(true);
      }
    });

    return (
      <PopupElement class="rtmp-output-popup" closable show={show()}>
        <PopupElement.Header>
          <PopupElement.CloseButton />
          <PopupElement.Title>{i18n(options.titleLangKey || 'Rtmp.OutputPopup.Title')}</PopupElement.Title>
        </PopupElement.Header>
        <PopupElement.Body>
          <PopupElement.Scrollable>
            <Section noMarginBottom>
              {renderForm()}
            </Section>
            <PopupElement.FooterPlaceholder />
          </PopupElement.Scrollable>
        </PopupElement.Body>
        <PopupElement.Footer floating>
          <PopupElement.FooterButton
            color="primary"
            langKey="Save"
            callback={() => {
              options.onPick(chosenDeviceId());
            }}
          />
        </PopupElement.Footer>
      </PopupElement>
    );
  });
}
