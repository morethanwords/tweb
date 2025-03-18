// SolidJS in worker script 🤯 #ReactSucks
import {createEffect, createRoot, createSignal, onCleanup} from 'solid-js';

import accumulate from '../../helpers/array/accumulate';
import DEBUG from '../../config/debug';

import commonStateStorage from '../commonStateStorage';

import type MTProtoMessagePort from './mtprotoMessagePort';


type UseAutoLockArgs = {
  getPort: () => MTProtoMessagePort<false>;
  getIsLocked: () => boolean;
  setIsLocked: (value: boolean) => void;
};

export const useAutoLock = ({getPort, getIsLocked, setIsLocked}: UseAutoLockArgs) => createRoot((dispose) => {
  const [areAllIdle, setAreAllIdle] = createSignal(false);
  const [uninteruptableActivities, setUninteruptableActivities] = createSignal(0);

  const uninteruptableActivitiesMap = new Map<MessageEventSource, Set<string>>();

  let autoLockTimeout: number;

  createEffect(() => {
    const hasActiveTabs = !areAllIdle();
    const activities = uninteruptableActivities();

    let cleaned = false;
    onCleanup(() => {
      cleaned = true;
      self.clearTimeout(autoLockTimeout);
    });

    (async() => {
      const settings = await commonStateStorage.get('settings', false);
      if(cleaned) return;

      const passcodeEnabled = settings?.passcode?.enabled || false;
      const timeoutMins = settings?.passcode?.autoLockTimeoutMins || null;

      if(!timeoutMins || !passcodeEnabled) return;

      if(hasActiveTabs || activities > 0 || getIsLocked()) return;

      autoLockTimeout = self.setTimeout(() => {
        if(!areAllIdle() || getIsLocked()) return;

        getPort().invokeVoid('toggleLock', true);
        getPort().invokeVoid('event', {
          name: 'toggle_locked',
          args: [true],
          accountNumber: undefined
        });

        setIsLocked(true);
      }, timeoutMins * 1000 * 60);
      // }, timeoutMins * 1000 * 10); // Please don't forget to comment this back))
    })();
  });

  function updateActivities() {
    const activities = accumulate(Array.from(uninteruptableActivitiesMap.values()).map(set => set.size), 0);

    if(DEBUG) {
      const activitiesObject = Object.fromEntries(Array.from(uninteruptableActivitiesMap.entries()).map(([, value], idx) => [idx, Array.from(value.values())]));
      getPort().invokeVoid('log', activitiesObject);
    }

    setUninteruptableActivities(activities);
  }

  return {
    dispose,
    toggleUninteruptableActivity: (source: MessageEventSource, activity: string, active: boolean) => {
      if(!uninteruptableActivitiesMap.has(source)) uninteruptableActivitiesMap.set(source, new Set());

      if(active) uninteruptableActivitiesMap.get(source).add(activity);
      else uninteruptableActivitiesMap.get(source).delete(activity);

      updateActivities();
    },
    removeTab: (source: MessageEventSource) => {
      if(uninteruptableActivitiesMap.delete(source))
        updateActivities();
    },
    setAreAllIdle
  }
});
