import {For, onCleanup, onMount} from 'solid-js';
import {blendWallpaperForTinted} from '@config/themePresets';
import {hexaToRgba} from '@helpers/color';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import markGridCornerItem, {GRID_CORNER_CLASSES} from '@helpers/dom/markGridCornerItem';
import highlightingColor from '@helpers/highlightingColor';
import throttle from '@helpers/schedulers/throttle';
import ColorPicker, {ColorPickerColor} from '@components/colorPicker';
import Section from '@components/section';
import {WallPaper} from '@layer';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';

const COLORS = [
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

const BackgroundColor = () => {
  const [tab] = useSuperTab();
  const {themeController, appImManager} = useHotReloadGuard();

  const theme = themeController.getTheme();
  const colorPicker = new ColorPicker();

  let grid!: HTMLDivElement;
  let applyColor: (hex: string, updateColorPicker?: boolean) => void;

  const setActive = () => {
    const active = grid.querySelector('.active');
    const background = themeController.getThemeSettings(theme);
    const wallPaper = background?.wallpaper;
    const color = wallPaper?.settings?.background_color;
    // `background_color` is a number; swatches store data-color as "#rrggbb", so format + pad it
    // (leading-zero colors like #008dd0 must still match).
    const target = color ? grid.querySelector(`.grid-item[data-color="#${color.toString(16).padStart(6, '0')}"]`) : null;
    if(active === target) {
      return;
    }

    active?.classList.remove('active', ...GRID_CORNER_CLASSES);
    if(target) {
      target.classList.add('active');
      markGridCornerItem(grid, target);
    }
  };

  const _applyColor = (hex: string, updateColorPicker = true) => {
    if(updateColorPicker) {
      colorPicker.setColor(hex);
    } else {
      const rgba = hexaToRgba(hex);
      const settings = themeController.getThemeSettings(theme);
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
      if(theme.name === 'tinted') {
        wallPaper = blendWallpaperForTinted(wallPaper, settings.accent_color);
      }

      // `settings` is a readonly Solid store node — assigning to it is silently dropped (the same
      // bug that broke the Chat Wallpaper tab). Persist through the store setter instead.
      themeController.setWallpaperForCurrentTheme(wallPaper, hsla);

      appImManager.applyCurrentTheme({
        broadcastEvent: true
      });
      setActive();
    }
  };

  const onColorChange = (color: ColorPickerColor) => {
    applyColor(color.hex, false);
  };

  onMount(() => {
    tab.container.classList.add('background-container', 'background-color-container');

    const middleware = tab.middlewareHelper.get();
    middleware.onDestroy(colorPicker.attachAutoResize());

    applyColor = throttle(_applyColor, 16, true);

    attachClickEvent(grid, (e) => {
      const target = findUpClassName(e.target as HTMLElement, 'grid-item');
      if(!target || target.classList.contains('active')) {
        return;
      }

      const color = target.dataset.color;
      if(!color) {
        return;
      }

      applyColor(color);
    }, {listenerSetter: tab.listenerSetter});

    // mirror legacy onOpen()
    setTimeout(() => {
      const settings = themeController.getThemeSettings(theme);
      const color = settings?.wallpaper?.settings?.background_color;

      const isColored = !!color && settings.wallpaper._ === 'wallPaperNoFile';

      // * set active if type is color
      if(isColored) {
        colorPicker.onChange = onColorChange;
      }

      colorPicker.setColor((color && '#' + color.toString(16)) || '#cccccc');

      if(!isColored) {
        colorPicker.onChange = onColorChange;
      }
    }, 0);
  });

  onCleanup(() => {
    colorPicker.onChange = undefined;
  });

  return (
    <>
      <Section>
        {colorPicker.container}
      </Section>
      {/* Same grid as Chat Wallpaper — Shared-Media look, full-bleed, no Section card. The colors
          are static so there's nothing to wait on; the grid shows immediately. `background-item`
          opts each swatch into the shared selection styling (ring + corner rounding). */}
      <div>
        <div class="search-super-content-media-grid" ref={grid}>
          <For each={COLORS}>
            {(color) => (
              <div class="grid-item background-item" data-color={color.toLowerCase()}>
                <div class="grid-item-media" style={{'background-color': color}} />
              </div>
            )}
          </For>
        </div>
      </div>
    </>
  );
};

export default BackgroundColor;
