import {Component} from 'solid-js';
import type {MyDialogFilter} from '@lib/storages/filters';
import type {DialogFilter, DialogFilterSuggested} from '@layer';
import {LottieLoader} from '@lib/rlottie/lottieLoader';
import Button from '@components/button';
import rootScope from '@lib/rootScope';
import Row from '@components/row';
import {i18n, i18n_, LangPackKey, join} from '@lib/langPack';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import RLottiePlayer from '@lib/rlottie/rlottiePlayer';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, REAL_FOLDERS} from '@appManagers/constants';
import replaceContent from '@helpers/dom/replaceContent';
import SettingSection from '@components/settingSection';
import Sortable from '@helpers/dom/sortable';
import whichChild from '@helpers/dom/whichChild';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import showLimitPopup from '@components/popups/limit';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import RadioField from '@components/radioField';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import useHasFoldersSidebar from '@stores/foldersSidebar';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppChatFoldersTab} from '@components/solidJsTabs/tabs';

const ChatFolders: Component = () => {
  const [tab] = useSuperTab<typeof AppChatFoldersTab>();
  const promiseCollector = usePromiseCollector();
  const {AppEditFolderTab, appSidebarLeft, lottieLoader, appImManager} = useHotReloadGuard();
  const p = tab.payload;

  const filtersRendered: {[filterId: number]: Row} = {};
  let animation: RLottiePlayer;
  let loadAnimationPromise: ReturnType<LottieLoader['waitForFirstFrame']>;

  let createFolderBtn: HTMLElement;
  let foldersSection: SettingSection;
  let suggestedSection: SettingSection;
  let viewSection: SettingSection;
  let stickerContainer: HTMLElement;
  let list: HTMLElement;

  const renderFolder = async(
    dialogFilter: DialogFilterSuggested | MyDialogFilter,
    container?: HTMLElement,
    row?: Row,
    append?: boolean
  ) => {
    let filter: MyDialogFilter;
    let description = '';
    const d: HTMLElement[] = [];
    if(dialogFilter._ === 'dialogFilterSuggested') {
      filter = dialogFilter.filter as MyDialogFilter;
      description = dialogFilter.description;
    } else {
      filter = dialogFilter;

      const pFlags = (filter as DialogFilter.dialogFilter).pFlags || {};
      const enabledFilters = Object.keys(pFlags).length;
      /* (['include_peers', 'exclude_peers'] as ['include_peers', 'exclude_peers']).forEach((key) => {
        enabledFilters += +!!filter[key].length;
      }); */

      if(enabledFilters === 1) {
        let k: LangPackKey;
        if(pFlags.contacts) k = 'FilterAllContacts';
        else if(pFlags.non_contacts) k = 'FilterAllNonContacts';
        else if(pFlags.groups) k = 'FilterAllGroups';
        else if(pFlags.broadcasts) k = 'FilterAllChannels';
        else if(pFlags.bots) k = 'FilterAllBots';

        if(k) {
          d.push(i18n(k));
        }
      }

      if(!d.length) {
        const folder = await tab.managers.dialogsStorage.getFolderDialogs(filter.id);
        let chats = 0, channels = 0, groups = 0;
        await Promise.all(folder.map(async(dialog) => {
          if(await tab.managers.appPeersManager.isAnyGroup(dialog.peerId)) ++groups;
          else if(await tab.managers.appPeersManager.isBroadcast(dialog.peerId)) ++channels;
          else ++chats;
        }));

        if(chats) d.push(i18n('Chats', [chats]));
        if(channels) d.push(i18n('Channels', [channels]));
        if(groups) d.push(i18n('Groups', [groups]));
      }
    }

    if(!row) {
      const isSuggested = dialogFilter._ === 'dialogFilterSuggested';
      row = new Row({
        title: filter.id === FOLDER_ID_ALL && !isSuggested ? i18n('FilterAllChats') : await wrapFolderTitle(filter.title, tab.middlewareHelper.get(), false, {textColor: 'primary-text-color'}),
        subtitle: description,
        clickable: true,
        buttonRightLangKey: isSuggested ? 'Add' : undefined
      });

      if(d.length) {
        row.subtitle.append(...join(d));
      }

      if(!isSuggested) {
        const filterId = filter.id;
        if(!filtersRendered[filter.id] && filter.id !== FOLDER_ID_ALL) {
          const initArgs = AppEditFolderTab.getInitArgs();
          attachClickEvent(row.container, async() => {
            const filter = await tab.managers.filtersStorage.getFilter(filterId);
            tab.slider.createTab(AppEditFolderTab).open({...initArgs, initFilter: filter});
          }, {listenerSetter: tab.listenerSetter});
        }

        filtersRendered[filter.id] = row;

        row.makeSortable();
      }
    } else {
      if(filter.id !== FOLDER_ID_ALL) {
        replaceContent(row.title, await wrapFolderTitle(filter.title, tab.middlewareHelper.get()));
      }

      row.subtitle.textContent = '';
      row.subtitle.append(...join(d));
    }

    const div = row.container;

    if(append) {
      const localId = (filter as MyDialogFilter).localId;
      if(localId !== undefined) {
        // ! header will be at 0 index
        positionElementByIndex(div, div.parentElement || container, localId);
      } else if(container) {
        container.append(div);
      }
    }

    return row;
  };

  const toggleAllChats = () => {
    const filterRendered = filtersRendered[FOLDER_ID_ALL];
    filterRendered.container.classList.toggle('hide', !rootScope.premium);
  };

  const canCreateFolder = async() => {
    const [limit, filters] = await Promise.all([
      tab.managers.apiManager.getLimit('folders'),
      tab.managers.filtersStorage.getDialogFilters()
    ]);

    const filtersLength = filters.filter((filter) => !REAL_FOLDERS.has(filter.id)).length;
    return filtersLength < limit;
  };

  const getSuggestedFilters = () => {
    return tab.managers.filtersStorage.getSuggestedDialogsFilters().then(async(suggestedFilters) => {
      suggestedSection.container.classList.toggle('hide', !suggestedFilters.length);
      Array.from(suggestedSection.content.children).slice(1).forEach((el) => el.remove());

      for(const filter of suggestedFilters) {
        const row = await renderFolder(filter);
        suggestedSection.content.append(row.container);

        const button = row.buttonRight;
        attachClickEvent(button, async(e) => {
          cancelEvent(e);

          if(!(await canCreateFolder())) {
            showLimitPopup('folders');
            return;
          }

          button.setAttribute('disabled', 'true');

          const f = filter.filter as DialogFilter.dialogFilter;
          f.includePeerIds = [];
          f.excludePeerIds = [];
          f.pinnedPeerIds = [];

          tab.managers.filtersStorage.createDialogFilter(f, true).then(() => {
            row.container.remove();
            suggestedSection.container.classList.toggle('hide', suggestedSection.content.childElementCount === 1);
          }).finally(() => {
            button.removeAttribute('disabled');
          });
        }, {listenerSetter: tab.listenerSetter});
      }
    });
  };

  (tab as any)._onOpenAfterTimeout = () => {
    loadAnimationPromise.then(() => {
      animation.autoplay = true;
      animation.play();
    });
  };

  tab.container.classList.add('chat-folders-container');

  tab.scrollable.container.classList.add('chat-folders');

  stickerContainer = document.createElement('div');
  stickerContainer.classList.add('sticker-container');

  const caption = document.createElement('div');
  caption.classList.add('caption');
  i18n_({element: caption, key: 'ChatList.Filter.Header'});

  createFolderBtn = Button('btn-primary btn-color-primary btn-control', {
    text: 'ChatList.Filter.NewTitle',
    icon: 'add'
  });

  foldersSection = new SettingSection({
    name: 'Filters'
  });
  foldersSection.container.classList.add('hide');

  list = document.createElement('div');
  foldersSection.content.append(list);

  suggestedSection = new SettingSection({
    name: 'FilterRecommended'
  });
  suggestedSection.container.classList.add('hide');

  viewSection = new SettingSection({
    name: 'FiltersView'
  });

  const form = document.createElement('form');

  const name = 'theme';
  const stateKey = joinDeepPath('settings', 'tabsInSidebar');

  const onLeftRow = new Row({
    radioField: new RadioField({
      langKey: 'FiltersOnLeft',
      name,
      value: 'true',
      valueForState: true,
      stateKey
    })
  });

  const nonTopRow = new Row({
    radioField: new RadioField({
      langKey: 'FiltersOnTop',
      name,
      value: 'false',
      valueForState: false,
      stateKey
    })
  });

  tab.listenerSetter.add(rootScope)('settings_updated', ({key, value}) => {
    if(key === stateKey) {
      const [, setHasFoldersSidebar] = useHasFoldersSidebar();
      setHasFoldersSidebar(!!value);
      appImManager.adjustChatPatternBackground();
      if(!value) appSidebarLeft.showCtrlFTip();
    }
  });

  form.append(onLeftRow.container, nonTopRow.container);
  viewSection.content.append(form);

  tab.scrollable.append(
    stickerContainer,
    caption,
    createFolderBtn,
    foldersSection.container,
    suggestedSection.container,
    viewSection.container
  );

  attachClickEvent(createFolderBtn, async() => {
    if(!(await canCreateFolder())) {
      showLimitPopup('folders');
    } else {
      tab.slider.createTab(AppEditFolderTab).open(AppEditFolderTab.getInitArgs());
    }
  }, {listenerSetter: tab.listenerSetter});

  const onFiltersContainerUpdate = () => {
    foldersSection.container.classList.toggle('hide', !Object.keys(filtersRendered).length);
  };

  const loadPromises: Promise<any>[] = [];
  const renderFiltersPromise = p.filters.then(async(filters) => {
    for(const filter of filters) {
      if(filter.id === FOLDER_ID_ARCHIVE) {
        continue;
      }

      await renderFolder(filter, list, undefined, true);
    }

    toggleAllChats();

    onFiltersContainerUpdate();
  });

  loadPromises.push(renderFiltersPromise);

  tab.listenerSetter.add(rootScope)('filter_update', async(filter) => {
    const filterRendered = filtersRendered[filter.id];
    if(filterRendered) {
      await renderFolder(filter, null, filterRendered);
    } else if(filter.id !== FOLDER_ID_ARCHIVE) {
      await renderFolder(filter, list, undefined, true);
    }

    onFiltersContainerUpdate();

    getSuggestedFilters();
  });

  tab.listenerSetter.add(rootScope)('filter_delete', (filter) => {
    const filterRendered = filtersRendered[filter.id];
    if(filterRendered) {
      /* for(const suggested of this.suggestedFilters) {
        if(deepEqual(suggested.filter, filter)) {

        }
      } */
      getSuggestedFilters();

      filterRendered.container.remove();
      delete filtersRendered[filter.id];
    }

    onFiltersContainerUpdate();
  });

  tab.listenerSetter.add(rootScope)('filter_order', (order) => {
    order.filter((filterId) => !!filtersRendered[filterId]).forEach((filterId, idx) => {
      const filterRendered = filtersRendered[filterId];
      const container = filterRendered.container;
      positionElementByIndex(container, container.parentElement, idx + 1); // ! + 1 due to header
    });
  });

  tab.listenerSetter.add(rootScope)('premium_toggle', () => {
    toggleAllChats();
  });

  loadAnimationPromise = p.animationData.then(async(cb) => {
    const player = await cb({
      container: stickerContainer,
      loop: false,
      autoplay: false,
      width: 86,
      height: 86
    });

    animation = player;

    return lottieLoader.waitForFirstFrame(player);
  });

  loadPromises.push(loadAnimationPromise);

  new Sortable({
    list: list,
    middleware: tab.middlewareHelper.get(),
    onSort: (prevIdx, newIdx) => {
      let order: number[] = [];
      for(const filterId in filtersRendered) {
        const row = filtersRendered[filterId];
        const idx = whichChild(row.container);
        order[idx] = +filterId;
      }

      order = order.filter((filterId) => filterId !== undefined);
      if(!rootScope.premium) {
        indexOfAndSplice(order, FOLDER_ID_ALL);
        // order.unshift(FOLDER_ID_ALL);
      }

      tab.managers.filtersStorage.updateDialogFiltersOrder(order);
    },
    scrollable: tab.scrollable
  });

  getSuggestedFilters();

  promiseCollector.collect(Promise.all(loadPromises));

  return null;
};

export default ChatFolders;
