import {Message} from '@layer';


export type PollVoteRestriction = 'subscribersOnly' | 'subscribersJoinedTooRecently' | 'countries';

export type PollVoteRestrictionState = {
  restriction: PollVoteRestriction;
  updatedAt: number;
};

export type ActivePollVoteRestrictionOptions = {
  restriction?: PollVoteRestriction;
  hasVoted: boolean;
  closed: boolean;
  creator: boolean;
  isRegularMessage: boolean;
};

type PollVotePrecheckArgs = {
  subscribersOnly: boolean;
  countriesIso2?: readonly string[];
  isInChat?: boolean;
  phoneCountryIso2?: string;
};

const SUBSCRIBERS_ONLY_ERROR_PATTERNS = [
  'POLL_SUBSCRIBERS_ONLY',
  'POLL_MEMBER_RESTRICTED',
  'VOTE_SUBSCRIBERS_ONLY',
  'SUBSCRIBERS_ONLY',
  'SUBSCRIBER_REQUIRED',
  'SUBSCRIBER_ONLY'
] as const;

const SUBSCRIBERS_JOINED_TOO_RECENTLY_ERROR_PATTERNS = [
  'POLL_SUBSCRIBERS_TOO_RECENT',
  'VOTE_SUBSCRIBERS_TOO_RECENT',
  'SUBSCRIBERS_TOO_RECENT',
  'SUBSCRIBER_TOO_RECENT',
  'JOINED_TOO_RECENTLY',
  '24_HOURS'
] as const;

const COUNTRIES_ERROR_PATTERNS = [
  'POLL_COUNTRIES_ISO2',
  'VOTE_COUNTRIES_ISO2',
  'COUNTRIES_ISO2',
  'COUNTRY_RESTRICTED',
  'COUNTRY_ISO2'
] as const;

export const POLL_VOTE_RESTRICTION_EXPIRY = 10 * 60 * 1000;

const matchesAnyErrorPattern = (errorType: string, patterns: readonly string[]) =>
  patterns.some(pattern => errorType.includes(pattern));

export function isExpiringPollVoteRestriction(restriction: PollVoteRestriction) {
  return restriction === 'subscribersOnly' || restriction === 'subscribersJoinedTooRecently';
}

export function isPollVoteRestrictionActive(state?: PollVoteRestrictionState, now = Date.now()) {
  return !!state && (
    !isExpiringPollVoteRestriction(state.restriction) ||
    state.updatedAt + POLL_VOTE_RESTRICTION_EXPIRY > now
  );
}

export function getActivePollVoteRestriction({
  restriction,
  hasVoted,
  closed,
  creator,
  isRegularMessage
}: ActivePollVoteRestrictionOptions): PollVoteRestriction | undefined {
  if(!restriction || hasVoted || closed || creator || !isRegularMessage) return;
  return restriction;
}

export function getPollVoteRestrictionPeerId(message: Pick<Message.message, 'peerId'>) {
  return message.peerId as PeerId;
}

export function isRegularPollMessage(
  message: Pick<Message.message, 'mid' | 'pFlags'>,
  isRegularSurface = true
) {
  return isRegularSurface && !!message.mid && message.mid > 0 &&
    !message.pFlags.local && !message.pFlags.is_scheduled;
}

export function getPollVotePrecheckRestriction({
  subscribersOnly,
  countriesIso2,
  isInChat,
  phoneCountryIso2
}: PollVotePrecheckArgs): PollVoteRestriction | undefined {
  if(subscribersOnly && isInChat === false) {
    return 'subscribersOnly';
  }

  const normalizedCountry = phoneCountryIso2?.trim().toUpperCase();
  if(!normalizedCountry || !countriesIso2?.length) {
    return;
  }

  const isCountryAllowed = countriesIso2.some(country => country.trim().toUpperCase() === normalizedCountry);
  if(!isCountryAllowed) {
    return 'countries';
  }
}

export function parsePollVoteRestrictionError(errorType?: string): PollVoteRestriction | undefined {
  const normalizedType = errorType?.toUpperCase();
  if(!normalizedType) {
    return;
  }

  if(matchesAnyErrorPattern(normalizedType, SUBSCRIBERS_JOINED_TOO_RECENTLY_ERROR_PATTERNS)) {
    return 'subscribersJoinedTooRecently';
  }

  if(matchesAnyErrorPattern(normalizedType, SUBSCRIBERS_ONLY_ERROR_PATTERNS)) {
    return 'subscribersOnly';
  }

  if(matchesAnyErrorPattern(normalizedType, COUNTRIES_ERROR_PATTERNS)) {
    return 'countries';
  }
}
