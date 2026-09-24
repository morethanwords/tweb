import {DialogsSelectionBase, DialogsSelectionMenuItem, MENU_ITEM_DELETE} from '@components/dialogsSelectionBase';
import confirmDeleteContacts from '@components/popups/deleteContacts';
import {LangPackKey} from '@lib/langPack';

type ContactsSelectionAction = 'delete';

const MENU_ITEMS: DialogsSelectionMenuItem<ContactsSelectionAction>[] = [MENU_ITEM_DELETE];

/**
 * Selecting several contacts at once, the way Android's `ContactsActivity` does it: the bar counts
 * them, and deleting them is all there is to do - so it is a button of the bar, not a menu. The
 * bar and the selecting itself are `DialogsSelectionBase`, the very ones the chats are selected with.
 *
 * One of these belongs to one contacts tab, and goes away with it.
 */
export default class ContactsSelection extends DialogsSelectionBase<ContactsSelectionAction> {
  protected countLangKey: LangPackKey = 'ContactsSelected';

  protected getMenuItems() {
    return MENU_ITEMS;
  }

  /** A contact of the list, and not a section header between them */
  public canSelect(element: HTMLElement) {
    return this.isRowOfList(element) && !!element.dataset.peerId;
  }

  protected async updateActions() {
    this.actions = {delete: true};
  }

  protected perform() {
    return this.deleteContacts(this.getOrderedKeys() as PeerId[]);
  }

  /**
   * Asks, as a contact's own page asks, and deletes the contacts - the ones selected, or the one a
   * row's own menu was opened on
   * @returns `false` when the delete was called off
   */
  public async deleteContacts(peerIds: PeerId[]) {
    try {
      await confirmDeleteContacts(peerIds);
    } catch{
      return false;
    }

    this.managers.appUsersManager.deleteContacts(peerIds.map((peerId) => peerId.toUserId()));
  }
}
