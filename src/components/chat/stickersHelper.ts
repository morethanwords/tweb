/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type Chat from './chat';
import ListenerSetter from '../../helpers/listenerSetter';
import mediaSizes from '../../helpers/mediaSizes';
import preloadAnimatedEmojiSticker from '../../helpers/preloadAnimatedEmojiSticker';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {AppManagers} from '../../lib/appManagers/managers';
import rootScope from '../../lib/rootScope';
import SuperStickerRenderer from '../emoticonsDropdown/tabs/SuperStickerRenderer';
import LazyLoadQueue from '../lazyLoadQueue';
import Scrollable from '../scrollable';
import attachStickerViewerListeners from '../stickerViewer';
import AutocompleteHelper from './autocompleteHelper';
import AutocompleteHelperController from './autocompleteHelperController';

export default class StickersHelper extends AutocompleteHelper {
  private scrollable: Scrollable;
  private onChangeScreen: () => void;
  private listenerSetter: ListenerSetter;

  constructor(
    appendTo: HTMLElement,
    controller: AutocompleteHelperController,
    private chat: Chat,
    private managers: AppManagers
  ) {
    super({
      appendTo,
      controller,
      listType: 'xy',
      onSelect: async(target) => {
        return !(await this.chat.input.emoticonsDropdown.onMediaClick({target}, true));
      },
      waitForKey: ['ArrowUp', 'ArrowDown']
    });

    this.container.classList.add('stickers-helper');

    this.addEventListener('visible', () => {
      setTimeout(() => { // it is not rendered yet
        this.scrollable.scrollPosition = 0;
      }, 0);

      rootScope.dispatchEvent('choosing_sticker', true);
    });

    this.addEventListener('hidden', () => {
      if(this.onChangeScreen) {
        mediaSizes.removeEventListener('changeScreen', this.onChangeScreen);
        this.onChangeScreen = undefined;

        this.listenerSetter.removeAll();
        this.listenerSetter = undefined;
      }

      rootScope.dispatchEvent('choosing_sticker', false);
    });
  }

  public checkEmoticon(emoticon: string) {
    const middleware = this.controller.getMiddleware();

    preloadAnimatedEmojiSticker(emoticon);
    this.managers.appStickersManager.getStickersByEmoticon({
      emoticon,
      includeOurStickers: true,
      includeServerStickers: rootScope.settings.stickers.suggest === 'all'
    }).then((stickers) => {
      if(!middleware()) {
        return;
      }

      if(this.init) {
        this.init();
        this.init = null;
      }

      const container = this.list.cloneNode() as HTMLElement;

      let ready: Promise<void>;

      if(stickers.length) {
        const lazyLoadQueue = new LazyLoadQueue();
        const superStickerRenderer = new SuperStickerRenderer({
          regularLazyLoadQueue: lazyLoadQueue,
          group: this.chat.animationGroup,
          managers: this.managers
        });

        ready = new Promise<void>((resolve) => {
          const promises: Promise<any>[] = [];
          stickers.forEach((sticker) => {
            container.append(superStickerRenderer.renderSticker(sticker as MyDocument, undefined, promises));
          });

          (Promise.all(promises) as Promise<any>).finally(resolve);
        });

        middleware.onClean(() => {
          lazyLoadQueue.clear();
          setTimeout(() => superStickerRenderer.destroy(), 500); // * fix video flick
        });
      } else {
        ready = Promise.resolve();
      }

      ready.then(() => {
        this.list.replaceWith(container);
        this.list = container;

        if(!this.onChangeScreen) {
          this.onChangeScreen = () => {
            const width = (this.list.childElementCount * mediaSizes.active.esgSticker.width) + (this.list.childElementCount - 1 * 1);
            this.list.style.width = width + 'px';
          };
          mediaSizes.addEventListener('changeScreen', this.onChangeScreen);

          this.listenerSetter = new ListenerSetter();
          attachStickerViewerListeners({listenTo: this.container, listenerSetter: this.listenerSetter});
        }

        this.onChangeScreen();

        this.toggle(!stickers.length);
        this.scrollable.scrollPosition = 0;
      });
    });
  }

  public init() {
    this.list = document.createElement('div');
    this.list.classList.add('stickers-helper-stickers', 'super-stickers');

    this.container.append(this.list);

    this.scrollable = new Scrollable(this.container);
  }
}
