import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  baseClose: vi.fn(async(_e?: MouseEvent) => {}),
  createObjectURL: vi.fn(() => 'blob:capture'),
  currentCall: undefined as any,
  exitPictureInPicture: vi.fn(async() => {}),
  leaveCall: vi.fn(async(_discard?: boolean, _expectedCall?: unknown) => true),
  openBaseMedia: vi.fn(async(_options?: unknown) => {}),
  pictureInPictureElement: undefined as Element | undefined,
  rejoinCall: vi.fn(async() => {}),
  removeAll: vi.fn(),
  revokeObjectURL: vi.fn(),
  videoToImage: vi.fn()
}));

vi.mock('@components/mediaViewer/base', () => ({
  default: class AppMediaViewerBase {
    public buttons = {
      download: document.createElement('button'),
      forward: document.createElement('button'),
      zoomin: document.createElement('button')
    };
    public content = {mover: document.createElement('div')};
    public log = {error: vi.fn(), bindPrefix: vi.fn(() => vi.fn())};
    public managers = {appGroupCallsManager: {stopRecording: vi.fn()}};
    public wholeDiv = document.createElement('div');

    public close(e?: MouseEvent) { return mocks.baseClose(e); }
    protected _openMedia(options: unknown) { return mocks.openBaseMedia(options); }
    protected setBtnMenuToggle() {}
    protected setListeners() {}
  }
}));
vi.mock('@helpers/listenerSetter', () => ({
  default: class ListenerSetter {
    public add() { return () => {}; }
    public removeAll() { mocks.removeAll(); }
  }
}));
vi.mock('@helpers/listLoader', () => ({default: class ListLoader {}}));
vi.mock('@components/preloader', () => ({
  default: class ProgressivePreloader {
    public attach() {}
    public construct() {}
    public detach() {}
    public setManual() {}
  }
}));
vi.mock('@helpers/dom/clickEvent', () => ({attachClickEvent: vi.fn()}));
vi.mock('@helpers/dom/videoToImage', () => ({videoToImage: mocks.videoToImage}));
vi.mock('@helpers/appWindow', () => ({
  getAppWindow: () => ({
    document: {
      exitPictureInPicture: mocks.exitPictureInPicture,
      get pictureInPictureElement() { return mocks.pictureInPictureElement; }
    }
  })
}));
vi.mock('@lib/apiManagerProxy', () => ({
  default: {
    getChat: vi.fn(),
    serviceMessagePort: {addEventListener: vi.fn()}
  }
}));
vi.mock('@lib/calls/rtmpCallsController', () => ({
  default: {
    addEventListener: vi.fn(),
    get currentCall() { return mocks.currentCall; },
    leaveCall: mocks.leaveCall,
    rejoinCall: mocks.rejoinCall
  }
}));
vi.mock('@appManagers/utils/peers/getPeerActiveUsernames', () => ({
  default: () => ['public-name']
}));
vi.mock('@lib/rtmp/url', () => ({
  getRtmpShareUrl: () => 'https://t.me/public-name',
  getRtmpStreamUrl: () => 'https://stream.invalid/live'
}));
vi.mock('@components/rtmp/adminPopup', () => ({RtmpStartStreamPopup: class {}}));
vi.mock('@components/rtmp/outputDevicePopup', () => ({default: vi.fn()}));
vi.mock('@components/rtmp/recordPopup', () => ({RtmpRecordPopup: class {}}));
vi.mock('@components/popups', () => ({default: {createPopup: vi.fn()}}));
vi.mock('@components/singleTransition', () => ({default: vi.fn()}));
vi.mock('@components/toast', () => ({toastNew: vi.fn()}));
vi.mock('@helpers/dom/safePlay', () => ({default: vi.fn()}));
vi.mock('@components/rtmp/adminStreamPopup', () => ({AdminStreamPopup: vi.fn()}));
vi.mock('solid-js/web', () => ({render: vi.fn()}));
vi.mock('@components/popups/shareUrl', () => ({default: vi.fn()}));

import {AppMediaViewerRtmp} from '@components/mediaViewer/rtmp';
import deferred from './helpers/deferred';


function makeCall(id: string, peerId: PeerId) {
  return {
    admin: false,
    call: {id, participants_count: 1, pFlags: {}},
    inputCall: {_: 'inputGroupCall', id, access_hash: `${id}-hash`},
    peerId,
    ssrc: 1
  };
}

function makeViewer(call: ReturnType<typeof makeCall>) {
  const viewer = new AppMediaViewerRtmp('');
  Object.assign(viewer as any, {
    joinedCall: call,
    peerId: call.peerId,
    videoPlayer: {
      inPip: false,
      video: document.createElement('video')
    }
  });
  return viewer;
}

