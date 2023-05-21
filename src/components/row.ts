/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {SliderSuperTab} from './slider';
import type {SliderSuperTabEventable, SliderSuperTabEventableConstructable} from './sliderTab';
import CheckboxField, {CheckboxFieldOptions} from './checkboxField';
import RadioField from './radioField';
import ripple from './ripple';
import RadioForm from './radioForm';
import {i18n, LangPackKey} from '../lib/langPack';
import replaceContent from '../helpers/dom/replaceContent';
import setInnerHTML, {setDirection} from '../helpers/dom/setInnerHTML';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import ListenerSetter from '../helpers/listenerSetter';
import Button from './button';
import createContextMenu from '../helpers/dom/createContextMenu';
import SidebarSlider from './slider';

type K = string | HTMLElement | DocumentFragment | true;

const setContent = (element: HTMLElement, content: K) => {
  if(content === true) {

  } else if(typeof(content) === 'string') {
    setInnerHTML(element, content);
  } else {
    element.append(content);
  }
};

export type RowMediaSizeType = 'small' | 'medium' | 'big' | 'abitbigger' | 'bigger';

type ConstructorP<T> = T extends {
  new (...args: any[]): infer U;
} ? U : never;

export default class Row<T extends SliderSuperTabEventableConstructable = any> {
  public container: HTMLElement;
  public titleRow: HTMLElement;
  public titleRight: HTMLElement;
  public media: HTMLElement;

  public subtitleRow: HTMLElement;
  public subtitleRight: HTMLElement;

  public checkboxField: CheckboxField;
  public radioField: RadioField;

  public freezed = false;

  public buttonRight: HTMLElement;

  private _title: HTMLElement;
  private _subtitle: HTMLElement;
  private _midtitle: HTMLElement;

  constructor(options: Partial<{
    icon: string,
    subtitle: K,
    subtitleLangKey: LangPackKey,
    subtitleLangArgs: any[],
    subtitleRight: K,
    radioField: Row['radioField'],
    checkboxField: Row['checkboxField'],
    checkboxFieldOptions: CheckboxFieldOptions,
    withCheckboxSubtitle: boolean,
    title: K,
    titleLangKey: LangPackKey,
    titleRight: K,
    titleRightSecondary: K,
    clickable: boolean | ((e: Event) => void),
    navigationTab: {
      constructor: T,
      slider: SidebarSlider,
      getInitArgs?: () => Promise<Parameters<ConstructorP<T>['init']>[0]> | Parameters<ConstructorP<T>['init']>[0]
      args?: any
    },
    havePadding: boolean,
    noRipple: boolean,
    noWrap: boolean,
    listenerSetter: ListenerSetter,
    buttonRight?: HTMLElement | boolean,
    buttonRightLangKey: LangPackKey,
    asLink: boolean,
    contextMenu: Omit<Parameters<typeof createContextMenu>[0], 'findElement' | 'listenTo' | 'listenerSetter'>,
    asLabel: boolean
  }> = {}) {
    if(options.checkboxFieldOptions) {
      options.checkboxField = new CheckboxField({
        listenerSetter: options.listenerSetter,
        ...options.checkboxFieldOptions
      });
    }

    const tagName = options.asLink ? 'a' : (options.radioField || options.checkboxField || options.asLabel ? 'label' : 'div');
    this.container = document.createElement(tagName);
    this.container.classList.add('row', 'no-subtitle');

    if(options.noWrap) {
      this.container.classList.add('no-wrap');
    }

    if(options.subtitle) {
      const subtitle = this.subtitle;
      setContent(subtitle, options.subtitle);

      if(options.noWrap) subtitle.classList.add('no-wrap');

      if(options.subtitleRight) {
        this.container.append(this.subtitleRow = this.createRow());
        this.subtitleRow.classList.add('row-subtitle-row');
        const subtitleRight = this.subtitleRight = document.createElement('div');
        subtitleRight.classList.add('row-subtitle', 'row-subtitle-right');

        setContent(subtitleRight, options.subtitleRight);
        this.subtitleRow.append(subtitle, subtitleRight);
      }
    } else if(options.subtitleLangKey) {
      this.subtitle.append(i18n(options.subtitleLangKey, options.subtitleLangArgs));
    }

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
          if(!this.checkboxField.span) {
            this.checkboxField.label.classList.add('checkbox-field-absolute');
          }
          this.container.append(this.checkboxField.label);
        }

