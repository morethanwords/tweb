import {createSignal, onCleanup} from 'solid-js';
import ListenerSetter from '@helpers/listenerSetter';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import groupCallsController from '@lib/calls/groupCallsController';
import type GroupCallInstance from '@lib/calls/groupCallInstance';
import GROUP_CALL_STATE from '@lib/calls/groupCallState';

/**
 * Reactive view of the group call this tab has joined, `undefined` when none.
 *
 * The controller keeps its reference after a hang-up and only dispatches
 * `instance` for a *new* call, so the closing edge has to come from the
 * instance's own `state` event — otherwise a left call would keep looking
 * joined forever.
 */
export function useCurrentGroupCall() {
  const [instance, setInstance] = createSignal<GroupCallInstance | undefined>();

  const instanceListeners = new ListenerSetter();
  onCleanup(() => instanceListeners.removeAll());

  const track = (newInstance: GroupCallInstance | undefined) => {
    instanceListeners.removeAll();

    if(newInstance?.state === GROUP_CALL_STATE.CLOSED) {
      newInstance = undefined;
    }

    setInstance(newInstance);
    if(!newInstance) return;

    instanceListeners.add(newInstance)('state', (state) => {
      if(state === GROUP_CALL_STATE.CLOSED) track(undefined);
    });
  };

  track(groupCallsController.groupCall);
  subscribeOn(groupCallsController)('instance', track);

  return instance;
}
