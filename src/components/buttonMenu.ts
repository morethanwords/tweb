import flatten from '@helpers/array/flatten';
import contextMenuController from '@helpers/contextMenuController';
import cancelEvent from '@helpers/dom/cancelEvent';
import {AttachClickOptions, attachClickEvent, simulateClickEvent} from '@helpers/dom/clickEvent';
import findUpClassName from '@helpers/dom/findUpClassName';
import setInnerHTML from '@helpers/dom/setInnerHTML';
import ListenerSetter from '@helpers/listenerSetter';
import {_i18n, FormatterArguments, i18n, LangPackKey} from '@lib/langPack';
import CheckboxField from '@components/checkboxField';
import {Chat, Document, User} from '@layer';
import {IS_MOBILE} from '@environment/userAgent';
import ripple from '@components/ripple';
import Icon from '@components/icon';
import RadioForm from '@components/radioForm';
import wrapAttachBotIcon from '@components/wrappers/attachBotIcon';
import {createRoot} from 'solid-js';
import {AvatarNew} from '@components/avatarNew';
import {ActiveAccountNumber} from '@lib/accounts/types';
import {putPreloader} from '@components/putPreloader';

type ButtonMenuItemInner = Omit<Parameters<typeof ButtonMenuSync>[0], 'listenerSetter'>;
let nextButtonMenuLabelId = 0;

type AvatarInfo = {
  accountNumber?: ActiveAccountNumber,
  peerId?: PeerId,
  peer?: Chat.channel | Chat.chat | User.user,
  active?: boolean
};

export type ButtonMenuItemOptions = {
  id?: any;
  icon?: Icon,
  iconElement?: HTMLElement;
  emptyIcon?: boolean,
  iconDoc?: Document.document,
  avatarInfo?: AvatarInfo,
  danger?: boolean,
  new?: boolean,
  className?: string,
  text?: LangPackKey,
  textArgs?: FormatterArguments,
  regularText?: Parameters<typeof setInnerHTML>[1],
  onClick: (e: MouseEvent | TouchEvent) => any,
  checkForClose?: () => boolean,
  element?: HTMLElement,
  textElement?: HTMLElement,
  options?: AttachClickOptions,
  checkboxField?: CheckboxField,
  noCheckboxClickListener?: boolean,
  keepOpen?: boolean,
  separator?: boolean | HTMLElement,
  separatorDown?: boolean,
  multiline?: boolean,
  secondary?: boolean,
  loadPromise?: Promise<any>,
  waitForAnimation?: boolean,
  radioGroup?: string,
  inner?: (() => MaybePromise<ButtonMenuItemInner>) | ButtonMenuItemInner,
  dispose?: () => void,
  onOpen?: () => void,
  onClose?: () => void
  /* , cancelEvent?: true */
};

export type ButtonMenuItemOptionsVerifiable = ButtonMenuItemOptions & {
  verify?: () => boolean | Promise<boolean>
};

export function setButtonMenuItemLoading(
  options: ButtonMenuItemOptions,
  loading: boolean,
  element = options.element
) {
  const iconElement = element?.querySelector('.btn-menu-item-icon:not(.btn-menu-item-icon-right)');
  if(!element || !iconElement) {
    return;
  }

  element.classList.toggle('is-loading', loading);
  const preloader = iconElement.querySelector('.btn-menu-item-preloader');
  if(loading && !preloader) {
    const newPreloader = putPreloader(undefined, true);
    newPreloader.classList.add('btn-menu-item-preloader');
    iconElement.append(newPreloader);
  } else if(!loading) {
    preloader?.remove();
  }
}

