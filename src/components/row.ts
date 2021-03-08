import CheckboxField from "./checkboxField";
import RadioField from "./radioField";
import { ripple } from "./ripple";
import { SliderSuperTab } from "./slider";
import RadioForm from "./radioForm";

export default class Row {
  public container: HTMLElement;
  public title: HTMLDivElement;
  public subtitle: HTMLElement;

  public checkboxField: CheckboxField;
  public radioField: RadioField;

  public freezed = false;

  constructor(options: Partial<{
    icon: string,
    subtitle: string,
    radioField: Row['radioField'],
    checkboxField: Row['checkboxField'],
    title: string,
    titleRight: string,
    clickable: boolean | ((e: Event) => void),
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

        this.checkboxField.input.addEventListener('change', () => {
          this.subtitle.innerHTML = this.checkboxField.input.checked ? 'Enabled' : 'Disabled';
        });
      }
    } else {
      if(options.title) {
        let c: HTMLElement;
        if(options.titleRight) {
          c = document.createElement('div');
          c.classList.add('row-title-row');
          this.container.append(c);
        } else {
          c = this.container;
        }

        this.title = document.createElement('div');
        this.title.classList.add('row-title');
        this.title.innerHTML = options.title;
        c.append(this.title);

        if(options.titleRight) {
          const titleRight = document.createElement('div');
          titleRight.classList.add('row-title', 'row-title-right');
          titleRight.innerHTML = options.titleRight;
          c.append(titleRight);
        }
      }

      if(options.icon) {
        havePadding = true;
        this.title.classList.add('tgico', 'tgico-' + options.icon);
        this.container.classList.add('row-with-icon');
      }
    }

    if(havePadding) {
      this.container.classList.add('row-with-padding');
    }

    if(options.navigationTab) {
      options.clickable = () => options.navigationTab.open();
    }

    if(options.clickable) {
      if(typeof(options.clickable) === 'function') {
        this.container.addEventListener('click', (e) => {
          if(this.freezed) return;
          (options.clickable as any)(e);
        });
      }

      this.container.classList.add('row-clickable', 'hover-effect');
      ripple(this.container);
    }

    this.container.append(this.subtitle);
  }


}

export const RadioFormFromRows = (rows: Row[], onChange: (value: string) => void) => {
  return RadioForm(rows.map(r => ({container: r.container, input: r.radioField.input})), onChange);
};