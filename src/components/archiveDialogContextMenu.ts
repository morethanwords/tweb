import createContextMenu from '@helpers/dom/createContextMenu';
import findUpTag from '@helpers/dom/findUpTag';
import {useAppSettings} from '@stores/appSettings';
import {archiveDialogTagName} from './archiveDialog';


type CreateArchiveDialogContextMenuArgs = {
  element: HTMLElement;
};

export const createArchiveDialogContextMenu = ({
  element
}: CreateArchiveDialogContextMenuArgs) => {
  let dialogElement: HTMLElement;

  const [, setAppSettings] = useAppSettings();

  createContextMenu({
    listenTo: element,
    buttons: [
      {
        icon: 'eye2',
        text: 'Archive.HideFromChatList',
        onClick: () => {
          setAppSettings('showArchiveInChatList', false);
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
