import {
  children,
  createRenderEffect,
  JSX,
  onCleanup,
  Ref,
  Show,
  splitProps,
  useContext
} from 'solid-js';
import classNames from '@helpers/string/classNames';
import {IconTsx} from '@components/iconTsx';
import RippleElement from '@components/rippleElement';
import createComponentContext, {ComponentContextValue} from '@helpers/solid/createComponentContext';
import createContextMenu from '@helpers/dom/createContextMenu';
import {hasMouseMovedSinceDown} from '@helpers/dom/clickEvent';
import ListenerSetter from '@helpers/listenerSetter';
import {getRowIconBackgroundImage} from '@helpers/rowIconBackground';
import {attachHotClassName} from '@helpers/solid/classname';
import {
  RADIO_FIELD_RIGHT_CLASS,
  ROW_CHECKBOX_FIELD_CLASS,
  ROW_CHECKBOX_FIELD_TOGGLE_CLASS,
  ROW_RADIO_FIELD_CLASS
} from '@components/rowFieldClasses';

export type RowMediaSizeType = 'small' | 'medium' | 'big' | 'abitbigger' | 'bigger' | '40';

export const createRowTitle = () => {
  const title = document.createElement('div');
  title.classList.add('row-title');
  title.dir = 'auto';
  return title;
};

type Kind = 'title' | 'subtitle' | 'media' | 'midtitle' | 'icon' |
  'rightContent' | 'checkboxField' | 'checkboxFieldToggle' | 'radioField' | 'radioFieldRight';

type RowContextValue = ComponentContextValue<Kind> & {
  noWrap?: boolean,
  /** A toggle sitting in its own right column instead of riding the title row. See `Row.CheckboxFieldToggle` */
  toggleAside?: boolean
};

const {
  context: RowContext,
  createValue: createRowValue
} = createComponentContext<RowContextValue, Kind>();

function registerExternalElement(
  context: RowContextValue,
  kind: Kind,
  element: () => HTMLElement,
  className: () => string
) {
  createRenderEffect(() => {
    const currentElement = element();
    const classes = className().split(' ').filter(Boolean);
    if(!currentElement) {
      return;
    }

    const addedClasses = classes.filter((className) => !currentElement.classList.contains(className));
    currentElement.classList.add(...addedClasses);
    onCleanup(() => currentElement.classList.remove(...addedClasses));
  });

  return context.register(kind, (
    <Show keyed when={element()}>{(currentElement) => currentElement}</Show>
  ));
}

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
  openContextMenuRef: (open?: ReturnType<typeof createContextMenu>['open']) => void,
  // checkboxKeys: [LangPackKey, LangPackKey],
  classList: {[key: string]: boolean},
  class: string,
  style: JSX.CSSProperties | string
}>) => {
  const value: RowContextValue = {
    ...createRowValue(),
    get noWrap() {
      return props.noWrap;
    },
    // with a subtitle underneath, a toggle on the title row would hang above the row's own middle,
    // out of line with the media/icon next to it — give it the right column instead
    get toggleAside() {
      return !!(this.store.checkboxFieldToggle && this.store.subtitle && !this.store.rightContent);
    }
  };

  const {store} = value;

  const isCheckbox = () => !!(
    store.checkboxField || store.checkboxFieldToggle || store.radioField || store.radioFieldRight
  );
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
  const ref = (container: HTMLElement) => {
    const listenerSetter = new ListenerSetter();

    if(props.contextMenu) {
      const {open} = createContextMenu({
        ...props.contextMenu,
        listenTo: container,
        listenerSetter
      });

      openContextMenu = open;
      props.openContextMenuRef?.(open);
    }

    onCleanup(() => {
      openContextMenu = undefined;
      props.openContextMenuRef?.();
      listenerSetter.removeAll();
    });

    if(typeof(props.ref) === 'function') {
      props.ref(container);
    }
  };
  const onClick: JSX.EventHandlerUnion<HTMLElement, MouseEvent> = (event) => {
    const clickable = props.clickable;
    if(typeof(clickable) === 'function') {
      if(!hasMouseMovedSinceDown(event)) {
        clickable(event);
      }
      return;
    }

    openContextMenu?.(event);
  };

  return (
    <RippleElement
      ref={ref}
      component={props.as === 'a' ? 'a' : (props.as === 'label' || isCheckbox() ? 'label' : 'div')}
      role={props.role}
      tabIndex={props.tabIndex}
      aria-checked={props['aria-checked']}
      aria-disabled={props['aria-disabled'] || props.disabled ? true : undefined}
      classList={{
        'row': true,
        'no-subtitle': !store.subtitle,
        'no-wrap': value.noWrap,
        'row-with-icon': !!store.icon,
        'row-with-padding': havePadding(),
        [`row-clickable hover-${props.color ? props.color + '-' : ''}effect`]: isClickable(),
        'is-disabled': props.disabled,
        'is-fake-disabled': props.fakeDisabled,
        'row-grid': !!store.rightContent || value.toggleAside,
        'with-midtitle': !!store.midtitle,
        ...(props.classList || {}),
        [props.class]: !!props.class
      }}
      onClick={typeof(props.clickable) === 'function' || props.contextMenu ? onClick : undefined}
      aria-label={props['aria-label']}
      style={props.style}
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
      <Show when={value.toggleAside}>
        <div class="row-right">{store.checkboxFieldToggle}</div>
      </Show>
      {store.media}
    </RippleElement>
  );
};

