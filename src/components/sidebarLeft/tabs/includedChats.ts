/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {MyDialogFilter} from '../../../lib/storages/filters';
import {SliderSuperTab} from '../../slider';
import AppSelectPeers from '../../appSelectPeers';
import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import ButtonIcon from '../../buttonIcon';
import Button from '../../button';
import AppEditFolderTab from './editFolder';
import I18n, {i18n, LangPackKey, _i18n, join} from '../../../lib/langPack';
import {toast} from '../../toast';
import copy from '../../../helpers/object/copy';
import forEachReverse from '../../../helpers/array/forEachReverse';
import setInnerHTML from '../../../helpers/dom/setInnerHTML';
import wrapEmojiText from '../../../lib/richTextProcessor/wrapEmojiText';
import {REAL_FOLDERS} from '../../../lib/mtproto/mtproto_config';
import rootScope from '../../../lib/rootScope';
import {MTAppConfig} from '../../../lib/mtproto/appConfig';
import {attachClickEvent, simulateClickEvent} from '../../../helpers/dom/clickEvent';
import SettingSection from '../../settingSection';
import {DialogFilter} from '../../../layer';
import Icon from '../../icon';
import showLimitPopup from '../../popups/limit';
import wrapFolderTitle from '../../wrappers/folderTitle';

export default class AppIncludedChatsTab extends SliderSuperTab {
  private editFolderTab: AppEditFolderTab;
  private confirmBtn: HTMLElement;

  private selector: AppSelectPeers;
  private type: 'included' | 'excluded';
  private filter: MyDialogFilter;
  private originalFilter: MyDialogFilter;

  private dialogsByFilters: Map<MyDialogFilter, Set<PeerId>>;
  private limit: number;

