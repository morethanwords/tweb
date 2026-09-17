import pause from '@helpers/schedulers/pause';
import {AppManagers} from '@lib/managers';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import SidebarSlider, {SidebarSliderOptions} from '@components/slider';
import {createSignal} from 'solid-js';

class SettingsSlider extends SidebarSlider {
  constructor(options: SidebarSliderOptions & {managers: AppManagers}) {
    super(options);
    this.managers = options.managers;
  }
}

export default function showSettingsSliderPopup(managers: AppManagers) {
  const [show, setShow] = createSignal(true);

  const element = document.createElement('div');
  element.classList.add('settings-slider-popup__height-limit');
  const sliderEl = document.createElement('div');
  sliderEl.classList.add('sidebar-slider', 'tabs-container');
  element.append(sliderEl);

  const slider = new SettingsSlider({
    navigationType: 'settings-popup',
    sidebarEl: element,
    managers
  });

  slider.onTabsCountChange = () => {
    if(slider.hasTabsInNavigation()) return;
    setShow(false);
  };

  createPopup(() => (
    <PopupElement
      class="settings-slider-popup"
      closable
      show={show()}
      onCloseAfterTimeout={() => {
        // wait for the popup to close
        pause(200).then(() => slider.closeAllTabs());
      }}
    >
      <PopupElement.Body>{element}</PopupElement.Body>
    </PopupElement>
  ));

  return slider;
}
