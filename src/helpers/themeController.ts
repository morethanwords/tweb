/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type { Theme } from "../config/state";
import IS_TOUCH_SUPPORTED from "../environment/touchSupport";
import rootScope from "../lib/rootScope";
import { hslaStringToHex } from "./color";

export class ThemeController {
  private themeColor: string;
  private _themeColorElem: Element;
  private systemTheme: Theme['name'];

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
        //const theme = this.getTheme();
        this.systemTheme = darkModeMediaQuery.matches ? 'night' : 'day';
        //const newTheme = this.getTheme();

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
    const theme = themeController.getTheme();
    if(theme.background.highlightningColor) {
      hsla = theme.background.highlightningColor;
      document.documentElement.style.setProperty('--message-highlightning-color', hsla);
    } else {
      document.documentElement.style.removeProperty('--message-highlightning-color');
    }

    if(!IS_TOUCH_SUPPORTED && hsla) {
      themeController.themeColor = hslaStringToHex(hsla);
    }
  }

  public setTheme() {
    const isNight = this.isNight();
    const colorScheme = document.head.querySelector('[name="color-scheme"]');
    if(colorScheme) {
      colorScheme.setAttribute('content', isNight ? 'dark' : 'light');
    }

    document.documentElement.classList.toggle('night', isNight);
    this.setThemeColor();

    this.applyHighlightningColor();
  }

  public isNight() {
    return this.getTheme().name === 'night';
  }

  public getTheme(name: Theme['name'] = rootScope.settings.theme === 'system' ? this.systemTheme : rootScope.settings.theme) {
    return rootScope.settings.themes.find((t) => t.name === name);
  }
}

const themeController = new ThemeController();
export default themeController;
