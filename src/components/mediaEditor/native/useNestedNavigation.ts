import {Accessor, createEffect, onCleanup} from 'solid-js';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import Modes from '@config/modes';

/** Nested native panels close before Escape reaches the editor's mode checkpoint. */
export default function useNestedNavigation(isOpen: Accessor<boolean>, close: () => void, type: NavigationItem['type'] = 'menu') {
  createEffect(() => {
    if(!Modes.a11y || !isOpen()) return;
    const item: NavigationItem = {
      type,
      noHistory: true,
      noBlurOnPop: true,
      // Signal setters can return false; that is not a request to reinsert
      // the navigation item after the panel/tool has already closed.
      onPop: () => { close(); }
    };
    appNavigationController.pushItem(item);
    onCleanup(() => appNavigationController.removeItem(item));
  });
}
