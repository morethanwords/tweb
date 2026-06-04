import {createEffect, createResource, on, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';
import {averageColor, averageColorFromCanvas} from '@helpers/averageColor';
import deferredPromise, {CancellablePromise} from '@helpers/cancellablePromise';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import highlightingColor from '@helpers/highlightingColor';
import copy from '@helpers/object/copy';
import ChatBackgroundGradientRenderer from '@components/chat/gradientRenderer';
import {ChatBackground as ChatBackgroundLayer} from '@components/chat/bubbles/chatBackground';
import {BaseTheme, Document, WallPaper, WebDocument} from '@layer';
import {MyDocument} from '@appManagers/appDocsManager';
import appDownloadManager, {AppDownloadManager} from '@lib/appDownloadManager';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import {useAppSettings} from '@stores/appSettings';
import {unwrap} from 'solid-js/store';
import Section from '@components/section';
import Row from '@components/rowTsx';
import Button from '@components/buttonTsx';
import CheckboxField from '@components/checkboxField';
import ProgressivePreloader from '@components/preloader';
import {AppBackgroundColorTab} from '@components/solidJsTabs/tabs';
import {AppTheme, AppThemeSettings, SETTINGS_INIT} from '@config/state';
import {blendWallpaperForTinted} from '@config/themePresets';
import themeController from '@helpers/themeController';
import requestFile from '@helpers/files/requestFile';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import scaleMediaElement from '@helpers/canvas/scaleMediaElement';
import {MediaSize} from '@helpers/mediaSize';
import {getColorsFromWallPaper} from '@helpers/color';
import ChatBackgroundStore from '@lib/chatBackgroundStore';
import ListenerSetter from '@helpers/listenerSetter';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';

const needBlur = (wallPaper: WallPaper, respectPattern = true) => {
  const blur = (wallPaper as WallPaper.wallPaper)?.settings?.pFlags?.blur;
  return !!(blur && (!respectPattern || !(wallPaper as WallPaper.wallPaper).pFlags.pattern));
};

const getWallPaperKey = (wallPaper: WallPaper) => '' + wallPaper.id;
const getWallPaperKeyFromTheme = (theme: AppTheme) => '' + (getWallPaperKey(themeController.getThemeSettings(theme)?.wallpaper) || '');

// ─────────────────────────────────────────────────────────────────────────────
// Static utility surface — kept on `AppBackgroundTab` so callers reaching it
// through `themeController.AppBackgroundTab` (set in appImManager) and direct
// imports keep working. Nothing here depends on the tab UI.
// ─────────────────────────────────────────────────────────────────────────────

export class AppBackgroundTab {
  public static tempId = 0;

  // Picker thumbnail = the real `<ChatBackground>` component. All compositing knobs
  // (overlay vs mask, intensity, dark-pattern invert) live inside ChatBackground +
  // chatBackground.module.scss. We pass a synthetic `theme.name` so the renderer
  // picks the right style for the slot being previewed — `tinted` triggers
  // overlay-render, `night` uses the mask path, everything else is plain blend.
  //
  // `size` controls the pattern-canvas dimensions inside ChatBackground. Defaults
  // to the actual .background-item tile (72×96 in the theme-picker / wallpaper-grid),
  // which is ~250× smaller than the default windowSize-sized canvas — same visual
  // result via object-fit: cover, but no wasted bitmap memory.
  public static addWallPaper(
    wallPaper: WallPaper,
    container = document.createElement('div'),
    forBaseTheme?: BaseTheme['_'],
    size: {width: number, height: number} = {width: 72, height: 96}
  ) {
    const colors = getColorsFromWallPaper(wallPaper);
    const hasFile = wallPaper._ === 'wallPaper';
    const isPattern = hasFile && !!(wallPaper as WallPaper.wallPaper).pFlags.pattern;
    if((hasFile && isPattern && !colors)) {
      return;
    }

    container.classList.add('background-item');
    container.dataset.id = '' + wallPaper.id;

    const media = document.createElement('div');
    media.classList.add('background-item-media');
    container.append(media);

    const themeName: AppTheme['name'] =
      forBaseTheme === 'baseThemeTinted' ? 'tinted' :
      forBaseTheme === 'baseThemeNight' ? 'night' :
      'day';
    const theme = {name: themeName} as AppTheme;

    const deferred = deferredPromise<void>();
    const dispose = render(() => (
      <ChatBackgroundLayer
        theme={theme}
        wallPaper={wallPaper}
        transition="instant"
        width={size.width}
        height={size.height}
        onReady={() => deferred.resolve()}
      />
    ), media);

    return {
      container,
      media,
      loadPromise: deferred as Promise<void>,
      dispose
    };
  }

  public static setBackgroundDocument = (
    wallPaper: WallPaper,
    themeSettings?: AppThemeSettings
  ) => {
    const _tempId = ++AppBackgroundTab.tempId;
    const middleware = () => _tempId === AppBackgroundTab.tempId;

    const doc = (wallPaper as WallPaper.wallPaper).document as MyDocument;
    const deferred = deferredPromise<void>();
    let download: Promise<void> | ReturnType<AppDownloadManager['downloadMediaURL']>;
    if(doc) {
      download = appDownloadManager.downloadMediaURL({
        media: doc,
        queueId: appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : 0
      });
      deferred.addNotifyListener = download.addNotifyListener.bind(download);
      deferred.cancel = download.cancel;
    } else {
      download = Promise.resolve();
    }

    download.then(async() => {
      if(!middleware()) {
        deferred.resolve();
        return;
      }

      const hadSettings = !!themeSettings;
      themeSettings ??= themeController.getThemeSettings(themeController.getTheme());
      // Chat Wallpaper tab grid clicks (and uploads) land here without a pre-blended wallpaper —
      // applyNewTheme would have already blended its argument, so it's safe to skip when the
      // caller passed an explicit themeSettings (which it does only from applyNewTheme). For
      // direct invocations on tinted base, run the same per-accent dark blend so wallpaper picks
      // sit in the Dark Blue palette like cloud-theme picks do.
      if(!hadSettings && themeController.getTheme().name === 'tinted') {
        wallPaper = blendWallpaperForTinted(wallPaper, themeSettings.accent_color);
      }
      const onReady = (url?: string) => {
        let getPixelPromise: Promise<Uint8ClampedArray>;
        const backgroundColor = getColorsFromWallPaper(wallPaper);
        if(url && !backgroundColor) {
          getPixelPromise = averageColor(url);
        } else {
          const {canvas} = ChatBackgroundGradientRenderer.create(backgroundColor);
          getPixelPromise = Promise.resolve(averageColorFromCanvas(canvas));
        }

        const slug = (wallPaper as WallPaper.wallPaper).slug;
        Promise.all([
          getPixelPromise,
          ChatBackgroundStore.saveWallPaperToCache(slug, url)
        ]).then(([pixel]) => {
          if(!middleware()) {
            deferred.resolve();
            return;
          }

          const hsla = highlightingColor(Array.from(pixel) as any);

          themeSettings.wallpaper = wallPaper;
          themeSettings.highlightingColor = hsla;

          if(!hadSettings) {
            const [appSettings] = useAppSettings();
            rootScope.managers.appStateManager.pushToState('settings', unwrap(appSettings));
          }

          appImManager.applyCurrentTheme({
            slug,
            backgroundUrl: url,
            broadcastEvent: true
          }).then(deferred.resolve.bind(deferred));
        });
      };

      if(!doc) {
        onReady();
        return;
      }

      const cacheContext = await rootScope.managers.thumbsStorage.getCacheContext(doc);
      if(needBlur(wallPaper)) {
        setTimeout(() => {
          ChatBackgroundStore.blurWallPaperImage(cacheContext.url).then((url) => {
            if(!middleware()) {
              deferred.resolve();
              return;
            }

            onReady(url);
          });
        }, 200);
      } else if(middleware()) {
        onReady(cacheContext.url);
      }
    });

    return deferred;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab UI — Solid component. Opens immediately; the wallpaper grid fills in
// as `getWallPapers()` resolves and each thumb finishes loading.
// ─────────────────────────────────────────────────────────────────────────────

const ChatBackground = () => {
  const [tab] = useSuperTab();

  const wallPapersByElement = new Map<HTMLElement, WallPaper>();
  const elementsByKey = new Map<string, HTMLElement>();
  const clicked = new Set<DocId>();

  const getTheme = () => themeController.getTheme();

  let grid!: HTMLDivElement;

  const getActiveThemeSettings = () => themeController.getThemeSettings(getTheme());

  const blurCheckboxField = new CheckboxField({
    text: 'ChatBackground.Blur',
    name: 'blur',
    checked: needBlur(getActiveThemeSettings()?.wallpaper, false)
  });

  const toggleBlurCheckbox = () => {
    const wallPaper = getActiveThemeSettings()?.wallpaper;
    blurCheckboxField.toggleDisability(!wallPaper || wallPaper._ === 'wallPaperNoFile' || !!wallPaper?.pFlags?.pattern);
  };

  const changeWallPaperBlur = async(wallPaper: WallPaper, blur: boolean) => {
    (wallPaper.settings ??= {_: 'wallPaperSettings', pFlags: {}}).pFlags.blur = blur || undefined;
    const [appSettings] = useAppSettings();
    await rootScope.managers.appStateManager.pushToState('settings', unwrap(appSettings));
  };

  const setBackgroundDocument = async(
    wallPaper: WallPaper,
    themeSettings?: AppThemeSettings
  ) => {
    if(!blurCheckboxField.isDisabled()) {
      await changeWallPaperBlur(wallPaper, blurCheckboxField.checked);
    }

    return AppBackgroundTab.setBackgroundDocument(wallPaper, themeSettings);
  };

  const setActive = () => {
    const active = grid.querySelector('.active');
    const target = elementsByKey.get(getWallPaperKeyFromTheme(getTheme()));
    if(active === target) return;

    toggleBlurCheckbox();

    active?.classList.remove('active');
    target?.classList.add('active');
  };

  // Each thumbnail mounts its own `<ChatBackground>` Solid root inside `media`.
  // Track the dispose handles so we tear the roots down (releasing gradient/pattern
  // renderers) when the picker tab closes.
  const solidRoots: (() => void)[] = [];

  const addWallPaper = (wallPaper: WallPaper, append = true) => {
    const result = AppBackgroundTab.addWallPaper(wallPaper);
    if(result) {
      const {container, media, dispose} = result;
      container.classList.add('grid-item');
      media.classList.add('grid-item-media');
      solidRoots.push(dispose);

      const key = getWallPaperKey(wallPaper);
      wallPapersByElement.set(container, wallPaper);
      elementsByKey.set(key, container);

      if(getWallPaperKeyFromTheme(getTheme()) === key) {
        container.classList.add('active');
      }

      grid[append ? 'append' : 'prepend'](container);
    }

    return result && result.loadPromise.then(() => result);
  };

  const listenerSetter = new ListenerSetter();
  onCleanup(() => {
    listenerSetter.removeAll();
    solidRoots.forEach((d) => d());
  });

  const onUploadClick = () => {
    requestFile('image/x-png,image/png,image/jpeg').then(async(file) => {
      if(file.name.endsWith('.png')) {
        const img = document.createElement('img');
        const url = URL.createObjectURL(file);
        await renderImageFromUrlPromise(img, url, false);
        const mimeType = 'image/jpeg';
        const {blob} = await scaleMediaElement({media: img, size: new MediaSize(img.naturalWidth, img.naturalHeight), mimeType});
        file = new File([blob], file.name.replace(/\.png$/, '.jpg'), {type: mimeType});
      }

      const wallPaper = await rootScope.managers.appDocsManager.prepareWallPaperUpload(file);
      // Seed ChatBackgroundStore with the local blob URL so the picker thumbnail
      // (which now goes through `<ChatBackground>` → ChatBackgroundStore.getBackground)
      // resolves the in-progress upload preview without trying to hit the network.
      const uploadDoc = (wallPaper as WallPaper.wallPaper).document as Document.document;
      if(uploadDoc) {
        const cacheContext = await rootScope.managers.thumbsStorage.getCacheContext(uploadDoc);
        ChatBackgroundStore.setBackgroundUrlToCache({
          slug: (wallPaper as WallPaper.wallPaper).slug,
          url: cacheContext.url
        });
      }
      const uploadPromise = rootScope.managers.appDocsManager.uploadWallPaper(wallPaper.id);
      const uploadDeferred: CancellablePromise<any> = appDownloadManager.getNewDeferredForUpload(file.name, uploadPromise);

      const deferred = deferredPromise<void>();
      deferred.addNotifyListener = uploadDeferred.addNotifyListener.bind(uploadDeferred);
      deferred.cancel = uploadDeferred.cancel;

      uploadDeferred.then((wallPaper) => {
        clicked.delete(key);
        elementsByKey.delete(key);
        wallPapersByElement.set(container, wallPaper);
        const newKey = getWallPaperKey(wallPaper);
        elementsByKey.set(newKey, container);

        setBackgroundDocument(wallPaper).then(deferred.resolve.bind(deferred), deferred.reject.bind(deferred));
      }, deferred.reject.bind(deferred));

      const key = getWallPaperKey(wallPaper);
      deferred.catch(() => {
        container.remove();
      });

      const preloader = new ProgressivePreloader({
        isUpload: true,
        cancelable: true,
        tryAgainOnFail: false
      });

      const {container} = await addWallPaper(wallPaper, false);
      clicked.add(key);

      preloader.attach(container, false, deferred);
    });
  };

  const onResetClick = () => {
    const theme = getTheme();
    const defaultTheme = SETTINGS_INIT.themes.find((t) => t.name === theme.name);
    if(defaultTheme) {
      ++AppBackgroundTab.tempId;
      theme.settings = copy(defaultTheme.settings);
      const [appSettings] = useAppSettings();
      rootScope.managers.appStateManager.pushToState('settings', unwrap(appSettings));
      appImManager.applyCurrentTheme({
        broadcastEvent: true
      });
      blurCheckboxField.setValueSilently(needBlur(themeController.getThemeSettings(theme)?.wallpaper, false));
    }
  };

  const onGridClick = (e: MouseEvent | TouchEvent) => {
    const target = findUpClassName(e.target, 'grid-item') as HTMLElement;
    if(!target) return;

    const wallPaper = wallPapersByElement.get(target);
    if(wallPaper._ === 'wallPaperNoFile') {
      setBackgroundDocument(wallPaper);
      return;
    }

    const key = getWallPaperKey(wallPaper);
    if(clicked.has(key)) return;
    clicked.add(key);

    const doc = wallPaper.document as MyDocument;
    const preloader = new ProgressivePreloader({
      cancelable: true,
      tryAgainOnFail: false
    });

    const load = async() => {
      const promise = setBackgroundDocument(wallPaper);
      const cacheContext = await rootScope.managers.thumbsStorage.getCacheContext(doc);
      if(!cacheContext.url || needBlur(wallPaper)) {
        preloader.attach(target, true, promise);
      }
    };

    preloader.construct();

    attachClickEvent(target, (e) => {
      if(preloader.preloader.parentElement) {
        preloader.onClick(e);
        preloader.detach();
      } else {
        load();
      }
    }, {listenerSetter});

    load();
  };

  // Wallpapers are fetched in the background. The buttons + blur row appear
  // immediately; the grid section sits empty (no jump in surrounding layout)
  // and items stream in as `getWallPapers()` and each photo wrap resolve.
  const [wallPapersResource] = createResource(() => rootScope.managers.appThemesManager.getWallPapers());

  createEffect(on(wallPapersResource, (wallPapers) => {
    if(!wallPapers || !grid) return;
    wallPapers.forEach((wallPaper) => addWallPaper(wallPaper));
  }));

  onMount(() => {
    toggleBlurCheckbox();
    tab.container.classList.add('background-container', 'background-image-container');

    listenerSetter.add(blurCheckboxField.input)('change', async() => {
      await changeWallPaperBlur(getActiveThemeSettings().wallpaper, blurCheckboxField.checked);

      // wait for the animation end before re-applying — matches legacy timing
      setTimeout(() => {
        const active = grid.querySelector('.active') as HTMLElement;
        if(!active) return;

        const wallpaper = wallPapersByElement.get(active);
        if((wallpaper as WallPaper.wallPaper).pFlags.pattern || wallpaper._ === 'wallPaperNoFile') {
          return;
        }

        setBackgroundDocument(wallpaper);
      }, 100);
    });
  });

  subscribeOn(rootScope)('background_change', setActive);

  return (
    <>
      <Section>
        <Button
          class="btn-primary btn-transparent"
          icon="cameraadd"
          text="ChatBackground.UploadWallpaper"
          onClick={onUploadClick}
        />
        <Button
          class="btn-primary btn-transparent"
          icon="colorize"
          text="SetColor"
          onClick={() => tab.slider.createTab(AppBackgroundColorTab).open()}
        />
        <Button
          class="btn-primary btn-transparent"
          icon="favourites"
          text="Appearance.Reset"
          onClick={onResetClick}
        />
        <Row>
          <Row.CheckboxField>{blurCheckboxField.label}</Row.CheckboxField>
        </Row>
      </Section>
      <Section>
        <div
          class="grid"
          ref={(el) => {
            grid = el;
            attachClickEvent(el, onGridClick, {listenerSetter});
          }}
        />
      </Section>
    </>
  );
};

export default ChatBackground;
