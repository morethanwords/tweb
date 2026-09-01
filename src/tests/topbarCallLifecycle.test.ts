import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';

const mocks = vi.hoisted(() => {
  type Listener = (...args: any[]) => void;

  class Emitter {
    private listeners = new Map<string, Set<Listener>>();

    public addEventListener(name: string, listener: Listener) {
      (this.listeners.get(name) || this.createListeners(name)).add(listener);
    }

    public removeEventListener(name: string, listener: Listener) {
      this.listeners.get(name)?.delete(listener);
    }

    public dispatchEvent(name: string, ...args: any[]) {
      for(const listener of [...(this.listeners.get(name) || [])]) listener(...args);
    }

    public clear() {
      this.listeners.clear();
    }

    private createListeners(name: string) {
      const listeners = new Set<Listener>();
      this.listeners.set(name, listeners);
      return listeners;
    }
  }

  class GroupCallInstance extends Emitter {
    public id = 'call';
    public chatId = 0;
    public state = 1;
    public isMuted = true;
    public participant = {pFlags: {can_self_unmute: true, muted: true}};
    public participants = Promise.resolve(new Map<PeerId, unknown>());
  }

  class CallInstance extends Emitter {}
  class RtmpCallInstance extends Emitter {}
  class PopupGroupCall {
    public show = vi.fn();
  }

  class DescriptionWidget {
    public update() {}
    public detach() {}
  }

  const callsController = new Emitter();
  const groupCallsController = new Emitter() as Emitter & {groupCall?: GroupCallInstance};
  const rootScope = new Emitter();
  const rtmpCallsController = new Emitter();

  return {
    CallInstance,
    DescriptionWidget,
    GroupCallInstance,
    PopupGroupCall,
    RtmpCallInstance,
    callsController,
    groupCallsController,
    plate: undefined as {
      container: HTMLElement,
      setHidden: ReturnType<typeof vi.fn>,
      destroy: ReturnType<typeof vi.fn>
    } | undefined,
    rootScope,
    rtmpCallsController,
    popupCreate: vi.fn(),
    popups: [] as unknown[],
    setTransition: vi.fn(),
    transitionTimeout: undefined as ReturnType<typeof setTimeout> | undefined
  };
});

vi.mock('@components/chat/topbarPlate', () => ({
  default: {},
  createTopbarPlate: (options: {initiallyHidden?: boolean}) => {
    const container = document.createElement('div');
    let hidden = options.initiallyHidden ?? true;
    const syncHidden = () => container.classList.toggle('hide', hidden);
    const setHidden = vi.fn((next: boolean) => {
      hidden = next;
      syncHidden();
    });
    syncHidden();

    return mocks.plate = {
      container,
      setHidden,
      destroy: vi.fn()
    };
  }
}));

vi.mock('@components/singleTransition', () => ({
  default: (options: {
    element: HTMLElement,
    className: string,
    forwards: boolean,
    duration: number,
    onTransitionEnd?: () => void
  }) => {
    mocks.setTransition(options);
    if(mocks.transitionTimeout !== undefined) clearTimeout(mocks.transitionTimeout);
    options.element.classList.toggle('forwards', options.forwards);
    if(options.forwards) {
      options.element.classList.add(options.className);
      mocks.transitionTimeout = setTimeout(() => {
        mocks.transitionTimeout = undefined;
      }, options.duration);
      return;
    }

    mocks.transitionTimeout = setTimeout(() => {
      mocks.transitionTimeout = undefined;
      options.element.classList.remove(options.className);
      options.onTransitionEnd?.();
    }, options.duration);
  }
}));

vi.mock('@lib/calls/callsController', () => ({default: mocks.callsController}));
vi.mock('@lib/calls/groupCallsController', () => ({default: mocks.groupCallsController}));
vi.mock('@lib/calls/rtmpCallsController', () => ({
  default: mocks.rtmpCallsController,
  RtmpCallInstance: mocks.RtmpCallInstance
}));
vi.mock('@lib/calls/groupCallInstance', () => ({default: mocks.GroupCallInstance}));
vi.mock('@lib/calls/callInstance', () => ({default: mocks.CallInstance}));
vi.mock('@lib/rootScope', () => ({default: mocks.rootScope}));

