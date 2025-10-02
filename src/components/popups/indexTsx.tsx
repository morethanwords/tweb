/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createContext, useContext, createSignal, onCleanup, JSX, Show, children, createRoot, Accessor, createEffect, untrack, on} from 'solid-js';
import {createStore} from 'solid-js/store';
import {Portal} from 'solid-js/web';
import classNames from '../../helpers/string/classNames';
import {IconTsx} from '../iconTsx';
import RippleElement from '../rippleElement';
import {FormatterArguments, i18n, LangPackKey} from '../../lib/langPack';
import {AppManagers} from '../../lib/appManagers/managers';
import overlayCounter from '../../helpers/overlayCounter';
import {getMiddleware, MiddlewareHelper} from '../../helpers/middleware';
import findUpClassName from '../../helpers/dom/findUpClassName';
import blurActiveElement from '../../helpers/dom/blurActiveElement';
import animationIntersector from '../animationIntersector';
import appNavigationController, {NavigationItem} from '../appNavigationController';
import {addFullScreenListener, getFullScreenElement} from '../../helpers/dom/fullScreen';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import MarkupTooltip from '../chat/markupTooltip';
import Button from '../buttonTsx';

export type PopupButton = {
  text?: HTMLElement | DocumentFragment | Text,
  callback?: (e: MouseEvent) => void | MaybePromise<boolean>,
  langKey?: LangPackKey,
  langArgs?: any[],
  isDanger?: boolean,
  isCancel?: boolean,
  element?: HTMLButtonElement,
  noRipple?: boolean,
  iconLeft?: Icon,
  iconRight?: Icon
};

export type PopupOptions = Partial<{
  closable: boolean,
  onBackClick: () => void | false,
  isConfirmationNeededOnClose: () => void | boolean | Promise<any>,
  // overlayClosable: boolean,
  withConfirm: LangPackKey | boolean,
  body: boolean,
  footer: boolean,
  confirmShortcutIsSendShortcut: boolean,
  withoutOverlay: boolean,
  scrollable: boolean,
  buttons: Array<PopupButton>,
  title: boolean | LangPackKey | DocumentFragment | HTMLElement,
  floatingHeader: boolean,
  withFooterConfirm: boolean
}>;

type PopupKind = 'header' | 'title' | 'body' | 'footer' | 'buttons' | 'closeButton' | 'confirmButton';

type PopupContextValue = {
  register: (kind: PopupKind, element: JSX.Element) => JSX.Element,
  registerButton: (props: PopupButton, element: JSX.Element) => JSX.Element,
  store: {[key in PopupKind]?: JSX.Element},
  buttons: PopupButton[],
  shown: () => boolean,
  show: () => void,
  hide: () => void,
  destroy: () => void,
  destroyed: boolean,
  managers: AppManagers,
  middlewareHelper: MiddlewareHelper,
  lateMiddlewareHelper: MiddlewareHelper,
  navigationItem: NavigationItem | undefined,
  // scrollable: Scrollable | undefined,
  withoutOverlay: boolean,
  night: boolean,
  confirmShortcutIsSendShortcut: boolean,
  // btnConfirmOnEnter: HTMLElement | undefined,
  isConfirmationNeededOnClose: PopupOptions['isConfirmationNeededOnClose'],
  closable: boolean,
  withConfirm: LangPackKey | boolean,
  body: boolean,
  footer: boolean,
  title: boolean | LangPackKey | DocumentFragment | HTMLElement,
  element: HTMLElement | undefined
};

type PopupControllerContextValue = {
  dispose: () => void
};

const PopupContext = createContext<PopupContextValue>();
const PopupControllerContext = createContext<PopupControllerContextValue>();

const DEFAULT_APPEND_TO = document.body;
const [appendPopupTo, setAppendPopupTo] = createSignal(DEFAULT_APPEND_TO);

const onFullScreenChange = () => {
  setAppendPopupTo(getFullScreenElement() || DEFAULT_APPEND_TO);
};

addFullScreenListener(DEFAULT_APPEND_TO, onFullScreenChange);

