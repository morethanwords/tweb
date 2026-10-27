import type {ReadingManagers} from '@lib/managers';
import type {AppChatFoldersTab} from '@components/solidJsTabs/tabs';
import type {AppEditFolderTab} from '@components/solidJsTabs/tabs';
import type {AppSidebarLeft} from '@components/sidebarLeft';
import type {AppDialogsManager} from '@lib/appDialogsManager';
import {FOLDER_ID_ALL, REAL_FOLDERS} from '@appManagers/constants';
import createContextMenu from '@helpers/dom/createContextMenu';
import findUpClassName from '@helpers/dom/findUpClassName';
import useChatListUnreadOnly from '@stores/chatListUnreadOnly';

export default function createFolderContextMenu({
  appSidebarLeft,
  appDialogsManager,
  AppChatFoldersTab: _AppChatFoldersTab,
  AppEditFolderTab: _AppEditFolderTab,
  managers,
  className,
  listenTo
}: {
  appSidebarLeft: AppSidebarLeft,
  appDialogsManager: AppDialogsManager,
  AppChatFoldersTab: typeof AppChatFoldersTab,
  AppEditFolderTab: typeof AppEditFolderTab,
  managers: ReadingManagers,
  className: string,
  listenTo: HTMLElement
}) {
  async function openSettingsForFilter(filterId: number) {
    if(REAL_FOLDERS.has(filterId)) return;
    const filter = await managers.filtersStorage.getFilter(filterId);

    appSidebarLeft.closeTabsBefore(() => {
      appSidebarLeft.createTab(_AppEditFolderTab).open({..._AppEditFolderTab.getInitArgs(), initFilter: filter});
    });
  }

  const [unreadOnly] = useChatListUnreadOnly();
  // * the folder is on screen with its unread chats only - any other one opens with them
  const showsUnreadOnly = () => unreadOnly() && clickFilterId === appDialogsManager.filterId;

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
          appSidebarLeft.createTab(_AppChatFoldersTab).open(_AppChatFoldersTab.getInitArgs());
        });
      },
      verify: () => clickFilterId === FOLDER_ID_ALL
    }, {
      icon: 'unread',
      text: 'ChatList.ShowUnreadOnly',
      onClick: () => {
        appDialogsManager.setUnreadOnly(true, clickFilterId);
      },
      verify: () => !showsUnreadOnly()
    }, {
      icon: 'unread',
      text: 'ChatList.ShowAllChats',
      onClick: () => {
        appDialogsManager.setUnreadOnly(false);
      },
      verify: showsUnreadOnly
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
