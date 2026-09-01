import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  confirmationPopup: vi.fn(),
  toastNew: vi.fn()
}));

vi.mock('@components/confirmationPopup', () => ({
  default: mocks.confirmationPopup
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

import requestGroupCallLeave from '@components/groupCall/requestLeave';
import type GroupCallInstance from '@lib/calls/groupCallInstance';

describe('group call leave UI semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createInstance() {
    return {
      hangUp: vi.fn().mockResolvedValue(undefined)
    } as unknown as GroupCallInstance;
  }

  it('leaves directly without discard-for-all for a regular participant', async() => {
    const instance = createInstance();

    await expect(requestGroupCallLeave(instance, false)).resolves.toBe(true);

    expect(mocks.confirmationPopup).not.toHaveBeenCalled();
    expect(instance.hangUp).toHaveBeenCalledWith(false);
  });

  it('keeps Leave as the admin default and only discards when explicitly selected', async() => {
    const instance = createInstance();
    mocks.confirmationPopup.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(requestGroupCallLeave(instance, true)).resolves.toBe(true);
    await expect(requestGroupCallLeave(instance, true)).resolves.toBe(true);

    expect(mocks.confirmationPopup).toHaveBeenCalledWith({
      titleLangKey: 'VoiceChat.End.Title',
      descriptionLangKey: 'VoiceChat.End.Text',
      className: 'popup-end-video-chat',
      checkbox: {text: 'VoiceChat.End.Third'},
      button: {
        langKey: 'VoiceChat.End.OK',
        isDanger: true
      }
    });
    expect(instance.hangUp).toHaveBeenNthCalledWith(1, false);
    expect(instance.hangUp).toHaveBeenNthCalledWith(2, true);
  });

  it('does not leave when the admin cancels the confirmation', async() => {
    const instance = createInstance();
    mocks.confirmationPopup.mockRejectedValueOnce(new Error('canceled'));

    await expect(requestGroupCallLeave(instance, true)).resolves.toBe(false);

    expect(instance.hangUp).not.toHaveBeenCalled();
  });

  it('reports a failed leave without throwing into the click handler', async() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const instance = createInstance();
    vi.mocked(instance.hangUp).mockRejectedValueOnce(new Error('leave failed'));

    await expect(requestGroupCallLeave(instance, false)).resolves.toBe(false);

    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
  });
});
