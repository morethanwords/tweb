/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { generateSection } from "..";
import { averageColor } from "../../../helpers/averageColor";
import blur from "../../../helpers/blur";
import { deferredPromise } from "../../../helpers/cancellablePromise";
import { attachClickEvent } from "../../../helpers/dom/clickEvent";
import findUpClassName from "../../../helpers/dom/findUpClassName";
import { requestFile } from "../../../helpers/files";
import highlightningColor from "../../../helpers/highlightningColor";
import { copy } from "../../../helpers/object";
import sequentialDom from "../../../helpers/sequentialDom";
import { AccountWallPapers, PhotoSize, WallPaper } from "../../../layer";
import appDocsManager, { MyDocument } from "../../../lib/appManagers/appDocsManager";
import appDownloadManager from "../../../lib/appManagers/appDownloadManager";
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
  private clicked: Set<string> = new Set();
  private blurCheckboxField: CheckboxField;

  init() {
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

        const active = grid.querySelector('.active') as HTMLElement;
        if(!active) return;

        // * wait for animation end
        setTimeout(() => {
          this.setBackgroundDocument(active.dataset.slug, appDocsManager.getDoc(active.dataset.docId));
        }, 100);
      });

      container.append(uploadButton, colorButton, resetButton, blurCheckboxField.label);
    }

    rootScope.addEventListener('background_change', this.setActive);

    apiManager.invokeApiHashable('account.getWallPapers').then((accountWallpapers) => {
      const wallpapers = (accountWallpapers as AccountWallPapers.accountWallPapers).wallpapers as WallPaper.wallPaper[];
      wallpapers.forEach((wallpaper) => {
        this.addWallPaper(wallpaper);
      });

      //console.log(accountWallpapers);
    });

    const grid = this.grid = document.createElement('div');
    grid.classList.add('grid');
    attachClickEvent(grid, this.onGridClick, {listenerSetter: this.listenerSetter});
    this.scrollable.append(grid);
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

          container.dataset.docId = wallpaper.document.id;
          container.dataset.slug = wallpaper.slug;
          
          this.setBackgroundDocument(wallpaper.slug, wallpaper.document).then(deferred.resolve, deferred.reject);
        }, deferred.reject);
      }, deferred.reject);

      deferred.then(() => {
        this.clicked.delete(wallpaper.document.id);
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
      this.clicked.add(wallpaper.document.id);

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

  private addWallPaper(wallpaper: WallPaper.wallPaper, append = true) {
    if(wallpaper.pFlags.pattern || (wallpaper.document as MyDocument).mime_type.indexOf('application/') === 0) {
      return;
    }

    wallpaper.document = appDocsManager.saveDoc(wallpaper.document);

    const container = document.createElement('div');
    container.classList.add('grid-item');

    const media = document.createElement('div');
    media.classList.add('grid-item-media');

    const wrapped = wrapPhoto({
      photo: wallpaper.document,
      message: null,
      container: media,
      withoutPreloader: true,
      size: appPhotosManager.choosePhotoSize(wallpaper.document, 200, 200)
    });

    container.dataset.docId = wallpaper.document.id;
    container.dataset.slug = wallpaper.slug;

    if(this.theme.background.type === 'image' && this.theme.background.slug === wallpaper.slug) {
      container.classList.add('active');
    }

    (wrapped.loadPromises.thumb || wrapped.loadPromises.full).then(() => {
      sequentialDom.mutate(() => {
        container.append(media);
      });
    });

    this.grid[append ? 'append' : 'prepend'](container);

    return container;
  }

  private onGridClick = (e: MouseEvent | TouchEvent) => {
    const target = findUpClassName(e.target, 'grid-item') as HTMLElement;
    if(!target) return;

    const {docId, slug} = target.dataset;
    if(this.clicked.has(docId)) return;
    this.clicked.add(docId);

    const preloader = new ProgressivePreloader({
      cancelable: true,
      tryAgainOnFail: false
    });

    const doc = appDocsManager.getDoc(docId);

    const load = () => {
      const promise = this.setBackgroundDocument(slug, doc);
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

  private setBackgroundDocument = (slug: string, doc: MyDocument) => {
    let _tempId = ++this.tempId;
    const middleware = () => _tempId === this.tempId;

    const download = appDocsManager.downloadDoc(doc, appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : 0);

    const deferred = deferredPromise<void>();
    deferred.addNotifyListener = download.addNotifyListener;
    deferred.cancel = download.cancel;

    download.then(() => {
      if(!middleware()) {
        deferred.resolve();
        return;
      }

      const background = this.theme.background;
      const onReady = (url: string) => {
        //const perf = performance.now();
        averageColor(url).then(pixel => {
          if(!middleware()) {
            deferred.resolve();
            return;
          }
          
          const hsla = highlightningColor(Array.from(pixel) as any);
          //console.log(doc, hsla, performance.now() - perf);

          background.slug = slug;
          background.type = 'image';
          background.highlightningColor = hsla;
          appStateManager.pushToState('settings', rootScope.settings);

          this.saveToCache(slug, url);
          appImManager.applyCurrentTheme(slug, url).then(deferred.resolve);
        });
      };

      const cacheContext = appDownloadManager.getCacheContext(doc);
      if(background.blur) {
        setTimeout(() => {
          blur(cacheContext.url, 12, 4)
          .then(url => {
            if(!middleware()) {
              deferred.resolve();
              return;
            }

            onReady(url);
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
    const background = this.theme.background;
    const target = background.type === 'image' ? this.grid.querySelector(`.grid-item[data-slug="${background.slug}"]`) : null;
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
