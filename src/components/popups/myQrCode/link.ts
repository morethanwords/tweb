import type {PrivacyRule} from '@layer';
import toHHMMSS from '@helpers/string/toHHMMSS';
import type {Caption} from './caption';

/**
 * Which link the own profile's code carries, and the arithmetic of a code that expires. Pure, so it is tested alone;
 * the state that holds them is `linkState.ts` and `feeCode.ts`.
 */

export type OwnLinkKind = 'username' | 'phone' | 'contact';

/** A copy, a share or a save this close to the end of a code is refused: it would be dead on arrival */
export const EXPIRY_CUTOFF_SECONDS = 3;

const ALLOWING = new Set<PrivacyRule['_']>([
  'privacyValueAllowAll',
  'privacyValueAllowContacts',
  'privacyValueAllowCloseFriends',
  'privacyValueAllowPremium'
]);

/** "Nobody" in a privacy setting: no rule lets a group of people through (exceptions by name do not count) */
export function isNobody(rules: PrivacyRule[] | undefined) {
  return !rules?.some((rule) => ALLOWING.has(rule._));
}

export function isEverybody(rules: PrivacyRule[] | undefined) {
  return !!rules?.some((rule) => rule._ === 'privacyValueAllowAll');
}

/**
 * The link of the own profile: the username, else the phone when someone who opens `t.me/+phone` can reach us
 * (a hidden number that strangers still cannot find us by is no use), else a temporary contact link.
 */
export function chooseOwnLink(options: {
  username?: string,
  phone?: string,
  phoneRules?: PrivacyRule[],
  addedByPhoneRules?: PrivacyRule[]
}): OwnLinkKind {
  if(options.username) return 'username';
  if(options.phone && !(isNobody(options.phoneRules) && !isEverybody(options.addedByPhoneRules))) return 'phone';
  return 'contact';
}

export function buildPhoneUrl(phone: string) {
  return `https://t.me/+${phone}`;
}

/** What is written under the code of a username or a phone link, in the card's capitals */
export function linkCaption(kind: 'username' | 'phone', value: string): Caption {
  return kind === 'username' ? {text: '@' + value.toUpperCase(), kind} : {text: '+' + value, kind};
}

/** The seconds a code still has, rounded up so that the last one shows as 0:01 and 0:00 means gone */
export function secondsLeft(expires: number, now = Date.now()) {
  return Math.max(0, Math.ceil((expires * 1000 - now) / 1000));
}

export function isExpiring(left: number | undefined) {
  return left !== undefined && left <= EXPIRY_CUTOFF_SECONDS;
}

/** `m:ss`, and `h:mm:ss` past an hour */
export function formatCountdown(seconds: number) {
  return toHHMMSS(Math.max(0, Math.floor(seconds)));
}

/** A kept code the server gave no `url` for: the plain link with the code on it */
export function freeLink(plainUrl: string, token: string) {
  return plainUrl + (plainUrl.includes('?') ? '&' : '?') + 'free=' + encodeURIComponent(token);
}
