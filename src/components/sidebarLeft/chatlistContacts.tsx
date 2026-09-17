import {createSignal} from 'solid-js';
import Section from '@components/section';
import SortedUserList from '@components/sortedUserList';
import {getMiddleware} from '@helpers/middleware';
import {wrapSolidComponent} from '@helpers/solid/wrapSolidComponent';
import filterAsync from '@helpers/array/filterAsync';
import windowSize from '@helpers/windowSize';
import {AppManagers} from '@lib/managers';

const CONTACT_ROW_HEIGHT = 60;

export type ChatlistContacts = ReturnType<typeof createChatlistContacts>;

/**
 * The "Contacts" section under a short chat list: with only a handful of dialogs the sidebar
 * would be mostly empty, so the contacts you have never written to are offered there instead.
 * It renders lazily — a page at a time as the chat list is scrolled — and hides itself while
 * nothing has passed the filter yet.
 */
export function createChatlistContacts(options: {
  managers: AppManagers,
  /** The rendered count changed — the sidebar rechecks its empty-placeholder layout. */
  onLengthChange: () => void,
  /** Hands the rendered list over so the sidebar can attach its own chat-row click handling. */
  attachToList: (list: HTMLUListElement) => void
}) {
  const {managers} = options;
  const middlewareHelper = getMiddleware();
  const middleware = middlewareHelper.get();

  const [hasItems, setHasItems] = createSignal(false);

  // the contact ids arrive asynchronously; until they do there is nothing to page through
  // and nothing to reconcile against
  let contacts: PeerId[];

  // a contact the user already has a dialog with belongs in the chat list, not here
  const isContactWithoutDialog = async(peerId: PeerId) => {
    const [isContact, dialog] = await Promise.all([
      managers.appPeersManager.isContact(peerId),
      managers.appMessagesManager.getDialogOnly(peerId)
    ]);

    return isContact && !dialog;
  };

  const onListLengthChange = () => {
    setHasItems(!!sortedUserList.list.childElementCount);
    options.onLengthChange();
  };

  const sortedUserList = new SortedUserList({
    avatarSize: 'abitbigger',
    createChatListOptions: {
      dialogSize: 48,
      new: true
    },
    autonomous: false,
    onListLengthChange,
    managers,
    middleware
  });

  const list = sortedUserList.list;
  options.attachToList(list);

  const loadMore = () => {
    if(!contacts?.length) {
      return;
    }

    const pageCount = windowSize.height / CONTACT_ROW_HEIGHT | 0;
    filterAsync(contacts.splice(0, pageCount), isContactWithoutDialog).then((peerIds) => {
      if(!middleware()) return;
      peerIds.forEach((peerId) => sortedUserList.add(peerId));
    });
  };

  const processContact = async(peerId: PeerId) => {
    if(!contacts || peerId.isAnyChat()) {
      return;
    }

    const good = await isContactWithoutDialog(peerId);
    if(!middleware()) return;

    const added = sortedUserList.has(peerId);
    if(!added && good) sortedUserList.add(peerId);
    else if(added && !good) sortedUserList.delete(peerId);
  };

  const element = wrapSolidComponent(() => (
    <Section
      class="sidebar-left-contacts-section"
      classList={{hide: !hasItems()}}
      name="Contacts"
      noDelimiter
      fakeGradientDelimiter
    >
      {list}
    </Section>
  ), middleware);

  managers.appUsersManager.getContactsPeerIds(undefined, undefined, 'online').then((peerIds) => {
    if(!middleware()) return;

    contacts = peerIds.slice();
    loadMore();
    onListLengthChange();
  });

  return {
    element,
    loadMore,
    processContact,
    destroy: () => middlewareHelper.destroy()
  };
}