const PopupElement = (props: {
  class?: string,
  containerClass?: string,
  managers?: AppManagers,
  children: JSX.Element,
  show?: boolean
} & PopupOptions) => {
  const [shown, setShown] = createSignal(false);
  const [store, setStore] = createStore<PopupContextValue['store']>({});
  const [buttons, setButtons] = createStore<PopupButton[]>([]);
  const [navigationItem, setNavigationItem] = createSignal<NavigationItem | undefined>();
  const controllerContext = useContext(PopupControllerContext);

  const managers = props.managers || PopupElement.MANAGERS;
  const middlewareHelper = getMiddleware();
  const lateMiddlewareHelper = getMiddleware();
  const withoutOverlay = props.withoutOverlay || false;
  const night = overlayCounter.isDarkOverlayActive;
  const confirmShortcutIsSendShortcut = props.confirmShortcutIsSendShortcut || false;
  const isConfirmationNeededOnClose = props.isConfirmationNeededOnClose;

  const register = (kind: PopupKind, element: JSX.Element) => {
    setStore(kind, element);
    onCleanup(() => setStore(kind, undefined));
    return element;
  };

  const registerButton = (props: PopupButton, element: JSX.Element) => {
    setButtons([...buttons, props]);
    onCleanup(() => setButtons(buttons.filter((b) => b !== props)));
    return element;
  };

  const show = () => {
    if(shown() || destroyed()) return;

    setShown(true);
    const navItem: NavigationItem = {
      type: 'popup',
      onPop: () => {
        if(isConfirmationNeededOnClose) {
          const result = isConfirmationNeededOnClose();
          if(result) {
            Promise.resolve(result).then(() => {
              destroy();
            });
            return false;
          }
        }
        return destroy();
      }
    };
    setNavigationItem(navItem);
    appNavigationController.pushItem(navItem);

    blurActiveElement();

    if(!withoutOverlay) {
      overlayCounter.isOverlayActive = true;
      animationIntersector.checkAnimations2(true);
    }

    // Add keyboard event listener
    // setTimeout(() => {
    //   const element = popupElement();
    //   if(!element || !element.classList.contains('active')) return;

    //   const handleKeydown = (e: KeyboardEvent) => {
    //     const btnConfirm = btnConfirmOnEnter();
    //     if(!btnConfirm ||
    //        (btnConfirm as HTMLButtonElement).disabled ||
    //        PopupElementTsx.POPUPS[PopupElementTsx.POPUPS.length - 1] !== value) {
    //       return;
    //     }

    //     if(confirmShortcutIsSendShortcut ? isSendShortcutPressed(e) : e.key === 'Enter') {
    //       simulateClickEvent(btnConfirm);
    //       cancelEvent(e);
    //     }
    //   };

    //   document.body.addEventListener('keydown', handleKeydown);
    //   onCleanup(() => document.body.removeEventListener('keydown', handleKeydown));
    // }, 0);
  };

  const hide = () => {
    if(destroyed()) return;

    const navItem = navigationItem();
    if(!navItem) {
      destroy();
      return;
    }

    appNavigationController.backByItem(navItem);
  };

  const destroy = () => {
    if(destroyed()) return;

    setHiding(true);
    setDestroyed(true);
    setShown(false);

    setTimeout(() => {
      setHiding(false);
      middlewareHelper.destroy();
      MarkupTooltip.getInstance().hide();

      if(!withoutOverlay) {
        overlayCounter.isOverlayActive = false;
      }

      const navItem = navigationItem();
      if(navItem) {
        appNavigationController.removeItem(navItem);
        setNavigationItem(undefined);
      }

      indexOfAndSplice(PopupElement.POPUPS, value);

      onFullScreenChange();

      lateMiddlewareHelper.destroy();

      if(!withoutOverlay) {
        animationIntersector.checkAnimations2(false);
      }

      controllerContext.dispose();
    }, 250);
  };

  const [destroyed, setDestroyed] = createSignal(false);
  const [hiding, setHiding] = createSignal(false);
  const [popupElement, setPopupElement] = createSignal<HTMLElement>();

  const value: PopupContextValue = {
    register,
    registerButton,
    store,
    buttons,
    shown,
    show,
    hide,
    destroy,
    get destroyed() { return destroyed(); },
    managers,
    middlewareHelper,
    lateMiddlewareHelper,
    get navigationItem() { return navigationItem(); },
    // get scrollable() { return scrollable(); },
    withoutOverlay,
    night,
    confirmShortcutIsSendShortcut,
    // get btnConfirmOnEnter() { return btnConfirmOnEnter(); },
    isConfirmationNeededOnClose,
    closable: props.closable || false,
    withConfirm: props.withConfirm || false,
    body: props.body || false,
    footer: props.footer || false,
    title: props.title || false,
    get element() { return popupElement(); }
  };

  // Add to popups array
  PopupElement.POPUPS.push(value);
  onCleanup(() => {
    indexOfAndSplice(PopupElement.POPUPS, value);
  });

  if(props.show !== undefined) {
    createEffect(on(() => props.show, (_show) => {
      if(_show) {
        show();
      } else if(shown()) {
        hide();
      }
    }));
  } else {
    setTimeout(() => {
      show();
    }, 0);
  }

  return (
    <PopupContext.Provider value={value}>
      <Portal mount={appendPopupTo()}>
        <div
          ref={setPopupElement}
          class={classNames(
            'popup',
            props.class,
            night && 'night',
            withoutOverlay && 'no-overlay',
            shown() && 'active',
            hiding() && 'hiding'
          )}
          onClick={/* store.closeButton &&  */((e) => {
            if(findUpClassName(e.target, 'popup-container') || !(e.target as HTMLElement).isConnected) {
              return;
            }

            hide();
          })}
        >
          <div class={classNames('popup-container z-depth-1', props.containerClass)}>
            {props.children}
          </div>
        </div>
      </Portal>
    </PopupContext.Provider>
  );
};

