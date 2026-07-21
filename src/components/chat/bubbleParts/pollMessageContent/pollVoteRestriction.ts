import type {PollVoteRestriction} from '@appManagers/utils/polls/pollVoteRestriction';
import getPollCountryName from '@helpers/getPollCountryName';
import {Poll} from '@layer';
import {FormatterArguments, join, LangPackKey} from '@lib/langPack';

export type PollVoteRestrictionText = {
  langPackKey: LangPackKey;
  langPackArguments?: FormatterArguments;
};

export function getPollVoteRestrictionDisplayState(
  activeRestriction: PollVoteRestriction | undefined,
  hideResults: boolean
) {
  return {
    forceResults: !!activeRestriction && !hideResults,
    showVotersCount: !!activeRestriction
  };
}

export function getPollVoteRestrictionText(
  poll: Poll,
  restriction: PollVoteRestriction,
  peerName?: string
): PollVoteRestrictionText {
  if(restriction === 'subscribersOnly') {
    return peerName ? {
      langPackKey: 'Poll.VoteRestricted.SubscribersChannel',
      langPackArguments: [peerName]
    } : {
      langPackKey: 'Poll.VoteRestricted.Subscribers'
    };
  }

  if(restriction === 'subscribersJoinedTooRecently') {
    return {langPackKey: 'Poll.VoteRestricted.SubscribersRecent'};
  }

  const countries = poll.countries_iso2?.map(getPollCountryName).filter(Boolean);
  return countries?.length ? {
    langPackKey: 'Poll.VoteRestricted.CountriesList',
    langPackArguments: [join(countries, true, true)]
  } : {
    langPackKey: 'Poll.VoteRestricted.Countries'
  };
}
