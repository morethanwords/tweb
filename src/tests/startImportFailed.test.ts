import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const RELOADED_AT_KEY = 'tweb_start_reloaded_at';

// * what the page is left with when a part of the app does not load at start: a reload, or the screen that asks for one
describe('a start whose import fails', () => {
  const reload = vi.fn();
  // * the props of every popup opened, which the screen is
  let popups: any[];
  // * the keys of the language pack applied
  let strings: Map<string, unknown>;

  const load = async() => {
    vi.resetModules();
    vi.doMock('@components/appNavigationController', () => ({default: {reload}}));
    vi.doMock('@lib/langPack', () => ({default: {strings}, i18n: (key: string) => key}));
    vi.doMock('@components/popups/indexTsx', () => ({
      default: (props: any) => popups.push(props),
      createPopup: (callback: () => any) => callback()
    }));
    return (await import('@/pages/deactivatedScreen')).onStartImportFailed;
  };

  const err = new TypeError('Failed to fetch dynamically imported module');

  beforeEach(() => {
    reload.mockClear();
    popups = [];
    strings = new Map(['Deactivated.LoadFailed.Title', 'Deactivated.LoadFailed.Subtitle'].map((key) => [key, {}]));
    window.sessionStorage.clear();
    document.body.classList.remove('deactivated');
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock('@components/appNavigationController');
    vi.doUnmock('@lib/langPack');
    vi.doUnmock('@components/popups/indexTsx');
  });

  it('reloads the page by itself, and keeps when', async() => {
    const onStartImportFailed = await load();

    expect(() => onStartImportFailed(err)).toThrow(err);

    // * as the address is: a link the page was opened by is followed after the reload
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith(false);
    expect(popups).toEqual([]);
    expect(Date.now() - +window.sessionStorage.getItem(RELOADED_AT_KEY)).toBeLessThan(1000);
  });

  it('asks for a reload instead when it failed again within minutes of the last one, and reloads on a click', async() => {
    window.sessionStorage.setItem(RELOADED_AT_KEY, '' + (Date.now() - 60e3));
    const onStartImportFailed = await load();

    expect(() => onStartImportFailed(err)).toThrow(err);

    expect(reload).not.toHaveBeenCalled();
    expect(document.body.classList.contains('deactivated')).toBe(true);
    expect(popups).toHaveLength(1);
    expect(popups[0].children.map((element: HTMLElement) => element.textContent)).toEqual([
      'Deactivated.LoadFailed.Title',
      'Deactivated.LoadFailed.Subtitle'
    ]);

    popups[0].onClose();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledWith(false);
  });

  it('says it with strings every pack has when the one applied is from before the screen\'s own', async() => {
    window.sessionStorage.setItem(RELOADED_AT_KEY, '' + Date.now());
    strings.clear();
    const onStartImportFailed = await load();

    expect(() => onStartImportFailed(err)).toThrow(err);

    expect(popups[0].children.map((element: HTMLElement) => element.textContent)).toEqual([
      'ConnectionStatus.Waiting',
      'BotWebViewReloadPage'
    ]);
  });

  it('reloads by itself again once the last reload is minutes old', async() => {
    window.sessionStorage.setItem(RELOADED_AT_KEY, '' + (Date.now() - 10 * 60e3));
    const onStartImportFailed = await load();

    expect(() => onStartImportFailed(err)).toThrow(err);

    expect(reload).toHaveBeenCalledTimes(1);
    expect(popups).toEqual([]);
  });

  it('never reloads by itself in a tab that cannot keep when it did', async() => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    const onStartImportFailed = await load();

    expect(() => onStartImportFailed(err)).toThrow(err);

    expect(reload).not.toHaveBeenCalled();
    expect(popups).toHaveLength(1);
  });

  it('acts on the first failure of a page only', async() => {
    const onStartImportFailed = await load();

    expect(() => onStartImportFailed(err)).toThrow(err);
    expect(() => onStartImportFailed(new TypeError('another'))).toThrow('another');

    expect(reload).toHaveBeenCalledTimes(1);
    expect(popups).toEqual([]);
  });
});

describe('bootstrapIm', () => {
  afterEach(() => {
    for(const path of ['@/pages/deactivatedScreen', '@/pages/appTopLevel', '@/pages/mountAuthFlow', '@lib/rootScope', '@helpers/voiceRecorder/isNativeSupported']) {
      vi.doUnmock(path);
    }
  });

  it('hands a top level that does not load to the start\'s failure, and goes no further', async() => {
    vi.resetModules();
    const onStartImportFailed = vi.fn((err: unknown): never => {
      throw err;
    });
    const disposeActiveAuthFlow = vi.fn();
    vi.doMock('@/pages/deactivatedScreen', () => ({onStartImportFailed}));
    vi.doMock('@/pages/mountAuthFlow', () => ({disposeActiveAuthFlow}));
    vi.doMock('@lib/rootScope', () => ({default: {managers: {appStateManager: {pushToState: async() => {}}}}}));
    vi.doMock('@helpers/voiceRecorder/isNativeSupported', () => ({default: () => true}));
    vi.doMock('@/pages/appTopLevel', () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });

    const {bootstrapIm} = await import('@/pages/bootstrapIm');
    await expect(bootstrapIm()).rejects.toThrow();

    expect(onStartImportFailed).toHaveBeenCalledTimes(1);
    expect(disposeActiveAuthFlow).not.toHaveBeenCalled();
  });
});
