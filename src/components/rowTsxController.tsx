import {createRoot, createSignal, Show} from 'solid-js';
import type {default as SidebarSlider, SliderSuperTab} from '@components/slider';
import type {SliderSuperTabEventable, SliderSuperTabEventableConstructable} from '@components/sliderTab';
import Button from '@components/button';
import CheckboxField, {CheckboxFieldOptions} from '@components/checkboxField';
import Icon from '@components/icon';
import Row, {createRowTitle, type RowMediaSizeType} from '@components/rowTsx';
import htmlToDocumentFragment from '@helpers/dom/htmlToDocumentFragment';
import replaceContent from '@helpers/dom/replaceContent';
import ListenerSetter from '@helpers/listenerSetter';
import {i18n, LangPackKey} from '@lib/langPack';
import createContextMenu from '@helpers/dom/createContextMenu';
import type {Middleware} from '@helpers/middleware';

export type {RowMediaSizeType} from '@components/rowTsx';

type RowContent = string | HTMLElement | DocumentFragment | true;

type ConstructorP<T> = T extends {
  new (...args: any[]): infer U;
} ? U : never;

export type RowTsxOptions<T extends SliderSuperTabEventableConstructable = any> = Partial<{
  icon: Icon,
  iconClasses: string[],
  subtitle: RowContent,
  subtitleLangKey: LangPackKey,
  subtitleLangArgs: any[],
  subtitleRight: RowContent,
  checkboxField: CheckboxField,
  checkboxFieldOptions: CheckboxFieldOptions,
  withCheckboxSubtitle: boolean,
  title: RowContent,
  titleLangKey: LangPackKey,
  titleLangArgs: any[],
  titleRight: RowContent,
  titleRightSecondary: RowContent,
  clickable: boolean | ((e: MouseEvent) => void),
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
  middleware: Middleware,
  buttonRight: HTMLElement | boolean,
  buttonRightLangKey: LangPackKey,
  rightContent: HTMLElement,
  rightTextContent: string,
  asLink: boolean,
  contextMenu: Omit<Parameters<typeof createContextMenu>[0], 'findElement' | 'listenTo' | 'listenerSetter'>,
  asLabel: boolean,
  checkboxKeys: [LangPackKey, LangPackKey]
}>;

export type RowTsxController = {
  container: HTMLElement,
  readonly titleRow: HTMLElement,
  readonly titleRight: HTMLElement,
  media: HTMLElement,
  readonly subtitleRow: HTMLElement,
  readonly subtitleRight: HTMLElement,
  checkboxField: CheckboxField,
  freezed: boolean,
  buttonRight: HTMLElement,
  readonly title: HTMLElement,
  readonly subtitle: HTMLElement,
  readonly midtitle: HTMLElement,
  openContextMenu: ReturnType<typeof createContextMenu>['open'],
  dispose: () => void,
  ensureSubtitle: () => HTMLElement,
  ensureMidtitle: () => HTMLElement,
  createTitle: () => HTMLElement,
  createMedia: (size?: RowMediaSizeType) => HTMLElement,
  applyMediaElement: (media: HTMLElement, size?: RowMediaSizeType) => HTMLElement,
  isDisabled: () => boolean,
  toggleDisability: (disable?: boolean) => () => void,
  disableWithPromise: (promise: Promise<any>) => void,
  makeSortable: () => void,
  toggleSorting: (enabled?: boolean) => void
};

const resolveRowContent = (content: RowContent) => {
  return typeof(content) === 'string' ? htmlToDocumentFragment(content) : content;
};

