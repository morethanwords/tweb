import {batch, createEffect, on, onCleanup, onMount} from 'solid-js';
import {createStore, reconcile} from 'solid-js/store';

import {SETTINGS_INIT} from '../../config/state';
import {DEFAULT_BACKGROUND_SLUG} from '../../config/app';
import {useLockScreenHotReloadGuard} from '../../lib/solidjs/hotReloadGuard';
import ChatBackgroundStore from '../../lib/chatBackgroundStore';
import {logger} from '../../lib/logger';
import ListenerSetter from '../../helpers/listenerSetter';
import renderImageFromUrl from '../../helpers/dom/renderImageFromUrl';
import {getColorsFromWallPaper} from '../../helpers/color';
import mediaSizes, {ScreenSize} from '../../helpers/mediaSizes';
import {WallPaper} from '../../layer';

import ChatBackgroundGradientRenderer from '../chat/gradientRenderer';
import ChatBackgroundPatternRenderer from '../chat/patternRenderer';

import styles from './background.module.scss';

type StateStore = {
  isMobile: boolean;
  image?: HTMLImageElement;
  patternCanvas?: HTMLCanvasElement;
  gradientCanvas?: HTMLCanvasElement;
};

const log = logger('my-debug');

const Background = () => {
  const {themeController} = useLockScreenHotReloadGuard();

  let container: HTMLDivElement;
  const listenerSetter = new ListenerSetter();

  const [store, setStore] = createStore<StateStore>({
    isMobile: mediaSizes.activeScreen === ScreenSize.mobile
  });

  async function getBackgroundURL(slug: string) {
    if(slug === DEFAULT_BACKGROUND_SLUG) {
      return '/assets/img/pattern.svg' // ChatBackgroundStore.getWallPaperStorageUrl(slug);
    }

    return ChatBackgroundStore.getBackground({slug});
  }

  async function tryGetBackgroundURL(slug: string) {
    try {
      const backgroundUrl = await getBackgroundURL(slug);
      return backgroundUrl;
    } catch{
      return undefined;
    }
  }

  async function getBackgroundParameters() {
    try {
      const theme = themeController.getTheme();
      const slug = (theme.settings?.wallpaper as WallPaper.wallPaper)?.slug;

      const backgroundUrl = slug ? await getBackgroundURL(slug) : undefined; // expected to throw if no cache available

      const {wallpaper: wallPaper} = themeController.getThemeSettings(theme);
      const isPattern = !!(wallPaper as WallPaper.wallPaper)?.pFlags?.pattern;
      const intensity = wallPaper.settings?.intensity && wallPaper.settings.intensity / 100;
      const isDarkPattern = !!intensity && intensity < 0;

      return {
        backgroundUrl,
        isPattern,
        isDarkPattern,
        intensity,
        wallPaper
      };
    } catch{
      const theme = themeController.getTheme();
      const defaultTheme = SETTINGS_INIT.themes.find((t) => t.name === theme.name);
      const slug = (defaultTheme.settings?.wallpaper as WallPaper.wallPaper)?.slug || DEFAULT_BACKGROUND_SLUG;

      const backgroundUrl = await tryGetBackgroundURL(slug) ;

      const {wallpaper: wallPaper} = themeController.getThemeSettings(defaultTheme);
      const isPattern = !!(wallPaper as WallPaper.wallPaper)?.pFlags?.pattern;
      const intensity = wallPaper.settings?.intensity && wallPaper.settings.intensity / 100;
      const isDarkPattern = !!intensity && intensity < 0;

      return {
        backgroundUrl,
        isPattern,
        isDarkPattern,
        intensity,
        wallPaper
      };
    }
  }

  async function createBackground() {
    const {
      backgroundUrl,
      isPattern,
      isDarkPattern,
      intensity,
      wallPaper
    } = await getBackgroundParameters();

    let
      image: HTMLImageElement,
      patternCanvas: HTMLCanvasElement,
      gradientCanvas: HTMLCanvasElement,
      patternRenderer: ChatBackgroundPatternRenderer
    ;

    if(backgroundUrl) {
      if(isPattern) {
        const rect = container.getBoundingClientRect();
        const patternRenderer = ChatBackgroundPatternRenderer.getInstance({
          element: container,
          url: backgroundUrl,
          width: rect.width,
          height: rect.height,
          mask: isDarkPattern
        });

        patternCanvas = patternRenderer.createCanvas();
        patternCanvas.classList.add(styles.CanvasCommon)
        if(!isDarkPattern) patternCanvas.classList.add(styles.blend);

        patternRenderer.renderToCanvas(patternCanvas);
      } else {
        image = document.createElement('img');
        image.classList.add(styles.CanvasCommon);
        renderImageFromUrl(image, backgroundUrl);
      }
    }

    const colors = getColorsFromWallPaper(wallPaper);
    if(colors) {
      gradientCanvas = ChatBackgroundGradientRenderer.create(colors).canvas;
      gradientCanvas.classList.add(styles.CanvasCommon);
    }

    if(intensity) {
      let setOpacityTo: HTMLElement;
      if(image) {
        setOpacityTo = image;
      } else {
        setOpacityTo = isDarkPattern ? gradientCanvas : patternCanvas;
      }

      let opacityMax = Math.abs(intensity) * (isDarkPattern ? .5 : 1);
      if(image) {
        opacityMax = Math.max(0.3, 1 - intensity);
      } else if(isDarkPattern) {
        opacityMax = Math.max(0.3, opacityMax);
      }

      setOpacityTo?.style.setProperty('--opacity-max', '' + opacityMax);
    }

    batch(() => {
      setStore({
        gradientCanvas,
        patternCanvas,
        image
      });
    });

    return {patternRenderer};
  }

  onMount(() => {
    listenerSetter.add(window)('resize', () => {
      ChatBackgroundPatternRenderer.resizeInstancesOf(container);
    });
    listenerSetter.add(mediaSizes)('changeScreen', (_, to) => {
      setStore({
        isMobile: to === ScreenSize.mobile
      });
    });
  });

  createEffect(on(() => store.isMobile, () => {
    if(store.isMobile) return;
    const promise = createBackground();

    onCleanup(() => {
      const patternCanvas = store.patternCanvas;
      promise.then(({patternRenderer}) => {
        patternRenderer?.cleanup(patternCanvas);
      });

      setStore(reconcile({
        isMobile: store.isMobile
      }));
    });
  }));

  onCleanup(() => {
    listenerSetter.removeAll();
  });

  return (
    <div ref={container} class={styles.Container}>
      {store.gradientCanvas}
      {store.patternCanvas}
      {store.image}
    </div>
  );
};

export default Background;