export function ButtonMenuItem(options: ButtonMenuItemOptions) {
  if(options.element) return [options.separator as HTMLElement, options.element].filter(Boolean);

  const {
    icon,
    iconDoc,
    iconElement,
    avatarInfo,
    className,
    text,
    onClick,
    checkboxField,
    noCheckboxClickListener,
    emptyIcon
  } = options;
  const el = document.createElement('div');
  const iconSplitted = icon?.split(' ');
  el.className = 'btn-menu-item rp-overflow' +
    (iconSplitted?.length > 1 ? ' ' + iconSplitted.slice(1).join(' ') : '') +
    (className ? ' ' + className : '') +
    (options.danger ? ' danger' : '');

  if(IS_MOBILE) {
    ripple(el);
  }

  if(iconElement) {
    iconElement.classList.add('btn-menu-item-icon');
    el.append(iconElement);
  } else if(iconSplitted) {
    el.append(Icon(iconSplitted[0] as Icon, 'btn-menu-item-icon'));
  } else if(emptyIcon) {
    const iconPlaceholder = document.createElement('span');
    iconPlaceholder.classList.add('btn-menu-item-icon');
    el.append(iconPlaceholder);
  }

  let textElement = options.textElement;
  if(!textElement) {
    textElement = options.textElement = text ? i18n(text, options.textArgs) : document.createElement('span');
    if(options.regularText) {
      setInnerHTML(textElement, options.regularText);
      textElement.dir = '';
    }
  }

  if(iconDoc) {
    const iconElement = document.createElement('span');
    iconElement.classList.add('btn-menu-item-icon');
    el.append(iconElement);

    const isMobile = () => document.documentElement.classList.contains('is-mobile');

    options.loadPromise = wrapAttachBotIcon({
      doc: iconDoc,
      element: iconElement,
      size: 24,
      textColor: () => isMobile() ? 'secondary-text-color' : 'primary-text-color',
      strokeWidth: () => isMobile() ? .625 : .375
    });
  }

  if(avatarInfo) {
    const avatar = createRoot((dispose) => {
      options.dispose = dispose;
      return AvatarNew({
        size: /* avatarInfo.active ? 22 :  */24,
        ...avatarInfo
      });
    });
    avatar.node.classList.add('btn-menu-item-icon', 'is-external', 'btn-menu-item-avatar');
    if(avatarInfo.active) {
      avatar.node.classList.add('active');
    }
    el.append(avatar.node);
  }

  textElement.classList.add('btn-menu-item-text');
  el.append(textElement);

  if(options.new) {
    const badge = document.createElement('span');
    badge.classList.add('btn-menu-item-badge');
    _i18n(badge, 'New');
    el.append(badge);
  }

  const keepOpen = !!checkboxField || !!options.keepOpen;

  // * cancel mobile keyboard close
  onClick && attachClickEvent(el, /* CLICK_EVENT_NAME !== 'click' || keepOpen ? */ /* async */(e) => {
    cancelEvent(e);

    const menu = findUpClassName(e.target, 'btn-menu');
    if(menu && !menu.classList.contains('active')) {
      return;
    }

    // let closed = false;
    // if(!keepOpen && !options.checkForClose) {
    //   closed = true;
    //   contextMenuController.close();
    // }

    // wait for closing animation
    // if(options.waitForAnimation && rootScope.settings.animationsEnabled && !options.checkForClose) {
    //   await pause(125);
    // }

    onClick(e);
    if(options.checkForClose?.() === false) {
      return;
    }

    if(!keepOpen/*  && !closed */) {
      contextMenuController.close();
    }

    if(checkboxField && !noCheckboxClickListener/*  && result !== false */) {
      checkboxField.checked = checkboxField.input.type === 'radio' ? true : !checkboxField.checked;
    }
  }/*  : onClick */, options.options);

  if(checkboxField) {
    textElement.id ||= `btn-menu-item-label-${++nextButtonMenuLabelId}`;
    checkboxField.input.setAttribute('aria-labelledby', textElement.id);
    el.append(checkboxField.label);
    el.classList.add('has-checkbox')
  }

  if(options.separator === true || options.separatorDown) {
    options.separator = document.createElement('hr');
  }

  if(options.secondary) {
    el.classList.add('is-secondary');
    options.multiline = true;
  }

  if(options.multiline) {
    el.classList.add('is-multiline');
  }

  if(options.inner) {
    el.append(Icon('next', 'btn-menu-item-icon', 'btn-menu-item-icon-right'));
    el.classList.add('has-inner');
    (el as any).inner = options.inner;
  }

  const ret: HTMLElement[] = [options.element = el];

  if(options.separator) {
    ret[options.separatorDown ? 'push' : 'unshift'](options.separator as HTMLElement);
  }

  return ret.filter(Boolean);
}

