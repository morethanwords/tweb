/*
 * MOUNT_CLASS_TO is `window` in every build (config/debug.ts), so the call
 * controllers and the getUserMedia chokepoints used to be reachable from any
 * script on the page in production. They are mounted under DEBUG only now.
 */
import {describe, expect, it, vi} from 'vitest';

const mounted = vi.hoisted(() => ({} as Record<string, unknown>));

vi.mock('@config/debug', () => ({default: false, MOUNT_CLASS_TO: mounted}));
vi.mock('@stores/appSettings', () => ({appSettings: {}, setAppSettings: vi.fn()}));
vi.mock('@lib/calls/helpers/getScreenStream', () => ({default: vi.fn()}));
vi.mock('@lib/apiManagerProxy', () => ({
  default: {serviceMessagePort: {addEventListener: vi.fn(), invokeVoid: vi.fn()}}
}));
vi.mock('@lib/rootScope', () => ({default: {addEventListener: vi.fn()}}));
vi.mock('@lib/calls/callTransitionCoordinator', () => ({default: {run: vi.fn()}}));

import '@lib/calls/helpers/getStream';
import '@lib/calls/helpers/getStreamCached';
import '@lib/calls/rtmpCallsController';

const NAMES = ['getStream', 'getStreamCached', 'rtmpCallsController'];

describe('call helpers on the global object', () => {
  it('mount nothing outside DEBUG', () => {
    for(const name of NAMES) {
      expect(mounted).not.toHaveProperty(name);
    }
  });

  it('mount under DEBUG, under the same names as before', async() => {
    const debugMounted: Record<string, unknown> = {};
    vi.resetModules();
    vi.doMock('@config/debug', () => ({default: true, MOUNT_CLASS_TO: debugMounted}));

    await import('@lib/calls/helpers/getStream');
    await import('@lib/calls/helpers/getStreamCached');
    await import('@lib/calls/rtmpCallsController');

    for(const name of NAMES) {
      expect(debugMounted).toHaveProperty(name);
      expect(mounted).not.toHaveProperty(name);
    }
  });
});
