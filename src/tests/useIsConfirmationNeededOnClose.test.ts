const mocks = vi.hoisted(() => ({
  confirmationPopup: vi.fn()
}));

vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({confirmationPopup: mocks.confirmationPopup})
}));

import useIsConfirmationNeededOnClose from '@hooks/useIsConfirmationNeededOnClose';

describe('useIsConfirmationNeededOnClose', () => {
  beforeEach(() => {
    mocks.confirmationPopup.mockReset();
  });

  test('waits for saving and propagates a persistence failure', async() => {
    const error = new Error('save failed');
    mocks.confirmationPopup.mockResolvedValue(undefined);
    const saveAllSettings = vi.fn().mockRejectedValue(error);
    const confirmClose = useIsConfirmationNeededOnClose({
      descriptionLangKey: 'UnsavedChangesDescription.ChatAutomation',
      hasChanges: () => true,
      saveAllSettings,
      waitForSave: true
    });

    await expect(confirmClose()).rejects.toBe(error);
    expect(saveAllSettings).toHaveBeenCalledOnce();
  });

  test('does not resolve a confirmed close before deferred saving succeeds', async() => {
    let resolveSave: () => void;
    mocks.confirmationPopup.mockResolvedValue(undefined);
    const saveAllSettings = vi.fn(() => new Promise<void>((resolve) => resolveSave = resolve));
    const confirmClose = useIsConfirmationNeededOnClose({
      descriptionLangKey: 'UnsavedChangesDescription.ChatAutomation',
      hasChanges: () => true,
      saveAllSettings,
      waitForSave: true
    });
    let settled = false;
    const closing = confirmClose().finally(() => settled = true);

    await Promise.resolve();
    expect(settled).toBe(false);

    resolveSave();
    await expect(closing).resolves.toBe(true);
    expect(settled).toBe(true);
  });

  test('allows discard without invoking save', async() => {
    mocks.confirmationPopup.mockRejectedValue('canceled');
    const saveAllSettings = vi.fn();
    const confirmClose = useIsConfirmationNeededOnClose({
      descriptionLangKey: 'UnsavedChangesDescription.ChatAutomation',
      hasChanges: () => true,
      saveAllSettings
    });

    await expect(confirmClose()).resolves.toBeUndefined();
    expect(saveAllSettings).not.toHaveBeenCalled();
  });

  test('rejects a close-button dismissal instead of treating it as discard', async() => {
    mocks.confirmationPopup.mockRejectedValue('closed');
    const saveAllSettings = vi.fn();
    const confirmClose = useIsConfirmationNeededOnClose({
      descriptionLangKey: 'UnsavedChangesDescription.ChatAutomation',
      hasChanges: () => true,
      saveAllSettings
    });

    await expect(confirmClose()).rejects.toBeInstanceOf(Error);
    expect(saveAllSettings).not.toHaveBeenCalled();
  });
});
