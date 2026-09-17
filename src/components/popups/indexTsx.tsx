import {createContext, useContext, createSignal, onCleanup, JSX, Show, createRoot, Accessor, createEffect, createRenderEffect, untrack, on, Ref, Setter, onMount} from 'solid-js';
import {createStore} from 'solid-js/store';
import {Portal} from 'solid-js/web';
import classNames from '@helpers/string/classNames';
import {IconTsx} from '@components/iconTsx';
import {FormatterArguments, i18n, LangPackKey} from '@lib/langPack';
import {AppManagers} from '@lib/managers';
import overlayCounter from '@helpers/overlayCounter';
import {getMiddleware, MiddlewareHelper} from '@helpers/middleware';
import findUpClassName from '@helpers/dom/findUpClassName';
import blurActiveElement from '@helpers/dom/blurActiveElement';
import animationIntersector, {AnimationItemGroup} from '@components/animationIntersector';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {addFullScreenListener, getFullScreenElement} from '@helpers/dom/fullScreen';
import {getOverlayRoot} from '@helpers/appWindow';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import MarkupTooltip from '@components/chat/markupTooltip';
import Button from '@components/buttonTsx';
import {putPreloader} from '@components/putPreloader';
import {doubleRaf} from '@helpers/schedulers';
import Scrollable, {ScrollableContextValue} from '@components/scrollable2';
import cancelEvent from '@helpers/dom/cancelEvent';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import isSendShortcutPressed from '@helpers/dom/isSendShortcutPressed';
import noop from '@helpers/noop';

export type PopupButton = {
  text?: HTMLElement | DocumentFragment | Text,
  callback?: (e: MouseEvent) => MaybePromise<boolean | void>,
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
  onClose: () => void,
  onCloseAfterTimeout: () => void,
  isConfirmationNeededOnClose: () => void | boolean | Promise<any>,
  // overlayClosable: boolean,
  confirmShortcutIsSendShortcut: boolean,
  withoutOverlay: boolean,
  btnConfirmOnEnter?: Accessor<HTMLElement>,
  old: boolean
}>;

type PopupKind = 'header' | 'title' | 'body' | 'footer' | 'buttons' | 'closeButton' | 'confirmButton';

export type PopupContextValue = {
  register: (kind: PopupKind, element: JSX.Element) => JSX.Element,
  registerButton: (props: PopupButton, element: JSX.Element) => JSX.Element,
  store: {[key in PopupKind]?: JSX.Element},
  buttons: PopupButton[],
  shown: () => boolean,
  show: () => void,
  /**
   * Note: Will trigger isConfirmationNeededOnClose if was set
   */
  hide: () => void,
  destroy: () => void,
  destroyed: boolean,
  managers: AppManagers,
  middlewareHelper: MiddlewareHelper,
  lateMiddlewareHelper: MiddlewareHelper,
  navigationItem: NavigationItem | undefined,
  // Reactive: the header renders before the scrollable, so its class effect must re-run once
  // the scrollable registers itself.
  scrollableRef: ScrollableContextValue | undefined,
  setScrollableRef: (ref: ScrollableContextValue) => void,
  hasFloatingHeader: boolean,
  setHasFloatingHeader: (value: boolean) => void,
  /** A footer that sits in the flow below the content, so it draws the line against it itself. */
  hasFlowFooter: boolean,
  setHasFlowFooter: (value: boolean) => void,
  /** A row of buttons there instead, which does not shade itself — the scroll draws that line. */
  hasFlowButtons: boolean,
  setHasFlowButtons: (value: boolean) => void,
  withoutOverlay: boolean,
  night: boolean,
  confirmShortcutIsSendShortcut: boolean,
  btnConfirmOnEnter: HTMLElement | undefined,
  setBtnConfirmOnEnter: Setter<HTMLElement>,
  isConfirmationNeededOnClose: PopupOptions['isConfirmationNeededOnClose'],
  closable: boolean,
  element: HTMLElement | undefined,
  /** `.popup-container` — what an imperative helper wants to render into or measure. */
  container: HTMLElement | undefined,
  kind: symbol | undefined,
  old?: boolean
};

type PopupControllerContextValue = {
  dispose: () => void
};

export const PopupContext = createContext<PopupContextValue>();
export const usePopupContext = () => useContext(PopupContext);
const PopupControllerContext = createContext<PopupControllerContextValue>();

