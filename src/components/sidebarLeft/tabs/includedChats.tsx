import {Component, onCleanup, onMount} from 'solid-js';
import type {MyDialogFilter} from '@lib/storages/filters';
import AppSelectPeers from '@components/appSelectPeers';
import appDialogsManager from '@lib/appDialogsManager';
import ButtonIcon from '@components/buttonIcon';
import Button from '@components/button';
import {i18n, LangPackKey, join} from '@lib/langPack';
import copy from '@helpers/object/copy';
import forEachReverse from '@helpers/array/forEachReverse';
import {REAL_FOLDERS} from '@appManagers/constants';
import rootScope from '@lib/rootScope';
import {attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import SettingSection from '@components/settingSection';
import {DialogFilter} from '@layer';
import showLimitPopup from '@components/popups/limit';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppIncludedChatsTab} from '@components/solidJsTabs/tabs';

const IncludedChats: Component = () => {
  const [tab] = useSuperTab<typeof AppIncludedChatsTab>();
  const promiseCollector = usePromiseCollector();

  const {type, onSetFilter} = tab.payload;
  const originalFilter = tab.payload.filter;
  const filter = copy(originalFilter);

  let confirmBtn: HTMLElement;
  let selector: AppSelectPeers;
  let limit: number;
  const dialogsByFilters: Map<MyDialogFilter, Set<PeerId>> = new Map();

  const renderResults = async(peerIds: PeerId[]) => {
    await tab.managers.appUsersManager.getContacts();
    const promises = peerIds.map(async(peerId) => {
      const dialogElement = appDialogsManager.addDialogNew({
        peerId: peerId,
        container: selector.list,
        rippleEnabled: true,
        avatarSize: 'abitbigger',
        wrapOptions: {
          middleware: tab.middlewareHelper.get()
        }
      });

      (dialogElement.container as any).dialogElement = dialogElement;
      const {dom} = dialogElement;

      const selected = selector.selected.has(peerId);
      dom.containerEl.append(selector.checkbox(selected));

      const foundInFilters: HTMLElement[] = [];
      const promises = [...dialogsByFilters.entries()].map(async([filter, dialogs]) => {
        if(dialogs.has(peerId)) {
          const span = document.createElement('span');
          span.append(await wrapFolderTitle(filter.title, tab.middlewareHelper.get()));
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

  const onSelectChange = (length: number) => {
    if(type === 'included') {
      confirmBtn.style.display = length ? '' : 'none';
    }
  };

  const buildSelector = () => {
    confirmBtn.style.display = type === 'excluded' ? '' : 'none';
    tab.title.replaceChildren(i18n(type === 'included' ? 'FilterAlwaysShow' : 'FilterNeverShow'));

    const categoriesSection = new SettingSection({
      noDelimiter: true,
      name: 'FilterChatTypes'
    });

    categoriesSection.container.classList.add('folder-categories');

    let details: {[flag: string]: {ico: Icon, icoFilled?: Icon, text: LangPackKey}};
    if(type === 'excluded') {
      details = {
        exclude_muted: {ico: 'mute', text: 'ChatList.Filter.MutedChats'},
        exclude_archived: {ico: 'archive', icoFilled: 'archive_filled', text: 'ChatList.Filter.Archive'},
        exclude_read: {ico: 'readchats', text: 'ChatList.Filter.ReadChats'}
      };
    } else {
      details = {
        contacts: {ico: 'newprivate', icoFilled: 'newprivate_filled', text: 'ChatList.Filter.Contacts'},
        non_contacts: {ico: 'noncontacts', text: 'ChatList.Filter.NonContacts'},
        groups: {ico: 'group', icoFilled: 'group_filled', text: 'ChatList.Filter.Groups'},
        broadcasts: {ico: 'newchannel', icoFilled: 'channel_filled', text: 'ChatList.Filter.Channels'},
        bots: {ico: 'bots', icoFilled: 'bot_filled', text: 'ChatList.Filter.Bots'}
      };
    }

    selector = new AppSelectPeers({
      middleware: tab.middlewareHelper.get(),
      appendTo: tab.container,
      onChange: onSelectChange,
      peerType: ['dialogs'],
      renderResultsFunc: renderResults,
      placeholder: 'Search',
      sectionNameLangPackKey: 'FilterChats',
      managers: tab.managers
    });

    const f = document.createDocumentFragment();
    for(const key in details) {
      const button = Button('btn-primary btn-transparent folder-category-button', {icon: details[key].ico, text: details[key].text});
      button.dataset.peerId = key;
      button.append(selector.checkbox());
      f.append(button);
    }
    categoriesSection.content.append(f);

    const selectedPeers = (type === 'included' ? filter.includePeerIds : (filter as DialogFilter.dialogFilter).excludePeerIds).slice();

    selector.selected = new Set(selectedPeers);

    let addedInitial = false;
    const _add = selector.add.bind(selector);
    selector.add = ({key, title, scroll}) => {
      const d = details[key];
      if(selector.selected.size >= limit && addedInitial && !d) {
        showLimitPopup('folderPeers');
        return false;
      }

      const ret = _add({
        key,
        title: d ? i18n(d.text) : undefined,
        scroll,
        fallbackIcon: d ? d.icoFilled || d.ico : undefined
      });
      return ret;
    };

    selector.scrollable.append(
      categoriesSection.container,
      selector.scrollable.container.lastElementChild
    );

    selector.addInitial(selectedPeers);
    addedInitial = true;

    const pFlags = (filter as DialogFilter.dialogFilter).pFlags;
    if(pFlags) for(const flag in pFlags) {
      if(details.hasOwnProperty(flag) && !!pFlags[flag as keyof typeof pFlags]) {
        simulateClickEvent(categoriesSection.content.querySelector(`[data-peer-id="${flag}"]`) as HTMLElement);
      }
    }
  };

  onMount(() => {
    tab.content.remove();
    tab.container.classList.add('included-chatlist-container');
    confirmBtn = ButtonIcon('check btn-confirm blue', {noRipple: true});
    confirmBtn.style.display = 'none';

    tab.header.append(confirmBtn);

    attachClickEvent(confirmBtn, async() => {
      const selected = selector.getSelected();

      const pFlags = (filter as DialogFilter.dialogFilter).pFlags;
      if(type === 'included' && pFlags) {
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
          filter.pFlags[key] = true;
        }
      }

      let cmp: (peerId: PeerId) => boolean;
      if(type === 'included') {
        cmp = (peerId) => peerIds.includes(peerId);
      } else {
        cmp = (peerId) => !peerIds.includes(peerId);
      }

      forEachReverse(filter.pinnedPeerIds, (peerId, idx) => {
        if(!cmp(peerId)) {
          filter.pinnedPeerIds.splice(idx, 1);
          filter.pinned_peers.splice(idx, 1);
        }
      });

      const other = type === 'included' ? 'excludePeerIds' : 'includePeerIds';
      const otherLegacy = type === 'included' ? 'exclude_peers' : 'include_peers';
      const otherArr = (filter as DialogFilter.dialogFilter)[other];
      const otherLegacyArr = (filter as DialogFilter.dialogFilter)[otherLegacy];
      if(otherArr) forEachReverse(otherArr, (peerId, idx) => {
        if(peerIds.includes(peerId)) {
          otherArr.splice(idx, 1);
          otherLegacyArr.splice(idx, 1);
        }
      });

      (filter as DialogFilter.dialogFilter)[type === 'included' ? 'includePeerIds' : 'excludePeerIds'] = peerIds;
      (filter as DialogFilter.dialogFilter)[type === 'included' ? 'include_peers' : 'exclude_peers'] = await Promise.all(peerIds.map((peerId) => tab.managers.appPeersManager.getInputPeerById(peerId)));

      onSetFilter(filter);
      tab.close();
    }, {listenerSetter: tab.listenerSetter});

    const onAppConfig = (appConfig: MTAppConfig) => {
      limit = rootScope.premium ? appConfig.dialog_filters_chats_limit_premium : appConfig.dialog_filters_chats_limit_default;
    };

    tab.listenerSetter.add(rootScope)('app_config', onAppConfig);

    promiseCollector.collect((async() => {
      await Promise.all([
        tab.managers.filtersStorage.getDialogFilters().then(async(filters) => {
          await Promise.all(filters.filter((filter) => !REAL_FOLDERS.has(filter.id)).map(async(filter) => {
            const dialogs = await tab.managers.dialogsStorage.getFolderDialogs(filter.id);
            const peerIds = dialogs.map((d) => d.peerId);
            dialogsByFilters.set(filter, new Set(peerIds));
          }));
        }),

        tab.managers.apiManager.getAppConfig().then((appConfig) => {
          onAppConfig(appConfig);
        })
      ]);

      buildSelector();
    })());
  });

  onCleanup(() => {
    if(selector) {
      selector.container.remove();
      selector = null;
    }
  });

  return null;
};

export default IncludedChats;
