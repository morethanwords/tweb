import {getPollVoteRestrictionDisplayState} from '@components/chat/bubbleParts/pollMessageContent/pollVoteRestriction';
import {
  getActivePollVoteRestriction,
  getPollVotePrecheckRestriction,
  getPollVoteRestrictionPeerId,
  isPollVoteRestrictionActive,
  POLL_VOTE_RESTRICTION_EXPIRY
} from '@appManagers/utils/polls/pollVoteRestriction';
import {Message} from '@layer';


describe('poll vote restrictions', () => {
  test('prechecks known subscriber and country mismatches but leaves unknown data to the server', () => {
    expect(getPollVotePrecheckRestriction({
      subscribersOnly: true,
      isInChat: false
    })).toBe('subscribersOnly');
    expect(getPollVotePrecheckRestriction({
      subscribersOnly: true
    })).toBeUndefined();
    expect(getPollVotePrecheckRestriction({
      subscribersOnly: false,
      countriesIso2: ['US', 'ae'],
      phoneCountryIso2: 'DE'
    })).toBe('countries');
    expect(getPollVotePrecheckRestriction({
      subscribersOnly: false,
      countriesIso2: ['US', 'ae'],
      phoneCountryIso2: 'AE'
    })).toBeUndefined();
  });

  test('uses the current chat for a forwarded poll restriction', () => {
    expect(getPollVoteRestrictionPeerId({
      peerId: -10 as PeerId,
      fwdFromId: -20 as PeerId
    } as Message.message)).toBe(-10);
  });

  test('does not expose hidden results and bypasses restrictions for the creator', () => {
    const options = {
      restriction: 'countries' as const,
      hasVoted: false,
      closed: false,
      creator: false,
      isRegularMessage: true
    };

    expect(getActivePollVoteRestriction(options)).toBe('countries');
    expect(getActivePollVoteRestriction({...options, creator: true})).toBeUndefined();
    expect(getPollVoteRestrictionDisplayState('countries', true)).toEqual({
      forceResults: false,
      showVotersCount: true
    });
  });

  test('expires transient subscriber restrictions but retains country restrictions', () => {
    const now = 1_000_000;
    const expiredAt = now - POLL_VOTE_RESTRICTION_EXPIRY;

    expect(isPollVoteRestrictionActive({restriction: 'subscribersOnly', updatedAt: expiredAt}, now)).toBe(false);
    expect(isPollVoteRestrictionActive({restriction: 'countries', updatedAt: expiredAt}, now)).toBe(true);
  });
});