vi.mock('@components/groupCall/title', () => ({default: mocks.DescriptionWidget}));
vi.mock('@components/groupCall/description', () => ({default: mocks.DescriptionWidget}));
vi.mock('@components/call/description', () => ({default: mocks.DescriptionWidget}));
vi.mock('@components/rtmp/description', () => ({default: mocks.DescriptionWidget}));
vi.mock('@components/peerTitle', () => ({
  default: class PeerTitle {
    public element = document.createElement('span');
  }
}));
vi.mock('@components/groupCall', () => ({default: mocks.PopupGroupCall}));
vi.mock('@components/call', () => ({default: class PopupCall {}}));
vi.mock('@components/popups', () => ({
  default: class PopupElement {
    public static getPopups(ctor: new(...args: any[]) => unknown): unknown[] {
      return mocks.popups.filter((popup) => popup instanceof ctor);
    }
    public static createPopup(ctor: new(...args: any[]) => unknown): unknown {
      const popup = new ctor();
      mocks.popups.push(popup);
      mocks.popupCreate(popup);
      return popup;
    }
  }
}));
vi.mock('@components/mediaViewer/rtmp', () => ({
  AppMediaViewerRtmp: {closeActivePip: vi.fn()}
}));
vi.mock('@components/buttonTsx', () => {
  const Button = Object.assign((): null => null, {Icon: (): null => null});
  return {default: Button};
});
vi.mock('@components/iconTsx', () => ({IconTsx: (): null => null}));
vi.mock('@components/stackedAvatars', () => ({StackedAvatarsTsx: (): null => null}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@lib/langPack', () => ({i18n: (key: string) => document.createTextNode(key)}));
vi.mock('@components/groupCall/microphoneControl', () => ({
  getMicrophoneControlAccessibility: () => ({disabled: false, label: 'VoipUnmute'}),
  performMicrophoneControlAction: vi.fn()
}));
vi.mock('@lib/apiManagerProxy', () => ({default: {invoke: vi.fn()}}));

import createTopbarCall from '@components/topbarCall';

describe('topbar call visibility lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.className = '';
    mocks.callsController.clear();
    mocks.groupCallsController.clear();
    mocks.rootScope.clear();
    mocks.rtmpCallsController.clear();
    mocks.popupCreate.mockClear();
    mocks.popups.length = 0;
    mocks.setTransition.mockClear();
    mocks.transitionTimeout = undefined;
    mocks.plate = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.className = '';
  });

  it('slides in and out with the body class instead of hiding the plate', () => {
    const controller = createTopbarCall({} as any);
    const plate = mocks.plate!;
    const first = new mocks.GroupCallInstance();

    // The plate is parked off-screen by CSS (`.pinned-call` transforms on
    // `body.is-calling`). Flipping `hide` in the same frame as that class would
    // leave the transform transition no start value and the plate would jump in.
    expect(plate.container.classList).not.toContain('hide');

    mocks.groupCallsController.groupCall = first;
    mocks.groupCallsController.dispatchEvent('instance', first);
    expect(document.body.classList).toContain('is-calling');
    expect(document.body.classList).toContain('forwards');

    first.state = GROUP_CALL_STATE.CLOSED;
    first.dispatchEvent('state', GROUP_CALL_STATE.CLOSED);
    // The exit animation owns the whole 250ms — nothing is torn down early.
    expect(document.body.classList).toContain('is-calling');
    vi.advanceTimersByTime(249);
    expect(document.body.classList).toContain('is-calling');

    vi.advanceTimersByTime(1);
    expect(document.body.classList).not.toContain('is-calling');
    expect(plate.setHidden).not.toHaveBeenCalled();

    const second = new mocks.GroupCallInstance();
    mocks.groupCallsController.groupCall = second;
    mocks.groupCallsController.dispatchEvent('instance', second);
    expect(document.body.classList).toContain('is-calling');
    expect(plate.container.classList).not.toContain('hide');

    controller.destroy();
  });

  it('reopens an active group-call popup after an automatic recovery', () => {
    const controller = createTopbarCall({} as any);
    const first = new mocks.GroupCallInstance();
    mocks.groupCallsController.groupCall = first;
    mocks.groupCallsController.dispatchEvent('instance', first);
    mocks.popups.push(new mocks.PopupGroupCall());

    first.state = GROUP_CALL_STATE.CLOSED;
    first.dispatchEvent('state', GROUP_CALL_STATE.CLOSED);
    mocks.popups.length = 0;

    const replacement = new mocks.GroupCallInstance();
    mocks.groupCallsController.groupCall = replacement;
    mocks.groupCallsController.dispatchEvent('instance', replacement, true);

    expect(mocks.popupCreate).toHaveBeenCalledTimes(1);
    expect((mocks.popups[0] as InstanceType<typeof mocks.PopupGroupCall>).show).toHaveBeenCalledTimes(1);
    controller.destroy();
  });

  it('does not let an interrupted exit hide a fast replacement', () => {
    const controller = createTopbarCall({} as any);
    const first = new mocks.GroupCallInstance();
    mocks.groupCallsController.groupCall = first;
    mocks.groupCallsController.dispatchEvent('instance', first);

    first.state = GROUP_CALL_STATE.CLOSED;
    first.dispatchEvent('state', GROUP_CALL_STATE.CLOSED);
    vi.advanceTimersByTime(100);

    const replacement = new mocks.GroupCallInstance();
    mocks.groupCallsController.groupCall = replacement;
    mocks.groupCallsController.dispatchEvent('instance', replacement, true);
    vi.advanceTimersByTime(250);

    // The replacement re-entered the plate mid-exit: the exit's timer must not
    // pull the panel out from under it.
    expect(document.body.classList).toContain('is-calling');
    expect(mocks.plate!.container.classList).not.toContain('hide');
    controller.destroy();
  });

  it('does not reopen a popup for an ordinary subsequent call', () => {
    const controller = createTopbarCall({} as any);
    const first = new mocks.GroupCallInstance();
    mocks.groupCallsController.groupCall = first;
    mocks.groupCallsController.dispatchEvent('instance', first);
    mocks.popups.push(new mocks.PopupGroupCall());

    first.state = GROUP_CALL_STATE.CLOSED;
    first.dispatchEvent('state', GROUP_CALL_STATE.CLOSED);
    mocks.popups.length = 0;

    const replacement = new mocks.GroupCallInstance();
    mocks.groupCallsController.groupCall = replacement;
    mocks.groupCallsController.dispatchEvent('instance', replacement);

    expect(mocks.popupCreate).not.toHaveBeenCalled();
    controller.destroy();
  });
});
