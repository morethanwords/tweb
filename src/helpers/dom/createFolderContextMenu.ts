import type {AppManagers} from '../../lib/appManagers/managers';
import type AppChatFoldersTab from '../../components/sidebarLeft/tabs/chatFolders';
import type AppEditFolderTab from '../../components/sidebarLeft/tabs/editFolder';
import type {AppSidebarLeft} from '../../components/sidebarLeft';
import {FOLDER_ID_ALL, REAL_FOLDERS} from '../../lib/mtproto/mtproto_config';
import createContextMenu from './createContextMenu';
import findUpClassName from './findUpClassName';

export default function createFolderContextMenu({
  appSidebarLeft,
  AppChatFoldersTab: _AppChatFoldersTab,
  AppEditFolderTab: _AppEditFolderTab,
  managers,
  className,
  listenTo
}: {
  appSidebarLeft: AppSidebarLeft,
  AppChatFoldersTab: typeof AppChatFoldersTab,
  AppEditFolderTab: typeof AppEditFolderTab,
  managers: AppManagers,
  className: string,
  listenTo: HTMLElement
}) {
  async function openSettingsForFilter(filterId: number) {
    if(REAL_FOLDERS.has(filterId)) return;
    const filter = await managers.filtersStorage.getFilter(filterId);

    appSidebarLeft.closeTabsBefore(() => {
      const tab = appSidebarLeft.createTab(_AppEditFolderTab);
      tab.setInitFilter(filter);
      tab.open();
    });
  }

  let clickFilterId: number;
  const {destroy} = createContextMenu({
    buttons: [{
      icon: 'edit',
      text: 'FilterEdit',
      onClick: () => {
        openSettingsForFilter(clickFilterId);
      },
      verify: () => clickFilterId !== FOLDER_ID_ALL
    }, {
      icon: 'edit',
      text: 'FilterEditAll',
      onClick: () => {
        appSidebarLeft.closeTabsBefore(() => {
          appSidebarLeft.createTab(_AppChatFoldersTab).open();
        });
      },
      verify: () => clickFilterId === FOLDER_ID_ALL
    }, {
      icon: 'readchats',
      text: 'MarkAllAsRead',
      onClick: () => {
        managers.dialogsStorage.markFolderAsRead(clickFilterId);
      },
      verify: async() => !!(await managers.dialogsStorage.getFolderUnreadCount(clickFilterId)).unreadCount
    }, {
      icon: 'delete',
      className: 'danger',
      text: 'Delete',
      onClick: () => {
        _AppEditFolderTab.deleteFolder(clickFilterId);
      },
      verify: () => clickFilterId !== FOLDER_ID_ALL
    }],
    listenTo,
    findElement: (e) => findUpClassName(e.target, className),
    onOpen: (e, target) => {
      clickFilterId = +target.dataset.filterId;
    }
  });

  return {destroy, openSettingsForFilter};
}
