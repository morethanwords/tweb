/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AppTheme} from '../config/state';
import type {Theme} from '../layer';
import type AppBackgroundTab from '../components/sidebarLeft/tabs/background';
import IS_TOUCH_SUPPORTED from '../environment/touchSupport';
import rootScope from '../lib/rootScope';
import {changeColorAccent, ColorRgb, getAccentColor, getAverageColor, getHexColorFromTelegramColor, getRgbColorFromTelegramColor, hexToRgb, hslaStringToHex, hsvToRgb, mixColors, rgbaToHexa, rgbaToHsla, rgbToHsv} from './color';
import {MOUNT_CLASS_TO} from '../config/debug';
import customProperties from './dom/customProperties';
import {TelegramWebViewTheme} from '../types';

export type AppColorName = 'primary-color' | 'message-out-primary-color' |
  'surface-color' | 'danger-color' | 'primary-text-color' |
  'secondary-text-color' | 'message-out-background-color' |
  'saved-color' | 'message-background-color' | 'green-color';
type AppColor = {
  rgb?: boolean,
  light?: boolean,
  lightFilled?: boolean,
  dark?: boolean,
  darkRgb?: boolean,
  darkFilled?: boolean
};

const appColorMap: {[name in AppColorName]: AppColor} = {
  'primary-color': {
    rgb: true,
    light: true,
    lightFilled: true,
    dark: true,
    darkRgb: true
  },
  'message-out-primary-color': {
    lightFilled: true
  },
  'surface-color': {
    rgb: true
  },
  'danger-color': {
    light: true,
    dark: true
  },
  'primary-text-color': {
    rgb: true
  },
  'secondary-text-color': {
    light: true,
    lightFilled: true
  },
  'message-background-color': {
    light: true,
    lightFilled: true,
    dark: true,
    darkFilled: true
  },
  'message-out-background-color': {
    light: true,
    lightFilled: true,
    dark: true,
    darkFilled: true
  },
  'saved-color': {
    lightFilled: true
  },
  'green-color': {}
};

const colorMap: {
  [name in AppTheme['name']]?: {
    [name in AppColorName]?: string
  }
} = {
  day: {
    'primary-color': '#3390ec',
    'message-out-primary-color': '#4fae4e',
    'message-background-color': '#ffffff',
    'surface-color': '#ffffff',
    'danger-color': '#df3f40',
    'primary-text-color': '#000000',
    'secondary-text-color': '#707579',
    'saved-color': '#359AD4',
    'green-color': '#70b768'
  },
  night: {
    'primary-color': '#8774E1',
    'message-out-primary-color': '#8774E1',
    'message-background-color': '#212121',
    'surface-color': '#212121',
    'danger-color': '#ff595a',
    'primary-text-color': '#ffffff',
    'secondary-text-color': '#aaaaaa',
    'saved-color': '#8774E1',
    'green-color': '#5CC85E'
  }
};

export class ThemeController {
  private themeColor: string;
  private _themeColorElem: Element;
  private systemTheme: AppTheme['name'];
  private styleElement: HTMLStyleElement;
  public AppBackgroundTab: typeof AppBackgroundTab;

  constructor() {
    rootScope.addEventListener('theme_change', () => {
      this.setTheme();
    });

    // rootScope.addEventListener('settings_updated', ())
  }

  private get themeColorElem() {
    if(this._themeColorElem !== undefined) {
      return this._themeColorElem;
    }

    return this._themeColorElem = document.head.querySelector('[name="theme-color"]') as Element || null;
  }

  public setThemeColor(color = this.themeColor) {
    if(!color) {
      color = this.isNight() ? '#212121' : '#ffffff';
    }

    const themeColorElem = this.themeColorElem;
    if(themeColorElem) {
      themeColorElem.setAttribute('content', color);
    }
  }

  public setThemeListener() {
    try {
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const checkDarkMode = () => {
        // const theme = this.getTheme();
        this.systemTheme = darkModeMediaQuery.matches ? 'night' : 'day';
        // const newTheme = this.getTheme();

        if(rootScope.myId) {
          rootScope.dispatchEvent('theme_change');
        } else {
          this.setTheme();
        }
      };

      if('addEventListener' in darkModeMediaQuery) {
        darkModeMediaQuery.addEventListener('change', checkDarkMode);
      } else if('addListener' in darkModeMediaQuery) {
        (darkModeMediaQuery as any).addListener(checkDarkMode);
      }

      checkDarkMode();
    } catch(err) {

    }
  }

  public applyHighlightningColor() {
    let hsla: string;
    const theme = this.getTheme();
    if(theme.settings?.highlightningColor) {
      hsla = theme.settings.highlightningColor;
      document.documentElement.style.setProperty('--message-highlightning-color', hsla);
    } else {
      document.documentElement.style.removeProperty('--message-highlightning-color');
    }

    if(!IS_TOUCH_SUPPORTED && hsla) {
      this.themeColor = hslaStringToHex(hsla);
    }
  }

