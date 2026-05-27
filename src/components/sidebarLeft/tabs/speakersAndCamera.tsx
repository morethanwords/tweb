import {createSignal, onCleanup, onMount, Show} from 'solid-js';
import Section from '@components/section';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {i18n} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import rootScope from '@lib/rootScope';
import {useAppSettings} from '@stores/appSettings';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import showOutputDevicePopup from '@components/rtmp/outputDevicePopup';
import applyDeviceToActiveCall from '@lib/calls/applyDeviceToActiveCall';
import MicrophoneLevelMeter from '@components/call/microphoneLevelMeter';
import CallCameraSection from '@components/call/cameraSection';
import {Authorization} from '@layer';

import '@components/call/settingsPopup.scss';

// Speakers-and-Camera settings tab. Mirrors tdesktop's settings_calls
// "Calls" panel: Speakers → Microphone (+ live level meter) → Camera (+
// preview) → Accept calls toggle. We deliberately do NOT include tdesktop's
// "Open system sound preferences" entry — there is no web-platform analog.
//
// The "use the same devices for calls" toggle that tdesktop carries is also
// omitted: tweb has no separate "global" audio output device (the only
// non-call output device picker is the RTMP livestream sink, which is
// per-livestream-popup), so the toggle would always be a no-op here.

export default function SpeakersAndCamera() {
  const [tab] = useSuperTab();
  const promiseCollector = usePromiseCollector();
  const [appSettings, setAppSettings] = useAppSettings();

  const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([]);

  // Current authorization carries the `call_requests_disabled` flag; we read
  // it on mount and write back via account.changeAuthorizationSettings.
  // Optimistic UI mirrors tdesktop's pattern — the server has no echo, so a
  // failed call rolls the signal back.
  const [currentAuth, setCurrentAuth] = createSignal<Authorization.authorization | undefined>(undefined);
  const acceptCalls = () => !(currentAuth()?.pFlags?.call_requests_disabled);

  const refreshDevices = () => {
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => setDevices([]));
  };

  // Fetch the current authorization once on mount. Stored in the tab's
  // promise collector so the tab waits for it to render — the toggle is
  // checkbox-with-no-loading-state today, and showing it briefly OFF before
  // flipping back ON would look like a flicker.
  promiseCollector.collect(
    rootScope.managers.appAccountManager.getAuthorizations()
    .then((res) => {
      const cur = res.authorizations.find((a) => a.pFlags?.current);
      setCurrentAuth(cur);
    })
    .catch(() => {})
  );

  onMount(() => {
    tab.header.classList.add('with-border');
    refreshDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);
    onCleanup(() => {
      navigator.mediaDevices.removeEventListener?.('devicechange', refreshDevices);
    });
  });

  const labelFor = (kind: MediaDeviceKind, id: string) => {
    if(!id) return i18n('CallSettings.DeviceDefault');
    const found = devices().find((d) => d.kind === kind && d.deviceId === id);
    return found ? wrapEmojiText(found.label || found.deviceId) : i18n('CallSettings.DeviceDefault');
  };

  const onPickSpeaker = () => {
    showOutputDevicePopup({
      kind: 'audiooutput',
      currentId: appSettings.callDevices?.speakerId || '',
      titleLangKey: 'CallSettings.Speakers',
      onPick: (id) => {
        setAppSettings('callDevices', 'speakerId', id);
        applyDeviceToActiveCall('speaker', id);
      },
      onStaleCurrentId: () => {
        setAppSettings('callDevices', 'speakerId', '');
      }
    });
  };

  const onPickMicrophone = () => {
    showOutputDevicePopup({
      kind: 'audioinput',
      currentId: appSettings.callDevices?.microphoneId || '',
      titleLangKey: 'CallSettings.Microphone',
      onPick: (id) => {
        setAppSettings('callDevices', 'microphoneId', id);
        applyDeviceToActiveCall('microphone', id);
      },
      onStaleCurrentId: () => {
        setAppSettings('callDevices', 'microphoneId', '');
      }
    });
  };

  const onToggleAcceptCalls = (checked: boolean) => {
    const auth = currentAuth();
    if(!auth) return;
    const previous = auth.pFlags?.call_requests_disabled;
    // Optimistic local flip — re-create the pFlags object so Solid's signal
    // equality fires.
    setCurrentAuth({
      ...auth,
      pFlags: {...auth.pFlags, call_requests_disabled: checked ? undefined : true}
    });
    rootScope.managers.appAccountManager.changeAuthorizationSettings(
      auth.hash,
      {callRequestsDisabled: !checked}
    ).catch((err) => {
      setCurrentAuth({
        ...auth,
        pFlags: {...auth.pFlags, call_requests_disabled: previous}
      });
      console.error('changeAuthorizationSettings failed', err);
    });
  };

  return (
    <>
      <Section name="CallSettings.OutputSection">
        <Row clickable={onPickSpeaker}>
          <Row.Title
            titleRight={labelFor('audiooutput', appSettings.callDevices?.speakerId || '')}
            titleRightSecondary
          >
            {i18n('CallSettings.OutputDevice')}
          </Row.Title>
        </Row>
      </Section>

      <Section name="CallSettings.InputSection">
        <Row clickable={onPickMicrophone}>
          <Row.Title
            titleRight={labelFor('audioinput', appSettings.callDevices?.microphoneId || '')}
            titleRightSecondary
          >
            {i18n('CallSettings.InputDevice')}
          </Row.Title>
        </Row>
        <div class="speakers-and-camera-meter-wrap">
          <MicrophoneLevelMeter deviceId={appSettings.callDevices?.microphoneId} />
        </div>
      </Section>

      <CallCameraSection />

      <Show when={currentAuth()}>
        <Section caption="CallSettings.AcceptCalls.Caption">
          {/* No `clickable` — toggle's own label-click already handles the
              flip. See the matching note in settingsPopup.tsx. */}
          <Row>
            <Row.CheckboxFieldToggle>
              <CheckboxFieldTsx
                toggle
                checked={acceptCalls()}
                onChange={onToggleAcceptCalls}
              />
            </Row.CheckboxFieldToggle>
            <Row.Title>{i18n('CallSettings.AcceptCalls')}</Row.Title>
          </Row>
        </Section>
      </Show>
    </>
  );
}
