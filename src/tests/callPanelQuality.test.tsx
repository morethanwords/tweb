/*
 * What the 1-on-1 call panel says about the call's quality, rendered from a call instance the way
 * the panel really reads it (`signalBars` and its event, the other side's MediaState):
 *
 * - four signal bars in front of the duration while the call is connected — tdesktop
 *   `Calls::SignalBars`, Android `VoIPTimerView` — counted in words for a screen reader;
 * - at no bars, iOS's weak-signal state: the "Weak network signal" pill and the warm palette
 *   (`PrivateCallScreen`: `quality <= 0.2`);
 * - "<name>'s battery is low" when the other side says so (tdesktop `createRemoteLowBattery`).
 *
 * The pills never leave the DOM, so they stay hidden from assistive technology and announce
 * themselves through a status region while shown. How any of it looks is the sandbox stories'
 * business (`call/active`, `call/activeWeakSignal`, `call/activeRemoteLowBattery`).
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  dispose: undefined as (() => void) | undefined,
  hide: undefined as ReturnType<typeof import('vitest').vi.fn> | undefined
}));

vi.mock('@components/popups/indexTsx', async() => {
  const {createContext} = await import('solid-js');
  const {getMiddleware} = await import('@helpers/middleware');
  const {render} = await import('solid-js/web');
  const PopupContext = createContext<any>();

  const PopupElement = (props: any) => {
    const context = {
      middlewareHelper: getMiddleware(),
      hide: mocks.hide,
      element: document.createElement('div')
    };

    return (
      <PopupContext.Provider value={context}>
        <div
          ref={(element) => props.containerProps?.ref?.(element)}
          class={props.containerClass}
          data-testid="call-panel"
        >
          {props.children}
        </div>
      </PopupContext.Provider>
    );
  };
  PopupElement.Header = (props: any) => <div class="popup-header">{props.children}</div>;
  PopupElement.CloseButton = () => <button class="popup-close" />;

  return {
    default: PopupElement,
    PopupContext,
    createPopup: (factory: () => any) => {
      const host = document.createElement('div');
      document.body.append(host);
      mocks.dispose = render(factory, host);
    }
  };
});

vi.mock('@lib/calls/callInstance', () => ({default: class CallInstance {}}));
vi.mock('@lib/calls/conferenceInviteInstance', () => ({default: class ConferenceInviteInstance {}}));

vi.mock('@components/chat/gradientRenderer', () => ({
  default: {
    create: (colors: string) => {
      const canvas = document.createElement('canvas');
      canvas.dataset.colors = colors;
      return {canvas, gradientRenderer: {toNextPosition: vi.fn(), cleanup: vi.fn()}};
    }
  }
}));

vi.mock('@helpers/animateValue', () => ({animateValue: () => () => {}}));

vi.mock('@components/groupCall/microphoneIconMini', () => ({
  default: class GroupCallMicrophoneIconMini {
    public container = document.createElement('div');
    public setState(_on?: boolean, _active?: boolean, onFrame?: () => void) {
      onFrame?.();
    }

    public getItem() {
      return {player: undefined as unknown};
    }

    public destroy() {}
  }
}));

vi.mock('@components/peerTitle', () => ({
  default: class PeerTitle {
    public element = document.createElement('span');
    constructor() {
      this.element.textContent = 'Anna';
    }
  }
}));

vi.mock('@components/avatarNew', () => ({
  avatarNew: () => ({node: document.createElement('div')})
}));

vi.mock('@components/stackedAvatars', () => ({
  default: class StackedAvatars {
    public container = document.createElement('div');
    public render() {}
  }
}));

vi.mock('@components/buttonIcon', () => ({
  default: (className: string) => {
    const button = document.createElement('button');
    button.className = 'btn-icon ' + className;
    return button;
  }
}));

vi.mock('@helpers/movablePanel', () => ({
  default: class MovablePanel {
    public movable: undefined;
    public state = {width: 400, height: 580};
    public destroy() {}
  }
}));

vi.mock('@helpers/dom/controlsHover', () => ({
  default: class ControlsHover {
    public setup() {}
    public showControls() {}
  }
}));

vi.mock('@helpers/themeController', () => ({default: {setThemeColor: vi.fn()}}));
vi.mock('@components/animationIntersector', () => ({default: {checkAnimations: vi.fn()}}));
vi.mock('@components/call/videoCanvasBlur', () => ({default: () => document.createElement('canvas')}));
vi.mock('@components/call/settingsPopup', () => ({default: vi.fn()}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({
  default: (text: string) => document.createTextNode(text)
}));

// The pills' scale-in is CSS; the class it hangs on is what the panel decides.
vi.mock('@components/singleTransition', () => ({
  default: ({element, className, forwards}: {element: HTMLElement, className: string, forwards: boolean}) => {
    element.classList.toggle(className, forwards);
    element.classList.toggle('forwards', forwards);
  }
}));

import EventListenerBase from '@helpers/eventListenerBase';
import I18n from '@lib/langPack';
import CALL_STATE from '@lib/calls/callState';
import {CallMediaState} from '@lib/calls/types';
import showCallPopup from '@components/call';

const STRINGS: {[key: string]: string} = {
  'AccDescr.CallSignalStrength': 'Signal strength: %1$d of %2$d',
  'VoipWeakNetwork': 'Weak network signal',
  'VoipUserMicrophoneIsOff': '%s\'s microphone is off',
  'Call.Toast.LowBattery': '%@\'s battery is low'
};

for(const key in STRINGS) {
  I18n.strings.set(key as any, {_: 'langPackString', key, value: STRINGS[key]});
}

const WEAK_COLORS = 'c0508d,f09536,ce5081,fc7c4c';
const ACTIVE_COLORS = 'acbd65,459f8d,53a4d1,3e917a';

class FakeCallInstance extends EventListenerBase<{
  state: (state: CALL_STATE) => void,
  mediaState: (mediaState: CallMediaState) => void,
  signalBars: (bars: number) => void
}> {
  public interlocutorUserId = 42 as UserId;
  public isOutgoing = true;
  public wasTryingToJoin = true;
  public connectionState = CALL_STATE.CONNECTED;
  public connectedAt = performance.now();
  public signalBars: number | undefined;
  public isMuted = false;
  public isSharingVideo = false;
  public isSharingScreen = false;
  public outputMediaState: CallMediaState;

  public get duration() {
    return 65;
  }

  public get isClosing() {
    return this.connectionState === CALL_STATE.CLOSING || this.connectionState === CALL_STATE.CLOSED;
  }

  public getMediaState(type: 'input' | 'output') {
    return type === 'output' ? this.outputMediaState : undefined;
  }

  public getVideoElement(): HTMLVideoElement {
    return undefined;
  }

  public getEmojisFingerprint() {
    return ['🐶', '🌴', '🎩', '🍎'];
  }

  public setSignalBars(bars: number) {
    this.signalBars = bars;
    this.dispatchEvent('signalBars', bars);
  }

  public setState(state: CALL_STATE) {
    this.connectionState = state;
    this.dispatchEvent('state', state);
  }

  public setRemoteMediaState(state: Partial<CallMediaState>) {
    this.outputMediaState = {
      '@type': 'MediaState',
      type: 'output',
      muted: false,
      lowBattery: false,
      screencastState: 'inactive',
      videoRotation: 0,
      videoState: 'inactive',
      ...state
    };
    this.dispatchEvent('mediaState', this.outputMediaState);
  }
}

let instance: FakeCallInstance;

function open(options: {state?: CALL_STATE, signalBars?: number} = {}) {
  instance = new FakeCallInstance();
  instance.connectionState = options.state ?? CALL_STATE.CONNECTED;
  instance.signalBars = options.signalBars;
  showCallPopup(instance as any);
}

const panel = () => document.querySelector<HTMLElement>('[data-testid="call-panel"]');
const bars = () => panel().querySelector<HTMLElement>('.call-subtitle [role="img"]');
const pill = (text: string) => [...panel().querySelectorAll<HTMLElement>('.call-party-state')]
.find((element) => element.textContent === text);
const announcements = () => [...panel().querySelectorAll<HTMLElement>('.call-party-states [role="status"]')]
.map((element) => element.textContent)
.filter(Boolean);
const shownGradient = () => [...panel().querySelectorAll<HTMLCanvasElement>('canvas.call-gradient')]
.filter((canvas) => !canvas.classList.contains('is-hidden'))
.map((canvas) => canvas.dataset.colors);

beforeEach(() => {
  mocks.hide = vi.fn();
});

afterEach(() => {
  mocks.dispose?.();
  mocks.dispose = undefined;
  document.body.replaceChildren();
});

describe('call panel signal bars', () => {
  it('puts the bars in front of the duration, counted in words', () => {
    open({signalBars: 3});

    const subtitle = panel().querySelector('.call-subtitle');
    expect(subtitle.firstElementChild).toBe(bars());
    expect(subtitle.lastElementChild.classList).toContain('call-description');
    expect(subtitle.lastElementChild.classList).toContain('has-duration');
    expect(bars().hidden).toBe(false);
    expect(bars().getAttribute('aria-label')).toBe('Signal strength: 3 of 4');
    expect(bars().children).toHaveLength(4);

    instance.setSignalBars(1);
    expect(bars().getAttribute('aria-label')).toBe('Signal strength: 1 of 4');
  });

  it('waits for the first count, and shows none while the call is not connected', () => {
    open();
    expect(bars().hidden).toBe(true);

    instance.setSignalBars(4);
    expect(bars().hidden).toBe(false);

    // a dropped transport is "Connecting..." again, with no reception to speak of
    instance.setState(CALL_STATE.CONNECTING);
    expect(bars().hidden).toBe(true);
    instance.setState(CALL_STATE.CONNECTED);
    expect(bars().hidden).toBe(false);
  });

  it('has none at all for a call that is still ringing', () => {
    open({state: CALL_STATE.PENDING, signalBars: 2});
    expect(bars().hidden).toBe(true);
  });
});

describe('call panel weak network', () => {
  it('raises the pill and the warm palette at no bars, and takes them back', () => {
    open({signalBars: 2});
    const notice = pill('Weak network signal');

    expect(notice.classList.contains('is-visible')).toBe(false);
    expect(shownGradient()).toContain(ACTIVE_COLORS);

    instance.setSignalBars(0);
    expect(notice.classList.contains('is-visible')).toBe(true);
    expect(shownGradient()).toContain(WEAK_COLORS);
    expect(announcements()).toEqual(['Weak network signal']);

    instance.setSignalBars(1);
    expect(notice.classList.contains('is-visible')).toBe(false);
    expect(announcements()).toEqual([]);
  });

  it('stays quiet while the call is not connected', () => {
    open({state: CALL_STATE.CONNECTING, signalBars: 0});
    expect(pill('Weak network signal').classList.contains('is-visible')).toBe(false);
    expect(shownGradient()).not.toContain(WEAK_COLORS);
  });
});

describe('call panel notices about the other side', () => {
  it('says when their battery is low, next to the microphone notice', () => {
    open({signalBars: 4});
    const battery = pill('Anna\'s battery is low');
    const muted = pill('Anna\'s microphone is off');
    expect(battery.parentElement).toBe(muted.parentElement);
    expect(battery.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    expect(battery.classList.contains('is-visible')).toBe(false);

    instance.setRemoteMediaState({lowBattery: true});
    expect(battery.classList.contains('is-visible')).toBe(true);
    expect(muted.classList.contains('is-visible')).toBe(false);
    expect(announcements()).toEqual(['Anna\'s battery is low']);

    instance.setRemoteMediaState({lowBattery: true, muted: true});
    expect(muted.classList.contains('is-visible')).toBe(true);
    expect(announcements()).toEqual(['Anna\'s microphone is off', 'Anna\'s battery is low']);

    instance.setRemoteMediaState({});
    expect(battery.classList.contains('is-visible')).toBe(false);
    expect(muted.classList.contains('is-visible')).toBe(false);
    expect(announcements()).toEqual([]);
  });

  it('keeps every pill away from assistive technology, which hears the status regions instead', () => {
    open();
    const pills = [...panel().querySelectorAll<HTMLElement>('.call-party-state')];
    expect(pills).toHaveLength(3);
    expect(pills.every((element) => element.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(panel().querySelectorAll('.call-party-states [role="status"]')).toHaveLength(3);
  });
});
