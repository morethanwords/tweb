/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Accessor, createContext, createEffect, createSignal, For, JSX, on, onCleanup, useContext} from 'solid-js';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import {requestWalletFrame} from '@components/wallet/frameLoop';
import liteMode from '@helpers/liteMode';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';
import Modes from '@config/modes';

/**
 * The screens inside the wallet window. A new one slides in from the inline end (the right, or the left in a
 * right-to-left layout) while the previous one moves a third towards the start; back is the reverse, and the
 * window's height travels with them. With reduced animations the screens cross-fade instead, the height still
 * following; with none they swap at once. A screen under the top one stays mounted (the main screen keeps its card),
 * only hidden. A screen may guard its leaving (`guardLeave`): back, Escape and closing the window ask it first.
 */

const DURATION = 360;
const EASING = 'cubic-bezier(0.22, 0.9, 0.3, 1)';
/** the cross-fade of reduced animations: the screen coming in takes this long, the one leaving a little less */
const FADE_DURATION = 200;
const FADE_OUT_DURATION = 150;
/** the longest a screen may hold its entrance for its data (`holdEntrance`) */
const HOLD_MAX = 1500;

export type WalletScreenEntry<Name extends string = string> = {
  id: number,
  name: Name,
  params?: any
};

type Running = {
  from: HTMLElement,
  to: HTMLElement,
  animations: Animation[],
  timeout: number,
  done: () => void
};

export type WalletRouter<Name extends string = string> = ReturnType<typeof createWalletRouter<Name>>;

/**
 * What leaving a screen waits for: nothing (it goes at once), or a question — it goes once that resolves, and stays
 * when it rejects
 */
export type WalletLeaveGuard = () => Promise<unknown> | void;

/** the id of the screen entry a component renders in */
const WalletScreenContext = createContext<number>();

/**
 * `above` opens the window straight on a screen over the first one, with no slide: the back step still leads
 * to the first screen. `prepare` loads what a screen needs before it is rendered (its lazy code): a screen measured
 * before it has its content would slide in at the wrong height. `shown` is the window's own: the screens' back
 * steps go above the window's, so they wait for it to show, and the window closing ends the router.
 */
