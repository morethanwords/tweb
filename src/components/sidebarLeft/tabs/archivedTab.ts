/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager from '@lib/appDialogsManager';
import {SliderSuperTab} from '@components/slider';
import {FOLDER_ID_ARCHIVE, REAL_FOLDER_ID} from '@appManagers/constants';
import StoriesList from '@components/stories/list';
import {render} from 'solid-js/web';
import {AutonomousDialogList} from '@components/autonomousDialogList/dialogs';
import ButtonMenuToggle from '@components/buttonMenuToggle';
import {getArchiveContextMenuButtons} from '@components/archiveDialogContextMenu';


export default class AppArchivedTab extends SliderSuperTab {
  private static filterId: REAL_FOLDER_ID = FOLDER_ID_ARCHIVE;
  private wasFilterId: number;

  private storiesListContainer: HTMLDivElement;
  private disposeStories: () => void;
  private resizeStoriesContainer?: () => void;

  private autonomousDialogList: AutonomousDialogList;

  public init() {
    this.wasFilterId = appDialogsManager.filterId;

    this.container.id = 'chats-archived-container';
    this.setTitle('ArchivedChats');

    this.header.classList.add('can-have-forum');
    this.content.classList.add('can-have-forum');

    this.appendMenu();

    if(!appDialogsManager.xds[AppArchivedTab.filterId]) {
      const {ul, scrollable} = appDialogsManager.l({
        title: undefined,
        id: AppArchivedTab.filterId,
        localId: FOLDER_ID_ARCHIVE
      });
      scrollable.append(ul);
    }

    this.autonomousDialogList = appDialogsManager.xds[AppArchivedTab.filterId];

    const storiesListContainer = this.storiesListContainer = document.createElement('div');
    storiesListContainer.classList.add('stories-list');

    this.header.after(storiesListContainer);

    const scrollable = this.autonomousDialogList.scrollable;
    this.scrollable.container.replaceWith(scrollable.container);
    scrollable.attachBorderListeners(this.container);
    // ! DO NOT UNCOMMENT NEXT LINE - chats will stop loading on scroll after closing the tab
    // this.scrollable = scrollable;

    return appDialogsManager.setFilterIdAndChangeTab(AppArchivedTab.filterId).then((/* {cached, renderPromise} */) => {
      // if(cached) {
      //   return renderPromise;
      // }
    });
  }

  private renderStories() {
    this.disposeStories = render(() => {
      return StoriesList({
        foldInto: this.title,
        setScrolledOn: this.container,
        getScrollable: () => this.autonomousDialogList.scrollable.container,
        listenWheelOn: this.content,
        archive: true,
        offsetX: -64,
        resizeCallback: (callback) => {
          this.resizeStoriesContainer = callback;
        }
      });
    }, this.storiesListContainer);
  }

  private appendMenu() {
    const buttonMenu = ButtonMenuToggle({
      icon: 'more',
      buttons: getArchiveContextMenuButtons(),
      direction: 'bottom-left'
    });

    this.header.append(buttonMenu);
  }

  // вообще, так делать нельзя, но нет времени чтобы переделать главный чатлист на слайд...
  onOpenAfterTimeout() {
    this.renderStories();
    appDialogsManager.xds[this.wasFilterId].clear();
  }

  onClose() {
    delete appDialogsManager.xds[AppArchivedTab.filterId];
    this.scrollable.onAdditionalScroll = undefined;
    appDialogsManager.setFilterIdAndChangeTab(this.wasFilterId);
  }

  onCloseAfterTimeout() {
    this.disposeStories?.();
    this.disposeStories = undefined;
    this.resizeStoriesContainer = undefined;
    this.autonomousDialogList.destroy();
    this.autonomousDialogList = undefined;
    return super.onCloseAfterTimeout();
  }
}
