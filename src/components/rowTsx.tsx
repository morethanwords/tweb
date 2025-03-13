import {children, JSX, Ref} from 'solid-js';
import {Dynamic} from 'solid-js/web';
import setInnerHTML from '../helpers/dom/setInnerHTML';
import classNames from '../helpers/string/classNames';
import {IconTsx} from './iconTsx';
import {Ripple} from './rippleTsx';

type K = string | HTMLElement | DocumentFragment | true;

const setContent = (element: HTMLElement, content: K) => {
  if(content === true) {

  } else if(typeof(content) === 'string') {
    setInnerHTML(element, content);
  } else {
    element.append(content);
  }
};

export type RowMediaSizeType = 'small' | 'medium' | 'big' | 'abitbigger' | 'bigger' | '40';

type ConstructorP<T> = T extends {
  new (...args: any[]): infer U;
} ? U : never;

export default function RowTsx(props: Partial<{
  ref: Ref<HTMLElement>,
  icon: Icon,
  iconClasses: string[],
  subtitle: JSX.Element,
  subtitleRight: JSX.Element,
  radioField: JSX.Element,
  checkboxField: JSX.Element,
  checkboxFieldToggle: JSX.Element,
  title: JSX.Element,
  titleRight: JSX.Element,
  titleRightSecondary: boolean,
  clickable: boolean | JSX.HTMLAttributes<HTMLElement>['onClick'],
  midtitle: JSX.Element,
  havePadding: boolean,
  noRipple: boolean,
  noWrap: boolean,
  disabled: boolean,
  fakeDisabled: boolean,
  color: 'primary' | 'danger',
  media: JSX.Element,
  mediaSize: RowMediaSizeType,
  // buttonRight?: HTMLElement | boolean,
  // buttonRightLangKey: LangPackKey,
  rightContent?: JSX.Element,
  // rightTextContent?: string,
  asLink: boolean,
  // contextMenu: Omit<Parameters<typeof createContextMenu>[0], 'findElement' | 'listenTo' | 'listenerSetter'>,
  asLabel: boolean,
  // checkboxKeys: [LangPackKey, LangPackKey],
  classList: {[key: string]: boolean}
}> = {}) {
  const RowRowPart = (props: {
    class: string,
    part?: JSX.Element
  }) => {
    if(!props.part) {
      return;
    }

    return (
      <div class={classNames('row-' + props.class, noWrap() && 'no-wrap')} dir="auto">
        {props.part}
      </div>
    );
  };

  const RowRow = (props: {
    class: string,
    left?: JSX.Element,
    right?: JSX.Element,
    rightSecondary?: boolean
  }) => {
    const part = <RowRowPart class={props.class} part={props.left} />;
    if(!props.right) {
      return part;
    }

    return (
      <div class={classNames('row-row', `row-${props.class}-row`)}>
        {part}
        <RowRowPart
          class={`${props.class} row-${props.class}-right${props.rightSecondary ? ` row-${props.class}-right-secondary` : ''}`}
          part={props.right}
        />
      </div>
    );
  };

  const noWrap = () => props.noWrap;
  const titleRow = <RowRow class="title" left={props.title} right={props.titleRight || props.checkboxFieldToggle} rightSecondary={props.titleRightSecondary} />;
  const subtitleRow = <RowRow class="subtitle" left={props.subtitle} right={props.subtitleRight} />;

  const rightContent = children(() => props.rightContent); // Prevent recreating the children when accessing props.rightContent

  const isCheckbox = () => !!(props.checkboxField || props.checkboxFieldToggle || props.radioField);
  const isClickable = () => !!(props.clickable || isCheckbox());
  const haveRipple = () => !!(!props.noRipple && isClickable());
  const havePadding = () => !!(
    props.havePadding ||
    props.icon ||
    props.checkboxField ||
    props.radioField ||
    props.media
  );

  const ret = (
    <Dynamic
      ref={props.ref as any}
      component={props.asLink ? 'a' : (props.asLabel || isCheckbox() ? 'label' : 'div')}
      classList={{
        'row': true,
        'no-subtitle': !subtitleRow,
        'no-wrap': props.noWrap,
        'row-with-icon': !!props.icon,
        'row-with-padding': havePadding(),
        [`row-clickable hover-${props.color ? props.color + '-' : ''}effect`]: isClickable(),
        'is-disabled': props.disabled,
        'is-fake-disabled': props.fakeDisabled,
        'row-grid': !!rightContent(),
        'with-midtitle': !!props.midtitle,
        ...(props.classList || {})
      }}
      onClick={typeof(props.clickable) !== 'boolean' && props.clickable}
    >
      {titleRow}
      {props.midtitle && <RowRow class="midtitle" left={props.midtitle} />}
      {subtitleRow}
      {props.icon && (
        <IconTsx icon={props.icon} class={classNames('row-icon', ...(props.iconClasses || []))} />
      )}
      {props.checkboxField || props.radioField}
      {rightContent() && (<div class="row-right">{rightContent()}</div>)}
      {props.media && (<div class={classNames('row-media', props.mediaSize && `row-media-${props.mediaSize}`)}>{props.media}</div>)}
    </Dynamic>
  );

  return (
    <>
      {haveRipple() ? <Ripple>{ret}</Ripple> : ret}
    </>
  );
}
