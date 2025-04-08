/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {averageColor, averageColorFromCanvas} from '../../../helpers/averageColor';
import deferredPromise, {CancellablePromise} from '../../../helpers/cancellablePromise';
import {attachClickEvent} from '../../../helpers/dom/clickEvent';
import findUpClassName from '../../../helpers/dom/findUpClassName';
import highlightingColor from '../../../helpers/highlightingColor';
import copy from '../../../helpers/object/copy';
import sequentialDom from '../../../helpers/sequentialDom';
import ChatBackgroundGradientRenderer from '../../chat/gradientRenderer';
import {Document, WallPaper, WebDocument} from '../../../layer';
import {MyDocument} from '../../../lib/appManagers/appDocsManager';
import appDownloadManager, {AppDownloadManager} from '../../../lib/appManagers/appDownloadManager';
import appImManager from '../../../lib/appManagers/appImManager';
import rootScope from '../../../lib/rootScope';
import Button from '../../button';
import CheckboxField from '../../checkboxField';
import ProgressivePreloader from '../../preloader';
import {SliderSuperTab} from '../../slider';
import AppBackgroundColorTab from './backgroundColor';
import choosePhotoSize from '../../../lib/appManagers/utils/photos/choosePhotoSize';
import {AppTheme, SETTINGS_INIT} from '../../../config/state';
import themeController from '../../../helpers/themeController';
import requestFile from '../../../helpers/files/requestFile';
import {renderImageFromUrlPromise} from '../../../helpers/dom/renderImageFromUrl';
import scaleMediaElement from '../../../helpers/canvas/scaleMediaElement';
import {MediaSize} from '../../../helpers/mediaSize';
import wrapPhoto from '../../wrappers/photo';
import {CreateRowFromCheckboxField} from '../../row';
import {generateSection} from '../../settingSection';
import {getColorsFromWallPaper} from '../../../helpers/color';
import ChatBackgroundStore from '../../../lib/chatBackgroundStore';

const needBlur = (wallPaper: WallPaper, respectPattern = true) => {
  const blur = (wallPaper as WallPaper.wallPaper)?.settings?.pFlags?.blur;
  return !!(blur && (!respectPattern || !(wallPaper as WallPaper.wallPaper).pFlags.pattern));
};

export default class AppBackgroundTab extends SliderSuperTab {
  public static tempId = 0;
  private grid: HTMLElement;
  private clicked: Set<DocId> = new Set();
  private blurCheckboxField: CheckboxField;

  private wallPapersByElement: Map<HTMLElement, WallPaper> = new Map();
  private elementsByKey: Map<string, HTMLElement> = new Map();

  public static getInitArgs() {
    return {
      backgrounds: rootScope.managers.appThemesManager.getWallPapers()
    };
  }

  private get theme() {
    return themeController.getTheme();
  }

  public init(p: ReturnType<typeof AppBackgroundTab['getInitArgs']> = AppBackgroundTab.getInitArgs()) {
    this.container.classList.add('background-container', 'background-image-container');
    this.setTitle('ChatBackground');

    {
      const container = generateSection(this.scrollable);

      const uploadButton = Button('btn-primary btn-transparent', {icon: 'cameraadd', text: 'ChatBackground.UploadWallpaper'});
      const colorButton = Button('btn-primary btn-transparent', {icon: 'colorize', text: 'SetColor'});
      const resetButton = Button('btn-primary btn-transparent', {icon: 'favourites', text: 'Appearance.Reset'});

      attachClickEvent(uploadButton, this.onUploadClick, {listenerSetter: this.listenerSetter});

      attachClickEvent(colorButton, () => {
        this.slider.createTab(AppBackgroundColorTab).open();
      }, {listenerSetter: this.listenerSetter});

      attachClickEvent(resetButton, this.onResetClick, {listenerSetter: this.listenerSetter});

      const wallPaper = this.theme.settings?.wallpaper;
      const blurCheckboxField = this.blurCheckboxField = new CheckboxField({
        text: 'ChatBackground.Blur',
        name: 'blur',
        checked: needBlur(wallPaper, false)
      });

      this.toggleBlurCheckbox();
      this.listenerSetter.add(blurCheckboxField.input)('change', async() => {
        await this.changeWallPaperBlur(this.theme.settings.wallpaper, blurCheckboxField.checked);

        // * wait for animation end
        setTimeout(() => {
          const active = grid.querySelector('.active') as HTMLElement;
          if(!active) return;

          const wallpaper = this.wallPapersByElement.get(active);
          if((wallpaper as WallPaper.wallPaper).pFlags.pattern || wallpaper._ === 'wallPaperNoFile') {
            return;
          }

          this.setBackgroundDocument(wallpaper);
        }, 100);
      });

      container.append(
        uploadButton,
        colorButton,
        resetButton,
        CreateRowFromCheckboxField(blurCheckboxField).container
      );
    }

    rootScope.addEventListener('background_change', this.setActive);

    const promise = p.backgrounds.then((wallPapers) => {
      const promises = wallPapers.map((wallPaper) => {
        return this.addWallPaper(wallPaper);
      });

      return Promise.all(promises);
    });

    const gridContainer = generateSection(this.scrollable);
    const grid = this.grid = document.createElement('div');
    grid.classList.add('grid');
    attachClickEvent(grid, this.onGridClick, {listenerSetter: this.listenerSetter});
    gridContainer.append(grid);

    return promise;
  }

