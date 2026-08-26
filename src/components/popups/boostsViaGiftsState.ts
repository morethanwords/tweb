import {Accessor, createMemo, createSignal} from 'solid-js';

export type BoostsViaGiftsType = 'premium' | 'specific' | 'stars';

export default function createBoostsViaGiftsState(initialType: BoostsViaGiftsType) {
  const [type, setType] = createSignal(initialType);
  const stars = createMemo(() => type() === 'stars');
  const specific = createMemo(() => type() === 'specific');

  const getPurposeFactory = <T>(factories: {
    giveaway: () => T,
    specific: () => T
  }): (() => T) => {
    return specific() ? factories.specific : factories.giveaway;
  };

  return {
    type,
    stars,
    specific,
    selectPremium: () => setType('premium'),
    selectSpecific: () => setType('specific'),
    selectStars: () => setType('stars'),
    getPurposeFactory
  };
}
