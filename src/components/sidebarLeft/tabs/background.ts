/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { generateSection } from "..";
import { averageColor, averageColorFromCanvas } from "../../../helpers/averageColor";
import blur from "../../../helpers/blur";
import deferredPromise, { CancellablePromise } from "../../../helpers/cancellablePromise";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import findUpClassName from "../../../helpers/dom/findUpClassName";
import highlightningColor from "../../../helpers/highlightningColor";
import copy from "../../../helpers/object/copy";
import sequentialDom from "../../../helpers/sequentialDom";
import ChatBackgroundGradientRenderer from "../../chat/gradientRenderer";
import { Document, PhotoSize, WallPaper } from "../../../layer";
import { MyDocument } from "../../../lib/appManagers/appDocsManager";
import appDownloadManager, { AppDownloadManager, DownloadBlob } from "../../../lib/appManagers/appDownloadManager";
import appImManager from "../../../lib/appManagers/appImManager";
import rootScope from "../../../lib/rootScope";
import Button from "../../button";
import CheckboxField from "../../checkboxField";
import ProgressivePreloader from "../../preloader";
import { SliderSuperTab } from "../../slider";
import { wrapPhoto } from "../../wrappers";
import AppBackgroundColorTab from "./backgroundColor";
import choosePhotoSize from "../../../lib/appManagers/utils/photos/choosePhotoSize";
import { STATE_INIT, Theme } from "../../../config/state";
import themeController from "../../../helpers/themeController";
import requestFile from "../../../helpers/files/requestFile";
import { renderImageFromUrlPromise } from "../../../helpers/dom/renderImageFromUrl";
import scaleMediaElement from "../../../helpers/canvas/scaleMediaElement";
import { MediaSize } from "../../../helpers/mediaSize";

export default class AppBackgroundTab extends SliderSuperTab {
  private grid: HTMLElement;
  private tempId = 0;
  private clicked: Set<DocId> = new Set();
  private blurCheckboxField: CheckboxField;

  private wallPapersByElement: Map<HTMLElement, WallPaper> = new Map();
  private elementsByKey: Map<string, HTMLElement> = new Map();

  private get theme() {
    return themeController.getTheme();
  }

