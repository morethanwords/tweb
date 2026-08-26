import {Component, createSignal, JSX, onMount, Show, Signal} from 'solid-js';
import type {MyDialogFilter} from '@lib/storages/filters';
import type {DialogFilter, DialogFilterSuggested} from '@layer';
import {LottieLoader} from '@lib/lottie/lottieLoader';
import Button from '@components/buttonTsx';
import rootScope from '@lib/rootScope';
import Section from '@components/section';
import {i18n, LangPackKey, join} from '@lib/langPack';
import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import {FOLDER_ID_ALL, FOLDER_ID_ARCHIVE, REAL_FOLDERS} from '@appManagers/constants';
import Sortable from '@helpers/dom/sortable';
import whichChild from '@helpers/dom/whichChild';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import showLimitPopup from '@components/popups/limit';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import wrapFolderTitle from '@components/wrappers/folderTitle';
import useHasFoldersSidebar from '@stores/foldersSidebar';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import type {AppChatFoldersTab} from '@components/solidJsTabs/tabs';
import Row from '@components/rowTsx';
import RadioFieldTsx from '@components/radioFieldTsx';
import {IconTsx} from '@components/iconTsx';
import {mountSolidComponent} from '@helpers/solid/wrapSolidComponent';
import type {Middleware} from '@helpers/middleware';
import ListenerSetter from '@helpers/listenerSetter';

type FolderRow = {
  container: HTMLElement,
  title: Signal<JSX.Element>,
  subtitle: Signal<JSX.Element>,
  buttonRight?: HTMLElement,
  middleware: Middleware,
  listenerSetter: ListenerSetter,
  dispose: VoidFunction
};

