import {AppTheme} from '@config/state';
import {blendWallpaperForTinted} from '@config/themePresets';
import {hexaToRgba} from '@helpers/color';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import highlightingColor from '@helpers/highlightingColor';
import throttle from '@helpers/schedulers/throttle';
import themeController from '@helpers/themeController';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import ColorPicker, {ColorPickerColor} from '@components/colorPicker';
import SettingSection from '@components/settingSection';
import {SliderSuperTab} from '@components/slider';
import {WallPaper} from '@layer';

export default class AppBackgroundColorTab extends SliderSuperTab {
  private colorPicker: ColorPicker;
  private grid: HTMLElement;
  private applyColor: (hex: string, updateColorPicker?: boolean) => void;
  private theme: AppTheme;

  init() {
    this.container.classList.add('background-container', 'background-color-container');
    this.setTitle('SetColor');

    this.theme = themeController.getTheme();

    const section = new SettingSection({});
    this.colorPicker = new ColorPicker();

    const middleware = this.middlewareHelper.get();
    middleware.onDestroy(this.colorPicker.attachAutoResize());

    section.content.append(this.colorPicker.container);

    this.scrollable.append(section.container);

    const gridSection = new SettingSection({});

    const grid = this.grid = document.createElement('div');
    grid.classList.add('grid');

    const colors = [
      '#E6EBEE',
      '#B2CEE1',
      '#008DD0',
      '#C6E7CB',
      '#C4E1A6',
      '#60B16E',
      '#CCD0AF',
      '#A6A997',
      '#7A7072',
      '#FDD7AF',
      '#FDB76E',
      '#DD8851'
    ];

    colors.forEach((color) => {
      const item = document.createElement('div');
      item.classList.add('grid-item');
      item.dataset.color = color.toLowerCase();

      // * need for transform scale
      const media = document.createElement('div');
      media.classList.add('grid-item-media');
      media.style.backgroundColor = color;

      item.append(media);
      grid.append(item);
    });

    attachClickEvent(grid, (e) => {
      const target = findUpClassName(e.target, 'grid-item');
      if(!target || target.classList.contains('active')) {
        return;
      }

      const color = target.dataset.color;
      if(!color) {
        return;
      }

      this.applyColor(color);
    }, {listenerSetter: this.listenerSetter});

    gridSection.content.append(grid);
    this.scrollable.append(gridSection.container);

    this.applyColor = throttle(this._applyColor, 16, true);
  }

  private setActive() {
    const active = this.grid.querySelector('.active');
    const background = themeController.getThemeSettings(this.theme);
    const wallPaper = background.wallpaper;
    const color = wallPaper.settings.background_color;
    const target = color ? this.grid.querySelector(`.grid-item[data-color="${color}"]`) : null;
    if(active === target) {
      return;
    }

    if(active) {
      active.classList.remove('active');
    }

    if(target) {
      target.classList.add('active');
    }
  }

  private _applyColor = (hex: string, updateColorPicker = true) => {
    if(updateColorPicker) {
      this.colorPicker.setColor(hex);
    } else {
      const rgba = hexaToRgba(hex);
      const settings = themeController.getThemeSettings(this.theme);
      const hsla = highlightingColor(rgba);

      let wallPaper: WallPaper = {
        _: 'wallPaperNoFile',
        id: 0,
        pFlags: {},
        settings: {
          _: 'wallPaperSettings',
          background_color: parseInt(hex.slice(1), 16),
          pFlags: {}
        }
      };

      // On tinted base, blend the picked solid color toward the iOS Dark Blue palette so
      // single-color picks from "Set Color" land in the navy family same as Chat Wallpaper grid.
      if(this.theme.name === 'tinted') {
        wallPaper = blendWallpaperForTinted(wallPaper, settings.accent_color);
      }

      settings.wallpaper = wallPaper;
      settings.highlightingColor = hsla;

      this.managers.appStateManager.pushToState('settings', rootScope.settings);

      appImManager.applyCurrentTheme({
        broadcastEvent: true
      });
      this.setActive();
    }
  };

  private onColorChange = (color: ColorPickerColor) => {
    this.applyColor(color.hex, false);
  };

  onOpen() {
    setTimeout(() => {
      const settings = themeController.getThemeSettings(this.theme);
      const color = settings?.wallpaper?.settings?.background_color;

      const isColored = !!color && settings.wallpaper._ === 'wallPaperNoFile';

      // * set active if type is color
      if(isColored) {
        this.colorPicker.onChange = this.onColorChange;
      }

      this.colorPicker.setColor((color && '#' + color.toString(16)) || '#cccccc');

      if(!isColored) {
        this.colorPicker.onChange = this.onColorChange;
      }
    }, 0);
  }

  onCloseAfterTimeout() {
    this.colorPicker.onChange = undefined;
    this.colorPicker = undefined;

    return super.onCloseAfterTimeout();
  }
}
