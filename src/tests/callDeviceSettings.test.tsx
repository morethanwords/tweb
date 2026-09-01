import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {JSX} from 'solid-js';
import {render} from 'solid-js/web';

const mocks = vi.hoisted(() => ({
  changeCallDevice: vi.fn(),
  showOutputDevicePopup: vi.fn(),
  toastNew: vi.fn()
}));

vi.mock('@lib/calls/applyDeviceToActiveCall', () => ({
  changeCallDevice: mocks.changeCallDevice
}));

vi.mock('@components/rtmp/outputDevicePopup', () => ({
  default: mocks.showOutputDevicePopup
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

vi.mock('@components/rowTsx', () => {
  const Row = (props: {
    children: JSX.Element,
    clickable?: boolean | (() => void),
    role?: JSX.HTMLAttributes<HTMLDivElement>['role'],
    tabIndex?: number
  }) => (
    <div
      class="row"
      role={props.role}
      tabIndex={props.tabIndex}
      onClick={() => typeof(props.clickable) === 'function' && props.clickable()}
    >
      {props.children}
    </div>
  );
  Row.Icon = (props: {icon: Icon}) => <i data-icon={props.icon} />;
  Row.Title = (props: {children: JSX.Element, titleRight?: JSX.Element}) => (
    <span>
      {props.children}
      <span data-title-right>{props.titleRight}</span>
    </span>
  );
  return {default: Row};
});

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => key
}));

vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({
  default: (value: string) => value
}));

vi.mock('@stores/appSettings', async() => {
  const {createStore} = await import('solid-js/store');
  const [appSettings, setAppSettings] = createStore({
    callDevices: {
      cameraId: '',
      microphoneId: '',
      speakerId: ''
    }
  });

  return {
    useAppSettings: () => [appSettings, setAppSettings] as const,
    setAppSettingsSilent: (
      key: 'callDevices',
      settingOrValue: 'cameraId' | 'microphoneId' | 'speakerId' | {
        cameraId: string,
        microphoneId: string,
        speakerId: string
      },
      value?: string
    ) => {
      if(typeof(settingOrValue) === 'object') {
        setAppSettings(key, settingOrValue);
      } else {
        setAppSettings(key, settingOrValue, value);
      }
    }
  };
});

import {
  CallDeviceRow,
  useCallDeviceSettings
} from '@components/call/callDeviceSettings';
import {setAppSettingsSilent} from '@stores/appSettings';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

function mediaDevice(kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo {
  return {kind, deviceId, label, groupId: '', toJSON: () => ({})};
}

describe('shared call device settings', () => {
  let devices: MediaDeviceInfo[];
  let deviceChangeListener: () => void;
  let addEventListener: ReturnType<typeof vi.fn>;
  let removeEventListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    devices = [
      mediaDevice('audiooutput', 'speaker-a', 'Speaker A'),
      mediaDevice('audiooutput', 'speaker-b', 'Speaker B'),
      mediaDevice('audioinput', 'microphone-a', 'Microphone A'),
      mediaDevice('videoinput', 'camera-a', 'Camera A')
    ];
    addEventListener = vi.fn((name: string, listener: () => void) => {
      if(name === 'devicechange') deviceChangeListener = listener;
    });
    removeEventListener = vi.fn();
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: {
        addEventListener,
        enumerateDevices: vi.fn(() => Promise.resolve(devices)),
        removeEventListener
      }
    });
    setAppSettingsSilent('callDevices', {
      cameraId: 'camera-a',
      microphoneId: 'microphone-a',
      speakerId: 'speaker-a'
    });
    mocks.changeCallDevice.mockImplementation(async(kind: 'speaker' | 'microphone' | 'camera', id: string) => {
      setAppSettingsSilent(
        'callDevices',
        kind === 'speaker' ? 'speakerId' : kind === 'microphone' ? 'microphoneId' : 'cameraId',
        id
      );
      return true;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('shares reactive ids, labels and one devicechange lifecycle across rows', async() => {
    let settings!: ReturnType<typeof useCallDeviceSettings>;
    const host = document.createElement('div');
    const dispose = render(() => {
      settings = useCallDeviceSettings();
      return (
        <>
          <CallDeviceRow
            settings={settings}
            kind="speaker"
            titleLangKey="CallSettings.OutputDevice"
          />
          <CallDeviceRow
            settings={settings}
            kind="microphone"
            titleLangKey="CallSettings.InputDevice"
          />
          <CallDeviceRow
            settings={settings}
            kind="camera"
          />
          <output data-device-id>{settings.deviceId('speaker')}</output>
        </>
      );
    }, host);
    await flushPromises();

    expect(host.textContent).toContain('Speaker A');
    expect(host.textContent).toContain('Camera A');
    expect(host.textContent).toContain('CallSettings.OutputDevice');
    expect(host.textContent).toContain('CallSettings.InputDevice');
    expect(addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledTimes(1);

    expect(host.querySelector('.row')?.getAttribute('role')).toBe('button');
    settings.pick('speaker');
    const pickerOptions = mocks.showOutputDevicePopup.mock.calls[0][0];
    expect(pickerOptions.currentId).toBe('speaker-a');

    pickerOptions.onPick('speaker-b');
    await flushPromises();
    expect(host.querySelector('[data-device-id]')?.textContent).toBe('speaker-b');
    expect(host.textContent).toContain('Speaker B');

    devices = [
      mediaDevice('audiooutput', 'speaker-b', 'Renamed Speaker'),
      mediaDevice('videoinput', 'camera-a', 'Renamed Camera')
    ];
    deviceChangeListener();
    await flushPromises();
    expect(host.textContent).toContain('Renamed Speaker');
    expect(host.textContent).toContain('Renamed Camera');

    dispose();
    expect(removeEventListener).toHaveBeenCalledWith('devicechange', deviceChangeListener);
  });

  it('routes picker failures and stale ids through the shared transaction', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('microphone swap failed');
    mocks.changeCallDevice.mockRejectedValueOnce(error).mockResolvedValueOnce(true);

    let settings!: ReturnType<typeof useCallDeviceSettings>;
    const host = document.createElement('div');
    const dispose = render(() => {
      settings = useCallDeviceSettings();
      return (
        <CallDeviceRow
          settings={settings}
          kind="microphone"
        />
      );
    }, host);
    await flushPromises();

    settings.pick('microphone');
    const pickerOptions = mocks.showOutputDevicePopup.mock.calls[0][0];
    pickerOptions.onPick('microphone-b');
    await flushPromises();
    expect(mocks.toastNew).toHaveBeenCalledWith({
      langPackKey: 'ConferenceCall.Media.MicrophoneError'
    });

    pickerOptions.onStaleCurrentId();
    await flushPromises();
    expect(mocks.changeCallDevice).toHaveBeenLastCalledWith('microphone', '');
    dispose();
  });
});
