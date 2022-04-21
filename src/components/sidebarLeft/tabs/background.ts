/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { generateSection } from "..";
import { averageColor, averageColorFromCanvas } from "../../../helpers/averageColor";
import blur from "../../../helpers/blur";
import deferredPromise from "../../../helpers/cancellablePromise";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import findUpClassName from "../../../helpers/dom/findUpClassName";
import { requestFile } from "../../../helpers/files";
import highlightningColor from "../../../helpers/highlightningColor";
import copy from "../../../helpers/object/copy";
import sequentialDom from "../../../helpers/sequentialDom";
import ChatBackgroundGradientRenderer from "../../chat/gradientRenderer";
import { AccountWallPapers, PhotoSize, WallPaper } from "../../../layer";
import appDocsManager, { MyDocument } from "../../../lib/appManagers/appDocsManager";
import appDownloadManager, { DownloadBlob } from "../../../lib/appManagers/appDownloadManager";
import appImManager from "../../../lib/appManagers/appImManager";
import appPhotosManager from "../../../lib/appManagers/appPhotosManager";
import appStateManager, { Theme, STATE_INIT } from "../../../lib/appManagers/appStateManager";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import rootScope from "../../../lib/rootScope";
import Button from "../../button";
import CheckboxField from "../../checkboxField";
import ProgressivePreloader from "../../preloader";
import { SliderSuperTab } from "../../slider";
import { wrapPhoto } from "../../wrappers";
import AppBackgroundColorTab from "./backgroundColor";

let uploadTempId = 0;

export default class AppBackgroundTab extends SliderSuperTab {
  private grid: HTMLElement;
  private tempId = 0;
  private theme: Theme;
  private clicked: Set<DocId> = new Set();
  private blurCheckboxField: CheckboxField;

  private wallpapersByElement: Map<HTMLElement, WallPaper> = new Map();
  private elementsByKey: Map<string, HTMLElement> = new Map();

  init() {
    this.header.classList.add('with-border');
    this.container.classList.add('background-container', 'background-image-container');
    this.setTitle('ChatBackground');

    this.theme = rootScope.getTheme();

    {
      const container = generateSection(this.scrollable);

      const uploadButton = Button('btn-primary btn-transparent', {icon: 'cameraadd', text: 'ChatBackground.UploadWallpaper'});
      const colorButton = Button('btn-primary btn-transparent', {icon: 'colorize', text: 'SetColor'});
      const resetButton = Button('btn-primary btn-transparent', {icon: 'favourites', text: 'Appearance.Reset'});

      attachClickEvent(uploadButton, this.onUploadClick, {listenerSetter: this.listenerSetter});

      attachClickEvent(colorButton, () => {
        new AppBackgroundColorTab(this.slider).open();
      }, {listenerSetter: this.listenerSetter});

      attachClickEvent(resetButton, this.onResetClick, {listenerSetter: this.listenerSetter});

      const blurCheckboxField = this.blurCheckboxField = new CheckboxField({
        text: 'ChatBackground.Blur', 
        name: 'blur', 
        checked: this.theme.background.blur,
        withRipple: true
      });

      this.listenerSetter.add(blurCheckboxField.input)('change', () => {
        this.theme.background.blur = blurCheckboxField.input.checked;
        appStateManager.pushToState('settings', rootScope.settings);

        // * wait for animation end
        setTimeout(() => {
          const active = grid.querySelector('.active') as HTMLElement;
          if(!active) return;

          const wallpaper = this.wallpapersByElement.get(active);
          if((wallpaper as WallPaper.wallPaper).pFlags.pattern || wallpaper._ === 'wallPaperNoFile') {
            return;
          }
          
          this.setBackgroundDocument(wallpaper);
        }, 100);
      });

      container.append(uploadButton, colorButton, resetButton, blurCheckboxField.label);
    }

    rootScope.addEventListener('background_change', this.setActive);

    apiManager.invokeApiHashable({method: 'account.getWallPapers'}).then((accountWallpapers) => {
      const wallpapers = (accountWallpapers as AccountWallPapers.accountWallPapers).wallpapers as WallPaper.wallPaper[];
      wallpapers.forEach((wallpaper) => {
        this.addWallPaper(wallpaper);
      });

      //console.log(accountWallpapers);
    });

    const gridContainer = generateSection(this.scrollable);
    const grid = this.grid = document.createElement('div');
    grid.classList.add('grid');
    attachClickEvent(grid, this.onGridClick, {listenerSetter: this.listenerSetter});
    gridContainer.append(grid);
  }

