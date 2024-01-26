/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatTopbar from './topbar';
import AppSearch, {SearchGroup} from '../appSearch';
import PopupDatePicker from '../popups/datePicker';
import ripple from '../ripple';
import InputSearch from '../inputSearch';
import type Chat from './chat';
import findUpTag from '../../helpers/dom/findUpTag';
import cancelEvent from '../../helpers/dom/cancelEvent';
import whichChild from '../../helpers/dom/whichChild';
import replaceContent from '../../helpers/dom/replaceContent';
import {i18n} from '../../lib/langPack';
import ListenerSetter from '../../helpers/listenerSetter';
import {attachClickEvent} from '../../helpers/dom/clickEvent';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import {IS_MOBILE_SAFARI} from '../../environment/userAgent';
import PopupElement from '../popups';
import {DIALOG_LIST_ELEMENT_TAG} from '../../lib/appManagers/appDialogsManager';
import {MiddlewareHelper, getMiddleware} from '../../helpers/middleware';
import ButtonIcon from '../buttonIcon';
import pause from '../../helpers/schedulers/pause';

export default class ChatSearch {
  private element: HTMLElement;
  private backBtn: HTMLElement;
  private inputSearch: InputSearch;

  private results: HTMLElement;

  private footer: HTMLElement;
  private dateBtn: HTMLElement;
  private foundCountEl: HTMLElement;
  private controls: HTMLElement;
  private downBtn: HTMLElement;
  private upBtn: HTMLElement;

  private appSearch: AppSearch;
  private searchGroup: SearchGroup;

  private foundCount = 0;
  private selectedIndex = 0;
  private setPeerPromise: Promise<any>;
  private listenerSetter: ListenerSetter;
  private navigationItem: NavigationItem;

  private middlewareHelper: MiddlewareHelper;

  constructor(private topbar: ChatTopbar, private chat: Chat, query?: string) {
    this.middlewareHelper = getMiddleware();
    this.element = document.createElement('div');
    this.element.classList.add('sidebar-header', 'chat-search', 'chatlist-container');

    this.backBtn = ButtonIcon('left sidebar-close-button');

    const listenerSetter = this.listenerSetter = new ListenerSetter();

    const attachClick = (element: HTMLElement, callback: (e: MouseEvent) => void) => {
      attachClickEvent(element, callback, {listenerSetter});
    };

    attachClick(this.backBtn, () => {
      this.destroy();
    });

    this.inputSearch = new InputSearch({placeholder: 'Search'});

    // Results
    this.results = document.createElement('div');
    this.results.classList.add('chat-search-results', 'chatlist-container');

    this.searchGroup = new SearchGroup(false, 'messages', undefined, '', false);
    attachClick(this.searchGroup.list, this.onResultsClick);

    this.appSearch = new AppSearch(
      this.results,
      this.inputSearch,
      {
        messages: this.searchGroup
      },
      this.middlewareHelper.get(),
      (count) => {
        this.foundCount = count;

        const value = this.inputSearch.value;
        this.foundCountEl.classList.toggle('empty', !value);
        if(!this.foundCount) {
          replaceContent(this.foundCountEl, value ? i18n('NoResult') : '');
          this.results.classList.remove('active');
          this.chat.bubbles.container.classList.remove('search-results-active');
          this.upBtn.setAttribute('disabled', 'true');
          this.downBtn.setAttribute('disabled', 'true');
        } else {
          this.selectResult(this.searchGroup.list.children[0] as HTMLElement);
        }
      }
    );
    this.appSearch.beginSearch(this.chat.peerId, this.chat.threadId);

    // appImManager.topbar.parentElement.insertBefore(this.results, appImManager.bubblesContainer);
    this.chat.bubbles.container.append(this.results);

    // Footer
    this.footer = document.createElement('div');
    this.footer.classList.add('chat-search-footer');

    attachClick(this.footer, this.onFooterClick);
    ripple(this.footer);

    this.foundCountEl = document.createElement('span');
    this.foundCountEl.classList.add('chat-search-count', 'empty');

    this.dateBtn = ButtonIcon('calendar chat-search-calendar', {noRipple: true});

    this.controls = document.createElement('div');
    this.controls.classList.add('chat-search-controls');

    this.upBtn = ButtonIcon('up', {noRipple: true});
    this.downBtn = ButtonIcon('down', {noRipple: true});

    this.upBtn.setAttribute('disabled', 'true');
    this.downBtn.setAttribute('disabled', 'true');

    attachClick(this.dateBtn, this.onDateClick);
    attachClick(this.upBtn, this.onUpClick);
    attachClick(this.downBtn, this.onDownClick);
    this.controls.append(this.upBtn, this.downBtn);

    this.footer.append(this.foundCountEl, this.dateBtn, this.controls);

    this.topbar.container.parentElement.insertBefore(this.footer, chat.input.chatInput);

    // Append container
    this.element.append(this.backBtn, this.inputSearch.container);

    this.topbar.container.classList.add('hide-pinned');
    this.topbar.container.parentElement.append(this.element);

    this.inputSearch.input.focus();

    if(query) {
      this.setQuery(query);
    }

    if(!IS_MOBILE_SAFARI) {
      this.navigationItem = {
        type: 'mobile-search',
        onPop: () => {
          this.destroy();
        }
      };

      appNavigationController.pushItem(this.navigationItem);
    }
  }