  public init(
    filter: MyDialogFilter,
    type: 'included' | 'excluded',
    editFolderTab: AppIncludedChatsTab['editFolderTab']
  ) {
    this.originalFilter = filter;
    this.filter = copy(this.originalFilter);
    this.type = type;
    this.editFolderTab = editFolderTab;

    this.content.remove();
    this.container.classList.add('included-chatlist-container');
    this.confirmBtn = ButtonIcon('check btn-confirm blue', {noRipple: true});
    this.confirmBtn.style.display = 'none';

    this.header.append(this.confirmBtn);

    attachClickEvent(this.confirmBtn, async() => {
      const selected = this.selector.getSelected();

      // this.filter.pFlags = {};

      const pFlags = (this.filter as DialogFilter.dialogFilter).pFlags;
      if(this.type === 'included' && pFlags) {
        for(const key in pFlags) {
          if(key.indexOf('exclude_') === 0) {
            continue;
          }

          // @ts-ignore
          delete pFlags[key];
        }
      } else if(pFlags) {
        for(const key in pFlags) {
          if(key.indexOf('exclude_') !== 0) {
            continue;
          }

          // @ts-ignore
          delete pFlags[key];
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
      const otherArr = (this.filter as DialogFilter.dialogFilter)[other];
      const otherLegacyArr = (this.filter as DialogFilter.dialogFilter)[otherLegacy];
      if(otherArr) forEachReverse(otherArr, (peerId, idx) => {
        if(peerIds.includes(peerId)) {
          otherArr.splice(idx, 1);
          otherLegacyArr.splice(idx, 1);
        }
      });

      (this.filter as DialogFilter.dialogFilter)[this.type === 'included' ? 'includePeerIds' : 'excludePeerIds'] = peerIds;
      (this.filter as DialogFilter.dialogFilter)[this.type === 'included' ? 'include_peers' : 'exclude_peers'] = await Promise.all(peerIds.map((peerId) => this.managers.appPeersManager.getInputPeerById(peerId)));
      // this.filter.pinned_peers = this.filter.pinned_peers.filter((peerId) => this.filter.include_peers.includes(peerId));

      this.editFolderTab.setFilter(this.filter, false);
      this.close();
    }, {listenerSetter: this.listenerSetter});

    const onAppConfig = (appConfig: MTAppConfig) => {
      this.limit = rootScope.premium ? appConfig.dialog_filters_chats_limit_premium : appConfig.dialog_filters_chats_limit_default;
    };

    this.listenerSetter.add(rootScope)('app_config', onAppConfig);

    this.dialogsByFilters = new Map();
    return Promise.all([
      this.managers.filtersStorage.getDialogFilters().then(async(filters) => {
        await Promise.all(filters.filter((filter) => !REAL_FOLDERS.has(filter.id)).map(async(filter) => {
          const dialogs = await this.managers.dialogsStorage.getFolderDialogs(filter.id);
          const peerIds = dialogs.map((d) => d.peerId);
          this.dialogsByFilters.set(filter, new Set(peerIds));
        }));
      }),

      this.managers.apiManager.getAppConfig().then((appConfig) => {
        onAppConfig(appConfig);
      })
    ]);
  }

  renderResults = async(peerIds: PeerId[]) => {
    // const other = this.type === 'included' ? this.filter.exclude_peers : this.filter.include_peers;

    await this.managers.appUsersManager.getContacts();
    const promises = peerIds.map(async(peerId) => {
      // if(other.includes(peerId)) return;

      const dialogElement = appDialogsManager.addDialogNew({
        peerId: peerId,
        container: this.selector.list,
        rippleEnabled: true,
        avatarSize: 'abitbigger',
        wrapOptions: {
          middleware: this.middlewareHelper.get()
        }
      });

      (dialogElement.container as any).dialogElement = dialogElement;
      const {dom} = dialogElement;

      const selected = this.selector.selected.has(peerId);
      dom.containerEl.append(this.selector.checkbox(selected));
      // if(selected) dom.listEl.classList.add('active');

      const foundInFilters: HTMLElement[] = [];
      const promises = [...this.dialogsByFilters.entries()].map(async([filter, dialogs]) => {
        if(dialogs.has(peerId)) {
          const span = document.createElement('span');
          span.append(await wrapFolderTitle(filter.title, this.middlewareHelper.get()));
          foundInFilters.push(span);
        }
      });

      await Promise.all(promises);

      const joined = join(foundInFilters, false);
      joined.forEach((el) => {
        dom.lastMessageSpan.append(el);
      });
    });

    await Promise.all(promises);
  };

  onOpen() {
    this.confirmBtn.style.display = this.type === 'excluded' ? '' : 'none';
    this.setTitle(this.type === 'included' ? 'FilterAlwaysShow' : 'FilterNeverShow');

    const filter = this.filter;

    const categoriesSection = new SettingSection({
      noDelimiter: true,
      name: 'FilterChatTypes'
    });

    categoriesSection.container.classList.add('folder-categories');

    let details: {[flag: string]: {ico: Icon, text: LangPackKey}};
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

    this.selector = new AppSelectPeers({
      middleware: this.middlewareHelper.get(),
      appendTo: this.container,
      onChange: this.onSelectChange,
      peerType: ['dialogs'],
      renderResultsFunc: this.renderResults,
      placeholder: 'Search',
      sectionNameLangPackKey: 'FilterChats',
      managers: this.managers
    });

    const f = document.createDocumentFragment();
    for(const key in details) {
      const button = Button('btn-primary btn-transparent folder-category-button', {icon: details[key].ico, text: details[key].text});
      button.dataset.peerId = key;
      button.append(this.selector.checkbox());
      f.append(button);
    }
    categoriesSection.content.append(f);

    // ///////////////

    const selectedPeers = (this.type === 'included' ? filter.includePeerIds : (filter as DialogFilter.dialogFilter).excludePeerIds).slice();

    this.selector.selected = new Set(selectedPeers);

    let addedInitial = false;
    const _add = this.selector.add.bind(this.selector);
    this.selector.add = ({key: peerId, title, scroll}) => {
      if(this.selector.selected.size >= this.limit && addedInitial && !details[peerId]) {
        showLimitPopup('folderPeers');
        return false;
      }

      const ret = _add({
        key: peerId,
        title: details[peerId] ? i18n(details[peerId].text) : undefined,
        scroll,
        fallbackIcon: details[peerId]?.ico
      });
      return ret;
    };

    this.selector.scrollable.append(categoriesSection.container, this.selector.scrollable.container.lastElementChild);

    this.selector.addInitial(selectedPeers);
    addedInitial = true;

    const pFlags = (filter as DialogFilter.dialogFilter).pFlags;
    if(pFlags) for(const flag in pFlags) {
      if(details.hasOwnProperty(flag) && !!pFlags[flag as keyof typeof pFlags]) {
        simulateClickEvent(categoriesSection.content.querySelector(`[data-peer-id="${flag}"]`) as HTMLElement);
      }
    }
  }

  onSelectChange = (length: number) => {
    // const changed = !deepEqual(this.filter, this.originalFilter);
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
}