const DEFAULT_APPEND_TO = document.body;
// A fullscreen element always wins; otherwise each popup uses the realm it captured at creation
// (see the Portal mount below). Only the fullscreen state is reactive here.
const [fullScreenElement, setFullScreenElement] = createSignal<HTMLElement>(null);

const onFullScreenChange = () => {
  setFullScreenElement((getFullScreenElement() as HTMLElement) || null);
};

addFullScreenListener(DEFAULT_APPEND_TO, onFullScreenChange);

export const useSnitchedPopupContext = () => {
  let context: PopupContextValue;

  return {
    SnitchPopupContext: () => {
      context = useContext(PopupContext);
      return <></>;
    },
    popupContext: () => context
  }
};

const PopupElement = (props: {
  class?: string,
  containerClass?: string,
  containerProps?: JSX.HTMLAttributes<HTMLDivElement>,
  managers?: AppManagers,
  children: JSX.Element,
  show?: boolean,
  kind?: symbol,
  animationGroup?: AnimationItemGroup // the popup's OWN content group - excluded from the on-show pause sweep
} & PopupOptions) => {
  const [shown, setShown] = createSignal(false);
  const [store, setStore] = createStore<PopupContextValue['store']>({});
  const [buttons, setButtons] = createStore<PopupButton[]>([]);
  const [navigationItem, setNavigationItem] = createSignal<NavigationItem | undefined>();
  const [scrollableRef, setScrollableRef] = createSignal<ScrollableContextValue | undefined>();
  const [hasFloatingHeader, setHasFloatingHeader] = createSignal(false);
  const [hasFlowFooter, setHasFlowFooter] = createSignal(false);
  const [hasFlowButtons, setHasFlowButtons] = createSignal(false);
  const controllerContext = useContext(PopupControllerContext);

  const managers = props.managers || PopupElement.MANAGERS;
  // Capture the active overlay root once. A popup opened while the client is popped out must stay in
  // the Document PiP window for its whole life; reading the live root in the Portal mount would yank
  // it to the tab the instant the app moves back.
  const capturedRoot = getOverlayRoot();
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
      // except the popup's own content: with the offscreen worker frame cache its
      // stickers can load and start playing BEFORE this sweep runs - pausing them
      // here would freeze them forever (nothing re-plays until popup close)
      animationIntersector.checkAnimations2(true, props.animationGroup);
    }

    // Add keyboard event listener
    setTimeout(() => {
      const element = popupElement();
      if(!element || !element.classList.contains('active')) return;

      const handleKeydown = (e: KeyboardEvent) => {
        const btnConfirm = value.btnConfirmOnEnter;
        if(!btnConfirm ||
           (btnConfirm as HTMLButtonElement).disabled ||
           PopupElement.POPUPS[PopupElement.POPUPS.length - 1] !== value) {
          return;
        }

        if(confirmShortcutIsSendShortcut ? isSendShortcutPressed(e) : e.key === 'Enter') {
          simulateClickEvent(btnConfirm);
          cancelEvent(e);
        }
      };

      document.body.addEventListener('keydown', handleKeydown);
      middlewareHelper.get().onClean(() => document.body.removeEventListener('keydown', handleKeydown));
    }, 0);
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

    props.onClose?.()

    setHiding(true);
    setDestroyed(true);
    setShown(false);

    setTimeout(() => {
      setHiding(false);
      middlewareHelper.destroy();
      controllerContext.dispose(); // * call it here for the content
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

      props.onCloseAfterTimeout?.();
    }, 250);
  };

  const [destroyed, setDestroyed] = createSignal(false);
  const [hiding, setHiding] = createSignal(false);
  const [popupElement, setPopupElement] = createSignal<HTMLElement>();
  const [containerElement, setContainerElement] = createSignal<HTMLElement>();
  const [btnConfirmOnEnter, setBtnConfirmOnEnter] = createSignal<HTMLElement>();

  if(props.btnConfirmOnEnter) {
    createEffect(() => {
      setBtnConfirmOnEnter(props.btnConfirmOnEnter());
    });
  }

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
    get scrollableRef() { return scrollableRef(); },
    setScrollableRef,
    get hasFloatingHeader() { return hasFloatingHeader(); },
    get hasFlowFooter() { return hasFlowFooter(); },
    setHasFlowFooter,
    get hasFlowButtons() { return hasFlowButtons(); },
    setHasFlowButtons,
    setHasFloatingHeader,
    // get scrollable() { return scrollable(); },
    withoutOverlay,
    night,
    confirmShortcutIsSendShortcut,
    get btnConfirmOnEnter() { return btnConfirmOnEnter(); },
    setBtnConfirmOnEnter: props.btnConfirmOnEnter ? noop as typeof setBtnConfirmOnEnter : setBtnConfirmOnEnter,
    isConfirmationNeededOnClose,
    closable: props.closable || false,
    get element() { return popupElement(); },
    get container() { return containerElement(); },
    kind: props.kind,
    old: props.old
  };

  // Add to popups array
  PopupElement.POPUPS.push(value);
  onCleanup(() => {
    indexOfAndSplice(PopupElement.POPUPS, value);
  });

  if(props.show !== undefined) {
    createEffect(on(() => props.show, (_show) => {
      let callback: () => void;
      if(_show) {
        callback = show;
      } else if(shown()) {
        callback = hide;
      }

      if(callback) {
        doubleRaf().then(callback);
      }
    }));
  } else {
    // Same doubleRaf as the reactive branch above: the open transition only runs if the browser
    // paints the popup in its hidden state BEFORE `active` lands. A `setTimeout(0)` doesn't
    // guarantee that frame — a popup whose content renders fast enough gets `active` within the
    // same frame as its insertion and simply pops into place.
    doubleRaf().then(show);
  }

  // The popup is laid out while it is still hidden, so anything that settles once it is on
  // screen leaves the scroll's idea of where its ends are a couple of pixels stale — and the
  // footer's line against the content with it.
  createEffect(() => {
    const scrollable = scrollableRef();
    if(!shown() || !scrollable) {
      return;
    }

    doubleRaf().then(() => !destroyed() && scrollable.onSizeChange());
  });

  let mouseDownTarget: Element;

  // the container's own ref is the context's, so a caller's ref is called from ours
  const {ref: containerRef, ...containerPropsWithoutRef} = props.containerProps || {};

  return (
    <PopupContext.Provider value={value}>
      <Portal mount={fullScreenElement() || capturedRoot}>
        <div
          ref={setPopupElement}
          class={classNames(
            'popup',
            props.class,
            night && 'night',
            withoutOverlay && 'no-overlay',
            shown() && 'active',
            hiding() && 'hiding',
            props.old && 'old'
          )}
          onMouseDown={(e) => {
            mouseDownTarget = e.target;
          }}
          onClick={/* store.closeButton &&  */((e) => {
            if(
              findUpClassName(e.target, 'popup-container') ||
              !(e.target as HTMLElement).isConnected
            ) {
              return;
            }

            if(props.closable === false) {
              return;
            }

            // Prevent hiding the popup when the click started inside the popup and ended outside
            if(mouseDownTarget && mouseDownTarget !== e.target) return;
            mouseDownTarget = undefined;

            hide();
          })}
        >
          <div
            {...containerPropsWithoutRef}
            ref={(element) => {
              setContainerElement(element);
              (containerRef as (element: HTMLDivElement) => void)?.(element);
            }}
            class={classNames(
              'popup-container z-depth-1',
              props.containerClass,
              props.containerProps?.class
            )}
          >
            {props.children}
          </div>
        </div>
      </Portal>
    </PopupContext.Provider>
  );
};

