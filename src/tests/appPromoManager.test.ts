import {afterEach, describe, expect, it, vi} from 'vitest';
import AppPromoManager from '@appManagers/appPromoManager';
import {HelpPromoData} from '@layer';

const HOUR = 60 * 60 * 1000;

describe('AppPromoManager', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('retries a failed promo request and keeps scheduling refetches after recovery', async() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));

    const promoData: HelpPromoData.helpPromoData = {
      _: 'help.promoData',
      pFlags: {},
      expires: Date.now() / 1000 + HOUR * 2 / 1000,
      pending_suggestions: ['BIRTHDAY_SETUP'],
      dismissed_suggestions: ['SETUP_PASSKEY'],
      chats: [],
      users: []
    };
    let request = 0;
    const invokeApiSingleProcess = vi.fn((options: {
      processResult: (result: HelpPromoData) => unknown
    }) => {
      ++request;
      if(request === 1 || request === 3) {
        return Promise.reject(new Error('temporary failure'));
      }

      return Promise.resolve(options.processResult(promoData));
    });
    const dispatchEvent = vi.fn();
    const saveApiPeers = vi.fn();
    const manager = new AppPromoManager();
    Object.assign(manager as any, {
      apiManager: {invokeApiSingleProcess},
      appPeersManager: {saveApiPeers},
      rootScope: {dispatchEvent}
    });

    await expect(manager.getPromoData()).rejects.toThrow('temporary failure');
    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(1);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(HOUR);

    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2);
    expect(saveApiPeers).toHaveBeenCalledWith(promoData);
    expect(dispatchEvent).toHaveBeenLastCalledWith('promo_data_update', {
      pendingSuggestions: ['BIRTHDAY_SETUP'],
      dismissedSuggestions: ['SETUP_PASSKEY']
    });
    expect(vi.getTimerCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(HOUR);

    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does not publish stale promo data while retries are still failing', async() => {
    vi.useFakeTimers();

    const invokeApiSingleProcess = vi.fn(() => Promise.reject(new Error('temporary failure')));
    const dispatchEvent = vi.fn();
    const manager = new AppPromoManager();
    Object.assign(manager as any, {
      apiManager: {invokeApiSingleProcess},
      rootScope: {dispatchEvent}
    });

    await expect(manager.getPromoData()).rejects.toThrow('temporary failure');
    await vi.advanceTimersByTimeAsync(HOUR);

    expect(invokeApiSingleProcess).toHaveBeenCalledTimes(2);
    expect(dispatchEvent).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
  });
});
