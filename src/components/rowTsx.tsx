import {children, createMemo, createRenderEffect, JSX, onCleanup, Ref, Show, splitProps, useContext} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {IconTsx} from '@components/iconTsx';
import RippleElement from '@components/rippleElement';
import createComponentContext, {ComponentContextValue} from '@helpers/solid/createComponentContext';
import createContextMenu from '@helpers/dom/createContextMenu';
import ListenerSetter from '@helpers/listenerSetter';
import {getRowIconBackgroundImage} from '@helpers/rowIconBackground';
import {attachHotClassName} from '@helpers/solid/classname';
import {ROW_CHECKBOX_FIELD_CLASS, ROW_CHECKBOX_FIELD_TOGGLE_CLASS, ROW_RADIO_FIELD_CLASS} from '@components/rowFieldClasses';

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
  role: JSX.HTMLAttributes<HTMLElement>['role'],
  tabIndex: number,
  'aria-label': string,
  'on:keydown': JSX.HTMLAttributes<HTMLElement>['on:keydown'],
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
  'aria-checked': boolean,
  'aria-disabled': boolean,
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
      role={props.role}
      tabIndex={props.tabIndex}
      aria-checked={props['aria-checked']}
      aria-disabled={props['aria-disabled']}
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
      aria-label={props['aria-label']}
      onKeyDown={!props['on:keydown'] && props.tabIndex !== undefined && props.clickable ? (event: KeyboardEvent) => {
        if(event.key !== 'Enter' && event.key !== ' ') {
          return;
        }

        event.preventDefault();
        (event.currentTarget as HTMLElement).click();
      } : undefined}
      on:keydown={props['on:keydown']}
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
  rightAdditionalClass?: string,
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
            props.rightAdditionalClass,
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
  titleRightClass?: string,
  titleRightSecondary?: boolean
}) => {
  const context = useContext(RowContext);
  return context.register('title', (
    <Row.Row
      class="title"
      additionalClass={props.class}
      left={props.children}
      right={props.titleRight || context.store.checkboxFieldToggle}
      rightAdditionalClass={props.titleRightClass}
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
    <span
      class={classNames(
        'row-icon',
        'row-icon-colored',
        props.class
      )}
      style={{
        'background-image': getRowIconBackgroundImage(props.icon)
      }}
    >
      <IconTsx icon={props.icon} class="row-icon-icon" />
    </span>
  ));
};

Row.RightContent = (inProps: JSX.HTMLAttributes<HTMLDivElement>) => {
  const [props, restProps] = splitProps(inProps, ['class']);
  return useContext(RowContext).register('rightContent', (
    <div class={classNames('row-right', props.class)} {...restProps} />
  ));
};

/**
 * Registers a field AND marks it as the row's own, so `_row.scss` lays out this checkbox and not
 * whatever else happens to sit inside the row. See `rowFieldClasses`.
 */
function registerRowField(kind: Kind, classes: string[], element: JSX.Element) {
  const context = useContext(RowContext);
  const resolved = children(() => element);

  createRenderEffect(() => {
    resolved.toArray().forEach((node) => {
      node instanceof HTMLElement && attachHotClassName(node, ...classes);
    });
  });

  return context.register(kind, resolved());
}

Row.CheckboxField = (props: {
  children: JSX.Element
}) => {
  return registerRowField('checkboxField', [ROW_CHECKBOX_FIELD_CLASS], props.children);
};

Row.RadioField = (props: {
  children: JSX.Element
}) => {
  return registerRowField('radioField', [ROW_RADIO_FIELD_CLASS], props.children);
};

Row.CheckboxFieldToggle = (props: {
  children: JSX.Element
}) => {
  // a toggle is a checkbox too, so the row's checkbox rules go on reaching it
  return registerRowField(
    'checkboxFieldToggle',
    [ROW_CHECKBOX_FIELD_CLASS, ROW_CHECKBOX_FIELD_TOGGLE_CLASS],
    props.children
  );
};

Row.Media = (inProps: JSX.HTMLAttributes<HTMLDivElement> & {
  children?: JSX.Element,
  size?: RowMediaSizeType,
  class?: string
}) => {
  const [props, restProps] = splitProps(inProps, ['children', 'size', 'class']);

  return useContext(RowContext).register('media', (
    <div
      class={classNames(
        'row-media',
        props.size && `row-media-${props.size}`,
        props.class
      )}
      {...restProps}
    >
      {props.children}
    </div>
  ));
};

export default Row;
