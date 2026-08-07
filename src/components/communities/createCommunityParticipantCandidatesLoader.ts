import type {
  CommunityParticipantCandidateKind,
  CommunityParticipantCandidatesOffset
} from '@appManagers/appCommunitiesManager';
import type {AppManagers} from '@lib/managers';

export default function createCommunityParticipantCandidatesLoader(options: {
  communityId: ChatId,
  manager: AppManagers['appCommunitiesManager'],
  limit: number,
  kind?: CommunityParticipantCandidateKind
}) {
  let query: string;
  let offset: CommunityParticipantCandidatesOffset = {
    contacts: 0,
    recent: 0
  };

  return async(nextQuery: string, middleware: () => boolean) => {
    if(query !== nextQuery) {
      query = nextQuery;
      offset = {
        contacts: 0,
        recent: 0
      };
    }

    const result = await options.manager.getParticipantCandidates({
      communityId: options.communityId,
      query,
      offset,
      limit: options.limit,
      ...(options.kind ? {kind: options.kind} : {})
    });
    if(!middleware()) {
      return;
    }

    offset = result.nextOffset;
    return {
      result: result.participantIds,
      isEnd: result.isEnd
    };
  };
}
