import {afterEach, describe, expect, it, vi} from 'vitest';

// what mounts the provider before the app is up (the media editor of the sign-up screen) has the root fill it first
describe('the registry of the app\'s top level, filled before the app is up', () => {
  afterEach(() => {
    vi.doUnmock('@lib/appDialogsManager');
    vi.doUnmock('@lib/solidjs/hotReloadGuardValue');
    vi.doUnmock('@/pages/mountAuthFlow');
  });

  it('waits for the root\'s loader every time, and for nothing without one', async() => {
    vi.resetModules();
    const {hotReloadGuardReady, registerHotReloadGuard, setHotReloadGuardLoader} = await import('@lib/solidjs/hotReloadGuardProvider');
    await hotReloadGuardReady();
    const loader = vi.fn(async() => {});
    setHotReloadGuardLoader(loader);
    await hotReloadGuardReady();
    // a singleton registers itself while the rest is still loading: no sign that the registry is filled
    registerHotReloadGuard({});
    await hotReloadGuardReady();
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('loads the top level once, the dialogs manager before the registry, and again after a failure', async() => {
    vi.resetModules();
    const order: string[] = [];
    let fail = true;
    vi.doMock('@/pages/mountAuthFlow', () => ({disposeActiveAuthFlow: () => {}}));
    vi.doMock('@lib/appDialogsManager', () => {
      order.push('appDialogsManager');
      return {default: {}};
    });
    vi.doMock('@lib/solidjs/hotReloadGuardValue', () => {
      order.push('hotReloadGuardValue');
      if(fail) throw new Error('offline');
      return {};
    });
    const {importAppTopLevel} = await import('@/pages/bootstrapIm');
    const first = importAppTopLevel();
    expect(importAppTopLevel()).toBe(first);
    await expect(first).rejects.toThrow();
    expect(order).toEqual(['appDialogsManager', 'hotReloadGuardValue']);

    fail = false;
    const again = importAppTopLevel();
    expect(again).not.toBe(first);
    await expect(again).resolves.toEqual({});
    expect(order[order.length - 1]).toBe('hotReloadGuardValue');
    expect(importAppTopLevel()).toBe(again);
  });
});