        if(options.withCheckboxSubtitle && !isToggle) {
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

    if(options.title || options.titleLangKey || options.titleRight || options.titleRightSecondary) {
      let c: HTMLElement;
      const titleRightContent = options.titleRight || options.titleRightSecondary;
      if(titleRightContent) {
        this.container.append(c = this.titleRow = this.createRow());
        this.titleRow.classList.add('row-title-row');
      } else {
        c = this.container;
      }

      this._title = this.createTitle();
      if(options.noWrap) this.title.classList.add('no-wrap');
      if(options.title) {
        setContent(this.title, options.title);
      } else if(options.titleLangKey) {
        this.title.append(i18n(options.titleLangKey));
      }

      c.append(this.title);

      if(titleRightContent) {
        const titleRight = this.titleRight = document.createElement('div');
        titleRight.classList.add('row-title', 'row-title-right');

        if(options.titleRightSecondary) {
          titleRight.classList.add('row-title-right-secondary');
        }

        setContent(titleRight, titleRightContent);
        c.append(titleRight);
      }
    }

    if(options.icon) {
      havePadding = true;
      // this.title.classList.add('tgico', 'tgico-' + options.icon);
      this.container.classList.add('tgico', 'tgico-' + options.icon);
      this.container.classList.add('row-with-icon');
    }

    if(havePadding) {
      this.container.classList.add('row-with-padding');
    }

    if(options.navigationTab) {
      let getInitArgs = options.navigationTab.getInitArgs;
      if(!getInitArgs) {
        const g = (options.navigationTab.constructor as any as typeof SliderSuperTab).getInitArgs;
        if(g) {
          // @ts-ignore
          getInitArgs = () => g();
        }
      }

      let args = options.navigationTab.args ?? getInitArgs?.();

      options.clickable = async() => {
        if(args instanceof Promise) {
          args = await args;
        }

        // if(!Array.isArray(args)) {
        //   args = [args];
        // }

        const tab = options.navigationTab.slider.createTab(options.navigationTab.constructor as any);
        tab.open(args);

        const eventListener = (tab as SliderSuperTabEventable).eventListener;
        if(eventListener && getInitArgs) {
          eventListener.addEventListener('destroyAfter', (promise) => {
            args = promise.then(() => getInitArgs() as any);
          });
        }
      };
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

    if(options.buttonRight || options.buttonRightLangKey) {
      this.buttonRight = options.buttonRight instanceof HTMLElement ?
        options.buttonRight :
        Button('btn-primary btn-color-primary btn-control-small', {text: options.buttonRightLangKey});
      this.container.append(this.buttonRight);
    }

    if(options.contextMenu) {
      createContextMenu({
        ...options.contextMenu,
        listenTo: this.container,
        listenerSetter: options.listenerSetter
      });
    }
  }

  public get title() {
    return this._title;
  }

  public get subtitle() {
    return this._subtitle ??= this.createSubtitle();
  }

  public get midtitle() {
    return this._midtitle ??= this.createMidtitle();
  }

  private createRow() {
    const c = document.createElement('div');
    c.classList.add('row-row');
    return c;
  }

  private createTitle() {
    const title = document.createElement('div');
    title.classList.add('row-title');
    setDirection(title);
    return title;
  }

  private createSubtitle() {
    const subtitle = document.createElement('div');
    subtitle.classList.add('row-subtitle');
    setDirection(subtitle);
    if(this.title) this.title.after(subtitle);
    else this.container.prepend(subtitle);
    this.container.classList.remove('no-subtitle');
    return subtitle;
  }

  private createMidtitle() {
    const midtitle = document.createElement('div');
    midtitle.classList.add('row-midtitle');
    this.subtitle.parentElement.insertBefore(midtitle, this.subtitle);
    return midtitle;
  }

  public createMedia(size?: RowMediaSizeType) {
    const media = document.createElement('div');
    return this.applyMediaElement(media, size);
  }

  public applyMediaElement(media: HTMLElement, size?: RowMediaSizeType) {
    this.container.classList.add('row-with-padding');

    this.media = media;
    media.classList.add('row-media');

    if(size) {
      media.classList.add('row-media-' + size);
    }

    this.container.append(media);

    return media;
  }

  public isDisabled() {
    return this.container.classList.contains('is-disabled');
  }

  public toggleDisability(disable = !this.container.classList.contains('is-disabled')) {
    this.container.classList.toggle('is-disabled', disable);
    return () => this.toggleDisability(!disable);
  }

  public disableWithPromise(promise: Promise<any>) {
    const toggle = this.toggleDisability(true);
    promise.finally(() => {
      toggle();
    });
  }

  public makeSortable() {
    const sortIcon = document.createElement('span');
    this.container.classList.add('row-sortable', 'tgico');
    sortIcon.classList.add('row-sortable-icon', 'tgico-menu');
    this.container.append(sortIcon);
  }

  public toggleSorting(enabled?: boolean) {
    this.container.classList.toggle('cant-sort', !enabled);
  }
}

export const CreateRowFromCheckboxField = (checkboxField: CheckboxField) => {
  return new Row({checkboxField, listenerSetter: checkboxField.listenerSetter});
};

export const RadioFormFromRows = (rows: Row[], onChange: (value: string) => void) => {
  return RadioForm(rows.map((r) => ({container: r.container, input: r.radioField.input})), onChange);
};

export const RadioFormFromValues = (values: {langPackKey: LangPackKey, value: number | string, checked?: boolean}[], onChange: Parameters<typeof RadioFormFromRows>[1]) => {
  const name = 'name-' + (Math.random() * 0x7FFFFF | 0);
  let checkedRadioField: RadioField;
  const rows = values.map(({langPackKey, value, checked}) => {
    const row = new Row({
      radioField: new RadioField({
        langKey: langPackKey,
        name,
        value: '' + value
      })
    });

    if(checked) {
      checkedRadioField = row.radioField;
    }

    return row;
  });

  const form = RadioFormFromRows(rows, onChange);
  if(checkedRadioField) {
    checkedRadioField.checked = true;
  }
  return form;
};
