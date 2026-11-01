import {SETTINGS_INIT} from '@config/state';
import {getCloudThemeWallpaper} from '@config/themePresets';
import themeController from '@helpers/themeController';
import type {Theme} from '@layer';

const factory = SETTINGS_INIT.themes.find((theme) => theme.name === 'light');
const factoryWallpaper = factory.settings.find((settings) => settings.base_theme._ === 'baseThemeDay').wallpaper;

const makeTheme = (wallpaper?: Theme['settings'][number]['wallpaper']) => ({
  _: 'theme',
  id: '1',
  access_hash: '',
  slug: 'theme',
  title: 'Theme',
  pFlags: {},
  settings: [{_: 'themeSettings', pFlags: {}, base_theme: {_: 'baseThemeDay'}, accent_color: 0x7e5fe5, message_colors: [0x7e5fe5, 0x2d7ed5], wallpaper}]
} as Theme);

describe('the plain white the server gives the Day base of a cloud theme', () => {
  const white = {_: 'wallPaperNoFile', id: 1, pFlags: {}, settings: {_: 'wallPaperSettings', pFlags: {}, background_color: 0xffffff}} as const;
  const classic = {...factoryWallpaper, slug: 'classic'};
  const make = (base: 'baseThemeDay' | 'baseThemeNight', wallpaper: any) => {
    const entry = {_: 'themeSettings', pFlags: {}, base_theme: {_: base}, accent_color: 0, wallpaper} as any;
    return {...makeTheme(), settings: [entry, {...entry, base_theme: {_: 'baseThemeClassic'}, wallpaper: classic}]} as Theme;
  };

  test('gives way to the wallpaper of the theme\'s Classic base', () => {
    const theme = make('baseThemeDay', white);
    expect(getCloudThemeWallpaper(theme, theme.settings[0])).toBe(classic);
  });

  test('another colour, or another base, stays', () => {
    const colored = {...white, settings: {...white.settings, background_color: 0xff0000}};
    const day = make('baseThemeDay', colored);
    expect(getCloudThemeWallpaper(day, day.settings[0])).toBe(colored);
    const night = make('baseThemeNight', white);
    expect(getCloudThemeWallpaper(night, night.settings[0])).toBe(white);
  });

  test('a white picked for an AppTheme stays, a chat\'s theme gets the wallpaper', () => {
    vi.spyOn(themeController as any, 'getResolvedThemeName').mockReturnValue('light');
    const theme = make('baseThemeDay', white);
    expect(themeController.getThemeWallpaper({...theme, name: 'light'} as any)).toBe(white);
    expect(themeController.getThemeWallpaper(theme)).toBe(classic);
    vi.restoreAllMocks();
  });
});

describe('a theme without a wallpaper of its own', () => {
  beforeEach(() => {
    vi.spyOn(themeController as any, 'getResolvedThemeName').mockReturnValue('light');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('keeps the current wallpaper', () => {
    const current = {...makeTheme(factoryWallpaper), name: 'light'} as any;
    vi.spyOn(themeController, 'getTheme').mockReturnValue(current);
    expect(themeController.getThemeWallpaper(makeTheme())).toBe(factoryWallpaper);
  });

  test('saved as the current theme, it gets the factory wallpaper', () => {
    const current = {...makeTheme(), name: 'light'} as any;
    vi.spyOn(themeController, 'getTheme').mockReturnValue(current);
    expect(themeController.getThemeWallpaper(current)).toBe(factoryWallpaper);
  });

  test('a wallpaper of its own stays', () => {
    const own = {...factoryWallpaper, slug: 'own'};
    vi.spyOn(themeController, 'getTheme').mockReturnValue(factory);
    expect(themeController.getThemeWallpaper(makeTheme(own))).toBe(own);
  });
});