// Static properties
PopupElement.POPUPS = [] as PopupContextValue[];
PopupElement.MANAGERS = undefined as any;

PopupElement.Header = (props: {
  class?: string,
  children?: JSX.Element,
  floating?: boolean,
  /** For a popup whose content fills the header itself (a Mini App's own chrome). */
  ref?: (element: HTMLDivElement) => void
}) => {
  const context = useContext(PopupContext);

  createRenderEffect(() => context.setHasFloatingHeader(!!props.floating));
  onCleanup(() => context.setHasFloatingHeader(false));

  // A body that can't scroll (or hasn't registered yet) reads as "still at the top": the
  // background and the title stay hidden until the content actually moves under the header.
  const isScrolledToStart = () => context.scrollableRef?.isScrolledToStart ?? true;

  return context.register('header', (
    <div ref={props.ref} class={classNames(
      'popup-header',
      props.class,
      props.floating && 'is-floating',
      props.floating && isScrolledToStart() && 'scrolled-start'
    )}>
      <Show when={props.floating}>
        <div class="popup-header-background" />
      </Show>
      {props.children}
    </div>
  ));
};

PopupElement.Title = (props: {
  children?: JSX.Element,
  title?: boolean | LangPackKey | DocumentFragment | HTMLElement,
  class?: string
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
      <div class={classNames('popup-title', props.class)} dir="auto">
        {titleContent()}
      </div>
    </Show>
  ));
};

