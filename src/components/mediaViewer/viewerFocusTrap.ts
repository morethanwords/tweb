import createFocusTrap, {FocusTrap, isFocusWithinOrLost} from '@helpers/dom/focusTrap';
import {getFullScreenElement} from '@helpers/dom/fullScreen';

/**
 * The media viewer keeps the focus it took from its opener (with the a11y layer, as `createFocusTrap` does):
 * Tab goes round its own controls, never on to the page under it. It gives the focus back to the opener itself,
 * once it is gone, so letting go restores nothing.
 */
export default function createViewerFocusTrap(element: HTMLElement) {
  let trap: FocusTrap, opener: HTMLElement;
  // * its video in full screen keeps the keyboard to itself, as the browser keeps it there: the trap would send Tab
  // * on to the controls left behind, which take no focus then
  const isActive = () => {
    const fullScreen = getFullScreenElement();
    return !fullScreen || fullScreen === element || !element.contains(fullScreen);
  };

  return {
    hold(restoreTo: HTMLElement) {
      opener = restoreTo;
      (trap ??= createFocusTrap(element, isActive)).activate(restoreTo, element);
    },

    /**
     * While its video plays in its own window the viewer is hidden and the page is the keyboard's. Back, the
     * viewer holds the focus again only if nothing else took it meanwhile: a popup opened over the page keeps it.
     */
    stepAside(aside: boolean) {
      if(!opener) return;
      if(aside) {
        trap.deactivate(false);
        return;
      }

      if(isFocusWithinOrLost(element)) {
        trap.activate(opener, element);
      }
    },

    release() {
      opener = undefined;
      trap?.deactivate(false);
    }
  };
}
