/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { SliderSuperTab } from "../../slider";
import AppSelectPeers from "../../appSelectPeers";
import appDialogsManager from "../../../lib/appManagers/appDialogsManager";
import appUsersManager from "../../../lib/appManagers/appUsersManager";
import { MyDialogFilter as DialogFilter } from "../../../lib/storages/filters";
import ButtonIcon from "../../buttonIcon";
import CheckboxField from "../../checkboxField";
import Button from "../../button";
import AppEditFolderTab from "./editFolder";
import I18n, { i18n, LangPackKey, _i18n, join } from "../../../lib/langPack";
import appMessagesManager from "../../../lib/appManagers/appMessagesManager";
import RichTextProcessor from "../../../lib/richtextprocessor";
import { SettingSection } from "..";
import { toast } from "../../toast";
import appPeersManager from "../../../lib/appManagers/appPeersManager";
import copy from "../../../helpers/object/copy";
import forEachReverse from "../../../helpers/array/forEachReverse";
import setInnerHTML from "../../../helpers/dom/setInnerHTML";

export default class AppIncludedChatsTab extends SliderSuperTab {
  private editFolderTab: AppEditFolderTab;
  private confirmBtn: HTMLElement;

  private selector: AppSelectPeers;
  private type: 'included' | 'excluded';
  private filter: DialogFilter;
  private originalFilter: DialogFilter;

  private dialogsByFilters: Map<DialogFilter, Set<PeerId>>;

  protected init() {
    this.content.remove();
    this.container.classList.add('included-chatlist-container');
    this.confirmBtn = ButtonIcon('check btn-confirm blue', {noRipple: true});
    this.confirmBtn.style.display = 'none';

    this.header.append(this.confirmBtn);

    this.confirmBtn.addEventListener('click', () => {
      const selected = this.selector.getSelected();

      //this.filter.pFlags = {};

      if(this.type === 'included') {
        for(const key in this.filter.pFlags) {
          if(key.indexOf('exclude_') === 0) {
            continue;
          }

          // @ts-ignore
          delete this.filter.pFlags[key];
        }
      } else {
        for(const key in this.filter.pFlags) {
          if(key.indexOf('exclude_') !== 0) {
            continue;
          }

          // @ts-ignore
          delete this.filter.pFlags[key];
        }
      }

      const peerIds: PeerId[] = [];
      for(const key of selected) {
        if(key.isPeerId()) {
          peerIds.push(key.toPeerId());
        } else {
          // @ts-ignore
          this.filter.pFlags[key] = true;
        }
      }

      let cmp: (peerId: PeerId) => boolean;
      if(this.type === 'included') {
        cmp = (peerId) => peerIds.includes(peerId);
      } else {
        cmp = (peerId) => !peerIds.includes(peerId);
      }

      forEachReverse(this.filter.pinnedPeerIds, (peerId, idx) => {
        if(!cmp(peerId)) {
          this.filter.pinnedPeerIds.splice(idx, 1);
          this.filter.pinned_peers.splice(idx, 1);
        }
      });

      const other = this.type === 'included' ? 'excludePeerIds' : 'includePeerIds';
      const otherLegacy = this.type === 'included' ? 'exclude_peers' : 'include_peers';
      forEachReverse(this.filter[other], (peerId, idx) => {
        if(peerIds.includes(peerId)) {
          this.filter[other].splice(idx, 1);
          this.filter[otherLegacy].splice(idx, 1);
        }
      });
      
      this.filter[this.type === 'included' ? 'includePeerIds' : 'excludePeerIds'] = peerIds;
      this.filter[this.type === 'included' ? 'include_peers' : 'exclude_peers'] = peerIds.map(peerId => appPeersManager.getInputPeerById(peerId));
      //this.filter.pinned_peers = this.filter.pinned_peers.filter(peerId => this.filter.include_peers.includes(peerId));

      this.editFolderTab.setFilter(this.filter, false);
      this.close();
    });

    this.dialogsByFilters = new Map();
    return appMessagesManager.filtersStorage.getDialogFilters().then(filters => {
      for(const filter of filters) {
        this.dialogsByFilters.set(filter, new Set(appMessagesManager.dialogsStorage.getFolderDialogs(filter.id).map(d => d.peerId)));
      }
    });
  }

  checkbox(selected?: boolean) {
    const checkboxField = new CheckboxField({
      round: true
    });
    if(selected) {
      checkboxField.input.checked = selected;
    }

    return checkboxField.label;
  }

