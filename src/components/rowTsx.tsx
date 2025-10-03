import {children, JSX, Ref, createContext, useContext, onCleanup} from 'solid-js';
import {createStore} from 'solid-js/store';
import classNames from '../helpers/string/classNames';
import {IconTsx} from './iconTsx';
import RippleElement from './rippleElement';

export type RowMediaSizeType = 'small' | 'medium' | 'big' | 'abitbigger' | 'bigger' | '40';

type Kind = 'title' | 'subtitle' | 'media' | 'midtitle' | 'icon' |
  'rightContent' | 'checkboxField' | 'checkboxFieldToggle' | 'radioField' |
  'media';

type RowContextValue = {
  register: (kind: Kind, element: JSX.Element) => JSX.Element,
  store: {[key in Kind]?: JSX.Element},
  noWrap?: boolean
};

const RowContext = createContext<RowContextValue>();

const Row = (props: Partial<{
  ref: Ref<HTMLElement>,
  clickable: boolean | JSX.HTMLAttributes<HTMLElement>['onClick'],
  havePadding: boolean,
  noRipple: boolean,
  noWrap: boolean,
  disabled: boolean,
  fakeDisabled: boolean,
  color: 'primary' | 'danger',
  // buttonRight?: HTMLElement | boolean,
  // buttonRightLangKey: LangPackKey,
  // rightTextContent?: string,
  as: 'a' | 'label' | 'div',
  // contextMenu: Omit<Parameters<typeof createContextMenu>[0], 'findElement' | 'listenTo' | 'listenerSetter'>,
  // checkboxKeys: [LangPackKey, LangPackKey],
  classList: {[key: string]: boolean},
  class: string,
  children: JSX.Element
}> = {}) => {
  const [store, setStore] = createStore<RowContextValue['store']>({});
  const register = (kind: Kind, element: JSX.Element) => {
    setStore(kind, element);
    onCleanup(() => setStore(kind, undefined));
    return element;
  };

  const isCheckbox = () => !!(store.checkboxField || store.checkboxFieldToggle || store.radioField);
  const isClickable = () => !!(props.clickable || isCheckbox());
  const haveRipple = () => !!(!props.noRipple && isClickable());
  const havePadding = () => !!(
    props.havePadding ||
    store.icon ||
    store.checkboxField ||
    store.radioField ||
    store.media
  );

  const value: RowContextValue = {
    register,
    store,
    get noWrap() {
      return props.noWrap;
    }
  };

  return (
    <RowContext.Provider value={value}>
      {props.children && undefined}
      <RippleElement
        ref={props.ref as any}
        component={props.as === 'a' ? 'a' : (props.as === 'label' || isCheckbox() ? 'label' : 'div')}
        classList={{
          'row': true,
          'no-subtitle': !store.subtitle,
          'no-wrap': value.noWrap,
          'row-with-icon': !!store.icon,
          'row-with-padding': havePadding(),
          [`row-clickable hover-${props.color ? props.color + '-' : ''}effect`]: isClickable(),
          'is-disabled': props.disabled,
          'is-fake-disabled': props.fakeDisabled,
          'row-grid': !!store.rightContent,
          'with-midtitle': !!store.midtitle,
          ...(props.classList || {}),
          [props.class]: !!props.class
        }}
        onClick={typeof(props.clickable) !== 'boolean' && props.clickable}
        noRipple={!haveRipple()}
      >
        {store.title}
        {store.midtitle}
        {store.subtitle}
        {store.icon}
        {store.checkboxField || store.radioField}
        {store.rightContent}
        {store.media}
      </RippleElement>
    </RowContext.Provider>
  );
};

Row.RowPart = (props: {
  class: string,
  part?: JSX.Element
}) => {
  const resolved = children(() => props.part);
  return (
    <>
      {resolved() && (
        <div
          class={classNames(
            'row-' + props.class,
            useContext(RowContext).noWrap && 'no-wrap'
          )}
          dir="auto"
        >
          {resolved()}
        </div>
      )}
    </>
  );
};

Row.Row = (props: {
  class: string,
  additionalClass?: string,
  left?: JSX.Element,
  right?: JSX.Element,
  rightSecondary?: boolean
}) => {
  const part = <Row.RowPart class={classNames(props.class, props.additionalClass)} part={props.left} />;
  const resolved = children(() => props.right);
  return (
    <>
      {resolved() && (
        <div class={classNames('row-row', `row-${props.class}-row`)}>
          {part}
          <Row.RowPart
            class={classNames(
              props.class,
              props.additionalClass,
              `row-${props.class}-right${props.rightSecondary ? ` row-${props.class}-right-secondary` : ''}`
            )}
            part={resolved()}
          />
        </div>
      )}
      {!resolved() && part}
    </>
  );
};

Row.Title = (props: {
  children: JSX.Element,
  class?: string,
  titleRight?: JSX.Element,
  titleRightSecondary?: boolean
}) => {
  const context = useContext(RowContext);
  return context.register('title', (
    <Row.Row
      class="title"
      additionalClass={props.class}
      left={props.children}
      right={props.titleRight || context.store.checkboxFieldToggle}
      rightSecondary={props.titleRightSecondary}
    />
  ));
};

Row.Midtitle = (props: {
  children: JSX.Element
}) => {
  return useContext(RowContext).register('midtitle', (
    <Row.Row
      class="midtitle"
      left={props.children}
    />
  ));
};

Row.Subtitle = (props: {
  children: JSX.Element,
  class?: string,
  subtitleRight?: JSX.Element
}) => {
  return useContext(RowContext).register('subtitle', (
    <Row.Row
      class="subtitle"
      additionalClass={props.class}
      left={props.children}
      right={props.subtitleRight}
    />
  ));
};

Row.Icon = (props: {
  icon: Icon,
  class?: string
}) => {
  return useContext(RowContext).register('icon', (
    <IconTsx icon={props.icon} class={classNames('row-icon', props.class)} />
  ));
};

Row.RightContent = (props: {
  children: JSX.Element
}) => {
  return useContext(RowContext).register('rightContent', (
    <div class="row-right">{props.children}</div>
  ));
};

Row.CheckboxField = (props: {
  children: JSX.Element
}) => {
  return useContext(RowContext).register('checkboxField', props.children);
};

Row.RadioField = (props: {
  children: JSX.Element
}) => {
  return useContext(RowContext).register('radioField', props.children);
};

Row.CheckboxFieldToggle = (props: {
  children: JSX.Element
}) => {
  return useContext(RowContext).register('checkboxFieldToggle', props.children);
};

Row.Media = (props: {
  children: JSX.Element,
  mediaSize: RowMediaSizeType
}) => {
  return useContext(RowContext).register('media', (
    <div class={classNames('row-media', props.mediaSize && `row-media-${props.mediaSize}`)}>{props.children}</div>
  ));
};

export default Row;
