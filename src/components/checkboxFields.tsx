import cancelEvent from '@helpers/dom/cancelEvent';
import {attachClickEvent} from '@helpers/dom/clickEvent';
import findUpAsChild from '@helpers/dom/findUpAsChild';
import ListenerSetter from '@helpers/listenerSetter';
import type {Middleware} from '@helpers/middleware';
import safeAssign from '@helpers/object/safeAssign';
import {FormatterArguments, i18n, LangPackKey} from '@lib/langPack';
import CheckboxField from '@components/checkboxField';
import CheckboxFieldTsx from '@components/checkboxFieldTsx';
import {IconTsx} from '@components/iconTsx';
import RowTsx from '@components/rowTsx';
import {toastNew} from '@components/toast';
import {Accessor, createRoot, createSignal, Setter} from 'solid-js';
import {unwrapSolidElement} from '@helpers/solid/wrapSolidComponent';

export type CheckboxFieldsRow = {
  container: HTMLElement,
  title?: HTMLElement,
  toggleDisability: (disable?: boolean) => VoidFunction
};

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
  nestedRightButtonIcon?: Icon | false,
  toggleWith?: {checked?: CheckboxFieldsField[], unchecked?: CheckboxFieldsField[]},
  name?: string,
  row?: CheckboxFieldsRow
};

export default class CheckboxFields<K extends CheckboxFieldsField = CheckboxFieldsField> {
  public fields: Array<K>;
  protected listenerSetter: ListenerSetter;
  /** The rows' RENDER lifetime, when the owner has one - see the disposal note in `createField` */
  protected middleware: Middleware;
  protected asRestrictions: boolean;
  protected round: boolean;
  protected onRowCreation: (row: CheckboxFieldsRow, info: K) => void;
  protected rightButtonIcon: Icon;
  protected onAnyChange?: () => void;
  protected onExpand?: (info: K) => void;