/** Mounts the Solid Row used by the remaining imperative dialog-row controller. */
const mountRowController = <T extends SliderSuperTabEventableConstructable = any>(
  initialOptions: RowTsxOptions<T> = {}
): RowTsxController => {
  const options = {...initialOptions};
  if(options.checkboxFieldOptions) {
    options.checkboxField = new CheckboxField({
      listenerSetter: options.listenerSetter,
      ...options.checkboxFieldOptions
    });
  }

  const checkboxField = options.checkboxField;
  const isToggle = checkboxField?.label.classList.contains('checkbox-field-toggle');
  checkboxField?.label.classList.add('disable-hover');

  let clickable = options.clickable;
  if(options.navigationTab) {
    let getInitArgs = options.navigationTab.getInitArgs;
    if(!getInitArgs) {
      const getArgs = (options.navigationTab.constructor as any as typeof SliderSuperTab).getInitArgs;
      if(getArgs) {
        getInitArgs = () => getArgs();
      }
    }

    let args = options.navigationTab.args ?? getInitArgs?.();
    clickable = async() => {
      if(args instanceof Promise) {
        args = await args;
      }

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

  let rightContent = options.rightContent;
  let buttonRight: HTMLElement;
  if(options.buttonRight || options.buttonRightLangKey) {
    rightContent = buttonRight = options.buttonRight instanceof HTMLElement ?
      options.buttonRight :
      Button('btn-primary btn-color-primary btn-control-small', {text: options.buttonRightLangKey});
  }

  if(options.rightTextContent) {
    rightContent = document.createElement('span');
    rightContent.classList.add('row-title-right-secondary');
    rightContent.textContent = options.rightTextContent;
  }

  const initialSubtitle = options.subtitleLangKey ?
    i18n(options.subtitleLangKey, options.subtitleLangArgs) :
    resolveRowContent(options.subtitle);
  const initialTitle = options.titleLangKey ?
    i18n(options.titleLangKey, options.titleLangArgs) :
    resolveRowContent(options.title);
  const titleRight = resolveRowContent(options.titleRight || options.titleRightSecondary);
  const subtitleRight = resolveRowContent(options.subtitleRight);

  let container: HTMLElement;
  let openContextMenu: RowTsxController['openContextMenu'];
  let freezed = false;
  let currentMedia: HTMLElement;
  const [hasSubtitle, setHasSubtitle] = createSignal(!!initialSubtitle);
  const [hasMidtitle, setHasMidtitle] = createSignal(false);
  const [media, setMedia] = createSignal<{element: HTMLElement, size?: RowMediaSizeType}>();
  const parts: Partial<Record<
    'title' | 'titleRow' | 'titleRight' | 'subtitle' | 'subtitleRow' | 'subtitleRight' | 'midtitle',
    HTMLElement
  >> = {};

  const getPart = (className: string) => container.querySelector(`.${className}`) as HTMLElement;
  const getTitle = () => container.querySelector(
    ':scope > .row-title, :scope > .row-title-row > .row-title:not(.row-title-right)'
  ) as HTMLElement;
  const getSubtitle = () => container.querySelector(
    ':scope > .row-subtitle, :scope > .row-subtitle-row > .row-subtitle:not(.row-subtitle-right)'
  ) as HTMLElement;
  const ensureSubtitle = () => {
    setHasSubtitle(true);
    return parts.subtitle ||= getSubtitle();
  };
  const ensureMidtitle = () => {
    setHasMidtitle(true);
    return parts.midtitle ||= getPart('row-midtitle');
  };
  let rootDispose: () => void;
  let disposed = false;
  const dispose = () => {
    if(disposed) {
      return;
    }

    disposed = true;
    rootDispose?.();
  };

  const controller: RowTsxController = {
    get container() {
      return container;
    },
    get titleRow() {
      return parts.titleRow;
    },
    get titleRight() {
      return parts.titleRight;
    },
    get media() {
      return currentMedia;
    },
    set media(value) {
      currentMedia = value;
    },
    get subtitleRow() {
      return parts.subtitleRow;
    },
    get subtitleRight() {
      return parts.subtitleRight;
    },
    checkboxField,
    get freezed() {
      return freezed;
    },
    set freezed(value) {
      freezed = value;
    },
    buttonRight,
    get title() {
      return parts.title;
    },
    get subtitle() {
      return parts.subtitle;
    },
    get midtitle() {
      return parts.midtitle;
    },
    get openContextMenu() {
      return openContextMenu;
    },
    set openContextMenu(open) {
      openContextMenu = open;
    },
    dispose,
    ensureSubtitle,
    ensureMidtitle,
    createTitle: createRowTitle,
    createMedia: (size?: RowMediaSizeType) => {
      return controller.applyMediaElement(document.createElement('div'), size);
    },
    applyMediaElement: (element: HTMLElement, size?: RowMediaSizeType) => {
      currentMedia = element;
      setMedia({element, size});
      return element;
    },
    isDisabled: () => container.classList.contains('is-disabled'),
    toggleDisability: (disable = !container.classList.contains('is-disabled')) => {
      container.classList.toggle('is-disabled', disable);
      return () => controller.toggleDisability(!disable);
    },
    disableWithPromise: (promise: Promise<any>) => {
      const toggle = controller.toggleDisability(true);
      promise.finally(toggle);
    },
    makeSortable: () => {
      container.classList.add('row-sortable');
      container.append(Icon('menu', 'row-sortable-icon'));
    },
    toggleSorting: (enabled?: boolean) => {
      container.classList.toggle('cant-sort', !enabled);
    }
  };

  const clickHandler = clickable;
  createRoot((_dispose) => {
    rootDispose = _dispose;
    return (
      <Row
      ref={(element) => container = element}
      clickable={typeof(clickHandler) === 'function' ? (event) => {
        if(!controller.freezed) {
          clickHandler(event);
        }
      } : clickHandler}
      havePadding={options.havePadding}
      noRipple={options.noRipple}
      noWrap={options.noWrap}
      as={options.asLink ? 'a' : (options.asLabel ? 'label' : undefined)}
      contextMenu={options.contextMenu}
      openContextMenuRef={(open) => openContextMenu = open}
    >
      <Show when={hasMidtitle()}>
        <Row.Midtitle>{true}</Row.Midtitle>
      </Show>
      <Show when={hasSubtitle()}>
        <Row.Subtitle subtitleRight={subtitleRight}>{initialSubtitle || true}</Row.Subtitle>
      </Show>
      <Show when={options.icon}>
        <Row.Icon icon={options.icon} class={(options.iconClasses || []).join(' ')} />
      </Show>
      <Show when={checkboxField && !isToggle}>
        <Row.CheckboxField>{checkboxField.label}</Row.CheckboxField>
      </Show>
      <Show when={checkboxField && isToggle}>
        <Row.CheckboxFieldToggle>{checkboxField.label}</Row.CheckboxFieldToggle>
      </Show>
      <Show when={rightContent}>
        <Row.RightContent element={rightContent} />
      </Show>
      <Show keyed when={media()}>{(value) => (
        <Row.Media element={value.element} size={value.size} />
      )}</Show>
      <Show when={initialTitle || titleRight || isToggle}>
        <Row.Title
          titleRight={titleRight}
          titleRightSecondary={!!options.titleRightSecondary}
        >
          {initialTitle}
        </Row.Title>
      </Show>
      </Row>
    );
  });

  parts.title = getTitle();
  parts.titleRow = getPart('row-title-row');
  parts.titleRight = getPart('row-title-right');
  parts.subtitle = getSubtitle();
  parts.subtitleRow = getPart('row-subtitle-row');
  parts.subtitleRight = getPart('row-subtitle-right');
  parts.midtitle = getPart('row-midtitle');

  const removeListenerCleanup = options.listenerSetter?.addCleanup(dispose);
  options.middleware?.onDestroy(() => {
    removeListenerCleanup?.();
    dispose();
  });

  if(options.withCheckboxSubtitle && checkboxField && !isToggle) {
    const [enabledKey, disabledKey] = options.checkboxKeys || ['Checkbox.Enabled', 'Checkbox.Disabled'];
    const onChange = () => {
      replaceContent(controller.ensureSubtitle(), i18n(checkboxField.checked ? enabledKey : disabledKey));
    };

    if(options.listenerSetter) options.listenerSetter.add(checkboxField.input)('change', onChange);
    else checkboxField.input.addEventListener('change', onChange);
  }

  return controller;
};

const ROW_CONTROLLER = Symbol.for('tweb.row-controller');
const prototypesWithRowController = new WeakSet<object>();

const installRowControllerDescriptors = (target: object, controller: RowTsxController) => {
  const prototype = Object.getPrototypeOf(target);
  const descriptorTarget = prototype && prototype !== Object.prototype ? prototype : target;
  if(prototypesWithRowController.has(descriptorTarget)) {
    return;
  }

  const descriptors: PropertyDescriptorMap = {};
  for(const key of Reflect.ownKeys(controller)) {
    const source = Object.getOwnPropertyDescriptor(controller, key);
    const writable = source.set || ('writable' in source && source.writable);
    descriptors[key as any] = {
      configurable: true,
      get(this: object) {
        return (this as any)[ROW_CONTROLLER][key];
      },
      set: writable ? function(this: object, value: unknown) {
        (this as any)[ROW_CONTROLLER][key] = value;
      } : undefined
    };
  }

  Object.defineProperties(descriptorTarget, descriptors);
  prototypesWithRowController.add(descriptorTarget);
};

export const attachRowController = <T extends object>(
  target: T,
  options: RowTsxOptions = {}
): T & RowTsxController => {
  const controller = mountRowController(options);
  Object.defineProperty(target, ROW_CONTROLLER, {value: controller});
  installRowControllerDescriptors(target, controller);
  return target as T & RowTsxController;
};
