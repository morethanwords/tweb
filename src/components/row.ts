/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import CheckboxField from "./checkboxField";
import RadioField from "./radioField";
import ripple from "./ripple";
import { SliderSuperTab } from "./slider";
import RadioForm from "./radioForm";
import { i18n, LangPackKey } from "../lib/langPack";
import replaceContent from "../helpers/dom/replaceContent";
import setInnerHTML from "../helpers/dom/setInnerHTML";
import ListenerSetter from "../helpers/listenerSetter";
import { attachClickEvent } from "../helpers/dom/clickEvent";

export default class Row {
  public container: HTMLElement;
  public title: HTMLDivElement;
  public titleRight: HTMLElement;
  public subtitle: HTMLElement;
  public media: HTMLElement;

  public checkboxField: CheckboxField;
  public radioField: RadioField;

  public freezed = false;

  constructor(options: Partial<{
    icon: string,
    subtitle: string | HTMLElement | DocumentFragment,
    subtitleLangKey: LangPackKey,
    subtitleLangArgs: any[],
    radioField: Row['radioField'],
    checkboxField: Row['checkboxField'],
    noCheckboxSubtitle: boolean,
    title: string | HTMLElement | DocumentFragment,
    titleLangKey: LangPackKey,
    titleRight: string | HTMLElement,
    titleRightSecondary: string | HTMLElement,
    clickable: boolean | ((e: Event) => void),
    navigationTab: SliderSuperTab,
    havePadding: boolean,
    noRipple: boolean,
    noWrap: boolean,
    listenerSetter: ListenerSetter
  }> = {}) {
    this.container = document.createElement(options.radioField || options.checkboxField ? 'label' : 'div');
    this.container.classList.add('row');

    this.subtitle = document.createElement('div');
    this.subtitle.classList.add('row-subtitle');
    this.subtitle.setAttribute('dir', 'auto');
    if(options.subtitle) {
      if(typeof(options.subtitle) === 'string') {
        setInnerHTML(this.subtitle, options.subtitle);
      } else {
        this.subtitle.append(options.subtitle);
      }
    } else if(options.subtitleLangKey) {
      this.subtitle.append(i18n(options.subtitleLangKey, options.subtitleLangArgs));
    }
    this.container.append(this.subtitle);

    let havePadding = !!options.havePadding;
    if(options.radioField || options.checkboxField) {
      if(options.radioField) {
        this.radioField = options.radioField;
        this.container.append(this.radioField.label);
        havePadding = true;
      }

      if(options.checkboxField) {
        this.checkboxField = options.checkboxField;
        
        const isToggle = options.checkboxField.label.classList.contains('checkbox-field-toggle');
        if(isToggle) {
          this.container.classList.add('row-with-toggle');
          options.titleRight = this.checkboxField.label;
        } else {
          havePadding = true;
          this.container.append(this.checkboxField.label);
        }

        if(!options.noCheckboxSubtitle && !isToggle) {
          const onChange = () => {
            replaceContent(this.subtitle, i18n(this.checkboxField.input.checked ? 'Checkbox.Enabled' : 'Checkbox.Disabled'));
          };

          if(options.listenerSetter) options.listenerSetter.add(this.checkboxField.input)('change', onChange);
          else this.checkboxField.input.addEventListener('change', onChange);
        }
      }

      const i = options.radioField || options.checkboxField;
      i.label.classList.add('disable-hover');
    } 
    
    if(options.title || options.titleLangKey) {
      let c: HTMLElement;
      const titleRight = options.titleRight || options.titleRightSecondary;
      if(titleRight) {
        c = document.createElement('div');
        c.classList.add('row-title-row');
        this.container.append(c);
      } else {
        c = this.container;
      }

      this.title = document.createElement('div');
      this.title.classList.add('row-title');
      this.title.setAttribute('dir', 'auto');
      if(options.noWrap) this.title.classList.add('no-wrap');
      if(options.title) {
        if(typeof(options.title) === 'string') {
          this.title.innerHTML = options.title;
        } else {
          this.title.append(options.title);
        }
      } else {
        this.title.append(i18n(options.titleLangKey));
      }
      c.append(this.title);

      if(titleRight) {
        const titleRightEl = this.titleRight = document.createElement('div');
        titleRightEl.classList.add('row-title', 'row-title-right');

        if(options.titleRightSecondary) {
          titleRightEl.classList.add('row-title-right-secondary');
        }

        if(typeof(titleRight) === 'string') {
          titleRightEl.innerHTML = titleRight;
        } else {
          titleRightEl.append(titleRight);
        }

        c.append(titleRightEl);
      }
    }

    if(options.icon) {
      havePadding = true;
      this.title.classList.add('tgico', 'tgico-' + options.icon);
      this.container.classList.add('row-with-icon');
    }

    if(havePadding) {
      this.container.classList.add('row-with-padding');
    }

    if(options.navigationTab) {
      options.clickable = () => options.navigationTab.open();
    }

    if(options.clickable || options.radioField || options.checkboxField) {
      if(typeof(options.clickable) === 'function') {
        attachClickEvent(this.container, (e) => {
          if(this.freezed) return;
          (options.clickable as any)(e);
        }, {listenerSetter: options.listenerSetter});
      }

      this.container.classList.add('row-clickable', 'hover-effect');

      if(!options.noRipple) {
        ripple(this.container, undefined, undefined, true);
      }

      /* if(options.radioField || options.checkboxField) {
        this.container.prepend(this.container.lastElementChild);
      } */
    }
  }

  public createMedia(size?: 'small') {
    this.container.classList.add('row-with-padding');
    
    const media = this.media = document.createElement('div');
    media.classList.add('row-media');

    if(size) {
      media.classList.add('row-media-' + size);
    }

    this.container.append(media);

    return media;
  }
}

export const RadioFormFromRows = (rows: Row[], onChange: (value: string) => void) => {
  return RadioForm(rows.map((r) => ({container: r.container, input: r.radioField.input})), onChange);
};