  private onUploadClick = () => {
    requestFile('image/x-png,image/png,image/jpeg').then(file => {
      const id = 'wallpaper-upload-' + ++uploadTempId;

      const thumb = {
        _: 'photoSize',
        h: 0,
        w: 0,
        location: {} as any,
        size: file.size,
        type: 'full',
      } as PhotoSize.photoSize;
      let document: MyDocument = {
        _: 'document',
        access_hash: '',
        attributes: [],
        dc_id: 0,
        file_reference: [],
        id,
        mime_type: file.type,
        size: file.size,
        date: Date.now() / 1000,
        pFlags: {},
        thumbs: [thumb],
        file_name: file.name
      };

      document = appDocsManager.saveDoc(document);

      const cacheContext = appDownloadManager.getCacheContext(document);
      cacheContext.downloaded = file.size;
      cacheContext.url = URL.createObjectURL(file);

      let wallpaper: WallPaper.wallPaper = {
        _: 'wallPaper',
        access_hash: '',
        document: document,
        id,
        slug: id,
        pFlags: {}
      };

      const upload = appDownloadManager.upload(file, file.name);

      const deferred = deferredPromise<void>();
      deferred.addNotifyListener = upload.addNotifyListener;
      deferred.cancel = upload.cancel;

      upload.then(inputFile => {
        apiManager.invokeApi('account.uploadWallPaper', {
          file: inputFile,
          mime_type: file.type,
          settings: {
            _: 'wallPaperSettings'
          }
        }).then(_wallpaper => {
          const newDoc = (_wallpaper as WallPaper.wallPaper).document as MyDocument;
          const newCacheContext = appDownloadManager.getCacheContext(newDoc);
          Object.assign(newCacheContext, cacheContext);

          wallpaper = _wallpaper as WallPaper.wallPaper;
          wallpaper.document = appDocsManager.saveDoc(wallpaper.document);

          this.setBackgroundDocument(wallpaper).then(deferred.resolve, deferred.reject);
        }, deferred.reject);
      }, deferred.reject);

      const key = this.getWallpaperKey(wallpaper);
      deferred.then(() => {
        this.clicked.delete(key);
      }, (err) => {
        container.remove();
        //console.error('i saw the body drop', err);
      });

      const preloader = new ProgressivePreloader({
        isUpload: true,
        cancelable: true,
        tryAgainOnFail: false
      });

      const container = this.addWallPaper(wallpaper, false);
      this.clicked.add(key);

      preloader.attach(container, false, deferred);
    });
  };

  private onResetClick = () => {
    const defaultTheme = STATE_INIT.settings.themes.find(t => t.name === this.theme.name);
    if(defaultTheme) {
      ++this.tempId;
      this.theme.background = copy(defaultTheme.background);
      appStateManager.pushToState('settings', rootScope.settings);
      appImManager.applyCurrentTheme(undefined, undefined, true);
      this.blurCheckboxField.setValueSilently(this.theme.background.blur);
    }
  };

  private getColorsFromWallpaper(wallpaper: WallPaper) {
    return wallpaper.settings ? [
      wallpaper.settings.background_color,
      wallpaper.settings.second_background_color,
      wallpaper.settings.third_background_color,
      wallpaper.settings.fourth_background_color
    ].filter(Boolean).map(color => '#' + color.toString(16)).join(',') : '';
  }

  private getWallpaperKey(wallpaper: WallPaper) {
    return '' + wallpaper.id;
  }

  private getWallpaperKeyFromTheme(theme: Theme) {
    return '' + theme.background.id;
  }