Row.RowPart = (props: {
  class: string,
  part?: JSX.Element,
  elementRef?: Ref<HTMLDivElement>
}) => {
  const resolved = children(() => props.part);
  return (
    <Show when={!!props.elementRef || !!resolved()}>
      <div
        ref={(element) => {
          if(typeof(props.elementRef) === 'function') {
            props.elementRef(element);
          }
        }}
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
  rowClass?: string,
  additionalClass?: string,
  rightAdditionalClass?: string,
  left?: JSX.Element,
  right?: JSX.Element,
  rightSecondary?: boolean,
  leftRef?: Ref<HTMLDivElement>,
  rightRef?: Ref<HTMLDivElement>
}) => {
  const part = (
    <Row.RowPart
      elementRef={props.leftRef}
      class={classNames(props.class, props.additionalClass)}
      part={props.left}
    />
  );
  const resolved = children(() => props.right);
  return (
    <Show when={!!props.rightRef || !!resolved()} fallback={part}>
      <div class={classNames('row-row', `row-${props.class}-row`, props.rowClass)}>
        {part}
        <Row.RowPart
          elementRef={props.rightRef}
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
  children?: JSX.Element,
  rowClass?: string,
  class?: string,
  titleRight?: JSX.Element,
  titleRightClass?: string,
  titleRightSecondary?: boolean,
  ref?: Ref<HTMLDivElement>,
  titleRightRef?: (element: HTMLDivElement) => void
}) => {
  const context = useContext(RowContext);
  const explicitRight = children(() => props.titleRight);
  const control = () => context.store.radioFieldRight || (
    context.toggleAside ? undefined : context.store.checkboxFieldToggle
  );
  const right = () => {
    const explicit = explicitRight();
    const currentControl = control();
    return explicit && currentControl ? [explicit, currentControl] : explicit || currentControl;
  };

  return context.register('title', (
    <Row.Row
      class="title"
      rowClass={props.rowClass}
      additionalClass={props.class}
      left={props.children}
      right={right()}
      rightAdditionalClass={classNames(
        props.titleRightClass,
        !!(explicitRight() && control()) && 'row-title-right-with-control'
      )}
      rightSecondary={props.titleRightSecondary}
      leftRef={props.ref}
      rightRef={props.titleRightRef}
    />
  ));
};

Row.Midtitle = (props: {
  children?: JSX.Element,
  ref?: Ref<HTMLDivElement>
}) => {
  return useContext(RowContext).register('midtitle', (
    <Row.Row
      class="midtitle"
      left={props.children}
      leftRef={props.ref}
    />
  ));
};

Row.Subtitle = (props: {
  children?: JSX.Element,
  class?: string,
  subtitleRight?: JSX.Element,
  ref?: Ref<HTMLDivElement>,
  subtitleRightRef?: (element: HTMLDivElement) => void
}) => {
  return useContext(RowContext).register('subtitle', (
    <Row.Row
      class="subtitle"
      additionalClass={props.class}
      left={props.children}
      right={props.subtitleRight}
      leftRef={props.ref}
      rightRef={props.subtitleRightRef}
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

type ExternalRowElementProps = {
  class?: string,
  element: HTMLElement
};

Row.RightContent = (inProps: JSX.HTMLAttributes<HTMLDivElement> | ExternalRowElementProps) => {
  const context = useContext(RowContext);

  if('element' in inProps) {
    return registerExternalElement(
      context,
      'rightContent',
      () => inProps.element,
      () => classNames('row-right', inProps.class)
    );
  }

  const [props, restProps] = splitProps(inProps, ['class']);
  return context.register('rightContent', (
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
  const registeredKind = kind === 'radioField' && resolved.toArray().some((node) => (
    node instanceof HTMLElement && node.classList.contains(RADIO_FIELD_RIGHT_CLASS)
  )) ? 'radioFieldRight' : kind;

  createRenderEffect(() => {
    resolved.toArray().forEach((node) => {
      node instanceof HTMLElement && attachHotClassName(node, ...classes);
    });
  });

  return context.register(registeredKind, resolved());
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
    [ROW_CHECKBOX_FIELD_TOGGLE_CLASS],
    props.children
  );
};

type RowMediaProps = JSX.HTMLAttributes<HTMLDivElement> & {
  children?: JSX.Element,
  size?: RowMediaSizeType,
  class?: string
};

type ExternalRowMediaProps = ExternalRowElementProps & {
  size?: RowMediaSizeType
};

Row.Media = (inProps: RowMediaProps | ExternalRowMediaProps) => {
  const context = useContext(RowContext);
  const classes = () => classNames(
    'row-media',
    inProps.size && `row-media-${inProps.size}`,
    inProps.class
  );

  if('element' in inProps) {
    return registerExternalElement(context, 'media', () => inProps.element, classes);
  }

  const [props, restProps] = splitProps(inProps, ['children', 'size', 'class']);
  return context.register('media', (
    <div
      class={classes()}
      {...restProps}
    >
      {props.children}
    </div>
  ));
};

export default Row;