  renderResults = async(peerIds: PeerId[]) => {
    //const other = this.type === 'included' ? this.filter.exclude_peers : this.filter.include_peers;

    await appUsersManager.getContacts();
    peerIds.forEach(peerId => {
      //if(other.includes(peerId)) return;

      const {dom} = appDialogsManager.addDialogNew({
        dialog: peerId,
        container: this.selector.scrollable,
        drawStatus: false,
        rippleEnabled: true,
        avatarSize: 46
      });

      const selected = this.selector.selected.has(peerId);
      dom.containerEl.append(this.checkbox(selected));
      //if(selected) dom.listEl.classList.add('active');

      const foundInFilters: HTMLElement[] = [];
      this.dialogsByFilters.forEach((dialogs, filter) => {
        if(dialogs.has(peerId)) {
          const span = document.createElement('span');
          setInnerHTML(span, RichTextProcessor.wrapEmojiText(filter.title));
          foundInFilters.push(span);
        }
      });

      const joined = join(foundInFilters, false);
      joined.forEach(el => {
        dom.lastMessageSpan.append(el);
      });
    });
  };

  onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }

    this.confirmBtn.style.display = this.type === 'excluded' ? '' : 'none';
    this.setTitle(this.type === 'included' ? 'FilterAlwaysShow' : 'FilterNeverShow');

    const filter = this.filter;

    const categoriesSection = new SettingSection({
      noDelimiter: true,
      name: 'FilterChatTypes'
    });

    categoriesSection.container.classList.add('folder-categories');

    let details: {[flag: string]: {ico: string, text: LangPackKey}};
    if(this.type === 'excluded') {
      details = {
        exclude_muted: {ico: 'mute', text: 'ChatList.Filter.MutedChats'},
        exclude_archived: {ico: 'archive', text: 'ChatList.Filter.Archive'},
        exclude_read: {ico: 'readchats', text: 'ChatList.Filter.ReadChats'}
      };
    } else {
      details = {
        contacts: {ico: 'newprivate', text: 'ChatList.Filter.Contacts'},
        non_contacts: {ico: 'noncontacts', text: 'ChatList.Filter.NonContacts'},
        groups: {ico: 'group', text: 'ChatList.Filter.Groups'},
        broadcasts: {ico: 'newchannel', text: 'ChatList.Filter.Channels'},
        bots: {ico: 'bots', text: 'ChatList.Filter.Bots'}
      };
    }

    const f = document.createDocumentFragment();
    for(const key in details) {
      const button = Button('btn-primary btn-transparent folder-category-button', {icon: details[key].ico, text: details[key].text});
      button.dataset.peerId = key;
      button.append(this.checkbox());
      f.append(button);
    }
    categoriesSection.content.append(f);

    /////////////////

    const selectedPeers = (this.type === 'included' ? filter.includePeerIds : filter.excludePeerIds).slice();

    this.selector = new AppSelectPeers({
      appendTo: this.container, 
      onChange: this.onSelectChange, 
      peerType: ['dialogs'], 
      renderResultsFunc: this.renderResults,
      placeholder: 'Search',
      sectionNameLangPackKey: 'FilterChats'
    });
    this.selector.selected = new Set(selectedPeers);

    let addedInitial = false;
    const _add = this.selector.add.bind(this.selector);
    this.selector.add = (peerId, title, scroll) => {
      if(this.selector.selected.size >= 100 && addedInitial && !details[peerId]) {
        const el: HTMLInputElement = this.selector.list.querySelector(`[data-peer-id="${peerId}"] [type="checkbox"]`);
        if(el) {
          setTimeout(() => {
            el.checked = false;
          }, 0);
        }

        const str = I18n.format(this.type === 'excluded' ? 'ChatList.Filter.Exclude.LimitReached': 'ChatList.Filter.Include.LimitReached', true);
        toast(str);
        return;
      }

      const div = _add(peerId, details[peerId] ? i18n(details[peerId].text) : undefined, scroll);
      if(details[peerId]) {
        div.querySelector('avatar-element').classList.add('tgico-' + details[peerId].ico);
      }
      return div;
    };

    this.selector.scrollable.container.append(categoriesSection.container, this.selector.scrollable.container.lastElementChild);

    this.selector.addInitial(selectedPeers);
    addedInitial = true;

    for(const flag in filter.pFlags) {
      // @ts-ignore
      if(details.hasOwnProperty(flag) && !!filter.pFlags[flag]) {
        (categoriesSection.content.querySelector(`[data-peer-id="${flag}"]`) as HTMLElement).click();
      }
    }
  }

  onSelectChange = (length: number) => {
    //const changed = !deepEqual(this.filter, this.originalFilter);
    if(this.type === 'included') {
      this.confirmBtn.style.display = length ? '' : 'none';
    }
  };

  onCloseAfterTimeout() {
    if(this.selector) {
      this.selector.container.remove();
      this.selector = null;
    }

    return super.onCloseAfterTimeout();
  }

  /**
   * Do not ignore arguments!
   */
  public open(filter?: DialogFilter, type?: 'included' | 'excluded', editFolderTab?: AppIncludedChatsTab['editFolderTab']) {
    this.originalFilter = filter;
    this.filter = copy(this.originalFilter);
    this.type = type;
    this.editFolderTab = editFolderTab;
    
    return super.open();
  }
}
