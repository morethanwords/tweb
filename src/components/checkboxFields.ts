/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import cancelEvent from '../helpers/dom/cancelEvent';
import {attachClickEvent} from '../helpers/dom/clickEvent';
import findUpAsChild from '../helpers/dom/findUpAsChild';
import ListenerSetter from '../helpers/listenerSetter';
import safeAssign from '../helpers/object/safeAssign';
import I18n, {LangPackKey} from '../lib/langPack';
import CheckboxField from './checkboxField';
import Row from './row';
import {toast} from './toast';

export type CheckboxFieldsField = {
  text: LangPackKey,
  description?: LangPackKey,
  restrictionText?: LangPackKey,
  checkboxField?: CheckboxField,
  checked?: boolean,
  nested?: CheckboxFieldsField[],
  nestedTo?: CheckboxFieldsField,
  nestedCounter?: HTMLElement,
  setNestedCounter?: (count: number) => void,
  toggleWith?: {checked?: CheckboxFieldsField[], unchecked?: CheckboxFieldsField[]},
  name?: string,
  row?: Row
};

export default class CheckboxFields<K extends CheckboxFieldsField = CheckboxFieldsField> {
  public fields: Array<K>;
  protected listenerSetter: ListenerSetter;
  protected asRestrictions: boolean;

  constructor(options: {
    fields: Array<K>,
    listenerSetter: ListenerSetter,
    asRestrictions?: boolean
  }) {
    safeAssign(this, options);
  }

  public createField(info: CheckboxFieldsField, isNested?: boolean) {
    if(info.nestedTo && !isNested) {
      return;
    }

    const row = info.row = new Row({
      titleLangKey: isNested ? undefined : info.text,
      checkboxField: info.checkboxField = new CheckboxField({
        text: isNested ? info.text : undefined,
        checked: info.nested ? false : info.checked,
        toggle: !isNested,
        listenerSetter: this.listenerSetter,
        restriction: this.asRestrictions && !isNested,
        name: info.name
      }),
      listenerSetter: this.listenerSetter,
      subtitleLangKey: info.description,
      clickable: info.nested ? (e) => {
        if(findUpAsChild(e.target as HTMLElement, row.checkboxField.label)) {
          return;
        }

        cancelEvent(e);
        row.container.classList.toggle('accordion-toggler-expanded');
        accordion.classList.toggle('is-expanded');
      } : undefined
    });

    if(info.restrictionText) {
      info.checkboxField.label.lastElementChild.classList.add('with-lock', 'tgico');
      info.checkboxField.input.disabled = true;

      attachClickEvent(info.row.container, (e) => {
        toast(I18n.format(info.restrictionText, true));
      }, {listenerSetter: this.listenerSetter});
    }

    const nodes: HTMLElement[] = [row.container];
    let accordion: HTMLElement, nestedCounter: HTMLElement;
    if(info.nested) {
      const container = accordion = document.createElement('div');
      container.classList.add('accordion');
      container.style.setProperty('--max-height', info.nested.length * 48 + 'px');
      const _info = info;
      info.nested.forEach((info) => {
        info.nestedTo ??= _info;
        container.append(...this.createField(info, true).nodes);
      });
      nodes.push(container);

      const span = document.createElement('span');
      span.classList.add('tgico-down', 'accordion-icon');

      nestedCounter = info.nestedCounter = document.createElement('b');
      this.setNestedCounter(info);
      row.title.append(' ', nestedCounter, ' ', span);

      row.container.classList.add('accordion-toggler');
      row.titleRow.classList.add('with-delimiter');

      row.checkboxField.setValueSilently(this.getNestedCheckedLength(info) === info.nested.length);

      info.toggleWith ??= {checked: info.nested, unchecked: info.nested};
    }

    if(info.toggleWith || info.nestedTo) {
      const processToggleWith = info.toggleWith ? (info: CheckboxFieldsField) => {
        const {toggleWith, nested} = info;
        const value = info.checkboxField.checked;
        const arr = value ? toggleWith.checked : toggleWith.unchecked;
        if(!arr) {
          return;
        }

        const other = this.fields.filter((i) => arr.includes(i));
        other.forEach((info) => {
          info.checkboxField.setValueSilently(value);
          if(info.nestedTo && !nested) {
            this.setNestedCounter(info.nestedTo);
          }

          if(info.toggleWith) {
            processToggleWith(info);
          }
        });

        if(info.nested) {
          this.setNestedCounter(info);
        }
      } : undefined;

      const processNestedTo = info.nestedTo ? () => {
        const length = this.getNestedCheckedLength(info.nestedTo);
        info.nestedTo.checkboxField.setValueSilently(length === info.nestedTo.nested.length);
        this.setNestedCounter(info.nestedTo, length);
      } : undefined;

      this.listenerSetter.add(info.checkboxField.input)('change', () => {
        processToggleWith?.(info);
        processNestedTo?.();
      });
    }

    return {row, nodes};
  }

  protected getNestedCheckedLength(info: CheckboxFieldsField) {
    return info.nested.reduce((acc, v) => acc + +v.checkboxField.checked, 0);
  }

  public setNestedCounter(info: CheckboxFieldsField, count = this.getNestedCheckedLength(info)) {
    info.nestedCounter.textContent = `${count}/${info.nested.length}`;
  }
}
