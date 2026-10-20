import {createSignal} from 'solid-js';
import PopupElement, {createPopup, usePopupController} from '@components/popups/indexTsx';
import SidebarSlider, {SidebarSliderOptions, SliderSuperTab, trackTabsDestruction} from '@components/slider';
import appNavigationController, {type NavigationItem} from '@components/appNavigationController';
import type {ReadingManagers} from '@lib/managers';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import pause from '@helpers/schedulers/pause';
import styles from '@components/sliderPopup.module.scss';

let titleIdSeed = 0;

class PopupSlider extends SidebarSlider {
  private type: NavigationItem['type'];
  private detached = false;

  constructor(options: SidebarSliderOptions & {managers: ReadingManagers}) {
    super(options);
    this.managers = options.managers;
    this.type = options.navigationType;
  }

  /**
   * Leaves the navigation as its popup starts to go. Its tabs close once the popup has: by then a
   * popup of the kind opened meanwhile may have pushed its own items, and a tab closing takes the
   * latest of the type, so closing ours afterwards would take that popup's.
   */
  public detachNavigation() {
    for(let i = this.getHistory().length; i > 0; --i) {
      appNavigationController.removeByType(this.type, true);
    }

    this.detached = true;
  }

  // * a tab whose init ends while the popup goes still opens, out of the navigation it has left
  protected pushNavigationItem(tab: SliderSuperTab) {
    if(this.detached) return;
    super.pushNavigationItem(tab);
  }

  protected onCloseTab(id: Parameters<SidebarSlider['closeTab']>[0], animate: boolean, isNavigation?: boolean) {
    super.onCloseTab(id, animate, isNavigation || this.detached);
  }
}

/**
 * A sidebar's tabs in a popup of the sidebar's size, which goes once its last tab is closed. A
 * `hidden` one waits for `show`: for its first tab to have something to show.
 */
export default function showSliderPopup(options: {
  managers: ReadingManagers,
  navigationType: NavigationItem['type'],
  hidden?: boolean,
  onClose?: () => void
}) {
  const [shown, setShown] = createSignal(!options.hidden);
  // * the popup and its tabs are screens of the account session they are opened in
  const managers = bindManagersToSession(options.managers);

  const element = document.createElement('div');
  element.classList.add(styles.slider);
  const sliderEl = document.createElement('div');
  sliderEl.classList.add('sidebar-slider', 'tabs-container');
  element.append(sliderEl);

  const slider = new PopupSlider({
    navigationType: options.navigationType,
    sidebarEl: element,
    managers
  });

  // * the dialog is named by the tab on top, as a popup is by its title
  const nameByTopTab = () => {
    const history = slider.getHistory();
    const tab = history[history.length - 1];
    const container = element.closest('.popup-container');
    if(!(tab instanceof SliderSuperTab) || !container) return;
    tab.title.id ||= 'slider-popup-title-' + ++titleIdSeed;
    container.setAttribute('aria-labelledby', tab.title.id);
  };

  slider.onTabsCountChange = () => {
    if(slider.hasTabsInNavigation()) {
      // * the slider counts a tab in before it puts it on top
      queueMicrotask(nameByTopTab);
      return;
    }

    setShown(false);
  };

  // * closed before it showed, it takes along a tab that comes in after
  let closed = false, wasShown = !options.hidden;
  let dispose: () => void;
  createPopup(() => {
    dispose = usePopupController().dispose;
    return (
      <PopupElement
        class={styles.popup}
        managers={managers}
        closable
        show={shown()}
        onClose={() => {
          closed = true;
          slider.detachNavigation();
          options.onClose?.();
        }}
        onCloseAfterTimeout={() => {
          // wait for the popup to close; whoever waits for closed tabs (an account switch) waits for these too
          trackTabsDestruction(pause(200).then(() => {
            slider.closeAllTabs();
          }));
        }}
      >
        <PopupElement.Body>{element}</PopupElement.Body>
      </PopupElement>
    );
  });

  return {
    slider,
    show: () => {
      if(closed) {
        slider.closeAllTabs();
        return;
      }

      wasShown = true;
      setShown(true);
    },
    close: () => {
      if(closed) return;
      closed = true;
      if(wasShown) {
        setShown(false);
        return;
      }

      // * one that never showed goes at once
      options.onClose?.();
      slider.closeAllTabs();
      dispose();
    }
  };
}
