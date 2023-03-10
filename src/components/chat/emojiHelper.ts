/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatInput from './input';
import {appendEmoji, getEmojiFromElement} from '../emoticonsDropdown/tabs/emoji';
import {ScrollableX} from '../scrollable';
import AutocompleteHelper from './autocompleteHelper';
import AutocompleteHelperController from './autocompleteHelperController';
import {AppManagers} from '../../lib/appManagers/managers';

export default class EmojiHelper extends AutocompleteHelper {
  private scrollable: ScrollableX;

  constructor(
    appendTo: HTMLElement,
    controller: AutocompleteHelperController,
    chatInput: ChatInput,
    private managers: AppManagers
  ) {
    super({
      appendTo,
      controller,
      listType: 'x',
      onSelect: (target) => {
        chatInput.onEmojiSelected(getEmojiFromElement(target as any), true);
      }
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
        this.scrollable.container.scrollLeft = 0;
      }, 0);
    });
  }

  public render(emojis: string[], waitForKey: boolean) {
    if(this.init) {
      if(!emojis.length) {
        return;
      }

      this.init();
      this.init = null;
    }

    emojis = emojis.slice(0, 80);

    if(emojis.length) {
      this.list.replaceChildren();
      emojis.forEach((emoji) => {
        appendEmoji(emoji, this.list, false, true);
      });
    }

    this.waitForKey = waitForKey ? ['ArrowUp', 'ArrowDown'] : undefined;
    this.toggle(!emojis.length);

    /* window.requestAnimationFrame(() => {
      this.container.style.width = (3 * 2) + (emojis.length * 44) + 'px';
    }); */
  }

  public checkQuery(query: string, firstChar: string) {
    const middleware = this.controller.getMiddleware();
    this.managers.appEmojiManager.getBothEmojiKeywords().then(async() => {
      if(!middleware()) {
        return;
      }

      const q = query.replace(/^:/, '');
      const emojis = await this.managers.appEmojiManager.searchEmojis(q);
      if(!middleware()) {
        return;
      }

      this.render(emojis, firstChar !== ':');
      // console.log(emojis);
    });
  }
}