const ChatFolders: Component = () => {
  const [tab] = useSuperTab<typeof AppChatFoldersTab>();
  const promiseCollector = usePromiseCollector();
  const {AppEditFolderTab, appSidebarLeft, lottieLoader, appImManager} = useHotReloadGuard();
  const p = tab.payload;

  const filtersRendered: {[filterId: number]: FolderRow} = {};
  const suggestedRows = new Set<FolderRow>();
  let animation: LottiePlayer;
  let loadAnimationPromise: ReturnType<LottieLoader['waitForFirstFrame']>;

  let stickerContainer!: HTMLDivElement;
  let list!: HTMLDivElement;
  let suggestedContent!: HTMLElement;
  const [foldersHidden, setFoldersHidden] = createSignal(true);
  const [suggestedHidden, setSuggestedHidden] = createSignal(true);

  const renderFolder = async(
    dialogFilter: DialogFilterSuggested | MyDialogFilter,
    container?: HTMLElement,
    row?: FolderRow,
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
      const title = createSignal<JSX.Element>(
        filter.id === FOLDER_ID_ALL && !isSuggested ?
          i18n('FilterAllChats') :
          undefined
      );
      const subtitle = createSignal<JSX.Element>(description || (d.length ? join(d) : undefined));
      let buttonRight: HTMLElement;
      const mounted = mountSolidComponent(() => (
        <Row
          class={isSuggested ? undefined : 'row-sortable'}
          clickable
        >
          <Row.Title>{title[0]()}</Row.Title>
          <Show when={subtitle[0]()}>
            <Row.Subtitle>{subtitle[0]()}</Row.Subtitle>
          </Show>
          <Show when={isSuggested}>
            <Row.RightContent>
              <Button
                ref={buttonRight}
                class="btn-primary btn-color-primary btn-control-small"
                text="Add"
              />
            </Row.RightContent>
          </Show>
          <Show when={!isSuggested}>
            <IconTsx icon="menu" class="row-sortable-icon" />
          </Show>
        </Row>
      ), tab.middlewareHelper.get());
      const rowContainer = mounted.element;
      const listenerSetter = new ListenerSetter();
      mounted.middleware.onClean(() => listenerSetter.removeAll());
      if(filter.id !== FOLDER_ID_ALL || isSuggested) {
        try {
          title[1](await wrapFolderTitle(
            filter.title,
            mounted.middleware,
            false,
            {textColor: 'primary-text-color'}
          ));
        } catch(err) {
          mounted.dispose();
          throw err;
        }
      }

      (container || (isSuggested ? suggestedContent : list)).append(rowContainer);
      row = {
        container: rowContainer,
        title,
        subtitle,
        buttonRight,
        middleware: mounted.middleware,
        listenerSetter,
        dispose: mounted.dispose
      };

      if(!isSuggested) {
        const filterId = filter.id;
        if(!filtersRendered[filter.id] && filter.id !== FOLDER_ID_ALL) {
          const initArgs = AppEditFolderTab.getInitArgs();
          attachClickEvent(row.container, async() => {
            const filter = await tab.managers.filtersStorage.getFilter(filterId);
            tab.slider.createTab(AppEditFolderTab).open({...initArgs, initFilter: filter});
          }, {listenerSetter: row.listenerSetter});
        }

        filtersRendered[filter.id] = row;
      }
    } else {
      if(filter.id !== FOLDER_ID_ALL) {
        row.title[1](await wrapFolderTitle(filter.title, row.middleware));
      }

      row.subtitle[1](d.length ? join(d) : undefined);
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
      setSuggestedHidden(!suggestedFilters.length);
      suggestedRows.forEach((row) => {
        row.dispose();
        row.container.remove();
      });
      suggestedRows.clear();

      for(const filter of suggestedFilters) {
        const row = await renderFolder(filter);
        suggestedRows.add(row);

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
            suggestedRows.delete(row);
            row.dispose();
            row.container.remove();
            setSuggestedHidden(suggestedContent.childElementCount === 1);
          }).finally(() => {
            button.removeAttribute('disabled');
          });
        }, {listenerSetter: row.listenerSetter});
      }
    });
  };

  const onFiltersContainerUpdate = () => {
    setFoldersHidden(!Object.keys(filtersRendered).length);
  };

  (tab as any)._onOpenAfterTimeout = () => {
    loadAnimationPromise.then(() => {
      animation.autoplay = true;
      animation.play();
    });
  };

  const name = 'theme';
  const stateKey = joinDeepPath('settings', 'tabsInSidebar');

  onMount(() => {
    tab.container.classList.add('chat-folders-container');
    tab.scrollable.container.classList.add('chat-folders');

    tab.listenerSetter.add(rootScope)('settings_updated', ({key, value}) => {
      if(key === stateKey) {
        const [, setHasFoldersSidebar] = useHasFoldersSidebar();
        setHasFoldersSidebar(!!value);
        appImManager.adjustChatPatternBackground();
        if(!value) appSidebarLeft.showCtrlFTip();
      }
    });

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
        getSuggestedFilters();

        filterRendered.dispose();
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
        }

        tab.managers.filtersStorage.updateDialogFiltersOrder(order);
      },
      scrollable: tab.scrollable
    });

    getSuggestedFilters();

    promiseCollector.collect(Promise.all(loadPromises));
  });

  return (
    <>
      <div ref={stickerContainer} class="sticker-container" />
      <div class="caption">{i18n('ChatList.Filter.Header')}</div>
      <Button
        class="btn-primary btn-color-primary btn-control"
        icon="add"
        text="ChatList.Filter.NewTitle"
        onClick={async() => {
          if(!(await canCreateFolder())) {
            showLimitPopup('folders');
          } else {
            tab.slider.createTab(AppEditFolderTab).open(AppEditFolderTab.getInitArgs());
          }
        }}
      />
      <Section name="Filters" classList={{hide: foldersHidden()}}>
        <div ref={list} />
      </Section>
      <Section
        name="FilterRecommended"
        classList={{hide: suggestedHidden()}}
        contentProps={{ref: (el) => suggestedContent = el}}
      />
      <Section name="FiltersView">
        <form>
          <Row>
            <Row.RadioField>
              <RadioFieldTsx
                name={name}
                value="true"
                valueForState={true}
                stateKey={stateKey}
              />
            </Row.RadioField>
            <Row.Title>{i18n('FiltersOnLeft')}</Row.Title>
          </Row>
          <Row>
            <Row.RadioField>
              <RadioFieldTsx
                name={name}
                value="false"
                valueForState={false}
                stateKey={stateKey}
              />
            </Row.RadioField>
            <Row.Title>{i18n('FiltersOnTop')}</Row.Title>
          </Row>
        </form>
      </Section>
    </>
  );
};

export default ChatFolders;
