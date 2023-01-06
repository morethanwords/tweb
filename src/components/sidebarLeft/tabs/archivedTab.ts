/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDialogsManager from '../../../lib/appManagers/appDialogsManager';
import {SliderSuperTab} from '../../slider';
import {FOLDER_ID_ARCHIVE, REAL_FOLDER_ID} from '../../../lib/mtproto/mtproto_config';

export default class AppArchivedTab extends SliderSuperTab {
  private static filterId: REAL_FOLDER_ID = FOLDER_ID_ARCHIVE;
  private wasFilterId: number;

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
      scrollable.container.append(ul);
    }

    const scrollable = appDialogsManager.xds[AppArchivedTab.filterId].scrollable;
    this.scrollable.container.replaceWith(scrollable.container);
    scrollable.attachBorderListeners(this.container);
    // ! DO NOT UNCOMMENT NEXT LINE - chats will stop loading on scroll after closing the tab
    // this.scrollable = scrollable;
    return appDialogsManager.setFilterIdAndChangeTab(AppArchivedTab.filterId).then(({cached, renderPromise}) => {
      if(cached) {
        return renderPromise;
      }
    });
  }

  // вообще, так делать нельзя, но нет времени чтобы переделать главный чатлист на слайд...
  onOpenAfterTimeout() {
    appDialogsManager.xds[this.wasFilterId].clear();
  }

  onClose() {
    this.scrollable.onAdditionalScroll = undefined;
    appDialogsManager.setFilterIdAndChangeTab(this.wasFilterId);
  }

  onCloseAfterTimeout() {
    appDialogsManager.xds[AppArchivedTab.filterId].clear();
    return super.onCloseAfterTimeout();
  }
}