  public setTheme() {
    const isNight = this.isNight();
    const colorScheme = document.head.querySelector('[name="color-scheme"]');
    colorScheme?.setAttribute('content', isNight ? 'dark' : 'light');

    document.documentElement.classList.toggle('night', isNight);
    this.setThemeColor();
    const theme = this.getTheme();
    this.applyTheme(theme);

    let style = this.styleElement;
    if(!style) {
      style = this.styleElement = document.createElement('style');
      document.head.append(style);
    }

    const e = document.createElement('div');
    this.applyTheme(rootScope.settings.themes.find((theme) => theme.name === 'night'), e);
    style.textContent = `.night {${e.style.cssText}}`;

    this.applyHighlightningColor();
    rootScope.dispatchEventSingle('theme_changed');
  }

  public async switchTheme(name: AppTheme['name']) {
    await rootScope.managers.appStateManager.setByKey('settings.theme', name);
    rootScope.dispatchEvent('theme_change');
  }

  public isNight() {
    return this.getTheme().name === 'night';
  }

  public getTheme(name: AppTheme['name'] = rootScope.settings.theme === 'system' ? this.systemTheme : rootScope.settings.theme) {
    return rootScope.settings.themes.find((t) => t.name === name);
  }

  // theme applier
  private bindColorApplier(options: Pick<Parameters<ThemeController['applyAppColor']>[0], 'element' | 'isNight'>) {
    const appliedColors: Set<AppColorName> = new Set();
    return {
      applyAppColor: (_options: Omit<Parameters<ThemeController['applyAppColor']>[0], keyof typeof options>) => {
        appliedColors.add(_options.name);
        return this.applyAppColor({..._options, ...options});
      },
      finalize: () => {
        const isNight = options.isNight;
        for(const name in appColorMap) {
          if(!appliedColors.has(name as AppColorName)) {
            this.applyAppColor({
              name: name as AppColorName,
              hex: colorMap[isNight ? 'night' : 'day'][name as AppColorName],
              ...options
            });
          }
        }
      }
    };
  };

