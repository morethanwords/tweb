import pause from '../../helpers/schedulers/pause';
import {AppManagers} from '../../lib/appManagers/managers';
import PopupElement from '../popups';
import SidebarSlider, {SidebarSliderOptions} from '../slider';

class SettingsSlider extends SidebarSlider {
  constructor(options: SidebarSliderOptions & {managers: AppManagers}) {
    super(options);
    this.managers = options.managers;
  }
}

export default class SettingsSliderPopup extends PopupElement {
  slider: SidebarSlider;

  constructor(managers: AppManagers) {
    super('settings-slider-popup', {
      overlayClosable: true,
      body: true,
      title: false
    });

    this.middlewareHelper.onDestroy(() => {
      pause(200).then(() => {
        this.slider.closeAllTabs();
      }); // wait for popup to close
    });

    const element = document.createElement('div');
    element.classList.add('settings-slider-popup__height-limit');
    const sliderEl = document.createElement('div');
    sliderEl.classList.add('sidebar-slider', 'tabs-container');

    // const scrollable = new Scrollable();

    element.append(sliderEl);

    this.slider = new SettingsSlider({
      navigationType: 'settings-popup',
      sidebarEl: element,
      managers
    });

    this.slider.onTabsCountChange = () => {
      if(this.slider.hasTabsInNavigation()) return;
      this.hide();
    };

    this.body.append(element);
  }
}
