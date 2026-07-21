import type {DisallowedGiftsSettings} from '@layer';
import type {MyStarGift} from '@appManagers/appGiftsManager';

export type DisallowedGifts = DisallowedGiftsSettings.disallowedGiftsSettings['pFlags'];

export interface StarGiftSendPolicy {
  allowed: boolean;
  forceUpgrade: boolean;
  upgradeAllowed: boolean;
}

export default function getStarGiftSendPolicy(
  gift: Pick<MyStarGift, 'raw' | 'isResale'>,
  disallowedGifts?: DisallowedGifts
): StarGiftSendPolicy {
  const uniqueAllowed = !disallowedGifts?.disallow_unique_stargifts;
  if(gift.isResale || gift.raw._ === 'starGiftUnique') {
    return {
      allowed: uniqueAllowed,
      forceUpgrade: false,
      upgradeAllowed: false
    };
  }

  const limited = !!gift.raw.pFlags.limited;
  const baseAllowed = limited ?
    !disallowedGifts?.disallow_limited_stargifts :
    !disallowedGifts?.disallow_unlimited_stargifts;
  const upgradeAllowed = limited && gift.raw.upgrade_stars !== undefined && uniqueAllowed;

  return {
    allowed: baseAllowed || upgradeAllowed,
    forceUpgrade: !baseAllowed && upgradeAllowed,
    upgradeAllowed
  };
}