PopupElement.CloseButton = (props: {
  canGoBack?: boolean,
  onBackClick?: () => void | false
  class?: string
}) => {
  const context = useContext(PopupContext);

  const handleClick = () => {
    if(props.canGoBack && props.onBackClick) {
      props.onBackClick()
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
        <div class={classNames('animated-close-icon', props.canGoBack && 'state-back')} />
      </Show>
    </button>
  ));
};

PopupElement.Body = (props: {
  children?: JSX.Element,
  class?: string,
  /** Same as the header's — for content that is appended to the body rather than rendered in it. */
  ref?: (element: HTMLDivElement) => void
}) => {
  return useContext(PopupContext).register('body', (
    <div ref={props.ref} class={classNames('popup-body', props.class)}>
      {props.children}
    </div>
  ));
};

/**
 * The popup's scrolling area. Where a flow footer follows it, the scroll's clip box reaches a
 * few pixels into the footer's padding, so a card that ends at the very bottom can still paint
 * its shadow there — see `$popup-scroll-bleed`.
 */
PopupElement.Scrollable = (props: Parameters<typeof Scrollable>[0]) => {
  const context = useContext(PopupContext);

  // The borders belong to the junctions the scroll has to draw itself. Above: a header that
  // stays in place — a floating one fades in its own background instead. Below: a row of
  // buttons, since a footer shades itself while content runs behind its edge, and a border
  // there would land inside its padding.
  const borders = (): Parameters<typeof Scrollable>[0]['withBorders'] => {
    const top = !!context.store.header && !context.hasFloatingHeader;
    const bottom = context.hasFlowButtons;
    return top && bottom ? 'both' : top ? 'top' : bottom ? 'bottom' : undefined;
  };

  return (
    <Scrollable
      {...props}
      // after the spread: a caller passing its own contextRef must not unregister the popup's
      contextRef={(ref) => {
        context.setScrollableRef(ref);
        props.contextRef?.(ref);
      }}
      // the footer reads `scrolled-end` to know whether anything is behind it
      trackEnds={props.trackEnds || context.hasFloatingHeader || context.hasFlowFooter}
      withBorders={props.withBorders ?? borders()}
      class={classNames('popup-scrollable', props.class)}
    >
      {props.children}
    </Scrollable>
  );
};

PopupElement.Footer = (props: {
  children: JSX.Element,
  class?: string,
  floating?: boolean,
  sticky?: boolean
}) => {
  const context = useContext(PopupContext);

  // a footer in the flow is what the scroll hands its bottom edge to; a floating one has the
  // content pass under it instead and stays where it is written
  const inFlow = () => !props.floating && !props.sticky;
  createRenderEffect(() => context.setHasFlowFooter(inFlow()));
  onCleanup(() => context.setHasFlowFooter(false));

  // A scroll that cannot move (or has not registered yet) reads as "already at the end": with
  // nothing running behind the footer it stays clear, and the content's own shadows show through.
  const isScrolledToEnd = () => context.scrollableRef?.isScrolledToEnd ?? true;

  return context.register('footer', (
    <div
      class={classNames(
        'popup-footer popup-footer-abitlarger',
        (props.floating || props.sticky) && 'popup-footer-floating',
        props.sticky && 'popup-footer-sticky',
        inFlow() && 'popup-footer-shaded',
        isScrolledToEnd() && 'scrolled-end',
        props.class
      )}
    >
      {/* {props.floating && <Tabs.MenuGradient className="popup-footer-gradient" color="background" />} */}
      {props.children}
    </div>
  ));
};

/**
 * Spacer for a floating footer: it stands at the end of the scroll so the last of the content
 * clears the footer painted over it. It is one button tall (`--popup-footer-height`) — a footer
 * with more in it than that is taller, and the popup has to reserve the difference itself.
 */
PopupElement.FooterPlaceholder = () => {
  return (
    <div class="popup-footer-placeholder" />
  );
};

