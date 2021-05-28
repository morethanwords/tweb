/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatTopbar from "./topbar";
import AppSearch, { SearchGroup } from "../appSearch";
import PopupDatePicker from "../popups/datePicker";
import { ripple } from "../ripple";
import InputSearch from "../inputSearch";
import type Chat from "./chat";
import findUpTag from "../../helpers/dom/findUpTag";
import { cancelEvent } from "../../helpers/dom/cancelEvent";
import whichChild from "../../helpers/dom/whichChild";
import replaceContent from "../../helpers/dom/replaceContent";
import { i18n } from "../../lib/langPack";

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

  constructor(private topbar: ChatTopbar, private chat: Chat, private query?: string) {
    this.element = document.createElement('div');
    this.element.classList.add('sidebar-header', 'chat-search', 'chatlist-container');

    this.backBtn = document.createElement('button');
    this.backBtn.classList.add('btn-icon', 'tgico-left', 'sidebar-close-button');
    ripple(this.backBtn);
    
    this.backBtn.addEventListener('click', () => {
      this.topbar.container.classList.remove('hide-pinned');
      this.element.remove();
      this.inputSearch.remove();
      this.results.remove();
      this.footer.remove();
      this.footer.removeEventListener('click', this.onFooterClick);
      this.dateBtn.removeEventListener('click', this.onDateClick);
      this.upBtn.removeEventListener('click', this.onUpClick);
      this.downBtn.removeEventListener('click', this.onDownClick);
      this.searchGroup.list.removeEventListener('click', this.onResultsClick);
      this.chat.bubbles.bubblesContainer.classList.remove('search-results-active');
    }, {once: true});

    this.inputSearch = new InputSearch('Search');
    
    // Results
    this.results = document.createElement('div');
    this.results.classList.add('chat-search-results', 'chatlist-container');

    this.searchGroup = new SearchGroup(false, 'messages', undefined, '', false);
    this.searchGroup.list.addEventListener('click', this.onResultsClick);

    this.appSearch = new AppSearch(this.results, this.inputSearch, {
      messages: this.searchGroup
    }, (count) => {
      this.foundCount = count;

      if(!this.foundCount) {
        this.foundCountEl.replaceWith(this.inputSearch.value ? i18n('NoResult') : '');
        this.results.classList.remove('active');
        this.chat.bubbles.bubblesContainer.classList.remove('search-results-active');
        this.upBtn.setAttribute('disabled', 'true');
        this.downBtn.setAttribute('disabled', 'true');
      } else {
        this.selectResult(this.searchGroup.list.children[0] as HTMLElement);
      }
    });
    this.appSearch.beginSearch(this.chat.peerId, this.chat.threadId);

    //appImManager.topbar.parentElement.insertBefore(this.results, appImManager.bubblesContainer);
    this.chat.bubbles.bubblesContainer.append(this.results);

    // Footer
    this.footer = document.createElement('div');
    this.footer.classList.add('chat-search-footer');

    this.footer.addEventListener('click', this.onFooterClick);
    ripple(this.footer);

    this.foundCountEl = document.createElement('span');
    this.foundCountEl.classList.add('chat-search-count');

    this.dateBtn = document.createElement('button');
    this.dateBtn.classList.add('btn-icon', 'tgico-calendar');

    this.controls = document.createElement('div');
    this.controls.classList.add('chat-search-controls');

    this.upBtn = document.createElement('button');
    this.upBtn.classList.add('btn-icon', 'tgico-up');
    this.downBtn = document.createElement('button');
    this.downBtn.classList.add('btn-icon', 'tgico-down');

    this.upBtn.setAttribute('disabled', 'true');
    this.downBtn.setAttribute('disabled', 'true');

    this.dateBtn.addEventListener('click', this.onDateClick);
    this.upBtn.addEventListener('click', this.onUpClick);
    this.downBtn.addEventListener('click', this.onDownClick);
    this.controls.append(this.upBtn, this.downBtn);

    this.footer.append(this.foundCountEl, this.dateBtn, this.controls);
    
    this.topbar.container.parentElement.insertBefore(this.footer, chat.input.chatInput);

    // Append container
    this.element.append(this.backBtn, this.inputSearch.container);

    this.topbar.container.classList.add('hide-pinned');
    this.topbar.container.parentElement.append(this.element);

    this.inputSearch.input.focus();

    query && (this.inputSearch.inputField.value = query);
  }

  onDateClick = (e: MouseEvent) => {
    cancelEvent(e);
    new PopupDatePicker(new Date(), this.chat.bubbles.onDatePick).show();
  };

  selectResult = (elem: HTMLElement) => {
    if(this.setPeerPromise) return this.setPeerPromise;

    const peerId = +elem.dataset.peerId;
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
    this.chat.bubbles.bubblesContainer.classList.remove('search-results-active');

    const res = this.chat.setPeer(peerId, lastMsgId);
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
  };

  onResultsClick = (e: MouseEvent) => {
    const target = findUpTag(e.target, 'LI');
    if(target) {
      this.selectResult(target);
    }
  };

  onFooterClick = (e: MouseEvent) => {
    if(this.foundCount) {
      this.chat.bubbles.bubblesContainer.classList.toggle('search-results-active');
      this.results.classList.toggle('active');
    }
  };

  onUpClick = (e: MouseEvent) => {
    cancelEvent(e);
    this.selectResult(this.searchGroup.list.children[this.selectedIndex + 1] as HTMLElement);
  };

  onDownClick = (e: MouseEvent) => {
    cancelEvent(e);
    this.selectResult(this.searchGroup.list.children[this.selectedIndex - 1] as HTMLElement);
  };
}