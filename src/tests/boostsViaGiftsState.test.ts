import {createRoot} from 'solid-js';
import {describe, expect, test, vi} from 'vitest';
import createBoostsViaGiftsState from '@components/popups/boostsViaGiftsState';

describe('boosts via gifts type state', () => {
  test('switches from specific Premium recipients to Stars and back', () => {
    createRoot((dispose) => {
      const state = createBoostsViaGiftsState('premium');

      state.selectSpecific();
      expect(state.type()).toBe('specific');
      expect(state.specific()).toBe(true);
      expect(state.stars()).toBe(false);

      state.selectStars();
      expect(state.type()).toBe('stars');
      expect(state.specific()).toBe(false);
      expect(state.stars()).toBe(true);

      state.selectPremium();
      expect(state.type()).toBe('premium');
      expect(state.specific()).toBe(false);
      expect(state.stars()).toBe(false);

      dispose();
    });
  });

  test('selects the purpose factory from the current type', () => {
    createRoot((dispose) => {
      const state = createBoostsViaGiftsState('premium');
      const createGiveaway = vi.fn(() => 'giveaway');
      const createSpecific = vi.fn(() => 'specific');
      const factories = {
        giveaway: createGiveaway,
        specific: createSpecific
      };

      state.selectSpecific();
      expect(state.getPurposeFactory(factories)()).toBe('specific');

      state.selectStars();
      expect(state.getPurposeFactory(factories)()).toBe('giveaway');

      state.selectPremium();
      expect(state.getPurposeFactory(factories)()).toBe('giveaway');
      expect(createSpecific).toHaveBeenCalledTimes(1);
      expect(createGiveaway).toHaveBeenCalledTimes(2);

      dispose();
    });
  });
});
