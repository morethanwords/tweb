import createContextMenu from '@helpers/dom/createContextMenu';
import ListenerSetter from '@helpers/listenerSetter';
import {findDialogListElement} from '@lib/appDialogsManager';
import type ContactsSelection from '@components/contactsSelection';

/**
 * The menu of a contact's row: it is where the selection of contacts starts, as the chats' does,
 * and where one contact is deleted without selecting it first
 */
export default function attachContactsContextMenu({list, selection, listenerSetter}: {
  list: HTMLElement,
  selection: ContactsSelection,
  listenerSetter: ListenerSetter
}) {
  let row: HTMLElement;

  return createContextMenu({
    listenTo: list,
    listenerSetter,
    findElement: (e) => findDialogListElement(e.target),
    onOpen: (e, target) => {
      // * Android shows no menu while contacts are being selected: the press belongs to the selection
      if(selection.isSelecting || !selection.canSelect(target)) {
        throw 'Selecting contacts';
      }

      row = target;
    },
    onClose: () => {
      row = undefined;
    },
    buttons: [{
      icon: 'select',
      text: 'Message.Context.Select',
      onClick: () => selection.toggleByElement(row)
    }, {
      icon: 'delete',
      text: 'DeleteContact',
      danger: true,
      onClick: () => {
        selection.deleteContacts([row.dataset.peerId.toPeerId()]);
      }
    }]
  });
}
