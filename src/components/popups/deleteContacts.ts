import confirmationPopup from '@components/confirmationPopup';

/**
 * Asks whether to delete contacts, with the red button every delete is confirmed with: one contact
 * by its avatar - from its own page, from its row's menu - and several by their count, the way
 * Android's contacts ask.
 * @returns a promise fulfilled once the delete is confirmed, and rejected when it is called off
 */
export default function confirmDeleteContacts(peerIds: PeerId[]) {
  return confirmationPopup({
    ...(peerIds.length === 1 ? {
      peerId: peerIds[0],
      titleLangKey: 'DeleteContact',
      descriptionLangKey: 'AreYouSureDeleteContact'
    } : {
      titleLangKey: 'DeleteContactsTitle',
      titleLangArgs: [peerIds.length],
      descriptionLangKey: 'DeleteContactsSubtitle'
    }),
    button: {langKey: 'Delete', isDanger: true}
  });
}
