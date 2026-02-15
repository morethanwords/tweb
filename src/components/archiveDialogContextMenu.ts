import anchorCallback from '@helpers/dom/anchorCallback';
import createContextMenu from '@helpers/dom/createContextMenu';
import findUpTag from '@helpers/dom/findUpTag';
import noop from '@helpers/noop';
import {FOLDER_ID_ARCHIVE} from '@lib/appManagers/constants';
import {i18n} from '@lib/langPack';
import rootScope from '@lib/rootScope';
import {useAppSettings} from '@stores/appSettings';
import {archiveDialogTagName} from './archiveDialog';
import confirmationPopup from './confirmationPopup';
import createFeatureDetailsIconSticker from './featureDetailsIconSticker';
import showFeatureDetailsPopup from './popups/featureDetails';


type CreateArchiveDialogContextMenuArgs = {
  element: HTMLElement;
};

const showConfirmationWhenAbove = 1000;

export const createArchiveDialogContextMenu = ({
  element
}: CreateArchiveDialogContextMenuArgs) => {
  let dialogElement: HTMLElement;

  const [, setAppSettings] = useAppSettings();

  const markAllAsRead = createMarkAllAsReadHandler();

  createContextMenu({
    listenTo: element,
    buttons: [
      {
        icon: 'eye2',
        text: 'Archive.HideFromChatList',
        onClick: () => {
          setAppSettings('showArchiveInChatList', false);
        }
      },
      {
        icon: 'readchats',
        text: 'MarkAllAsRead',
        onClick: async() => {
          const unreadCount = await getUnreadCount();
          if(unreadCount > showConfirmationWhenAbove) {
            confirmationPopup({
              titleLangKey: 'Archive.MarkAllAsRead.ConfirmationTitle',
              descriptionLangKey: 'Archive.MarkAllAsRead.ConfirmationDescription',
              button: {
                langKey: 'Confirm'
              }
            }).then(() => {
              markAllAsRead();
            }, noop);
          } else {
            markAllAsRead();
          }
        },
        verify: async() => !markAllAsRead.isLoading() && (await getUnreadCount() > 0)
      },
      {
        icon: 'info2',
        text: 'ArchiveFeatureDetails.MenuOption',
        onClick: () => {
          openFeatureDetails();
        }
      }
    ],
    onOpen: async(_, li) => {
      dialogElement = li;
      li.classList.add('menu-open');
    },
    onClose: () => {
      dialogElement.classList.remove('menu-open');
    },
    findElement: (e) => {
      return findUpTag(e.target, archiveDialogTagName);
    }
  });
};

function createMarkAllAsReadHandler() {
  let isLoading = false;

  const markAllAsRead = async() => {
    try {
      isLoading = true;
      rootScope.managers.dialogsStorage.markFolderAsRead(FOLDER_ID_ARCHIVE);
    } finally {
      isLoading = false;
    }
  };

  markAllAsRead.isLoading = () => isLoading;

  return markAllAsRead;
};

async function getUnreadCount() {
  const {unreadCount} = await rootScope.managers.dialogsStorage.getFolderUnreadCount(FOLDER_ID_ARCHIVE);
  return unreadCount;
};

function openFeatureDetails() {
  showFeatureDetailsPopup({
    title: i18n('ArchiveFeatureDetails.Title'),
    subtitle: i18n('ArchiveFeatureDetails.Subtitle', [anchorCallback(() => {
      // TODO: implement
    })]),
    rows: [
      {
        icon: 'archive',
        title: i18n('ArchiveFeatureDetails.HowTo.Title'),
        subtitle: i18n('ArchiveFeatureDetails.HowTo.Subtitle', [i18n('Archive'), i18n('Unarchive')])
      },
      {
        icon: 'eye2',
        title: i18n('ArchiveFeatureDetails.Hide.Title'),
        subtitle: i18n('ArchiveFeatureDetails.Hide.Subtitle', [i18n('Archive.HideFromChatList')])
      },
      {
        icon: 'stories',
        title: i18n('ArchiveFeatureDetails.Stories.Title'),
        subtitle: i18n('ArchiveFeatureDetails.Stories.Subtitle')
      }
    ],
    buttons: [
      {
        text: i18n('ArchiveFeatureDetails.Button')
      }
    ],
    sticker: {
      element: createFeatureDetailsIconSticker('archive')
    }
  });
}
