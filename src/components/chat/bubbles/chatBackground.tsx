import {batch, createSignal, onCleanup, onMount} from 'solid-js';
import ChatBackgroundPatternRenderer from '../patternRenderer';
import {DEFAULT_BACKGROUND_SLUG} from '../../../config/app';
import ChatBackgroundStore from '../../../lib/chatBackgroundStore';
import {ThemeController} from '../../../helpers/themeController';
import {Theme, WallPaper} from '../../../layer';
import {AppTheme, SETTINGS_INIT} from '../../../config/state';

import styles from './chatBackground.module.scss';
import renderImageFromUrl from '../../../helpers/dom/renderImageFromUrl';
import {getColorsFromWallPaper} from '../../../helpers/color';
import ChatBackgroundGradientRenderer from '../gradientRenderer';
import classNames from '../../../helpers/string/classNames';
import {AppManagers} from '../../../lib/appManagers/managers';
import {appState} from '../../../stores/appState';
import {averageColorFromCanvas, averageColorFromImage} from '../../../helpers/averageColor';
import highlightingColor from '../../../helpers/highlightingColor';

async function getBackgroundParameters(options: {
  themeController: ThemeController
  managers: AppManagers
  peerId?: PeerId
}) {
  const {
    themeController,
    managers,
    peerId
  } = options;

  let theme: AppTheme | Theme = themeController.getTheme();
  let wallPaper = themeController.getThemeSettings(theme).wallpaper as WallPaper.wallPaper;

  if(peerId && peerId.isUser()) {
    const full = await managers.appProfileManager.getCachedFullUser(peerId.toUserId())
    if(full?.wallpaper) {
      wallPaper = full.wallpaper as WallPaper.wallPaper;
    } else if(full?.theme_emoticon) {
      const acctTheme = appState.accountThemes.themes?.find((theme) => theme.emoticon === full.theme_emoticon);
      if(acctTheme) {
        theme = acctTheme;
        const themeWallPaper = acctTheme?.settings.find(it => it.wallpaper)?.wallpaper;
        if(themeWallPaper) {
          wallPaper = themeWallPaper as WallPaper.wallPaper;
        }
      }
    }
  }

  let backgroundUrl: string;
  try {
    backgroundUrl = getBackgroundURL(wallPaper.slug, wallPaper.settings?.pFlags.blur); // expected to throw if no cache available
  } catch{
    backgroundUrl = getBackgroundURL(DEFAULT_BACKGROUND_SLUG);
  }

  const isPattern = !!(wallPaper as WallPaper.wallPaper)?.pFlags?.pattern;
  const intensity = wallPaper.settings?.intensity && wallPaper.settings.intensity / 100;
  const isDarkPattern = !!intensity && intensity < 0;

  return {
    theme,
    backgroundUrl,
    isPattern,
    isDarkPattern,
    intensity,
    wallPaper
  };
}

function getBackgroundURL(slug: string, blur?: boolean) {
  if(slug === DEFAULT_BACKGROUND_SLUG) {
    return 'assets/img/pattern.svg'
  }

  /**
     * This delays when the background appears and makes it blink after refresh ☹️
     */
  // const hasInCache = await ChatBackgroundStore.hasWallPaperStorageUrl(slug);
  // if(!hasInCache) throw new Error('No background with this slug found in cache');

  return ChatBackgroundStore.getWallPaperStorageUrl(slug, blur);
}

async function ensureImageLoaded(image: HTMLImageElement) {
  if(!image.naturalWidth) {
    await new Promise((resolve) => {
      image.addEventListener('load', resolve, {once: true});
    });
  }
}

export function ChatBackground(props: {
  class?: string
  themeController: ThemeController
  managers: AppManagers
  peerId?: PeerId
  gradientRendererRef?: (value: ChatBackgroundGradientRenderer | undefined) => void
  onHighlightColor?: (hsla: string) => void
}) {
  let container!: HTMLDivElement;

  const [patternCanvas, setPatternCanvas] = createSignal<HTMLCanvasElement>();
  const [gradientCanvas, setGradientCanvas] = createSignal<HTMLCanvasElement>();
  const [image, setImage] = createSignal<HTMLImageElement>();
  const [url, setUrl] = createSignal<string>();

  async function createBackground() {
    const {
      backgroundUrl,
      isPattern,
      isDarkPattern,
      intensity,
      wallPaper
    } = await getBackgroundParameters(props);

    setUrl(backgroundUrl);

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
      const {canvas, gradientRenderer} = ChatBackgroundGradientRenderer.create(colors);
      gradientCanvas = canvas;
      props.gradientRendererRef?.(gradientRenderer);
      gradientCanvas.classList.add(styles.CanvasCommon);
    } else {
      props.gradientRendererRef?.(undefined);
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
      setPatternCanvas(patternCanvas);
      setGradientCanvas(gradientCanvas);
      setImage(image);
    });

    if(props.onHighlightColor) {
      let pixel: Uint8ClampedArray;
      if(image) {
        await ensureImageLoaded(image);
        pixel = averageColorFromImage(image);
      } else {
        pixel = averageColorFromCanvas(gradientCanvas);
      }

      const hsla = highlightingColor(Array.from(pixel) as any);
      props.onHighlightColor(hsla);
    }

    return {patternRenderer};
  }

  onMount(() => {
    const onResize = () => {
      ChatBackgroundPatternRenderer.resizeInstancesOf(container);
    };
    window.addEventListener('resize', onResize);

    const promise = createBackground();

    onCleanup(() => {
      window.removeEventListener('resize', onResize);
      promise.then(({patternRenderer}) => {
        patternRenderer?.cleanup(patternCanvas());
      });
    });
  });

  return (
    <div ref={container} class={classNames(styles.Container, props.class)}>
      {gradientCanvas()}
      {patternCanvas()}
      {image()}
      {url() && <img class={/* @once */ styles.CanvasCommon} style={{visibility: 'hidden'}} src={url()} />}
    </div>
  )
}