  constructor(options: {
    fields: Array<K>,
    listenerSetter: ListenerSetter,
    middleware?: Middleware,
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

    let accordion: HTMLElement;
    let rightContent: HTMLElement;
    let nestedCounter: HTMLElement;
    let expanded: Accessor<boolean>;
    let setExpanded: Setter<boolean>;
    const updateAccordionHeight = () => {
      accordion.style.setProperty('--max-height', accordion.scrollHeight + 'px');
    };
    const setAccordionExpanded = (expanded: boolean) => {
      updateAccordionHeight();
      setExpanded(expanded);
      accordion.classList.toggle('is-expanded', expanded);
      this.onExpand?.(info as K);
    };

    let container: HTMLElement;
    let title: HTMLElement;
    let checkboxField: CheckboxField;
    let disposeRoot: VoidFunction;
    let disabled: Accessor<boolean>;
    let setDisabled: Setter<boolean>;
    let disposed = false;
    const titleContent = info.text ? i18n(info.text, info.textArgs) : undefined;
    const subtitleContent = info.description ? i18n(info.description) : undefined;
    const isToggle = !this.round && !isNested;
    const nestedRightButtonIcon = info.nestedRightButtonIcon === false ?
      undefined :
      info.nestedRightButtonIcon ?? this.rightButtonIcon;
    const onClick = info.nested ? (e: MouseEvent) => {
      if(
        this.round ?
          !findUpAsChild(e.target as HTMLElement, rightContent) && e.target !== rightContent :
          findUpAsChild(e.target as HTMLElement, checkboxField.label)
      ) {
        if(checkboxField.input.disabled) {
          const checked = checkboxField.checked;
          info.nested.forEach((field) => {
            field.checkboxField.checked = !checked;
          });
        } else {
          checkboxField.checked = !checkboxField.checked;
        }

        return;
      }

      cancelEvent(e);

      setAccordionExpanded(!accordion.classList.contains('is-expanded'));
    } : undefined;

    const rowElement = createRoot((dispose) => {
      disposeRoot = dispose;
      [expanded, setExpanded] = createSignal(false);
      [disabled, setDisabled] = createSignal(false);

      const field = (
        <CheckboxFieldTsx
          checked={info.nested ? false : info.checked}
          toggle={this.round ? undefined : !isNested}
          listenerSetter={this.listenerSetter}
          restriction={this.asRestrictions && !isNested}
          name={info.name}
          round={this.round}
          lockIcon={info.restrictionText && !info.nestedTo ? 'premium_lock' : undefined}
          ref={(createdField) => {
            checkboxField = info.checkboxField = createdField;
            createdField.label.classList.add('disable-hover');
          }}
        />
      );

      const element = (
        <RowTsx
          ref={(element) => container = element}
          clickable={onClick}
          disabled={disabled()}
          aria-disabled={disabled()}
          classList={{
            'accordion-row': true,
            'accordion-toggler': !!info.nested,
            'accordion-toggler-round': !!info.nested && !!this.round,
            'accordion-toggler-expanded': expanded()
          }}
        >
          {/* Row.Title adopts an already-registered toggle into its right column. */}
          {isToggle ? (
            <RowTsx.CheckboxFieldToggle>{field}</RowTsx.CheckboxFieldToggle>
          ) : (
            <RowTsx.CheckboxField>{field}</RowTsx.CheckboxField>
          )}
          {(titleContent || (!this.round && info.nested)) && (
            <RowTsx.Title
              ref={(element) => title = element}
              rowClass={!this.round && info.nested ? 'with-delimiter' : undefined}
            >
              {titleContent}
              {!this.round && info.nested && (
                <>
                  {' '}
                  <b ref={(element) => nestedCounter = info.nestedCounter = element} class="accordion-counter" />
                  {' '}
                  <IconTsx icon="down" class="accordion-icon" />
                </>
              )}
            </RowTsx.Title>
          )}
          {subtitleContent && (
            <RowTsx.Subtitle>{subtitleContent}</RowTsx.Subtitle>
          )}
          {this.round && info.nested && (
            <RowTsx.RightContent
              ref={(element) => rightContent = element}
              class="accordion-right-button"
            >
              {nestedRightButtonIcon && (
                <>
                  <IconTsx icon={nestedRightButtonIcon} />
                  {' '}
                </>
              )}
              <b ref={(element) => nestedCounter = info.nestedCounter = element} class="accordion-counter" />
              {' '}
              <IconTsx icon="down" class="accordion-icon" />
            </RowTsx.RightContent>
          )}
        </RowTsx>
      );

      return unwrapSolidElement(element);
    });

    const dispose = () => {
      if(disposed) return;

      disposed = true;
      disposeRoot();
    };
    // same rule as `rowTsxController`: a Solid root follows the render lifetime, so prefer the
    // middleware and fall back to the listenerSetter only when the owner has none
    if(this.middleware) {
      this.middleware.onDestroy(dispose);
    } else {
      this.listenerSetter.addCleanup(dispose);
    }

    const row = info.row = {
      container: rowElement as HTMLElement,
      title,
      toggleDisability: (disable = !disabled()) => {
        setDisabled(disable);
        return () => setDisabled(!disable);
      }
    };

    if(info.restrictionText) {
      info.checkboxField.input.disabled = true;

      if(!info.nested) attachClickEvent(row.container, (e) => {
        toastNew({langPackKey: info.restrictionText});
      }, {listenerSetter: this.listenerSetter});
    }

    const nodes: HTMLElement[] = [row.container];
    if(info.nested) {
      const container = accordion = document.createElement('div');
      container.classList.add('accordion');
      const _info = info;
      info.nested.forEach((info) => {
        info.nestedTo ??= _info;
        container.append(...this.createField(info, true).nodes);
      });
      nodes.push(container);

      this.setNestedCounter(info);

      // * will control it myself, otherwise on mobiles it will be toggled everytime
      checkboxField.input.disabled = true;
      checkboxField.setValueSilently(this.getNestedCheckedLength(info) === info.nested.length);

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
    if(info.setNestedCounter) {
      info.setNestedCounter(count);
      return;
    }

    info.nestedCounter.textContent = this.round ? '' + info.nested.length : `${count}/${info.nested.length}`;
  }
}