PopupElement.FooterButton = (
  props: Omit<Parameters<typeof PopupElement.Button>[0], 'danger'> & {
    color?: 'primary' | 'secondary' | 'danger'/*  | 'transparent' */
  }
) => {
  return (
    <PopupElement.Button
      {...props}
      noDefaultClass
      class={classNames(
        'popup-footer-button',
        'btn-primary',
        props.color === 'danger' && 'btn-primary-transparent danger',
        props.color === 'secondary' && 'btn-transparent primary text-bold',
        // props.color === 'transparent' && 'btn-primary-transparent',
        (!props.color || props.color === 'primary') && 'btn-color-primary',
        props.class
      )}
    />
  );
};

PopupElement.Button = (props: {
  children?: JSX.Element,
  callback?: (e: MouseEvent) => MaybePromise<boolean | void>,
  langKey?: LangPackKey,
  langArgs?: FormatterArguments,
  danger?: boolean,
  cancel?: boolean,
  noRipple?: boolean,
  iconLeft?: Icon,
  iconRight?: Icon,
  class?: string,
  noDefaultClass?: boolean,
  disabled?: boolean,
  ref?: Ref<HTMLButtonElement>,
  confirm?: boolean,
  /** Overlays a spinner on the button while an async `callback` is in flight. */
  preloader?: boolean,
  /** The label to show instead of the button's own while an async `callback` is in flight. */
  pendingLangKey?: LangPackKey
}) => {
  const context = useContext(PopupContext);

  const [disabled, setDisabled] = createSignal(false);
  const [pending, setPending] = createSignal(false);

  const handleClick = async(e: MouseEvent) => {
    if(context.destroyed) return;
    let result = props.callback?.(e);
    if(result !== undefined && result instanceof Promise) {
      setDisabled(true);
      setPending(true);
      try {
        result = await result;
      } catch(err) {
        console.log('popup button error', err);
        result = false;
      }

      // a resolved callback closes the popup, so only the rejected one is worth restoring
      if(result === false) {
        setDisabled(false);
        setPending(false);
      }
    }

    if(result === false) {
      return;
    }

    context.hide();
  };

  onMount(() => {
    createEffect(() => {
      if(props.confirm) {
        context.setBtnConfirmOnEnter(ref);

        onCleanup(() => {
          context.setBtnConfirmOnEnter();
        });
      }
    });

    // the spinner is absolutely positioned over the whole button, so it goes in as a child of its own
    // rather than through `Button`, whose single slot is taken by the label
    createEffect(() => {
      if(!props.preloader || !pending()) {
        return;
      }

      const preloader = putPreloader(ref);
      onCleanup(() => preloader.remove());
    });
  });

  const pendingLangKey = () => pending() ? props.pendingLangKey : undefined;

  let ref: HTMLButtonElement;
  return context.registerButton(props, (
    <Button
      class={classNames(
        !props.noDefaultClass && 'popup-button btn',
        props.noDefaultClass ? undefined : (props.danger ? 'danger' : 'primary'),
        props.class
      )}
      noRipple={props.noRipple}
      onClick={handleClick}
      disabled={props.disabled || disabled()}
      icon={props.iconLeft}
      iconAfter={props.iconRight}
      iconClass={classNames('popup-button-icon', 'inline-icon', props.iconLeft ? 'left' : 'right')}
      text={pendingLangKey() ?? props.langKey}
      textArgs={pendingLangKey() ? undefined : props.langArgs}
      ref={(_ref) => {
        ref = _ref as HTMLButtonElement;
        (props.ref as any)?.(ref);
      }}
    >{props.children}</Button>
  ));
};

PopupElement.Buttons = (props: {
  class?: string
  children?: JSX.Element
}) => {
  const context = useContext(PopupContext);

  // the scroll ends against this row and draws the line itself — the row has no shading of its own
  createRenderEffect(() => context.setHasFlowButtons(true));
  onCleanup(() => context.setHasFlowButtons(false));

  return context.register('buttons', (
    <div class={classNames('popup-buttons', props.class)}>
      {props.children}
    </div>
  ));
};

PopupElement.getPopups = (popupKind: symbol) => {
  return PopupElement.POPUPS.filter((element) => {
    return element.kind === popupKind;
  });
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
      {untrack(callback)}
    </PopupControllerContext.Provider>
  });
}

export default PopupElement;

/*
Пример использования PopupElementTsx:

import PopupElementTsx from '@components/popups/indexTsx';

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
