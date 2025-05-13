/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager, {type Some2} from '../../../lib/appManagers/appDialogsManager';
import {SliderSuperTab} from '../../slider';
import {FOLDER_ID_ARCHIVE, REAL_FOLDER_ID} from '../../../lib/mtproto/mtproto_config';
import StoriesList from '../../stories/list';
import {render} from 'solid-js/web';

export default class AppArchivedTab extends SliderSuperTab {
  private static filterId: REAL_FOLDER_ID = FOLDER_ID_ARCHIVE;
  private wasFilterId: number;

  private storiesListContainer: HTMLDivElement;
  private disposeStories: () => void;

  private chatListManager: Some2;

  public init() {
    this.wasFilterId = appDialogsManager.filterId;

    this.container.id = 'chats-archived-container';
    this.setTitle('ArchivedChats');

    this.header.classList.add('can-have-forum');
    this.content.classList.add('can-have-forum');

    if(!appDialogsManager.xds[AppArchivedTab.filterId]) {
      const {ul, scrollable} = appDialogsManager.l({
        title: undefined,
        id: AppArchivedTab.filterId,
        localId: FOLDER_ID_ARCHIVE
      });
      scrollable.append(ul);
    }

    this.chatListManager = appDialogsManager.xds[AppArchivedTab.filterId];

    const storiesListContainer = this.storiesListContainer = document.createElement('div');
    storiesListContainer.classList.add('stories-list');

    this.header.after(storiesListContainer);

    const scrollable = this.chatListManager.scrollable;
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
        foldInto: this.header,
        setScrolledOn: this.container,
        getScrollable: () => this.chatListManager.scrollable.container,
        listenWheelOn: this.content,
        archive: true,
        offsetX: -84
      });
    }, this.storiesListContainer);
  }

  // вообще, так делать нельзя, но нет времени чтобы переделать главный чатлист на слайд...
  onOpenAfterTimeout() {
    this.renderStories();
    appDialogsManager.xds[this.wasFilterId].clear();
  }

  onClose() {
    appDialogsManager.xds[AppArchivedTab.filterId] = undefined;
    this.scrollable.onAdditionalScroll = undefined;
    appDialogsManager.setFilterIdAndChangeTab(this.wasFilterId);
  }

  onCloseAfterTimeout() {
    this.disposeStories?.();
    this.disposeStories = undefined;
    this.chatListManager.destroy();
    this.chatListManager = undefined;
    return super.onCloseAfterTimeout();
  }
}
