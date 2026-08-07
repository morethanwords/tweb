import type {AppPeersManager} from '@appManagers/appPeersManager';
import type {AppUsersManager} from '@appManagers/appUsersManager';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import type {ChannelParticipant, ChatParticipant} from '@layer';

export default function filterParticipantsByQuery<
  T extends Array<ChannelParticipant | ChatParticipant>
>(
  participants: T,
  query: string,
  managers: {
    appPeersManager: Pick<AppPeersManager, 'getPeerSearchText'>,
    appUsersManager: Pick<AppUsersManager, 'createSearchIndex'>
  }
): T {
  const index = managers.appUsersManager.createSearchIndex();
  participants.forEach((participant) => {
    const peerId = getParticipantPeerId(participant);
    index.indexObject(peerId, managers.appPeersManager.getPeerSearchText(peerId));
  });

  const found = index.search(query);
  return participants.filter((participant) => {
    return found.has(getParticipantPeerId(participant));
  }) as T;
}
