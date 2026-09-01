import {createSignal, onMount, Show} from 'solid-js';
import Section from '@components/section';
import Row from '@components/rowTsx';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import MicrophoneLevelMeter from '@components/call/microphoneLevelMeter';
import CallCameraSection from '@components/call/cameraSection';
import {
  CallDeviceRow,
  useCallDeviceSettings
} from '@components/call/callDeviceSettings';
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
  const callDevices = useCallDeviceSettings();

  // Current authorization carries the `call_requests_disabled` flag; we read
  // it on mount and write back via account.changeAuthorizationSettings.
  // Optimistic UI mirrors tdesktop's pattern — the server has no echo, so a
  // failed call rolls the signal back.
  const [currentAuth, setCurrentAuth] = createSignal<Authorization.authorization | undefined>(undefined);
  const acceptCalls = () => !(currentAuth()?.pFlags?.call_requests_disabled);

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
  });

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
        <CallDeviceRow
          settings={callDevices}
          kind="speaker"
          titleLangKey="CallSettings.OutputDevice"
        />
      </Section>

      <Section name="CallSettings.InputSection">
        <CallDeviceRow
          settings={callDevices}
          kind="microphone"
          titleLangKey="CallSettings.InputDevice"
        />
        <div class="speakers-and-camera-meter-wrap">
          <MicrophoneLevelMeter deviceId={callDevices.deviceId('microphone')} />
        </div>
      </Section>

      <CallCameraSection settings={callDevices} />

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