  private addWallPaper(wallpaper: WallPaper, append = true) {
    const colors = this.getColorsFromWallpaper(wallpaper);
    const hasFile = wallpaper._ === 'wallPaper';
    if((hasFile && wallpaper.pFlags.pattern && !colors)/*  || 
      (wallpaper.document as MyDocument).mime_type.indexOf('application/') === 0 */) {
      return;
    }

    const isDark = !!wallpaper.pFlags.dark;

    const doc: MyDocument = hasFile ? (wallpaper.document = appDocsManager.saveDoc(wallpaper.document)) : undefined;

    const container = document.createElement('div');
    container.classList.add('grid-item');

    container.dataset.id = '' + wallpaper.id;

    const key = this.getWallpaperKey(wallpaper);
    this.wallpapersByElement.set(container, wallpaper);
    this.elementsByKey.set(key, container);

    const media = document.createElement('div');
    media.classList.add('grid-item-media');

    let wrapped: ReturnType<typeof wrapPhoto>, size: PhotoSize;
    if(hasFile) {
      size = appPhotosManager.choosePhotoSize(doc, 200, 200);
      wrapped = wrapPhoto({
        photo: doc,
        message: null,
        container: media,
        withoutPreloader: true,
        size: size,
        noFadeIn: wallpaper.pFlags.pattern
      });

      (wrapped.loadPromises.thumb || wrapped.loadPromises.full).then(() => {
        sequentialDom.mutate(() => {
          container.append(media);
        });
      });

      if(wallpaper.pFlags.pattern) {
        media.classList.add('is-pattern');
  
        if(isDark) {
          wrapped.images.full.style.display = 'none';
          if(wrapped.images.thumb) {
            wrapped.images.thumb.style.display = 'none';
          }
        } else if(wallpaper.settings?.intensity) {
          wrapped.images.full.style.opacity = '' + Math.abs(wallpaper.settings.intensity) / 100;
        }
      }
    } else {
      container.append(media);
    }

    if(wallpaper.settings && wallpaper.settings.background_color !== undefined) {
      const {canvas} = ChatBackgroundGradientRenderer.create(colors);
      canvas.classList.add('background-colors-canvas');
      
      if(isDark && hasFile) {
        const cacheContext = appDownloadManager.getCacheContext(doc, size.type);
        wrapped.loadPromises.full.then(() => {
          canvas.style.webkitMaskImage = `url(${cacheContext.url})`;
          canvas.style.opacity = '' + Math.abs(wallpaper.settings.intensity) / 100;
          media.append(canvas);
        });
      } else {
        media.append(canvas);
      }
    }

    if(this.getWallpaperKeyFromTheme(this.theme) === key) {
      container.classList.add('active');
    }

    this.grid[append ? 'append' : 'prepend'](container);

    return container;
  }

  private onGridClick = (e: MouseEvent | TouchEvent) => {
    const target = findUpClassName(e.target, 'grid-item') as HTMLElement;
    if(!target) return;

    const wallpaper = this.wallpapersByElement.get(target);
    if(wallpaper._ === 'wallPaperNoFile') {
      this.setBackgroundDocument(wallpaper);
      return;
    }
    
    const key = this.getWallpaperKey(wallpaper);
    if(this.clicked.has(key)) return;
    this.clicked.add(key);
    
    const doc = wallpaper.document as MyDocument;
    const preloader = new ProgressivePreloader({
      cancelable: true,
      tryAgainOnFail: false
    });

    const load = () => {
      const promise = this.setBackgroundDocument(wallpaper);
      const cacheContext = appDownloadManager.getCacheContext(doc);
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
    fetch(url).then(response => {
      appDownloadManager.cacheStorage.save('backgrounds/' + slug, response);
    });
  };

  private setBackgroundDocument = (wallpaper: WallPaper) => {
    let _tempId = ++this.tempId;
    const middleware = () => _tempId === this.tempId;

    const doc = (wallpaper as WallPaper.wallPaper).document as MyDocument;
    const deferred = deferredPromise<void>();
    let download: Promise<void> | DownloadBlob;
    if(doc) {
      download = appDocsManager.downloadDoc(doc, appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : 0);
      deferred.addNotifyListener = download.addNotifyListener;
      deferred.cancel = download.cancel;
    } else {
      download = Promise.resolve();
    }

    download.then(() => {
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
          const {canvas} = ChatBackgroundGradientRenderer.create(this.getColorsFromWallpaper(wallpaper));
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

          const slug = (wallpaper as WallPaper.wallPaper).slug ?? '';
          background.id = wallpaper.id;
          background.intensity = wallpaper.settings?.intensity ?? 0;
          background.color = this.getColorsFromWallpaper(wallpaper);
          background.slug = slug;
          background.highlightningColor = hsla;
          appStateManager.pushToState('settings', rootScope.settings);

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

      const cacheContext = appDownloadManager.getCacheContext(doc);
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
    const target = this.elementsByKey.get(this.getWallpaperKeyFromTheme(this.theme));
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
