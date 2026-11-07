import '@/tests/mocks/chatInputIntegrationUi';
import {AppImManager} from '@lib/appImManager';
import ChatBackgroundStore from '@lib/chatBackgroundStore';
import themeController from '@helpers/themeController';
import {SETTINGS_INIT} from '@config/state';
import copy from '@helpers/object/copy';
import type {WallPaper} from '@layer';
import type {MockInstance} from 'vitest';

// * the cache answers nothing - as for the default pattern in an account the tab switched to in place, which
// * never had it put in. A few misses, then an answer, so that code which asks without end still finishes
function mockCacheMisses() {
  let calls = 0;
  return vi.spyOn(ChatBackgroundStore, 'getBackground').mockImplementation(() => {
    return ++calls > 20 ? Promise.resolve('blob:found') : Promise.reject(new Error('NO_ENTRY_FOUND'));
  });
}

function setUp(wallPaperSlug?: string) {
  const theme = copy(SETTINGS_INIT.themes.find((t) => t.name === 'day'));
  if(wallPaperSlug) {
    theme.settings.forEach((settings) => {
      settings.wallpaper = {...settings.wallpaper, slug: wallPaperSlug} as WallPaper.wallPaper;
    });
  }

  vi.spyOn(themeController, 'getTheme').mockReturnValue(theme);
  const host = {
    managers: {},
    setBackground: vi.fn(() => Promise.resolve()),
    setCurrentBackground: AppImManager.prototype.setCurrentBackground
  };

  return {theme, host};
}

// * the cache asked this many times, then the background put on once, with these arguments
function expectPutOn(
  getBackground: MockInstance,
  host: ReturnType<typeof setUp>['host'],
  lookups: number,
  ...setBackgroundArgs: unknown[]
) {
  expect(getBackground).toHaveBeenCalledTimes(lookups);
  expect(host.setBackground).toHaveBeenCalledTimes(1);
  expect(host.setBackground).toHaveBeenCalledWith(...setBackgroundArgs);
}

function getWallPaperSlug(theme: ReturnType<typeof setUp>['theme']) {
  return (themeController.getThemeSettings(theme).wallpaper as WallPaper.wallPaper).slug;
}

afterEach(() => {
  vi.restoreAllMocks();
});

test('the default pattern is not looked up in the cache: it comes with the app', async() => {
  const getBackground = mockCacheMisses();
  const {theme, host} = setUp();
  const settings = theme.settings;

  await host.setCurrentBackground(false, true);

  expectPutOn(getBackground, host, 0, false, true);
  expect(theme.settings).toBe(settings);
});

test('a wallpaper gone from the cache gives way to the default theme once, with no lookup again', async() => {
  const getBackground = mockCacheMisses();
  const {theme, host} = setUp('custom-wallpaper');

  await host.setCurrentBackground(false, true);

  expectPutOn(getBackground, host, 1, true, undefined);
  expect(getWallPaperSlug(theme)).toBe('pattern');
});

test('a wallpaper in the cache is put on as it is', async() => {
  const getBackground = vi.spyOn(ChatBackgroundStore, 'getBackground').mockResolvedValue('blob:found');
  const {theme, host} = setUp('custom-wallpaper');

  await host.setCurrentBackground(true);

  expectPutOn(getBackground, host, 1, true, undefined);
  expect(getWallPaperSlug(theme)).toBe('custom-wallpaper');
});