  private onUploadClick = () => {
    requestFile('image/x-png,image/png,image/jpeg').then(async(file) => {
      if(file.name.endsWith('.png')) {
        const img = document.createElement('img');
        const url = URL.createObjectURL(file);
        await renderImageFromUrlPromise(img, url, false);
        const mimeType = 'image/jpeg';
        const {blob} = await scaleMediaElement({media: img, size: new MediaSize(img.naturalWidth, img.naturalHeight), mimeType});
        file = new File([blob], file.name.replace(/\.png$/, '.jpg'), {type: mimeType});
      }

      const wallPaper = await this.managers.appDocsManager.prepareWallPaperUpload(file);
      const uploadPromise = this.managers.appDocsManager.uploadWallPaper(wallPaper.id);
      const uploadDeferred: CancellablePromise<any> = appDownloadManager.getNewDeferredForUpload(file.name, uploadPromise);

      const deferred = deferredPromise<void>();
      deferred.addNotifyListener = uploadDeferred.addNotifyListener.bind(uploadDeferred);
      deferred.cancel = uploadDeferred.cancel;

      uploadDeferred.then((wallPaper) => {
        this.clicked.delete(key);
        this.elementsByKey.delete(key);
        this.wallPapersByElement.set(container, wallPaper);
        const newKey = this.getWallPaperKey(wallPaper);
        this.elementsByKey.set(newKey, container);

        this.setBackgroundDocument(wallPaper).then(deferred.resolve.bind(deferred), deferred.reject.bind(deferred));
      }, deferred.reject.bind(deferred));

      const key = this.getWallPaperKey(wallPaper);
      deferred.catch(() => {
        container.remove();
      });

      const preloader = new ProgressivePreloader({
        isUpload: true,
        cancelable: true,
        tryAgainOnFail: false
      });

      const {container} = await this.addWallPaper(wallPaper, false);
      this.clicked.add(key);

      preloader.attach(container, false, deferred);
    });
  };

  private onResetClick = () => {
    const defaultTheme = SETTINGS_INIT.themes.find((t) => t.name === this.theme.name);
    if(defaultTheme) {
      ++AppBackgroundTab.tempId;
      this.theme.settings = copy(defaultTheme.settings);
      this.managers.appStateManager.pushToState('settings', rootScope.settings);
      appImManager.applyCurrentTheme({
        broadcastEvent: true
      });
      this.blurCheckboxField.setValueSilently(needBlur(this.theme.settings?.wallpaper, false));
    }
  };

  private getWallPaperKey(wallPaper: WallPaper) {
    return '' + wallPaper.id;
  }

  private getWallPaperKeyFromTheme(theme: AppTheme) {
    return '' + (this.getWallPaperKey(theme.settings?.wallpaper) || '');
  }

