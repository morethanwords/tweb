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
import I18n, {FormatterArguments, LangPackKey} from '../lib/langPack';
import CheckboxField from './checkboxField';
import Icon from './icon';
import Row from './row';
import {toast} from './toast';

export type CheckboxFieldsField = {
  text?: LangPackKey,
  textArgs?: FormatterArguments,
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
  protected round: boolean;
  protected onRowCreation: (row: Row, info: K) => void;
  protected rightButtonIcon: Icon;
  protected onAnyChange?: () => void;
  protected onExpand?: (info: K) => void;

  constructor(options: {
    fields: Array<K>,
    listenerSetter: ListenerSetter,
    asRestrictions?: boolean,
    round?: boolean,
    rightButtonIcon?: Icon,
    onRowCreation?: CheckboxFields<K>['onRowCreation'],
    onAnyChange?: () => void,
    onExpand?: (info: K) => void
  }) {
    safeAssign(this, options);
  }

  public createField(info: CheckboxFieldsField, isNested?: boolean) {
    if(info.nestedTo && !isNested) {
      return;
    }

    const asInner = isNested && !this.round;

    const accordionIcon = Icon('down', 'accordion-icon');

    let rightContent: HTMLElement;
    if(this.round && !asInner && info.nested) {
      rightContent = document.createElement('div');
      rightContent.classList.add('accordion-right-button');
    }

    const row = info.row = new Row({
      titleLangKey: asInner ? undefined : info.text,
      titleLangArgs: asInner ? undefined : info.textArgs,
      checkboxField: info.checkboxField = new CheckboxField({
        text: asInner ? info.text : undefined,
        textArgs: asInner ? info.textArgs : undefined,
        checked: info.nested ? false : info.checked,
        toggle: this.round ? undefined : !isNested,
        listenerSetter: this.listenerSetter,
        restriction: this.asRestrictions && !isNested,
        name: info.name,
        round: this.round
      }),
      listenerSetter: this.listenerSetter,
      subtitleLangKey: info.description,
      clickable: info.nested ? (e) => {
        if(
          this.round ?
            !findUpAsChild(e.target as HTMLElement, rightContent) && e.target !== rightContent :
            findUpAsChild(e.target as HTMLElement, row.checkboxField.label)
        ) {
          if(row.checkboxField.input.disabled) {
            const checked = row.checkboxField.checked;
            info.nested.forEach((field) => {
              field.checkboxField.checked = !checked;
            });
          } else {
            row.checkboxField.checked = !row.checkboxField.checked;
          }

          return;
        }

        cancelEvent(e);
        row.container.classList.toggle('accordion-toggler-expanded');
        accordion.classList.toggle('is-expanded');
        this.onExpand?.(info as K);
      } : undefined,
      rightContent
    });

    row.container.classList.add('accordion-row');

    if(info.restrictionText) {
      if(!info.nestedTo) {
        const circle = info.checkboxField.label.lastElementChild.firstElementChild;
        circle.classList.add('with-lock');
        circle.append(Icon('premium_lock', 'checkbox-caption-lock'));
      }

      info.checkboxField.input.disabled = true;

      if(!info.nested) attachClickEvent(info.row.container, (e) => {
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

      nestedCounter = info.nestedCounter = document.createElement('b');
      nestedCounter.classList.add('accordion-counter');
      this.setNestedCounter(info);

      row.container.classList.add('accordion-toggler');
      if(this.round) {
        rightContent.append(Icon(this.rightButtonIcon), ' ', nestedCounter, ' ', accordionIcon);
        row.container.classList.add('accordion-toggler-round');
      } else {
        row.title.append(' ', nestedCounter, ' ', accordionIcon);
        row.titleRow.classList.add('with-delimiter');
      }

      // * will control it myself, otherwise on mobiles it will be toggled everytime
      row.checkboxField.input.disabled = true;
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
          if(info.restrictionText) {
            return;
          }

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
        this.onAnyChange?.();
      });
    } else if(this.onAnyChange && !info.nested) {
      this.listenerSetter.add(info.checkboxField.input)('change', () => {
        this.onAnyChange();
      });
    }

    this.onRowCreation?.(row, info as K);

    return {row, nodes};
  }

  protected getNestedCheckedLength(info: CheckboxFieldsField) {
    return info.nested.reduce((acc, v) => acc + +v.checkboxField.checked, 0);
  }

  public setNestedCounter(info: CheckboxFieldsField, count = this.getNestedCheckedLength(info)) {
    info.nestedCounter.textContent = this.round ? '' + info.nested.length : `${count}/${info.nested.length}`;
  }
}
