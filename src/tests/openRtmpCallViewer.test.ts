import {beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  activeInstance: undefined as any,
  closeWithoutLeaving: vi.fn(),
  currentCall: undefined as any,
  getShareUrl: vi.fn(),
  isAttachedToCall: vi.fn(),
  leaveCall: vi.fn(),
  openMedia: vi.fn()
}));

vi.mock('@components/mediaViewer/rtmp', () => ({
  AppMediaViewerRtmp: class AppMediaViewerRtmp {
    public static get activeInstance() { return mocks.activeInstance; }
    public static getShareUrl = mocks.getShareUrl;
    public closeWithoutLeaving = mocks.closeWithoutLeaving;
    public isAttachedToCall = mocks.isAttachedToCall;
    public openMedia = mocks.openMedia;
  }
}));
vi.mock('@lib/calls/rtmpCallsController', () => ({
  default: {
    get currentCall() { return mocks.currentCall; },
    leaveCall: mocks.leaveCall
  }
}));

import openRtmpCallViewer from '@lib/calls/openRtmpCallViewer';

describe('RTMP viewer open transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activeInstance = undefined;
    mocks.currentCall = {admin: true, call: {id: 'rtmp-call'}};
    mocks.getShareUrl.mockResolvedValue('https://t.me/live');
    mocks.openMedia.mockReset().mockResolvedValue(undefined);
    mocks.closeWithoutLeaving.mockResolvedValue(undefined);
    mocks.isAttachedToCall.mockReturnValue(false);
    mocks.leaveCall.mockImplementation(async(_discard, expectedCall) => {
      if(!expectedCall || mocks.currentCall === expectedCall) {
        mocks.currentCall = undefined;
      }
    });
  });

  it('leaves the exact accepted call and closes a viewer whose open rejects', async() => {
    const openError = new Error('viewer media bootstrap failed');
    const joinedCall = mocks.currentCall;
    mocks.openMedia.mockRejectedValue(openError);

    await expect(openRtmpCallViewer((-10042).toPeerId())).rejects.toBe(openError);

    expect(mocks.leaveCall).toHaveBeenCalledTimes(1);
    expect(mocks.leaveCall).toHaveBeenCalledWith(false, joinedCall);
    expect(joinedCall.call.id).toBe('rtmp-call');
    expect(mocks.closeWithoutLeaving).toHaveBeenCalledTimes(1);
  });

  it('closes a viewer from the previous call before opening the accepted replacement', async() => {
    const oldViewer = {
      closeWithoutLeaving: mocks.closeWithoutLeaving,
      isAttachedToCall: mocks.isAttachedToCall
    };
    mocks.activeInstance = oldViewer;

    await openRtmpCallViewer((-10042).toPeerId());

    expect(mocks.isAttachedToCall).toHaveBeenCalledWith(mocks.currentCall);
    expect(mocks.closeWithoutLeaving).toHaveBeenCalledTimes(1);
    expect(mocks.getShareUrl).toHaveBeenCalledTimes(1);
    expect(mocks.openMedia).toHaveBeenCalledTimes(1);
  });

  it('does not leave a newer call when an old viewer fails late', async() => {
    let rejectOpen!: (reason: unknown) => void;
    mocks.openMedia.mockReturnValue(new Promise<void>((_resolve, reject) => {
      rejectOpen = reject;
    }));
    const joinedCall = mocks.currentCall;
    const opening = openRtmpCallViewer((-10042).toPeerId());
    await vi.waitFor(() => expect(mocks.openMedia).toHaveBeenCalledTimes(1));
    mocks.currentCall = {admin: false, call: {id: 'newer-call'}};
    const openError = new Error('old viewer failed late');
    rejectOpen(openError);

    await expect(opening).rejects.toBe(openError);
    expect(mocks.leaveCall).toHaveBeenCalledWith(false, joinedCall);
    expect(mocks.currentCall.call.id).toBe('newer-call');
    expect(mocks.closeWithoutLeaving).toHaveBeenCalledTimes(1);
  });
});
