import { SliderSuperTab } from "../../slider"
import { AppSidebarLeft } from "..";
import RangeSelector from "../../rangeSelector";
import { clamp } from "../../../helpers/number";

export class RangeSettingSelector {
  public container: HTMLDivElement;
  private range: RangeSelector;

  constructor(name: string, step: number, initialValue: number, minValue: number, maxValue: number) {
    const BASE_CLASS = 'range-setting-selector';
    this.container = document.createElement('div');
    this.container.classList.add(BASE_CLASS);

    const details = document.createElement('div');
    details.classList.add(BASE_CLASS + '-details');

    const nameDiv = document.createElement('div');
    nameDiv.classList.add(BASE_CLASS + '-name');
    nameDiv.innerHTML = name;

    const valueDiv = document.createElement('div');
    valueDiv.classList.add(BASE_CLASS + '-value');
    valueDiv.innerHTML = '' + initialValue;

    details.append(nameDiv, valueDiv);

    this.range = new RangeSelector(step, initialValue, minValue, maxValue);
    this.range.setListeners();
    this.range.setHandlers({
      onScrub: value => {
        //console.log('font size scrub:', value);
        valueDiv.innerText = '' + value;
      }
    });

    this.container.append(details, this.range.container);
  }
}

export default class AppGeneralSettingsTab extends SliderSuperTab {
  constructor(appSidebarLeft: AppSidebarLeft) {
    super(appSidebarLeft);
  }

  init() {
    this.container.classList.add('general-settings-container');
    this.title.innerText = 'General';

    const generateSection = (name: string) => {
      const container = document.createElement('div');
      container.classList.add('sidebar-left-section');

      const hr = document.createElement('hr');
      const h2 = document.createElement('div');
      h2.classList.add('sidebar-left-section-name');
      h2.innerHTML = name;

      const content = document.createElement('div');
      content.classList.add('sidebar-left-section-content');
      content.append(h2);

      container.append(hr, content);

      this.scrollable.append(container);

      return content;
    };

    {
      const container = generateSection('Settings');
      
      const range = new RangeSettingSelector('Message Text Size', 1, 16, 12, 20);
      
      container.append(range.container);
    }

    generateSection('Keyboard');
    generateSection('Auto-Download Media');
    generateSection('Auto-Play Media');
    generateSection('Stickers');
  }

  onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }
  }
}