import {describe, expect, it} from 'vitest';
import selectPendingSuggestion from '@components/sidebarLeft/selectPendingSuggestion';

describe('selectPendingSuggestion', () => {
  it('keeps the frozen-account warning above suggestions', () => {
    expect(selectPendingSuggestion({
      frozen: true,
      notifications: true,
      passkey: true,
      birthdayContacts: true,
      birthdaySetup: true
    })).toBe('frozen');
  });

  it('prioritizes notifications over other available suggestions', () => {
    expect(selectPendingSuggestion({
      notifications: true,
      passkey: true,
      birthdayContacts: true,
      birthdaySetup: true
    })).toBe('notifications');
  });

  it('shows the next pending suggestion after notifications become unavailable', () => {
    expect(selectPendingSuggestion({
      notifications: false,
      passkey: false,
      birthdayContacts: true,
      birthdaySetup: true
    })).toBe('birthdayContacts');
  });
});
