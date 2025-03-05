/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatInput from './input';
import {appendEmoji as wrapAppEmoji, getEmojiFromElement} from '../emoticonsDropdown/tabs/emoji';
import {ScrollableX} from '../scrollable';
import AutocompleteHelper from './autocompleteHelper';
import AutocompleteHelperController from './autocompleteHelperController';
import {AppManagers} from '../../lib/appManagers/managers';
import {CustomEmojiRendererElement} from '../../lib/customEmoji/renderer';
import mediaSizes from '../../helpers/mediaSizes';
import {getMiddleware, Middleware} from '../../helpers/middleware';
import CustomEmojiElement from '../../lib/customEmoji/element';
import attachStickerViewerListeners from '../stickerViewer';
import ListenerSetter from '../../helpers/listenerSetter';
import rootScope from '../../lib/rootScope';

export default class EmojiHelper extends AutocompleteHelper {
  private scrollable: ScrollableX;
  private innerList: HTMLElement;

  constructor(
    appendTo: HTMLElement,
    controller: AutocompleteHelperController,
    private chatInput: ChatInput,
    private managers: AppManagers
  ) {
    super({
      appendTo,
      controller,
      listType: 'x',
      onSelect: (target) => {
        chatInput.onEmojiSelected(getEmojiFromElement(target as any), true);
      },
      getNavigationList: () => this.innerList
    });

    this.container.classList.add('emoji-helper');
  }

  public init() {
    this.list = document.createElement('div');
    this.list.classList.add('emoji-helper-emojis', 'super-emojis');

    this.container.append(this.list);

    this.scrollable = new ScrollableX(this.container);

    this.addEventListener('visible', () => {
      setTimeout(() => { // it is not rendered yet
        this.scrollable.scrollPosition = 0;
      }, 0);
    });
  }

  private async renderEmojis(emojis: AppEmoji[], middleware: Middleware) {
    const container = this.list.cloneNode() as HTMLElement;
    const customEmojis: Parameters<CustomEmojiRendererElement['add']>[0]['addCustomEmojis'] = new Map();
    const inner = this.innerList = document.createElement('span');
    container.append(inner);

    if(!rootScope.premium) {
      emojis = emojis.filter((emoji) => this.chatInput.emoticonsDropdown.canUseEmoji(emoji, false));
    }

    emojis.forEach((emoji) => {
      const wrapped = wrapAppEmoji(emoji, true);
      inner.append(wrapped);

      if(emoji.docId) {
        const customEmojiElement = wrapped.firstElementChild as CustomEmojiElement;
        // customEmojiElement.clear(false);
        // const customEmojiElement = CustomEmojiElement.create(document.id);
        customEmojis.set(customEmojiElement.docId, new Set([customEmojiElement]));
      }
    });

    if(customEmojis.size) {
      const _middleware = getMiddleware();
      middleware.create().get().onClean(() => {
        setTimeout(() => _middleware.destroy(), 500); // * fix video flick
      });

      const customEmojiRenderer = CustomEmojiRendererElement.create({
        animationGroup: 'INLINE-HELPER',
        customEmojiSize: mediaSizes.active.esgCustomEmoji,
        textColor: 'primary-text-color',
        observeResizeElement: false,
        middleware: _middleware.get()
      });

      container.prepend(customEmojiRenderer);

      customEmojiRenderer.setDimensionsFromRect({
        width: (emojis.length * 42) + 8,
        height: 42
      });

      const listenerSetter = new ListenerSetter();
      middleware.onClean(() => {
        listenerSetter.removeAll();
        if(this.innerList === inner) {
          this.innerList = undefined;
        }
      });
      attachStickerViewerListeners({listenTo: this.container, listenerSetter});

      await customEmojiRenderer.add({
        addCustomEmojis: customEmojis
      });
    }

    return container;
  }

  public async render(emojis: AppEmoji[], waitForKey: boolean, middleware: Middleware) {
    if(this.init) {
      if(!emojis.length) {
        return;
      }

      this.init();
      this.init = null;
    }

    if(!emojis.length) {
      this.toggle(true);
      return;
    }

    emojis = emojis.slice(0, 80);

    const container = await this.renderEmojis(emojis, middleware);
    if(!middleware()) {
      return;
    }

    this.list.replaceWith(container);
    this.list = container;
    this.waitForKey = waitForKey ? ['ArrowUp', 'ArrowDown'] : undefined;

    this.toggle(false);
    this.scrollable.scrollPosition = 0;

    /* window.requestAnimationFrame(() => {
      this.container.style.width = (3 * 2) + (emojis.length * 44) + 'px';
    }); */
  }

  public checkQuery(query: string, firstChar: string) {
    const middleware = this.controller.getMiddleware();
    const q = query.replace(/^:/, '');
    this.managers.appEmojiManager.prepareAndSearchEmojis({q, addCustom: true}).then(async(emojis) => {
      if(!middleware()) {
        return;
      }

      this.render(emojis, firstChar !== ':', middleware);
      // console.log(emojis);
    });
  }
}