  init() {
    this.header.classList.add('with-border');
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

      const blurCheckboxField = this.blurCheckboxField = new CheckboxField({
        text: 'ChatBackground.Blur', 
        name: 'blur', 
        checked: this.theme.background.blur,
        withRipple: true
      });

      this.listenerSetter.add(blurCheckboxField.input)('change', async() => {
        this.theme.background.blur = blurCheckboxField.input.checked;
        await this.managers.appStateManager.pushToState('settings', rootScope.settings);

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

      container.append(uploadButton, colorButton, resetButton, blurCheckboxField.label);
    }

    rootScope.addEventListener('background_change', this.setActive);

    this.managers.appDocsManager.getWallPapers().then((wallPapers) => {
      wallPapers.forEach((wallPaper) => {
        this.addWallPaper(wallPaper);
      });
    });

    const gridContainer = generateSection(this.scrollable);
    const grid = this.grid = document.createElement('div');
    grid.classList.add('grid');
    attachClickEvent(grid, this.onGridClick, {listenerSetter: this.listenerSetter});
    gridContainer.append(grid);
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
      deferred.addNotifyListener = uploadDeferred.addNotifyListener;
      deferred.cancel = uploadDeferred.cancel;

      uploadDeferred.then((wallPaper) => {
        this.clicked.delete(key);
        this.elementsByKey.delete(key);
        this.wallPapersByElement.set(container, wallPaper);
        const newKey = this.getWallPaperKey(wallPaper);
        this.elementsByKey.set(newKey, container);

        this.setBackgroundDocument(wallPaper).then(deferred.resolve, deferred.reject);
      }, deferred.reject);

      const key = this.getWallPaperKey(wallPaper);
      deferred.catch(() => {
        container.remove();
      });

      const preloader = new ProgressivePreloader({
        isUpload: true,
        cancelable: true,
        tryAgainOnFail: false
      });

      const container = this.addWallPaper(wallPaper, false);
      this.clicked.add(key);

      preloader.attach(container, false, deferred);
    });
  };

  private onResetClick = () => {
    const defaultTheme = STATE_INIT.settings.themes.find((t) => t.name === this.theme.name);
    if(defaultTheme) {
      ++this.tempId;
      this.theme.background = copy(defaultTheme.background);
      this.managers.appStateManager.pushToState('settings', rootScope.settings);
      appImManager.applyCurrentTheme(undefined, undefined, true);
      this.blurCheckboxField.setValueSilently(this.theme.background.blur);
    }
  };

  private getColorsFromWallPaper(wallPaper: WallPaper) {
    return wallPaper.settings ? [
      wallPaper.settings.background_color,
      wallPaper.settings.second_background_color,
      wallPaper.settings.third_background_color,
      wallPaper.settings.fourth_background_color
    ].filter(Boolean).map((color) => '#' + color.toString(16)).join(',') : '';
  }

  private getWallPaperKey(wallPaper: WallPaper) {
    return '' + wallPaper.id;
  }

  private getWallPaperKeyFromTheme(theme: Theme) {
    return '' + theme.background.id;
  }

  private addWallPaper(wallPaper: WallPaper, append = true) {
    const colors = this.getColorsFromWallPaper(wallPaper);
    const hasFile = wallPaper._ === 'wallPaper';
    if((hasFile && wallPaper.pFlags.pattern && !colors)/*  || 
      (wallpaper.document as MyDocument).mime_type.indexOf('application/') === 0 */) {
      return;
    }

    const isDark = !!wallPaper.pFlags.dark;

    const doc = hasFile ? wallPaper.document as Document.document : undefined;

    const container = document.createElement('div');
    container.classList.add('grid-item');

    container.dataset.id = '' + wallPaper.id;

    const key = this.getWallPaperKey(wallPaper);
    this.wallPapersByElement.set(container, wallPaper);
    this.elementsByKey.set(key, container);

    const media = document.createElement('div');
    media.classList.add('grid-item-media');

    let wrapped: ReturnType<typeof wrapPhoto>, size: PhotoSize;
    if(hasFile) {
      size = choosePhotoSize(doc, 200, 200);
      wrapped = wrapPhoto({
        photo: doc,
        message: null,
        container: media,
        withoutPreloader: true,
        size: size,
        noFadeIn: wallPaper.pFlags.pattern
      });

      if(wallPaper.pFlags.pattern) {
        media.classList.add('is-pattern');
      }

      wrapped.then(async({loadPromises, images}) => {
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

        sequentialDom.mutate(() => {
          container.append(media);
        });
      });
    } else {
      container.append(media);
    }

    if(wallPaper.settings && wallPaper.settings.background_color !== undefined) {
      const {canvas} = ChatBackgroundGradientRenderer.create(colors);
      canvas.classList.add('background-colors-canvas');
      
      if(isDark && hasFile) {
        wrapped.then(({loadPromises}) => {
          loadPromises.full.then(async() => {
            const cacheContext = await this.managers.thumbsStorage.getCacheContext(doc, size.type);
            canvas.style.webkitMaskImage = `url(${cacheContext.url})`;
            canvas.style.opacity = '' + Math.abs(wallPaper.settings.intensity) / 100;
            media.append(canvas);
          });
        });
      } else {
        media.append(canvas);
      }
    }

    if(this.getWallPaperKeyFromTheme(this.theme) === key) {
      container.classList.add('active');
    }

    this.grid[append ? 'append' : 'prepend'](container);

    return container;
  }

  private onGridClick = (e: MouseEvent | TouchEvent) => {
    const target = findUpClassName(e.target, 'grid-item') as HTMLElement;
    if(!target) return;

    const wallpaper = this.wallPapersByElement.get(target);
    if(wallpaper._ === 'wallPaperNoFile') {
      this.setBackgroundDocument(wallpaper);
      return;
    }
    
    const key = this.getWallPaperKey(wallpaper);
    if(this.clicked.has(key)) return;
    this.clicked.add(key);
    
    const doc = wallpaper.document as MyDocument;
    const preloader = new ProgressivePreloader({
      cancelable: true,
      tryAgainOnFail: false
    });

    const load = async() => {
      const promise = this.setBackgroundDocument(wallpaper);
      const cacheContext = await this.managers.thumbsStorage.getCacheContext(doc);
      if(!cacheContext.url || this.theme.background.blur) {
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

    //console.log(doc);
  };

  private saveToCache = (slug: string, url: string) => {
    fetch(url).then((response) => {
      appImManager.cacheStorage.save('backgrounds/' + slug, response);
    });
  };

  private setBackgroundDocument = (wallPaper: WallPaper) => {
    let _tempId = ++this.tempId;
    const middleware = () => _tempId === this.tempId;

    const doc = (wallPaper as WallPaper.wallPaper).document as MyDocument;
    const deferred = deferredPromise<void>();
    let download: Promise<void> | ReturnType<AppDownloadManager['downloadMediaURL']>;
    if(doc) {
      download = appDownloadManager.downloadMediaURL({media: doc, queueId: appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : 0});
      deferred.addNotifyListener = download.addNotifyListener;
      deferred.cancel = download.cancel;
    } else {
      download = Promise.resolve();
    }

    download.then(async() => {
      if(!middleware()) {
        deferred.resolve();
        return;
      }

      const background = this.theme.background;
      const onReady = (url?: string) => {
        //const perf = performance.now();
        let getPixelPromise: Promise<Uint8ClampedArray>;
        if(url && !this.theme.background.color) {
          getPixelPromise = averageColor(url);
        } else {
          const {canvas} = ChatBackgroundGradientRenderer.create(this.getColorsFromWallPaper(wallPaper));
          getPixelPromise = Promise.resolve(averageColorFromCanvas(canvas));
        }

        getPixelPromise.then((pixel) => {
          if(!middleware()) {
            deferred.resolve();
            return;
          }
          
          const hsla = highlightningColor(Array.from(pixel) as any);
          // const hsla = 'rgba(0, 0, 0, 0.3)';
          //console.log(doc, hsla, performance.now() - perf);

          const slug = (wallPaper as WallPaper.wallPaper).slug ?? '';
          background.id = wallPaper.id;
          background.intensity = wallPaper.settings?.intensity ?? 0;
          background.color = this.getColorsFromWallPaper(wallPaper);
          background.slug = slug;
          background.highlightningColor = hsla;
          this.managers.appStateManager.pushToState('settings', rootScope.settings);

          if(slug) {
            this.saveToCache(slug, url);
          }

          appImManager.applyCurrentTheme(slug, url, true).then(deferred.resolve);
        });
      };

      if(!doc) {
        onReady();
        return;
      }

      const cacheContext = await this.managers.thumbsStorage.getCacheContext(doc);
      if(background.blur) {
        setTimeout(() => {
          const {canvas, promise} = blur(cacheContext.url, 12, 4)
          promise.then(() => {
            if(!middleware()) {
              deferred.resolve();
              return;
            }

            onReady(canvas.toDataURL());
          });
        }, 200);
      } else {
        onReady(cacheContext.url);
      }
    });

    return deferred;
  };

  private setActive = () => {
    const active = this.grid.querySelector('.active');
    const target = this.elementsByKey.get(this.getWallPaperKeyFromTheme(this.theme));
    if(active === target) {
      return;
    }

    if(active) {
      active.classList.remove('active');
    }

    if(target) {
      target.classList.add('active');
    }
  };
}