  public applyAppColor({
    name,
    hex,
    element,
    lightenAlpha = 0.08,
    darkenAlpha = lightenAlpha,
    mixColor,
    isNight = this.isNight()
  }: {
    name: AppColorName,
    hex: string,
    element: HTMLElement,
    lightenAlpha?: number
    darkenAlpha?: number,
    mixColor?: ColorRgb,
    isNight?: boolean
  }) {
    const appColor = appColorMap[name];
    const rgb = hexToRgb(hex);
    const hsla = rgbaToHsla(...rgb);

    mixColor ??= hexToRgb(colorMap[isNight ? 'night' : 'day']['surface-color']);
    const lightenedRgb = mixColors(rgb, mixColor, lightenAlpha);

    const darkenedHsla: typeof hsla = {
      ...hsla,
      l: hsla.l - darkenAlpha * 100
    };

    const properties: [string, string][] = [
      [name, hex],
      appColor.rgb && [name + '-rgb', rgb.join(',')],
      appColor.light && ['light-' + name, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${lightenAlpha})`],
      appColor.lightFilled && ['light-filled-' + name, rgbaToHexa(lightenedRgb)],
      appColor.dark && ['dark-' + name, `hsl(${darkenedHsla.h}, ${darkenedHsla.s}%, ${darkenedHsla.l}%)`]
      // appColor.darkFilled && ['dark-' + name, `hsl(${darkenedHsla.h}, ${darkenedHsla.s}%, ${darkenedHsla.l}%)`]
    ];

    const isDocumentElement = element === document.documentElement;
    properties.filter(Boolean).forEach(([name, value]) => {
      element.style.setProperty('--' + name, value);

      if(isDocumentElement) {
        customProperties.setPropertyCache(name as AppColorName, value);
      }
    });
  }

  public async applyNewTheme(theme: Theme) {
    const isNight = this.isNightTheme(theme);
    const currentTheme = this.getTheme();
    const themes = rootScope.settings.themes;
    const themeSettings = theme.settings.find((themeSettings) => themeSettings.base_theme._ === (isNight ? 'baseThemeNight' : 'baseThemeClassic'));
    const newAppTheme: AppTheme = {
      ...theme,
      name: currentTheme.name,
      settings: {
        ...themeSettings,
        highlightningColor: ''
      }
    };

    await this.AppBackgroundTab.setBackgroundDocument(themeSettings.wallpaper, newAppTheme.settings);
    themes[themes.indexOf(currentTheme)] = newAppTheme;
    await rootScope.managers.appStateManager.setByKey('settings.themes', rootScope.settings.themes);
    rootScope.dispatchEvent('theme_change');
  }

  private isNightTheme(theme: Theme | AppTheme) {
    return (theme as AppTheme).name === 'night' || this.isNight();
  }

  public applyTheme(theme: Theme | AppTheme, element = document.documentElement) {
    const isNight = this.isNightTheme(theme);
    const themeSettings = Array.isArray(theme.settings) ?
      theme.settings.find((settings) => settings.base_theme._ === (isNight ? 'baseThemeNight' : 'baseThemeClassic')) :
      theme.settings;
    const baseColors = colorMap[isNight ? 'night' : 'day'];

    let hsvTemp1 = rgbToHsv(...hexToRgb(baseColors['primary-color'])); // primary base
    let hsvTemp2 = rgbToHsv(...getRgbColorFromTelegramColor(themeSettings.accent_color)); // new primary

    const newAccentRgb = changeColorAccent(
      hsvTemp1,
      hsvTemp2,
      hexToRgb(baseColors['primary-color']),
      !isNight
    );
    const newAccentHex = rgbaToHexa(newAccentRgb);

    const {applyAppColor, finalize} = this.bindColorApplier({element, isNight});

    applyAppColor({
      name: 'primary-color',
      hex: newAccentHex,
      darkenAlpha: 0.04
    });

    applyAppColor({
      name: 'saved-color',
      hex: newAccentHex,
      lightenAlpha: 0.64,
      mixColor: [255, 255, 255]
    });

    if(!themeSettings.message_colors?.length) {
      return;
    }

    const messageLightenAlpha = isNight ? 0.92 : 0.12;
    const baseMessageColor = hexToRgb(baseColors['message-out-primary-color']);
    hsvTemp1 = rgbToHsv(...baseMessageColor);
    const baseMessageOutBackgroundColor = mixColors(baseMessageColor, hexToRgb(baseColors['surface-color']), messageLightenAlpha);

    const firstColor = getRgbColorFromTelegramColor(themeSettings.message_colors[0]);

    let myMessagesAccent = firstColor;
    if(themeSettings.message_colors.length > 1) {
      // const w = getAccentColor(hsvTemp1, baseMessageOutBackgroundColor, myMessagesAccent);

      themeSettings.message_colors.slice(1).forEach((nextColor) => {
        myMessagesAccent = getAverageColor(myMessagesAccent, getRgbColorFromTelegramColor(nextColor));
      });

      myMessagesAccent = getAccentColor(hsvTemp1, baseMessageOutBackgroundColor, myMessagesAccent);

      // console.log('www', rgbaToHexa(w), rgbaToHexa(myMessagesAccent));
    }

    const o = myMessagesAccent;
    hsvTemp2 = rgbToHsv(...o);

    // const c = changeColorAccent(
    //   hsvTemp1,
    //   hsvTemp2,
    //   baseMessageOutBackgroundColor
    // );

    // console.log(o, c, rgbaToHexa(o), rgbaToHexa(c));

    const accentColor2 = themeSettings.outbox_accent_color !== undefined && rgbToHsv(...getRgbColorFromTelegramColor(themeSettings.outbox_accent_color));

    const newMessageOutBackgroundColor = mixColors(myMessagesAccent, hexToRgb(baseColors['surface-color']), messageLightenAlpha);

    applyAppColor({
      name: 'message-out-background-color',
      hex: rgbaToHexa(newMessageOutBackgroundColor),
      lightenAlpha: messageLightenAlpha
    });

    applyAppColor({
      name: 'message-out-primary-color',
      hex: isNight ? '#ffffff' : rgbaToHexa(accentColor2 ? hsvToRgb(...accentColor2) : myMessagesAccent),
      mixColor: newMessageOutBackgroundColor
    });

    // if(accentColor2) {
    //   console.log(rgbaToHexa(myMessagesAccent), rgbaToHexa(hsvToRgb(...accentColor2)));
    // }

    finalize();
  }

  public getThemeParamsForWebView() {
    const themePropertiesMap: {[key in keyof TelegramWebViewTheme]: string} = {
      bg_color: 'surface-color',
      button_color: 'primary-color',
      button_text_color: '#ffffff',
      hint_color: 'secondary-text-color',
      link_color: 'link-color',
      secondary_bg_color: 'background-color-true',
      text_color: 'primary-text-color'
    };
    const themeParams: TelegramWebViewTheme = {} as any;
    for(const key in themePropertiesMap) {
      const value = themePropertiesMap[key as keyof TelegramWebViewTheme];
      themeParams[key as keyof TelegramWebViewTheme] = value[0] === '#' ? value : customProperties.getProperty(value as AppColorName);
    }

    return themeParams;
  }
}

const themeController = new ThemeController();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.themeController = themeController);
export default themeController;