  public destroy() {
    this.middlewareHelper.destroy();
    this.topbar.container.classList.remove('hide-pinned');
    this.element.remove();
    this.inputSearch.remove();
    this.results.remove();
    this.footer.remove();
    this.listenerSetter.removeAll();
    this.chat.bubbles.container.classList.remove('search-results-active');
    this.chat.search = undefined;
    appNavigationController.removeItem(this.navigationItem);
  }

  public setQuery(query: string) {
    this.inputSearch.inputField.value = query;
  }

  private onDateClick = (e: MouseEvent) => {
    cancelEvent(e);
    PopupElement.createPopup(PopupDatePicker, new Date(), this.chat.bubbles.onDatePick).show();
  };

  private selectResult(elem: HTMLElement) {
    if(this.setPeerPromise) return this.setPeerPromise;

    const peerId = elem.dataset.peerId.toPeerId();
    const lastMsgId = +elem.dataset.mid || undefined;

    const index = whichChild(elem);

    if(index === (this.foundCount - 1)) {
      this.upBtn.setAttribute('disabled', 'true');
    } else {
      this.upBtn.removeAttribute('disabled');
    }

    if(!index) {
      this.downBtn.setAttribute('disabled', 'true');
    } else {
      this.downBtn.removeAttribute('disabled');
    }

    this.results.classList.remove('active');
    this.chat.bubbles.container.classList.remove('search-results-active');

    const res = this.chat.setPeer({peerId, lastMsgId});
    this.setPeerPromise = ((res instanceof Promise ? res : Promise.resolve(res)) as Promise<any>).then(() => {
      this.selectedIndex = index;
      replaceContent(this.foundCountEl, i18n('Of', [index + 1, this.foundCount]));

      const renderedCount = this.searchGroup.list.childElementCount;
      if(this.selectedIndex >= (renderedCount - 6)) {
        this.appSearch.searchMore();
      }
    }).finally(() => {
      this.setPeerPromise = null;
    });
  }

  private onResultsClick = (e: MouseEvent) => {
    const target = findUpTag(e.target, DIALOG_LIST_ELEMENT_TAG);
    if(target) {
      this.selectResult(target);
    }
  };

  private onFooterClick = (e: MouseEvent) => {
    if(this.foundCount) {
      this.chat.bubbles.container.classList.toggle('search-results-active');
      this.results.classList.toggle('active');
    }
  };

  private onUpClick = (e: MouseEvent) => {
    cancelEvent(e);
    this.selectResult(this.searchGroup.list.children[this.selectedIndex + 1] as HTMLElement);
  };

  private onDownClick = (e: MouseEvent) => {
    cancelEvent(e);
    this.selectResult(this.searchGroup.list.children[this.selectedIndex - 1] as HTMLElement);
  };
}
