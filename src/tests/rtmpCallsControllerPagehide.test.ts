/*
 * Watching a live stream is a server-side membership (phone.joinGroupCall).
 * A tab closed mid-stream now leaves it — best effort through the manager,
 * which the SharedWorker keeps alive while any other tab exists — so the
 * viewer count does not carry a ghost until the server times it out.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@config/debug', () => ({default: false, MOUNT_CLASS_TO: undefined}));
vi.mock('@lib/apiManagerProxy', () => ({
  default: {serviceMessagePort: {addEventListener: vi.fn(), invokeVoid: vi.fn()}}
}));
vi.mock('@lib/rootScope', () => ({default: {addEventListener: vi.fn()}}));
vi.mock('@lib/calls/callTransitionCoordinator', () => ({
  default: {run: vi.fn((callback: () => Promise<void>) => callback())}
}));

import {RtmpCallsController} from '@lib/calls/rtmpCallsController';

// One controller for the file: every `construct` subscribes to pagehide anew.
const hangUp = vi.fn(async() => {});
const controller = new RtmpCallsController();
controller.construct({appGroupCallsManager: {hangUp}} as any);

describe('RtmpCallsController on pagehide', () => {
  beforeEach(() => {
    hangUp.mockClear();
    (controller as any)._currentCall = undefined;
  });

  it('leaves the stream this tab is watching', () => {
    (controller as any)._currentCall = {call: {id: '42'}, ssrc: 7};

    window.dispatchEvent(new Event('pagehide'));

    expect(hangUp).toHaveBeenCalledWith('42', 7);
  });

  it('does nothing when no stream is being watched', () => {
    window.dispatchEvent(new Event('pagehide'));

    expect(hangUp).not.toHaveBeenCalled();
  });

  it('swallows a manager that is already gone', async() => {
    hangUp.mockRejectedValueOnce(new Error('port closed'));
    (controller as any)._currentCall = {call: {id: '42'}, ssrc: 7};

    window.dispatchEvent(new Event('pagehide'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(hangUp).toHaveBeenCalledTimes(1);
  });
});
