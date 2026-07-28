import {describe, expect, it, vi} from 'vitest';
import hideCommandAutocomplete from '@components/chat/hideCommandAutocomplete';

describe('commands helper selection', () => {
  it('hides autocomplete before waiting for the send flow', () => {
    const calls: string[] = [];
    const controller = {
      hideOtherHelpers: vi.fn((preserveHelpers, skipAnimation) => {
        calls.push('hide');
        expect(preserveHelpers).toBeUndefined();
        expect(skipAnimation).toBe(true);
      })
    };
    const waitForSend = vi.fn(() => calls.push('ready'));

    hideCommandAutocomplete(controller as any);
    waitForSend();

    expect(controller.hideOtherHelpers).toHaveBeenCalledOnce();
    expect(calls).toEqual(['hide', 'ready']);
  });
});
