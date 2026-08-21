import {Message} from '@layer';
import type {MyDocument} from '@appManagers/appDocsManager';
import rootScope from '@lib/rootScope';

/**
 * A local, never-sent message wrapping an audio document, so it can be rendered with the regular
 * `wrapDocument` / `AudioElement` machinery — which needs a message to hang playback state off.
 *
 * Used where tracks exist outside of any chat history: the profile playlist and the music picker.
 * `mid` must be unique within the list that renders it (playback identifies a track by peerId+mid).
 */
export default async function createFakeAudioMessage({doc, peerId, mid, savedMusic}: {
  doc: MyDocument,
  peerId: PeerId,
  mid: number,
  savedMusic?: boolean
}): Promise<Message.message> {
  return {
    _: 'message',
    id: mid,
    mid: mid,
    peer_id: await rootScope.managers.appPeersManager.getOutputPeer(peerId),
    peerId: peerId,
    fromId: peerId,
    date: doc.date,
    message: '',
    pFlags: {
      local: true,
      ...(savedMusic ? {fakeForSavedMusic: true as const} : {})
    },
    media: {
      _: 'messageMediaDocument',
      document: doc,
      pFlags: {}
    }
  };
}
