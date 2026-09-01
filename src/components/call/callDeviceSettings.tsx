import {createSignal, onCleanup, onMount} from 'solid-js';
import Row from '@components/rowTsx';
import showOutputDevicePopup from '@components/rtmp/outputDevicePopup';
import {toastNew} from '@components/toast';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {i18n, LangPackKey} from '@lib/langPack';
import {useAppSettings} from '@stores/appSettings';
import {changeCallDevice} from '@lib/calls/applyDeviceToActiveCall';
import {CALL_DEVICE_SETTING_KEYS, CallDeviceKind} from '@lib/calls/callDeviceKind';

const deviceOptions: Record<CallDeviceKind, {
  mediaKind: MediaDeviceKind,
  titleLangKey: LangPackKey,
  errorLangKey: LangPackKey
}> = {
  speaker: {
    mediaKind: 'audiooutput',
    titleLangKey: 'CallSettings.Speakers',
    errorLangKey: 'Error.AnError'
  },
  microphone: {
    mediaKind: 'audioinput',
    titleLangKey: 'CallSettings.Microphone',
    errorLangKey: 'ConferenceCall.Media.MicrophoneError'
  },
  camera: {
    mediaKind: 'videoinput',
    titleLangKey: 'CallSettings.Camera',
    errorLangKey: 'ConferenceCall.Media.CameraError'
  }
};

export function useCallDeviceSettings() {
  const [appSettings] = useAppSettings();
  const [devices, setDevices] = createSignal<MediaDeviceInfo[]>([]);

  const refreshDevices = () => {
    navigator.mediaDevices.enumerateDevices().then(setDevices).catch(() => setDevices([]));
  };

  onMount(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener?.('devicechange', refreshDevices);
    onCleanup(() => {
      navigator.mediaDevices.removeEventListener?.('devicechange', refreshDevices);
    });
  });

  const deviceId = (kind: CallDeviceKind): string => {
    return appSettings.callDevices?.[CALL_DEVICE_SETTING_KEYS[kind]] || '';
  };

  const label = (kind: CallDeviceKind) => {
    const id = deviceId(kind);
    if(!id) return i18n('CallSettings.DeviceDefault');

    const {mediaKind} = deviceOptions[kind];
    const device = devices().find((item) => item.kind === mediaKind && item.deviceId === id);
    return device ? wrapEmojiText(device.label || device.deviceId) : i18n('CallSettings.DeviceDefault');
  };

  const reportChangeError = (kind: CallDeviceKind, error: unknown) => {
    console.error(`change ${kind} device failed`, error);
    toastNew({langPackKey: deviceOptions[kind].errorLangKey});
  };

  const change = (kind: CallDeviceKind, id: string): void => {
    void changeCallDevice(kind, id).catch((error) => reportChangeError(kind, error));
  };

  const pick = (kind: CallDeviceKind): void => {
    const config = deviceOptions[kind];
    showOutputDevicePopup({
      kind: config.mediaKind,
      currentId: deviceId(kind),
      titleLangKey: config.titleLangKey,
      onPick: (id) => change(kind, id),
      onStaleCurrentId: () => {
        void changeCallDevice(kind, '').catch((error) => {
          console.error(`reset ${kind} device failed`, error);
        });
      }
    });
  };

  return {deviceId, label, pick};
}

export type CallDeviceSettings = ReturnType<typeof useCallDeviceSettings>;

export function CallDeviceRow(props: {
  settings: CallDeviceSettings,
  kind: CallDeviceKind,
  icon?: Icon,
  titleLangKey?: LangPackKey
}) {
  return (
    <Row clickable={() => props.settings.pick(props.kind)} role="button" tabIndex={0}>
      {props.icon && <Row.Icon icon={props.icon} />}
      <Row.Title titleRight={props.settings.label(props.kind)} titleRightSecondary>
        {i18n(props.titleLangKey || deviceOptions[props.kind].titleLangKey)}
      </Row.Title>
    </Row>
  );
}
