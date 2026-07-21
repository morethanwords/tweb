import getStarGiftSendPolicy, {DisallowedGifts} from '@appManagers/utils/gifts/getStarGiftSendPolicy';
import type {MyStarGift} from '@appManagers/appGiftsManager';

type Gift = Pick<MyStarGift, 'raw' | 'isResale'>;

function limitedGift(upgradeable: boolean): Gift {
  return {
    raw: {
      _: 'starGift',
      pFlags: {limited: true},
      upgrade_stars: upgradeable ? 100 : undefined
    } as Gift['raw']
  };
}

function settings(limitedAllowed: boolean, uniqueAllowed: boolean): DisallowedGifts {
  return {
    disallow_limited_stargifts: limitedAllowed ? undefined : true,
    disallow_unique_stargifts: uniqueAllowed ? undefined : true
  };
}

describe('getStarGiftSendPolicy', () => {
  test.each([
    [true, true, false, true, false, false],
    [true, true, true, true, false, true],
    [true, false, false, true, false, false],
    [true, false, true, true, false, false],
    [false, true, false, false, false, false],
    [false, true, true, true, true, true],
    [false, false, false, false, false, false],
    [false, false, true, false, false, false]
  ])(
    'limitedAllowed=%s uniqueAllowed=%s upgradeable=%s',
    (limitedAllowed, uniqueAllowed, upgradeable, allowed, forceUpgrade, upgradeAllowed) => {
      expect(getStarGiftSendPolicy(
        limitedGift(upgradeable),
        settings(limitedAllowed, uniqueAllowed)
      )).toEqual({allowed, forceUpgrade, upgradeAllowed});
    }
  );

  test('unlimited gifts depend only on the unlimited setting', () => {
    const gift = {
      raw: {_: 'starGift', pFlags: {}} as Gift['raw']
    };

    expect(getStarGiftSendPolicy(gift, {disallow_unique_stargifts: true}).allowed).toBe(true);
    expect(getStarGiftSendPolicy(gift, {disallow_unlimited_stargifts: true}).allowed).toBe(false);
  });

  test('ready unique and resale gifts depend only on the unique setting', () => {
    const unique = {
      raw: {_: 'starGiftUnique'} as Gift['raw']
    };
    const resale = {
      raw: {_: 'starGift', pFlags: {limited: true}} as Gift['raw'],
      isResale: true
    };

    expect(getStarGiftSendPolicy(unique).allowed).toBe(true);
    expect(getStarGiftSendPolicy(resale).allowed).toBe(true);
    expect(getStarGiftSendPolicy(unique, {disallow_unique_stargifts: true}).allowed).toBe(false);
    expect(getStarGiftSendPolicy(resale, {disallow_unique_stargifts: true}).allowed).toBe(false);
  });
});
