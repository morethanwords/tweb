import {afterEach, describe, expect, it, vi} from 'vitest';

// what mounts the provider before the app is up (the media editor of the sign-up screen) has the root fill it first
describe('the registry of the app\'s top level, filled before the app is up', () => {
  afterEach(() => {
    vi.doUnmock('@lib/appDialogsManager');
    vi.doUnmock('@lib/solidjs/hotReloadGuardValue');
    vi.doUnmock('@/pages/appTopLevel');
    vi.doUnmock('@/pages/mountAuthFlow');
    vi.doUnmock('@/pages/deactivatedScreen');
  });

  // * what bootstrapIm imports beside the top level: the sign-in screens it takes down, and the start's failure
  const mockAuthAndFailure = () => {
    vi.doMock('@/pages/mountAuthFlow', () => ({disposeActiveAuthFlow: () => {}}));
    vi.doMock('@/pages/deactivatedScreen', () => ({
      onStartImportFailed: (err: unknown) => {
        throw err;
      }
    }));
  };

  // * two graphs imported one after the other fetch the second only once the first has run: a whole round of
  // * requests more on the way to the chat list, seconds on a slow link
  it('loads the top level through one import, both graphs fetched at once', async() => {
    vi.resetModules();
    const separate: string[] = [];
    const appDialogsManager = {};
    mockAuthAndFailure();
    vi.doMock('@/pages/appTopLevel', () => ({default: appDialogsManager}));
    vi.doMock('@lib/appDialogsManager', () => {
      separate.push('appDialogsManager');
      return {default: {}};
    });
    vi.doMock('@lib/solidjs/hotReloadGuardValue', () => {
      separate.push('hotReloadGuardValue');
      return {};
    });
    const {importAppTopLevel} = await import('@/pages/bootstrapIm');
    await expect(importAppTopLevel()).resolves.toBe(appDialogsManager);
    expect(separate).toEqual([]);
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
    mockAuthAndFailure();
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