describe('RTMP media viewer call ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentCall = undefined;
    mocks.pictureInPictureElement = undefined;
    mocks.openBaseMedia.mockResolvedValue(undefined);
    mocks.rejoinCall.mockResolvedValue(undefined);
    mocks.leaveCall.mockImplementation(async(_discard?: boolean, expectedCall?: unknown) => {
      if(!expectedCall || mocks.currentCall === expectedCall) {
        mocks.currentCall = undefined;
        return true;
      }
      return false;
    });
    Object.defineProperty(URL, 'createObjectURL', {configurable: true, value: mocks.createObjectURL});
    Object.defineProperty(URL, 'revokeObjectURL', {configurable: true, value: mocks.revokeObjectURL});
    AppMediaViewerRtmp.activeInstance = undefined;
    AppMediaViewerRtmp.previousCapture = undefined;
    AppMediaViewerRtmp.previousPeerId = 0 as PeerId;
  });

  it('observes rejected picture-in-picture exits from detached controls', async() => {
    const error = new Error('PiP already changed');
    mocks.exitPictureInPicture.mockRejectedValue(error);
    const call = makeCall('same', (-1001).toPeerId());
    const viewer = makeViewer(call);
    Object.assign((viewer as any).videoPlayer, {
      cancelFullScreen: vi.fn(),
      inPip: true,
      lockControls: vi.fn()
    });
    Object.assign(viewer as any, {adminPanel: document.createElement('div')});
    AppMediaViewerRtmp.activeInstance = viewer;

    (viewer as any).toggleAdminPanel(true);
    AppMediaViewerRtmp.closeActivePip();
    await Promise.resolve();

    expect(mocks.exitPictureInPicture).toHaveBeenCalledTimes(2);
    expect((viewer as any).log.error).toHaveBeenCalledTimes(2);
  });

  it('does not let a delayed close leave a replacement call', async() => {
    const capture = deferred<Blob>();
    mocks.videoToImage.mockReturnValueOnce(capture.promise);
    const oldCall = makeCall('old', (-1001).toPeerId());
    const replacement = makeCall('new', (-1002).toPeerId());
    const viewer = makeViewer(oldCall);
    const oldVideo = (viewer as any).videoPlayer.video as HTMLVideoElement;
    (viewer as any).videoPlayer.inPip = true;
    AppMediaViewerRtmp.activeInstance = viewer;
    mocks.currentCall = oldCall;
    mocks.pictureInPictureElement = oldVideo;

    const closing = viewer.close();
    expect(AppMediaViewerRtmp.activeInstance).toBeUndefined();
    mocks.currentCall = replacement;
    mocks.pictureInPictureElement = document.createElement('video');
    capture.resolve(new Blob(['old']));
    await closing;

    expect(mocks.leaveCall).toHaveBeenCalledWith(false, oldCall);
    expect(mocks.exitPictureInPicture).not.toHaveBeenCalled();
    expect(mocks.currentCall).toBe(replacement);
  });

  it('publishes only the newest thumbnail when closes finish out of order', async() => {
    const oldCapture = deferred<Blob>();
    const newCapture = deferred<Blob>();
    mocks.videoToImage
    .mockReturnValueOnce(oldCapture.promise)
    .mockReturnValueOnce(newCapture.promise);
    const oldCall = makeCall('old', (-1001).toPeerId());
    const newCall = makeCall('new', (-1002).toPeerId());
    const oldViewer = makeViewer(oldCall);
    const newViewer = makeViewer(newCall);

    const closingOld = oldViewer.closeWithoutLeaving();
    const closingNew = newViewer.closeWithoutLeaving();
    newCapture.resolve(new Blob(['new']));
    await closingNew;
    oldCapture.resolve(new Blob(['old']));
    await closingOld;

    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1);
    expect(AppMediaViewerRtmp.previousPeerId).toBe(newCall.peerId);
    expect(AppMediaViewerRtmp.previousCapture).toBe('blob:capture');
  });

  it('rejects an opening viewer when its call changes before listeners attach', async() => {
    const openingMedia = deferred<void>();
    mocks.openBaseMedia.mockReturnValueOnce(openingMedia.promise);
    const call = makeCall('old', (-1001).toPeerId());
    const replacement = makeCall('new', (-1002).toPeerId());
    const viewer = new AppMediaViewerRtmp('');
    mocks.currentCall = call;

    const opening = viewer.openMedia({peerId: call.peerId, isAdmin: false});
    await vi.waitFor(() => expect(mocks.openBaseMedia).toHaveBeenCalledTimes(1));
    mocks.currentCall = replacement;
    openingMedia.resolve();

    await expect(opening).rejects.toThrow('RTMP call changed while opening its viewer');
    await viewer.closeWithoutLeaving();
    expect(mocks.currentCall).toBe(replacement);
  });

  it('does not re-arm a rejoin timer after the viewer closes', async() => {
    const rejoin = deferred<void>();
    mocks.rejoinCall.mockReturnValueOnce(rejoin.promise);
    const call = makeCall('same', (-1001).toPeerId());
    const viewer = makeViewer(call);
    mocks.currentCall = call;

    (viewer as any).rejoin();
    await vi.waitFor(() => expect(mocks.rejoinCall).toHaveBeenCalledTimes(1));
    await viewer.closeWithoutLeaving();
    const schedule = vi.spyOn(window, 'setTimeout');
    rejoin.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(schedule).not.toHaveBeenCalled();
    expect(mocks.currentCall).toBe(call);
    schedule.mockRestore();
  });
});
