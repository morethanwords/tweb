import { SliderSuperTab } from "../../slider"
import { AppSidebarLeft } from "..";
import RangeSelector from "../../rangeSelector";
import { clamp } from "../../../helpers/number";
import Button from "../../button";
import CheckboxField from "../../checkbox";
import RadioField from "../../radioField";

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
      h2.classList.add('sidebar-left-h2', 'sidebar-left-section-name');
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

      const chatBackgroundButton = Button('btn-primary btn-transparent', {icon: 'photo', text: 'Chat Background'});

      const animationsCheckboxField = CheckboxField('Enable Animations', 'animations', false, 'settings.animationsEnabled');
      
      container.append(range.container, chatBackgroundButton, animationsCheckboxField.label);
    }

    {
      const container = generateSection('Keyboard');

      class Row {
        public container: HTMLElement;
        public title: HTMLDivElement;
        public subtitle: HTMLElement;

        public checkboxField: ReturnType<typeof CheckboxField>;
        public radioField: ReturnType<typeof RadioField>;

        constructor(options: Partial<{
          icon: string,
          subtitle: string,
          radioField: Row['radioField'],
          checkboxField: Row['checkboxField'],
          title: string,
        }> = {}) {
          this.container = document.createElement('div');
          this.container.classList.add('row');

          this.subtitle = document.createElement('div');
          this.subtitle.classList.add('row-subtitle');
          if(options.subtitle) {
            this.subtitle.innerHTML = options.subtitle;
          }

          let havePadding = false;
          if(options.radioField || options.checkboxField) {
            havePadding = true;
            if(options.radioField) {
              this.radioField = options.radioField;
              this.container.append(this.radioField.label);
            }
  
            if(options.checkboxField) {
              this.checkboxField = options.checkboxField;
              this.container.append(this.checkboxField.label);
            }
          } else {
            if(options.icon) {
              havePadding = true;
              this.container.classList.add('tgico-', options.icon);
            }

            if(options.title) {
              this.title = document.createElement('div');
              this.title.classList.add('row-title');
              this.title.innerHTML = options.title;
              this.container.append(this.title);
            }
          }

          if(havePadding) {
            this.container.classList.add('row-with-padding');
          }

          this.container.append(this.subtitle);
        }


      }

      const form = document.createElement('form');

      const enterRow = new Row({
        radioField: RadioField('Send by Enter', 'send-shortcut', 'enter', 'settings.sendShortcut'),
        subtitle: 'New line by Shift + Enter',
      });

      const ctrlEnterRow = new Row({
        radioField: RadioField('Send by Ctrl + Enter', 'send-shortcut', 'ctrlEnter', 'settings.sendShortcut'),
        subtitle: 'New line by Enter',
      });
      
      form.append(enterRow.container, ctrlEnterRow.container);
      container.append(form);
    }

    {
      const container = generateSection('Auto-Download Media');

      const contactsCheckboxField = CheckboxField('Contacts', 'contacts', false, 'settings.autoDownload.contacts');
      const privateCheckboxField = CheckboxField('Private Chats', 'private', false, 'settings.autoDownload.private');
      const groupsCheckboxField = CheckboxField('Group Chats', 'groups', false, 'settings.autoDownload.groups');
      const channelsCheckboxField = CheckboxField('Channels', 'channels', false, 'settings.autoDownload.channels');

      container.append(contactsCheckboxField.label, privateCheckboxField.label, groupsCheckboxField.label, channelsCheckboxField.label);
    }

    {
      const container = generateSection('Auto-Play Media');

      const gifsCheckboxField = CheckboxField('GIFs', 'gifs', false, 'settings.autoPlay.gifs');
      const videosCheckboxField = CheckboxField('Videos', 'videos', false, 'settings.autoPlay.videos');

      container.append(gifsCheckboxField.label, videosCheckboxField.label);
    }
    
    {
      const container = generateSection('Stickers');

      const suggestCheckboxField = CheckboxField('Suggest Stickers by Emoji', 'suggest', false, 'settings.stickers.suggest');
      const loopCheckboxField = CheckboxField('Loop Animated Stickers', 'loop', false, 'settings.stickers.loop');

      container.append(suggestCheckboxField.label, loopCheckboxField.label);
    }
  }

  onOpen() {
    if(this.init) {
      this.init();
      this.init = null;
    }
  }
}