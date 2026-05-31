import {Component} from 'solid-js';
import {render} from 'solid-js/web';
import appDialogsManager from '@lib/appDialogsManager';
import {FOLDER_ID_ARCHIVE, REAL_FOLDER_ID} from '@appManagers/constants';
import StoriesList from '@components/stories/list';
import {AutonomousDialogList} from '@components/autonomousDialogList/dialogs';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {getArchiveContextMenuButtons} from '@components/archiveDialogContextMenu';
import {fastSmoothScrollToStart} from '@helpers/fastSmoothScroll';
import {i18n} from '@lib/langPack';
import {useSuperTab} from '@components/solidJsTabs/superTabProvider';
import {usePromiseCollector} from '@components/solidJsTabs/promiseCollector';
import type {AppArchivedTab} from '@components/solidJsTabs/tabs';

const ArchivedTab: Component = () => {
  const [tab] = useSuperTab<typeof AppArchivedTab>();
  const promiseCollector = usePromiseCollector();

  const filterId: REAL_FOLDER_ID = FOLDER_ID_ARCHIVE;
  const wasFilterId = appDialogsManager.filterId;

  let storiesListContainer: HTMLDivElement;
  let disposeStories: () => void;
  let resizeStoriesContainer: () => void;
  let autonomousDialogList: AutonomousDialogList;

  const renderStories = () => {
    disposeStories = render(() => {
      return StoriesList({
        foldInto: tab.title,
        setScrolledOn: tab.container,
        getScrollable: () => autonomousDialogList.scrollable.container,
        listenWheelOn: tab.content,
        archive: true,
        offsetX: -64,
        resizeCallback: (callback) => {
          resizeStoriesContainer = callback;
        },
        onExpand: () => {
          const container = autonomousDialogList.scrollable.container;
          tab.container.classList.add('scrolled-start');
          fastSmoothScrollToStart(container, 'y');
        }
      });
    }, storiesListContainer);
  };

  const appendMenu = () => {
    const buttonMenu = ButtonMenuToggle({
      icon: 'more',
      buttons: getArchiveContextMenuButtons(),
      direction: 'bottom-left'
    });

    tab.header.append(buttonMenu);
  };

  // вообще, так делать нельзя, но нет времени чтобы переделать главный чатлист на слайд...
  (tab as any)._onOpenAfterTimeout = () => {
    renderStories();
    appDialogsManager.xds[wasFilterId].clear();
  };

  (tab as any)._onClose = () => {
    delete appDialogsManager.xds[filterId];
    tab.scrollable.onAdditionalScroll = undefined;
    appDialogsManager.setFilterIdAndChangeTab(wasFilterId);
  };

  (tab as any)._onCloseAfterTimeout = () => {
    disposeStories?.();
    disposeStories = undefined;
    resizeStoriesContainer = undefined;
    autonomousDialogList.destroy();
    autonomousDialogList = undefined;
  };

  tab.container.id = 'chats-archived-container';
  tab.title.replaceChildren(i18n('ArchivedChats'));

  tab.header.classList.add('can-have-forum');
  tab.content.classList.add('can-have-forum');

  appendMenu();

  if(!appDialogsManager.xds[filterId]) {
    const {ul, scrollable} = appDialogsManager.l({
      title: undefined,
      id: filterId,
      localId: FOLDER_ID_ARCHIVE
    });
    scrollable.append(ul);
  }

  autonomousDialogList = appDialogsManager.xds[filterId];

  storiesListContainer = document.createElement('div');
  storiesListContainer.classList.add('stories-list');

  tab.header.after(storiesListContainer);

  const scrollable = autonomousDialogList.scrollable;
  tab.scrollable.container.replaceWith(scrollable.container);
  scrollable.attachBorderListeners(tab.container);
  // ! DO NOT UNCOMMENT NEXT LINE - chats will stop loading on scroll after closing the tab
  // tab.scrollable = scrollable;

  promiseCollector.collect(appDialogsManager.setFilterIdAndChangeTab(filterId).then((/* {cached, renderPromise} */) => {
    // if(cached) {
    //   return renderPromise;
    // }
  }));

  return null;
};

export default ArchivedTab;
