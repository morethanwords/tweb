import {RestrictionReason} from '../layer';

const platforms = new Set([
  'all',
  'web',
  'webk'
]);

const ignore = new Set();

export function getRestrictionReason(reasons: RestrictionReason[]) {
  // return reasons[0];
  return reasons.find((reason) => platforms.has(reason.platform) && !ignore.has(reason.reason));
}

export function isRestricted(reasons: RestrictionReason[]) {
  return !!getRestrictionReason(reasons);
}

export function ignoreRestrictionReasons(reasons: string[]) {
  ignore.clear();
  reasons.forEach((reason) => {
    ignore.add(reason);
  });
}