// Static properties
PopupElement.POPUPS = [] as any[];
PopupElement.MANAGERS = undefined as any;

PopupElement.Header = (props: {
  class?: string,
  children?: JSX.Element
}) => {
  return useContext(PopupContext).register('header', (
    <div class={classNames('popup-header', props.class)}>
      {props.children}
    </div>
  ));
};

PopupElement.Title = (props: {
  children?: JSX.Element,
  title?: boolean | LangPackKey | DocumentFragment | HTMLElement
}) => {
  const context = useContext(PopupContext);
  const titleContent = () => {
    if(props.title) {
      if(typeof(props.title) === 'string') {
        return i18n(props.title);
      } else if(typeof(props.title) !== 'boolean') {
        return props.title;
      }
    }
    return props.children;
  };

  return context.register('title', (
    <Show when={titleContent()}>
      <div class="popup-title">
        {titleContent()}
      </div>
    </Show>
  ));
};

PopupElement.CloseButton = (props: {
  onBackClick?: () => void | false
  class?: string
}) => {
  const context = useContext(PopupContext);
  const [backState, setBackState] = createSignal(false);

  const handleClick = () => {
    if(props.onBackClick && backState()) {
      if(props.onBackClick() !== false) {
        setBackState(false);
      }
    } else {
      context.hide();
    }
  };

  return context.register('closeButton', (
    <button
      class={classNames('btn-icon popup-close', props.class)}
      onClick={handleClick}
    >
      <Show when={props.onBackClick} fallback={<IconTsx icon="close" />}>
        <div class={classNames('animated-close-icon', backState() && 'state-back')} />
      </Show>
    </button>
  ));
};

PopupElement.ConfirmButton = (props: {
  withConfirm?: LangPackKey | boolean
}) => {
  const context = useContext(PopupContext);

  if(!context.withConfirm) return null;

  return context.register('confirmButton', (
    <button class="btn-primary btn-color-primary">
      <Show when={context.withConfirm !== true}>
        {i18n(context.withConfirm as LangPackKey)}
      </Show>
    </button>
  ));
};

PopupElement.Body = (props: {
  children: JSX.Element,
  scrollable?: boolean,
  floatingHeader?: boolean
}) => {
  return useContext(PopupContext).register('body', (
    <div class="popup-body">
      {props.children}
    </div>
  ));
};

PopupElement.Footer = (props: {
  children: JSX.Element,
  class?: string
}) => {
  return useContext(PopupContext).register('footer', (
    <div class={classNames('popup-footer popup-footer-abitlarger', props.class)}>
      {props.children}
    </div>
  ));
};

