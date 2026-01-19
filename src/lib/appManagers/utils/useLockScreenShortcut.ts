import PasscodeLockScreenController from '@components/passcodeLock/passcodeLockScreenController';
import ListenerSetter from '@helpers/listenerSetter';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {addShortcutListener} from '@helpers/shortcutListener';
import apiManagerProxy from '@lib/apiManagerProxy';
import appImManager from '@lib/appImManager';
import rootScope from '@lib/rootScope';
import {createEffect, createResource, createRoot, createSignal, onCleanup} from 'solid-js';


const _useLockScreenShortcut = () => {
  const [locked, setLocked] = createSignal(PasscodeLockScreenController.getIsLocked());

  const [enabled, {mutate: mutateEnabled}] = createResource(() =>
    rootScope.managers.appStateManager.getState().then(state =>
      state.settings?.passcode?.enabled || false
    )
  );

  const [shortcutEnabled, {mutate: mutateShortcutEnabled}] = createResource(() =>
    rootScope.managers.appStateManager.getState().then(state =>
      state?.settings?.passcode?.lockShortcutEnabled || false
    )
  );

  const [shortcutKeys, {mutate: mutateShortcutKeys}] = createResource(() =>
    rootScope.managers.appStateManager.getState().then(state =>
      state?.settings?.passcode?.lockShortcut || []
    )
  );

  const listenerSetter = new ListenerSetter();

  listenerSetter.add(rootScope)('settings_updated', ({key, value}) => {
    if(key === joinDeepPath('settings', 'passcode', 'enabled')) {
      mutateEnabled(value);
    } else if(key === joinDeepPath('settings', 'passcode', 'lockShortcut')) {
      mutateShortcutKeys(value);
    } else if(key === joinDeepPath('settings', 'passcode', 'lockShortcutEnabled')) {
      mutateShortcutEnabled(value);
    }
  });

  onCleanup(() => {
    listenerSetter.removeAll();
  });

  createEffect(() => {
    if(locked() || !enabled() || !shortcutEnabled()) return;

    if(!shortcutKeys()?.length) return;

    const combo = [...shortcutKeys(), 'KeyL'].join('+');

    const isShiftLockShortcut = combo === 'Shift+KeyL';
    appImManager.isShiftLockShortcut = isShiftLockShortcut;

    const removeListener = addShortcutListener([combo], (_, event) => {
      const activeElement = document.activeElement as HTMLElement;

      if(
        isShiftLockShortcut &&
        activeElement &&
        (activeElement.isContentEditable || ['INPUT', 'TEXTAREA'].includes(activeElement.tagName))
      ) return;

      event.preventDefault();

      PasscodeLockScreenController.lock(true, () => {
        apiManagerProxy.lock();
      });
      // PasscodeLockScreenController.lockOtherTabs();
    }, false);

    onCleanup(() => {
      removeListener();
      appImManager.isShiftLockShortcut = false;
    });
  });
};


const useLockScreenShortcut = () => {
  let dispose: () => void;
  createRoot((_dispose) => {
    dispose = _dispose;
    _useLockScreenShortcut();
  });

  return {dispose};
};

export default useLockScreenShortcut;
