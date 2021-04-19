/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { generateSection } from "..";
import { averageColor } from "../../../helpers/averageColor";
import blur from "../../../helpers/blur";
import { deferredPromise } from "../../../helpers/cancellablePromise";
import { highlightningColor } from "../../../helpers/color";
import { attachClickEvent } from "../../../helpers/dom";
import findUpClassName from "../../../helpers/dom/findUpClassName";
import { AccountWallPapers, WallPaper } from "../../../layer";
import appDocsManager, { MyDocument } from "../../../lib/appManagers/appDocsManager";
import appDownloadManager from "../../../lib/appManagers/appDownloadManager";
import appImManager from "../../../lib/appManagers/appImManager";
import appStateManager from "../../../lib/appManagers/appStateManager";
import apiManager from "../../../lib/mtproto/mtprotoworker";
import rootScope from "../../../lib/rootScope";
import CheckboxField from "../../checkboxField";
import ProgressivePreloader from "../../preloader";
import { SliderSuperTab } from "../../slider";
import { wrapPhoto } from "../../wrappers";

export default class AppBackgroundTab extends SliderSuperTab {
  init() {
    this.container.classList.add('background-container');
    this.setTitle('ChatBackground');

    {
      const container = generateSection(this.scrollable);

      //const uploadButton = Button('btn-primary btn-transparent', {icon: 'cameraadd', text: 'ChatBackground.UploadWallpaper', disabled: true});
      //const colorButton = Button('btn-primary btn-transparent', {icon: 'colorize', text: 'ChatBackground.SetColor', disabled: true});

      const theme = rootScope.settings.themes.find(t => t.name === rootScope.settings.theme);
      const blurCheckboxField = new CheckboxField({
        text: 'ChatBackground.Blur', 
        name: 'blur', 
        checked: theme.background.blur,
        withRipple: true
      });
      blurCheckboxField.input.addEventListener('change', () => {
        const active = grid.querySelector('.active') as HTMLElement;
        if(!active) return;

        theme.background.blur = blurCheckboxField.input.checked;
        appStateManager.pushToState('settings', rootScope.settings);

        // * wait for animation end
        setTimeout(() => {
          setBackgroundDocument(active.dataset.slug, appDocsManager.getDoc(active.dataset.docId));
        }, 100);
      });

      container.append(/* uploadButton, colorButton,  */blurCheckboxField.label);
    }

    const grid = document.createElement('div');
    grid.classList.add('grid');

    const saveToCache = (slug: string, url: string) => {
      fetch(url).then(response => {
        appDownloadManager.cacheStorage.save('backgrounds/' + slug, response);
      });
    };

    let tempId = 0;
    const setBackgroundDocument = (slug: string, doc: MyDocument) => {
      let _tempId = ++tempId;
      const middleware = () => _tempId === tempId;

      const download = appDocsManager.downloadDoc(doc, appImManager.chat.bubbles ? appImManager.chat.bubbles.lazyLoadQueue.queueId : 0);

      const deferred = deferredPromise<void>();
      deferred.addNotifyListener = download.addNotifyListener;
      deferred.cancel = download.cancel;

      download.then(() => {
        if(!middleware()) {
          deferred.resolve();
          return;
        }

        const background = rootScope.settings.themes.find(t => t.name === rootScope.settings.theme).background;
        const onReady = (url: string) => {
          //const perf = performance.now();
          averageColor(url).then(pixel => {
            if(!middleware()) {
              deferred.resolve();
              return;
            }
            
            const hsla = highlightningColor(pixel);
            //console.log(doc, hsla, performance.now() - perf);

            background.slug = slug;
            background.type = 'image';
            background.highlightningColor = hsla;
            appStateManager.pushToState('settings', rootScope.settings);

            saveToCache(slug, url);
            appImManager.applyCurrentTheme(slug, url).then(deferred.resolve);
          });
        };

        if(background.blur) {
          setTimeout(() => {
            blur(doc.url, 12, 4)
            .then(url => {
              if(!middleware()) {
                deferred.resolve();
                return;
              }

              onReady(url);
            });
          }, 200);
        } else {
          onReady(doc.url);
        }
      });

      return deferred;
    };

    const setActive = () => {
      const active = grid.querySelector('.active');
      const background = rootScope.settings.themes.find(t => t.name === rootScope.settings.theme).background;
      const target = background.type === 'image' ? grid.querySelector(`.grid-item[data-slug="${background.slug}"]`) : null;
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

    rootScope.on('background_change', setActive);

    apiManager.invokeApiHashable('account.getWallPapers').then((accountWallpapers) => {
      const background = rootScope.settings.themes.find(t => t.name === rootScope.settings.theme).background;
      const wallpapers = (accountWallpapers as AccountWallPapers.accountWallPapers).wallpapers as WallPaper.wallPaper[];
      wallpapers.forEach((wallpaper) => {
        if(wallpaper.pFlags.pattern || (wallpaper.document as MyDocument).mime_type.indexOf('application/') === 0) {
          return;
        }

        wallpaper.document = appDocsManager.saveDoc(wallpaper.document);

        const container = document.createElement('div');
        container.classList.add('grid-item');

        const wrapped = wrapPhoto({
          photo: wallpaper.document,
          message: null,
          container: container,
          boxWidth: 0,
          boxHeight: 0,
          withoutPreloader: true
        });

        [wrapped.images.thumb, wrapped.images.full].filter(Boolean).forEach(image => {
          image.classList.add('grid-item-media');
        });

        container.dataset.docId = wallpaper.document.id;
        container.dataset.slug = wallpaper.slug;

        if(background.type === 'image' && background.slug === wallpaper.slug) {
          container.classList.add('active');
        }

        grid.append(container);
      });

      let clicked: Set<string> = new Set();
      attachClickEvent(grid, (e) => {
        const target = findUpClassName(e.target, 'grid-item') as HTMLElement;
        if(!target) return;

        const {docId, slug} = target.dataset;
        if(clicked.has(docId)) return;
        clicked.add(docId);

        const preloader = new ProgressivePreloader({
          cancelable: true,
          tryAgainOnFail: false
        });

        const doc = appDocsManager.getDoc(docId);

        const load = () => {
          const promise = setBackgroundDocument(slug, doc);
          if(!doc.url || background.blur) {
            preloader.attach(target, true, promise);
          }
        };

        preloader.construct();

        attachClickEvent(target, (e) => {
          if(preloader.preloader.parentElement) {
            preloader.onClick(e);
          } else {
            load();
          }
        });

        load();

        //console.log(doc);
      });

      //console.log(accountWallpapers);
    });

    this.scrollable.append(grid);
  }
}
