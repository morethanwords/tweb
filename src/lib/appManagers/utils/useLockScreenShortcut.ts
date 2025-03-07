import {createEffect, createResource, createRoot, createSignal, onCleanup} from 'solid-js';

import PasscodeLockScreenController from '../../../components/passcodeLock/passcodeLockScreenController';
import {addShortcutListener} from '../../../components/mediaEditor/shortcutListener';
import ListenerSetter from '../../../helpers/listenerSetter';
import {joinDeepPath} from '../../../helpers/object/setDeepProperty';

import rootScope from '../../rootScope';

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

  listenerSetter.add(rootScope)('toggle_locked', (value) => {
    setLocked(value);
  });

  onCleanup(() => {
    listenerSetter.removeAll();
  });

  createEffect(() => {
    if(locked() || !enabled() || !shortcutEnabled()) return;

    if(!shortcutKeys()?.length) return;

    const combos = shortcutKeys().map(key => key + '+L');

    const removeListener = addShortcutListener(combos, () => {
      PasscodeLockScreenController.lock(true);
      PasscodeLockScreenController.lockOtherTabs();

      setTimeout(() => {
        rootScope.dispatchEvent('toggle_locked', true);
      }, 400);
    });

    onCleanup(() => {
      removeListener();
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