export function ButtonMenuSync({listenerSetter, buttons, radioGroups}: {
  buttons: ButtonMenuItemOptions[],
  radioGroups?: {
    name: string,
    onChange: (value: string, e: Event) => any,
    checked: number // idx
  }[],
  listenerSetter?: ListenerSetter
}) {
  const el: HTMLElement = document.createElement('div');
  el.classList.add('btn-menu');

  if(radioGroups) {
    buttons.forEach((b) => {
      if(!b.radioGroup) {
        return;
      }

      b.checkboxField ??= new CheckboxField();
    });
  }

  if(listenerSetter) {
    buttons.forEach((b) => {
      (b.options ??= {}).listenerSetter = listenerSetter;
    });
  }

  const items = buttons.map(ButtonMenuItem);
  el.append(...flatten(items));

  if(radioGroups) {
    radioGroups.forEach((group) => {
      const elements = buttons.filter((button) => button.radioGroup === group.name);

      const hr = document.createElement('hr');
      elements[0].element.replaceWith(hr);

      const container = RadioForm(elements.map((e, idx) => {
        const input = e.checkboxField.input;
        input.type = 'radio';
        input.name = group.name;
        input.value = '' + +(idx === group.checked);
        input.checked = idx === group.checked;
        return {
          container: e.element,
          input: e.checkboxField.input
        };
      }), group.onChange);

      hr.before(container);
      container.append(hr);
    });
  }

  // ButtonMenu is used for a mix of actions, native checkbox/radio controls,
  // and static rows. Keep the ordinary tab model instead of claiming the
  // composite ARIA menu pattern, which would also require roving focus and
  // arrow-key navigation. Native form controls own their focus; only plain
  // action rows need button semantics and delegated keyboard activation.
  buttons.forEach(({element, onClick, checkboxField}) => {
    if(!onClick || checkboxField || !element.classList.contains('btn-menu-item')) return;

    element.setAttribute('role', 'button');
    element.tabIndex = 0;
  });

  const add = listenerSetter ? listenerSetter.add(el) : el.addEventListener.bind(el);
  add('keydown', (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const item = target.closest<HTMLElement>('.btn-menu-item');
    const button = item && buttons.find(({element}) => element === item);

    const radioInput = button?.checkboxField?.input;
    const radioStep = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 :
      (e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0);
    if(
      target === radioInput &&
      radioInput.type === 'radio' &&
      radioStep &&
      button.radioGroup &&
      button.onClick
    ) {
      const group = buttons.filter((candidate) =>
        candidate.radioGroup === button.radioGroup &&
        candidate.checkboxField?.input.type === 'radio' &&
        candidate.checkboxField.input.name === radioInput.name &&
        candidate.onClick
      );
      const index = group.indexOf(button);
      const next = group[(index + radioStep + group.length) % group.length];
      if(next && next !== button) {
        cancelEvent(e);
        next.checkboxField.input.focus();
        simulateClickEvent(next.element);
      }
      return;
    }

    if(e.key !== 'Enter' && e.key !== ' ') return;

    const isActionRow = target === item && !!button?.onClick && !button.checkboxField;
    const isNativeChoice = target === button?.checkboxField?.input && !!button.onClick;
    if(!isActionRow && !isNativeChoice) return;

    cancelEvent(e);
    simulateClickEvent(item);
  });

  return el;
}

export default async function ButtonMenu(options: Parameters<typeof ButtonMenuSync>[0]) {
  const el = ButtonMenuSync(options);
  await Promise.all(options.buttons.map(({loadPromise}) => loadPromise));
  return el;
}
