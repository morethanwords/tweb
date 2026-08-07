import type {ChannelParticipant, ChannelParticipantsFilter} from '@layer';
import type {AppManagers} from '@lib/managers';
import getParticipantPeerId
from '@appManagers/utils/chats/getParticipantPeerId';

export const COMMUNITY_PARTICIPANTS_PAGE_SIZE = 50;

export default function createCommunityParticipantsLoader(options: {
  communityId: ChatId,
  manager: AppManagers['appProfileManager'],
  filter: (query: string) => ChannelParticipantsFilter,
  onParticipant: (
    participantId: PeerId,
    participant: ChannelParticipant
  ) => void,
  limit?: number
}) {
  let query: string;
  let offset = 0;
  const limit = options.limit ?? COMMUNITY_PARTICIPANTS_PAGE_SIZE;

  return async(nextQuery: string, middleware: () => boolean) => {
    if(query !== nextQuery) {
      query = nextQuery;
      offset = 0;
    }

    const result = await options.manager.getChannelParticipants({
      id: options.communityId,
      filter: options.filter(query),
      offset,
      limit
    });
    if(!middleware()) {
      return;
    }

    const participantIds = result.participants.map((participant) => {
      const participantId = getParticipantPeerId(participant);
      options.onParticipant(participantId, participant);
      return participantId;
    });
    offset += result.participants.length;
    return {
      result: participantIds,
      isEnd: offset >= result.count || result.participants.length < limit
    };
  };
}
