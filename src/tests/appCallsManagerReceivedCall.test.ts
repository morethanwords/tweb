/*
 * phone.receivedCall acknowledges an incoming request: until a device sends it
 * the caller sees "waiting", not "ringing". tdesktop sends it before ringing
 * (calls_call.cpp startIncoming); tweb never did.
 */
import {describe, expect, it, vi} from 'vitest';

vi.mock('@appManagers/appTabsManager', () => ({default: {getTabs: vi.fn(() => [])}}));
vi.mock('@lib/mainWorker/mainMessagePort', () => ({
  default: {getInstance: () => ({invokeVoid: vi.fn()})}
}));

import {AppCallsManager} from '@appManagers/appCallsManager';

const CALL_ID = '900';

describe('AppCallsManager.receivedCall', () => {
  it('acknowledges the call the manager holds, by its id and access hash', async() => {
    const invokeApi = vi.fn(async() => true);
    const manager = new AppCallsManager();
    Object.assign(manager as any, {
      calls: new Map([[CALL_ID, {_: 'phoneCallRequested', id: CALL_ID, access_hash: 'hash'}]]),
      apiManager: {invokeApi},
      log: Object.assign(vi.fn(), {warn: vi.fn(), error: vi.fn()})
    });

    await expect(manager.receivedCall(CALL_ID)).resolves.toBe(true);

    expect(invokeApi).toHaveBeenCalledWith('phone.receivedCall', {
      peer: {_: 'inputPhoneCall', id: CALL_ID, access_hash: 'hash'}
    });
  });
});