export function createWalletRouter<Name extends string>(
  initial: Name,
  above?: {name: Name, params?: any},
  prepare?: (name: Name) => Promise<unknown> | void,
  shown?: Accessor<boolean>
) {
  let lastId = 0;
  const initialStack: WalletScreenEntry<Name>[] = [{id: ++lastId, name: initial}];
  if(above && above.name !== initial) {
    initialStack.push({id: ++lastId, name: above.name, params: above.params});
  }

  const [stack, setStack] = createSignal<WalletScreenEntry<Name>[]>(initialStack);
  // * the stack plus a screen that is leaving and still animates out
  const [rendered, setRendered] = createSignal<WalletScreenEntry<Name>[]>(stack());
  const [running, setRunning] = createSignal(false);
  const elements: Map<number, HTMLElement> = new Map();
  const navigationItems: Map<number, NavigationItem> = new Map();
  const leaveGuards: Map<number, WalletLeaveGuard> = new Map();
  const entranceHolds: Map<number, Promise<unknown>[]> = new Map();
  // * one question at a time
  let asking = false;
  let root: HTMLElement;
  let current: Running;
  // * the window closed or the router is gone: what was still loading or waiting goes nowhere
  let alive = true;
  // * the window's own navigation item is there: the screens' ones may go above it
  let navigationReady = !shown || shown();

  const current_ = () => stack()[stack().length - 1];

  const settle = () => {
    const r = current;
    if(!r) {
      return;
    }

    current = undefined;
    clearTimeout(r.timeout);
    r.animations.forEach((animation) => animation.cancel());
    [r.from, r.to].forEach((element) => {
      element.classList.remove('is-moving');
      element.style.zIndex = '';
    });
    r.done();
    setRunning(false);
  };

  const slide = (from: HTMLElement, to: HTMLElement, direction: 1 | -1, done: () => void) => {
    settle();
    if(!from || !to || !root || !liteMode.isAvailable('animations')) {
      if(from) from.hidden = true;
      if(to) to.hidden = false;
      done();
      return;
    }

    const startHeight = root.offsetHeight;
    to.hidden = false;
    from.classList.add('is-moving');
    const endHeight = to.offsetHeight;
    to.classList.add('is-moving');
    from.style.zIndex = direction > 0 ? '0' : '1';
    to.style.zIndex = direction > 0 ? '1' : '0';

    const motion = liteMode.isAvailable('motion');
    const duration = motion ? DURATION : FADE_DURATION;
    const options: KeyframeAnimationOptions = {duration, easing: motion ? EASING : 'ease-out', fill: 'both'};
    let animations: Animation[];
    if(motion) {
      // * forward comes from the inline end and pushes the old screen towards the start: mirrored right to left
      const reflect = isDocumentRTL(root.ownerDocument) ? -1 : 1;
      const end = `translateX(${100 * reflect}%)`, start = `translateX(${-30 * reflect}%)`;
      const incoming = direction > 0 ?
        [{transform: end}, {transform: 'translateX(0)'}] :
        [{transform: start}, {transform: 'translateX(0)'}];
      const outgoing = direction > 0 ?
        [{transform: 'translateX(0)'}, {transform: start}] :
        [{transform: 'translateX(0)'}, {transform: end}];
      animations = [to.animate(incoming, options), from.animate(outgoing, options)];
    } else {
      // * reduced: nothing travels, the screens cross-fade where they stand
      animations = [
        to.animate([{opacity: 0}, {opacity: 1}], options),
        from.animate([{opacity: 1}, {opacity: 0}], {...options, duration: FADE_OUT_DURATION})
      ];
    }

    // * the window's height follows the screens either way
    animations.push(root.animate([{height: `${startHeight}px`}, {height: `${endHeight}px`}], options));

    setRunning(true);
    current = {
      from,
      to,
      animations,
      // * the end comes by the clock, not by the animations' promises: those may never settle in a hidden tab
      timeout: window.setTimeout(() => settle(), duration + 20),
      done: () => {
        from.hidden = true;
        done();
      }
    };
  };

  /**
   * Escape or the browser's back: the top screen goes. One whose guard asks keeps its item until the answer.
   */
  const popByNavigation = (entry: WalletScreenEntry<Name>) => () => {
    if(pop(undefined, true) === false) {
      return false;
    }

    navigationItems.delete(entry.id);
  };

  const pushNavigation = (entry: WalletScreenEntry<Name>) => {
    if(!alive) return;
    const item: NavigationItem = {
      type: 'popup',
      noBlurOnPop: Modes.a11y,
      onPop: popByNavigation(entry)
    };

    navigationItems.set(entry.id, item);
    if(navigationReady) appNavigationController.pushItem(item);
  };

  const dropNavigation = (entry: WalletScreenEntry<Name>) => {
    const item = navigationItems.get(entry.id);
    if(item) {
      navigationItems.delete(entry.id);
      appNavigationController.removeItem(item);
    }
  };

  // * with the keyboard layer, the screen that comes in takes the focus, the way a dialog does — unless it took it
  // * itself while it came in (the amount's field, on its first frame)
  const focusScreen = (entry: WalletScreenEntry<Name>) => {
    if(!Modes.a11y) return;
    const element = elements.get(entry.id);
    if(element?.contains(element.ownerDocument.activeElement)) return;
    const target = element?.querySelector<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])');
    target?.focus({preventScroll: true});
  };

  /**
   * Shows a rendered entry once it is ready: its element exists (a lazy screen may take a frame) and what it holds
   * its entrance for has come (see `holdEntrance`). `instant` swaps the screens without a slide.
   */
  const enter = (from: WalletScreenEntry<Name>, entry: WalletScreenEntry<Name>, instant?: boolean) => {
    return new Promise<void>((resolve) => {
      const run = async(attempt: number) => {
        if(alive && !elements.get(entry.id) && attempt < 10) {
          requestWalletFrame(() => run(attempt + 1));
          return;
        }

        const holds = entranceHolds.get(entry.id);
        entranceHolds.delete(entry.id);
        if(alive && holds?.length) {
          await Promise.race([Promise.allSettled(holds), new Promise((resolve) => setTimeout(resolve, HOLD_MAX))]);
        }

        // * gone back meanwhile, or the window closed: the entry left without having come in
        if(!alive || !stack().includes(entry)) {
          resolve();
          return;
        }

        const fromElement = elements.get(from.id), toElement = elements.get(entry.id);
        if(instant) {
          settle();
          if(fromElement) fromElement.hidden = true;
          if(toElement) toElement.hidden = false;
          focusScreen(entry);
        } else {
          slide(fromElement, toElement, 1, () => focusScreen(entry));
        }

        resolve();
      };

      queueMicrotask(() => run(0));
    });
  };

  /**
   * A screen over the current one. Its code is loaded first (`prepare`) and it comes in once ready (see `enter`);
   * the promise settles when it does.
   */
  const push = async(name: Name, params?: any, options: {instant?: boolean} = {}) => {
    const from = current_();
    if(!alive || (from.name === name && !params)) {
      return;
    }

    await prepare?.(name);
    // * moved on while the screen loaded, or the window closed: the push is for a screen that is no longer there
    if(!alive || current_() !== from) {
      return;
    }

    const entry: WalletScreenEntry<Name> = {id: ++lastId, name, params};
    setStack((stack) => [...stack, entry]);
    setRendered((list) => [...list.filter((item) => item.id !== entry.id), entry]);
    pushNavigation(entry);
    return enter(from, entry, options.instant);
  };

  /**
   * What leaving `entries` waits for: nothing, or the first guard's question — `true` leaves, `false` stays.
   * While a question is up, a guarded screen stays without another one.
   */
  const askLeave = (entries: WalletScreenEntry<Name>[]): Promise<boolean> | undefined => {
    for(const entry of entries) {
      const guard = leaveGuards.get(entry.id);
      if(guard && asking) {
        return Promise.resolve(false);
      }

      const question = guard?.();
      if(!question) {
        continue;
      }

      asking = true;
      return question.then(() => true, () => false).finally(() => asking = false);
    }
  };

  /**
   * Back one screen, straight to `name`, or to the index `name` picks of the stack. A guarded screen asks first (see
   * `guardLeave`): then nothing moves yet and `false` comes back.
   */
  const pop = (
    name?: Name | ((list: WalletScreenEntry<Name>[]) => number),
    fromNavigation?: boolean,
    confirmed?: boolean
  ): false | void => {
    const list = stack();
    if(list.length < 2) {
      return;
    }

    let index = list.length - 2;
    if(typeof name === 'function') {
      index = name(list);
      if(index < 0 || index >= list.length - 1) {
        return;
      }
    } else if(name) {
      let found = -1;
      for(let i = list.length - 1; i >= 0; --i) {
        if(list[i].name === name) {
          found = i;
          break;
        }
      }

      if(found === -1 || found === list.length - 1) {
        return;
      }

      index = found;
    }

    const removed = list.slice(index + 1);
    const from = list[list.length - 1];
    const to = list[index];
    const answer = !confirmed && askLeave(removed);
    if(answer) {
      // * the screens may have moved on meanwhile, or the window closed: a yes only leaves the screen it was asked for
      answer.then((leave) => leave && alive && current_() === from && pop(name, false, true));
      return false;
    }

    setStack(list.slice(0, index + 1));
    removed.forEach((entry) => {
      if(fromNavigation && entry === from) return;
      dropNavigation(entry);
    });

    slide(elements.get(from.id), elements.get(to.id), -1, () => {
      setRendered((list) => list.filter((entry) => !removed.includes(entry)));
      focusScreen(to);
    });
  };

  /**
   * Swaps the top screen for another without a back step
   */
  const replace = async(name: Name, params?: any) => {
    const from = current_();
    if(!alive) return;
    await prepare?.(name);
    if(!alive || current_() !== from) {
      return;
    }

    const list = stack();
    const entry: WalletScreenEntry<Name> = {id: ++lastId, name, params};
    setStack([...list.slice(0, -1), entry]);
    setRendered((rendered) => [...rendered, entry]);
    const item = navigationItems.get(from.id);
    if(item) {
      navigationItems.delete(from.id);
      navigationItems.set(entry.id, item);
      item.onPop = popByNavigation(entry);
    }

    queueMicrotask(() => {
      if(!alive) return;
      slide(elements.get(from.id), elements.get(entry.id), 1, () => {
        setRendered((rendered) => rendered.filter((item) => item.id !== from.id));
      });
    });
  };

  /**
   * Leaving the screen this is called in — back, Escape, closing the window — asks `guard` first
   */
  const guardLeave = (guard: WalletLeaveGuard) => {
    const id = useContext(WalletScreenContext);
    leaveGuards.set(id, guard);
    onCleanup(() => {
      if(leaveGuards.get(id) === guard) leaveGuards.delete(id);
    });
  };

  /**
   * The screen this is called in comes in once `promise` settles — its content in place, its height final — or
   * after `HOLD_MAX` at most
   */
  const holdEntrance = (promise: Promise<unknown>) => {
    const id = useContext(WalletScreenContext);
    const holds = entranceHolds.get(id) || [];
    holds.push(promise);
    entranceHolds.set(id, holds);
  };

  /**
   * For a screen's work that ends later (a recipient resolving): whether the screen this is called in is still the
   * top one of a window still open. Call it in the screen's setup, use the function it gives when the work is done.
   */
  const watchCurrent = () => {
    const id = useContext(WalletScreenContext);
    return () => alive && current_().id === id;
  };

  /**
   * For a screen that ends itself while screens it opened may stand above it (its work done elsewhere): back to the
   * screen under it, past those. Call it in the screen's setup, use the function it gives when the screen is done.
   */
  const bindLeave = () => {
    const id = useContext(WalletScreenContext);
    return () => pop((list) => list.findIndex((entry) => entry.id === id) - 1);
  };

  /**
   * Closing the window: what leaving every screen waits for, if anything (see `askLeave`)
   */
  const askClose = () => askLeave(stack().slice().reverse());

  const end = () => {
    alive = false;
    navigationItems.forEach((item) => appNavigationController.removeItem(item));
    navigationItems.clear();
  };

  // * the screen the window opened on above the first one goes back like a pushed one
  initialStack.slice(1).forEach(pushNavigation);

  if(shown) {
    createEffect(on(shown, (isShown) => {
      // * it closes for good (it was shown before): no back step of its screens may outlive it
      if(!isShown) {
        end();
        return;
      }

      // * the window pushes its own item right after it says it shows: the screens' ones go above it, in order
      queueMicrotask(() => {
        if(!alive || navigationReady) return;
        navigationReady = true;
        navigationItems.forEach((item) => appNavigationController.pushItem(item));
      });
    }, {defer: true}));
  }

  onCleanup(() => {
    end();
    settle();
  });

  const Screens = (props: {
    class?: string,
    screenClass?: (entry: WalletScreenEntry<Name>) => string,
    children: (entry: WalletScreenEntry<Name>, isActive: Accessor<boolean>) => JSX.Element
  }) => {
    return (
      <div ref={(element) => root = element} class={props.class}>
        <For each={rendered()}>
          {(entry) => {
            const isActive = () => current_().id === entry.id;
            const isInitial = entry.id === initialStack[initialStack.length - 1].id;
            return (
              <div
                ref={(element) => {
                  elements.set(entry.id, element);
                  onCleanup(() => elements.delete(entry.id));
                }}
                class={props.screenClass?.(entry)}
                hidden={!isInitial}
                data-screen={entry.name}
                inert={!isActive() || undefined}
              >
                <WalletScreenContext.Provider value={entry.id}>
                  {props.children(entry, isActive)}
                </WalletScreenContext.Provider>
              </div>
            );
          }}
        </For>
      </div>
    );
  };

  return {
    stack,
    current: current_,
    running,
    push,
    pop: (name?: Name) => pop(name),
    replace,
    guardLeave,
    holdEntrance,
    watchCurrent,
    bindLeave,
    askClose,
    Screens
  };
}
