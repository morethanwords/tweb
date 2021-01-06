import CheckboxField from "./checkbox";
import RadioField from "./radioField";
import { ripple } from "./ripple";
import { SliderSuperTab } from "./slider";
import RadioForm from "./radioForm";

export default class Row {
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
    clickable: boolean,
    navigationTab: SliderSuperTab
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
      if(options.title) {
        this.title = document.createElement('div');
        this.title.classList.add('row-title');
        this.title.innerHTML = options.title;
        this.container.append(this.title);
      }

      if(options.icon) {
        havePadding = true;
        this.title.classList.add('tgico', 'tgico-' + options.icon);
      }
    }

    if(havePadding) {
      this.container.classList.add('row-with-padding');
    }

    if(options.navigationTab) {
      this.container.addEventListener('click', () => {
        options.navigationTab.open();
      });
      options.clickable = true;
    }

    if(options.clickable) {
      this.container.classList.add('row-clickable', 'hover-effect');
      ripple(this.container);
    }

    this.container.append(this.subtitle);
  }


}

export const RadioFormFromRows = (rows: Row[], onChange: (value: string) => void) => {
  return RadioForm(rows.map(r => ({container: r.container, input: r.radioField.input})), onChange);
};