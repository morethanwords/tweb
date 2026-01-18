import {children, createMemo, JSX, onCleanup, Ref, Show, useContext} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {IconTsx} from '@components/iconTsx';
import RippleElement from '@components/rippleElement';
import createComponentContext, {ComponentContextValue} from '@helpers/solid/createComponentContext';
import createContextMenu from '@helpers/dom/createContextMenu';
import ListenerSetter from '@helpers/listenerSetter';

export type RowMediaSizeType = 'small' | 'medium' | 'big' | 'abitbigger' | 'bigger' | '40';

type Kind = 'title' | 'subtitle' | 'media' | 'midtitle' | 'icon' |
  'rightContent' | 'checkboxField' | 'checkboxFieldToggle' | 'radioField' |
  'media';

type RowContextValue = ComponentContextValue<Kind> & {
  noWrap?: boolean
};

const {
  context: RowContext,
  createValue: createRowValue
} = createComponentContext<RowContextValue, Kind>();

const Row = (props: {children: JSX.Element} & Partial<{
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
  contextMenu: Omit<Parameters<typeof createContextMenu>[0], 'findElement' | 'listenTo' | 'listenerSetter'>,
  // checkboxKeys: [LangPackKey, LangPackKey],
  classList: {[key: string]: boolean},
  class: string
}>) => {
  const value: RowContextValue = {
    ...createRowValue(),
    get noWrap() {
      return props.noWrap;
    }
  };

  const {store} = value;

  const isCheckbox = () => !!(store.checkboxField || store.checkboxFieldToggle || store.radioField);
  const isClickable = () => !!(props.clickable || isCheckbox() || props.contextMenu);
  const haveRipple = () => !!(!props.noRipple && isClickable());
  const havePadding = () => !!(
    props.havePadding ||
    store.icon ||
    store.checkboxField ||
    store.radioField ||
    store.media
  );

  const resolvedChildren = children(() => (
    <RowContext.Provider value={value}>
      {props.children}
    </RowContext.Provider>
  ));

  let openContextMenu: ReturnType<typeof createContextMenu>['open'];
  const ref = createMemo(() => {
    return props.contextMenu ? (container: HTMLElement) => {
      const listenerSetter = new ListenerSetter();
      const {open} = createContextMenu({
        ...props.contextMenu,
        listenTo: container,
        listenerSetter
      });

      openContextMenu = open;

      onCleanup(() => {
        openContextMenu = undefined;
        listenerSetter.removeAll();
      });

      // @ts-ignore
      props.ref?.(container);
    } : props.ref as any;
  });

  return (
    <RippleElement
      ref={ref()}
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
      onClick={
        (typeof(props.clickable) !== 'boolean' && props.clickable) ||
        (props.contextMenu ? openContextMenu : undefined)
      }
      noRipple={!haveRipple()}
    >
      {resolvedChildren()}
      {store.title}
      {store.midtitle}
      {store.subtitle}
      {store.icon}
      {store.checkboxField || store.radioField}
      {store.rightContent}
      {store.media}
    </RippleElement>
  );
};

Row.RowPart = (props: {
  class: string,
  part?: JSX.Element
}) => {
  const resolved = children(() => props.part);
  return (
    <Show when={resolved()}>
      <div
        class={classNames(
          'row-' + props.class,
          useContext(RowContext).noWrap && 'no-wrap'
        )}
        dir="auto"
      >
        {resolved()}
      </div>
    </Show>
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
    <Show when={resolved()} fallback={part}>
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
    </Show>
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
  children?: JSX.Element,
  size: RowMediaSizeType,
  ref?: Ref<HTMLDivElement>,
  class?: string
}) => {
  return useContext(RowContext).register('media', (
    <div
      class={classNames(
        'row-media',
        props.size && `row-media-${props.size}`,
        props.class
      )}
      ref={props.ref}
    >
      {props.children}
    </div>
  ));
};

export default Row;