PopupElement.FooterButton = (props: Parameters<typeof PopupElement.Button>[0] & {secondary?: boolean}) => {
  return (
    <PopupElement.Button
      {...props}
      noDefaultClass
      class={classNames(
        'popup-footer-button',
        'btn-primary',
        props.secondary ? 'btn-transparent primary text-bold' : 'btn-color-primary',
        props.class
      )}
    />
  );
};

PopupElement.Button = (props: {
  children?: JSX.Element,
  callback?: (e: MouseEvent) => void | MaybePromise<boolean>,
  langKey?: LangPackKey,
  langArgs?: FormatterArguments,
  danger?: boolean,
  cancel?: boolean,
  noRipple?: boolean,
  iconLeft?: Icon,
  iconRight?: Icon,
  class?: string,
  noDefaultClass?: boolean
}) => {
  const context = useContext(PopupContext);

  const [disabled, setDisabled] = createSignal(false);

  const handleClick = async(e: MouseEvent) => {
    if(context.destroyed) return;
    let result = props.callback?.(e);
    if(result !== undefined && result instanceof Promise) {
      setDisabled(true);
      try {
        result = await result;
      } catch(err) {
        result = false;
      }

      if(result === false) {
        setDisabled(false);
      }
    }

    if(result === false) {
      return;
    }

    context.hide();
  };

  return context.registerButton(props, (
    <Button
      class={classNames(
        !props.noDefaultClass && 'popup-button btn',
        props.noDefaultClass ? undefined : (props.danger ? 'danger' : 'primary'),
        props.class
      )}
      noRipple={props.noRipple}
      onClick={handleClick}
      disabled={disabled()}
      icon={props.iconLeft}
      iconAfter={props.iconRight}
      iconClass={classNames('popup-button-icon', props.iconLeft ? 'left' : 'right')}
      text={props.langKey}
      textArgs={props.langArgs}
    >{props.children}</Button>
  ));
};

PopupElement.Buttons = (props: {
  children?: JSX.Element
}) => {
  const context = useContext(PopupContext);
  return context.register('buttons', (
    <div class="popup-buttons">
      {props.children}
    </div>
  ));
};

PopupElement.getPopups = <T extends any>(popupConstructor: any) => {
  return PopupElement.POPUPS.filter((element) => element instanceof popupConstructor) as T[];
};

export const addCancelButton = (buttons: PopupButton[]) => {
  const button = buttons.find((b) => b.isCancel);
  if(!button) {
    buttons.push({
      langKey: 'Cancel',
      isCancel: true
    });
  }

  return buttons;
};

export function createPopup(callback: () => JSX.Element) {
  createRoot((dispose) => {
    <PopupControllerContext.Provider value={{dispose}}>
      {callback()}
    </PopupControllerContext.Provider>
  });
}

export default PopupElement;

/*
Пример использования PopupElementTsx:

import PopupElementTsx from './indexTsx';

// Простой попап с заголовком и кнопками (чистый JSX)
<PopupElementTsx
  class="my-popup"
  closable={true}
  overlayClosable={true}
  title="MyPopupTitle"
  body={true}
>
  <PopupElementTsx.CloseButton />
  <PopupElementTsx.Title />
  <PopupElementTsx.Body>
    <div>Содержимое попапа</div>
  </PopupElementTsx.Body>
  <PopupElementTsx.Buttons>
    <PopupElementTsx.Button
      langKey="Cancel"
      isCancel={true}
    />
    <PopupElementTsx.Button
      langKey="OK"
      callback={() => {
        console.log('OK clicked');
        return true; // закрыть попап
      }}
    />
  </PopupElementTsx.Buttons>
</PopupElementTsx>

// Теперь весь попап полностью реактивный без ручных DOM манипуляций!
// - JSX с Portal для монтирования
// - Сигналы для всех состояний (shown, hiding, disabled, backState)
// - Реактивные классы вместо classList манипуляций
// - Автоматическое переключение fullscreen через appendPopupTo сигнал
// - Никаких createElement, dispatchEvent, classList.add/remove
*/