  public static addWallPaper(
    wallPaper: WallPaper,
    container = document.createElement('div')
  ) {
    const colors = getColorsFromWallPaper(wallPaper);
    const hasFile = wallPaper._ === 'wallPaper';
    if((hasFile && wallPaper.pFlags.pattern && !colors)/*  ||
      (wallpaper.document as MyDocument).mime_type.indexOf('application/') === 0 */) {
      return;
    }

    const isDark = !!wallPaper.pFlags.dark;

    let doc: WebDocument.webDocumentNoProxy | Document.document = hasFile ? wallPaper.document as Document.document : undefined;
    if(hasFile && !doc) {
      doc = {
        _: 'webDocumentNoProxy',
        attributes: [],
        size: 100000,
        url: 'assets/img/pattern.svg',
        w: 1440,
        h: 2960,
        mime_type: 'image/svg+xml'
      };
    }

    container.classList.add('background-item');
    container.dataset.id = '' + wallPaper.id;

    const media = document.createElement('div');
    media.classList.add('background-item-media');

    const loadPromises: Promise<any>[] = [];
    let wrapped: ReturnType<typeof wrapPhoto>, size: ReturnType<typeof choosePhotoSize>;
    if(hasFile) {
      size = choosePhotoSize(doc, 200, 200);
      wrapped = wrapPhoto({
        photo: doc,
        message: null,
        container: media,
        withoutPreloader: true,
        size,
        noFadeIn: wallPaper.pFlags.pattern
      });

      if(wallPaper.pFlags.pattern) {
        media.classList.add('is-pattern');
      }

      const promise = wrapped.then(async({loadPromises, images}) => {
        await loadPromises.thumb || loadPromises.full;
        return images;
      }).then((images) => {
        if(wallPaper.pFlags.pattern) {
          if(isDark) {
            images.full.style.display = 'none';
            if(images.thumb) {
              images.thumb.style.display = 'none';
            }
          } else if(wallPaper.settings?.intensity) {
            images.full.style.opacity = '' + Math.abs(wallPaper.settings.intensity) / 100;
          }
        }

        return sequentialDom.mutate(() => {
          container.append(media);
        });
      });

      loadPromises.push(promise);
    } else {
      container.append(media);
    }

    if(wallPaper.settings?.background_color) {
      const {canvas} = ChatBackgroundGradientRenderer.create(colors);
      canvas.classList.add('background-colors-canvas');

      if(isDark && hasFile) {
        const promise = wrapped.then(({loadPromises}) => {
          return loadPromises.full.then(async() => {
            const cacheContext = await rootScope.managers.thumbsStorage.getCacheContext(doc, size.type);
            canvas.style.webkitMaskImage = `url(${cacheContext.url})`;
            canvas.style.opacity = '' + (wallPaper.pFlags.dark ? 100 + wallPaper.settings.intensity : wallPaper.settings.intensity) / 100;
            media.append(canvas);
          });
        });

        loadPromises.push(promise);
      } else {
        media.append(canvas);
      }
    }

    return {
      container,
      media,
      loadPromise: Promise.all(loadPromises)
    };
  }

  private addWallPaper(wallPaper: WallPaper, append = true) {
    const result = AppBackgroundTab.addWallPaper(wallPaper);
    if(result) {
      const {container, media} = result;
      container.classList.add('grid-item');
      media.classList.add('grid-item-media');

      const key = this.getWallPaperKey(wallPaper);
      this.wallPapersByElement.set(container, wallPaper);
      this.elementsByKey.set(key, container);

      if(this.getWallPaperKeyFromTheme(this.theme) === key) {
        container.classList.add('active');
      }

      this.grid[append ? 'append' : 'prepend'](container);
    }

    return result && result.loadPromise.then(() => result);
  }

  private onGridClick = (e: MouseEvent | TouchEvent) => {
    const target = findUpClassName(e.target, 'grid-item') as HTMLElement;
    if(!target) return;

    const wallPaper = this.wallPapersByElement.get(target);
    if(wallPaper._ === 'wallPaperNoFile') {
      this.setBackgroundDocument(wallPaper);
      return;
    }

    const key = this.getWallPaperKey(wallPaper);
    if(this.clicked.has(key)) return;
    this.clicked.add(key);

    const doc = wallPaper.document as MyDocument;
    const preloader = new ProgressivePreloader({
      cancelable: true,
      tryAgainOnFail: false
    });

    const load = async() => {
      const promise = this.setBackgroundDocument(wallPaper);
      const cacheContext = await this.managers.thumbsStorage.getCacheContext(doc);
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
    }, {listenerSetter: this.listenerSetter});

    load();

    // console.log(doc);
  };

  private async changeWallPaperBlur(wallPaper: WallPaper, blur: boolean) {
    (wallPaper.settings ??= {_: 'wallPaperSettings', pFlags: {}}).pFlags.blur = blur || undefined;
    await this.managers.appStateManager.pushToState('settings', rootScope.settings);
  }

  private setBackgroundDocument = async(
    wallPaper: WallPaper,
    themeSettings?: AppTheme['settings']
  ) => {
    if(!this.blurCheckboxField.isDisabled()) {
      await this.changeWallPaperBlur(wallPaper, this.blurCheckboxField.checked);
    }

    return AppBackgroundTab.setBackgroundDocument(wallPaper, themeSettings);
  };

  public static setBackgroundDocument = (
    wallPaper: WallPaper,
    themeSettings?: AppTheme['settings']
  ) => {
    const _tempId = ++this.tempId;
    const middleware = () => _tempId === this.tempId;

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
      themeSettings ??= themeController.getTheme().settings;
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
            rootScope.managers.appStateManager.pushToState('settings', rootScope.settings);
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

  private toggleBlurCheckbox() {
    const wallPaper = this.theme.settings?.wallpaper;
    this.blurCheckboxField.toggleDisability(!wallPaper || wallPaper._ === 'wallPaperNoFile' || !!wallPaper?.pFlags?.pattern);
  }

  private setActive = () => {
    const active = this.grid.querySelector('.active');
    const target = this.elementsByKey.get(this.getWallPaperKeyFromTheme(this.theme));
    if(active === target) {
      return;
    }

    this.toggleBlurCheckbox();

    if(active) {
      active.classList.remove('active');
    }

    if(target) {
      target.classList.add('active');
    }
  };
}
