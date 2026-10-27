import {AccountContentSettings, RestrictionReason} from '@layer';

const platforms = new Set([
  'all',
  'web',
  'webk'
]);

export const SENSITIVE_RESTRICTION_REASON = 'sensitive';

export type IgnoredRestrictionReasons = ReadonlySet<string>;

/**
 * The reasons one account ignores: what its app config lists, with `sensitive` decided by the account's own
 * switch once its content settings are known. Like Android: the switch takes effect at once and survives a
 * reload, instead of waiting for the app config to catch up with it.
 */
export function makeIgnoredRestrictionReasons(
  appConfigReasons: string[] = [],
  contentSettings?: AccountContentSettings
): IgnoredRestrictionReasons {
  const ignored = new Set(appConfigReasons);
  if(contentSettings) {
    if(contentSettings.pFlags.sensitive_enabled) ignored.add(SENSITIVE_RESTRICTION_REASON);
    else ignored.delete(SENSITIVE_RESTRICTION_REASON);
  }

  return ignored;
}

// * the page's, for the account it shows (`@stores/contentSettings` keeps it); the worker serves every account
// * at once and passes each one's own
let pageIgnored: IgnoredRestrictionReasons = new Set();

export function setIgnoredRestrictionReasons(ignored: IgnoredRestrictionReasons) {
  pageIgnored = ignored;
}

export function getRestrictionReason(reasons: RestrictionReason[], ignored = pageIgnored) {
  // return reasons[0];
  return reasons.find((reason) => platforms.has(reason.platform) && !ignored.has(reason.reason));
}

export function isSensitive(reasons: RestrictionReason[], ignored = pageIgnored) {
  if(ignored.has(SENSITIVE_RESTRICTION_REASON)) return false;
  // * only this client's platforms, as tdesktop and Android do: a mark for one app store is not for the web
  return reasons.some((reason) => reason.reason === SENSITIVE_RESTRICTION_REASON && platforms.has(reason.platform));
}

export function isRestricted(reasons: RestrictionReason[], ignored = pageIgnored) {
  return !!getRestrictionReason(reasons, ignored);
}
