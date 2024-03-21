// https://github.com/solidjs-community/solid-transition-group

import {createMemo} from 'solid-js';
import type {TransitionEvents, TransitionProps} from './transition';
// import type {TransitionGroupProps} from './transitionGroup';

export function createClassnames(props: TransitionProps/*  & TransitionGroupProps */) {
  return createMemo(() => {
    const name = props.name || 's';
    return {
      enterActive: (props.enterActiveClass || name + '-enter-active').split(' '),
      enter: (props.enterClass || name + '-enter').split(' '),
      enterTo: (props.enterToClass || name + '-enter-to').split(' '),
      exitActive: (props.exitActiveClass || name + '-exit-active').split(' '),
      exit: (props.exitClass || name + '-exit').split(' '),
      exitTo: (props.exitToClass || name + '-exit-to').split(' ')
      // move: (props.moveClass || name + '-move').split(' ')
    };
  });
}

// https://github.com/solidjs-community/solid-transition-group/issues/12
// for the css transition be triggered properly on firefox
// we need to wait for two frames before changeing classes
export function nextFrame(fn: () => void) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

/**
 * Run an enter transition on an element - common for both Transition and TransitionGroup
 */
export function enterTransition(
  classes: ReturnType<ReturnType<typeof createClassnames>>,
  events: TransitionEvents,
  el: Element,
  done?: VoidFunction,
  duration?: number
) {
  const {onBeforeEnter, onEnter, onAfterEnter} = events;

  let timeout: number;

  // before the elements are added to the DOM
  onBeforeEnter?.(el);

  el.classList.add(...classes.enter);
  el.classList.add(...classes.enterActive);

  // after the microtask the elements will be added to the DOM
  // and onEnter will be called in the same frame
  queueMicrotask(() => {
    // Don't animate element if it's not in the DOM
    // This can happen when elements are changed under Suspense
    if(!el.parentNode) return done?.();

    onEnter?.(el, () => endTransition());
  });

  nextFrame(() => {
    el.classList.remove(...classes.enter);
    el.classList.add(...classes.enterTo);

    if(!onEnter || onEnter.length < 2) {
      el.addEventListener('transitionend', endTransition);
      el.addEventListener('animationend', endTransition);

      if(duration !== undefined) {
        timeout = window.setTimeout(() => endTransition(), duration);
      }
    }
  });

  function endTransition(e?: Event) {
    if(!e || e.target === el) {
      clearTimeout(timeout);
      done?.(); // starts exit transition in "in-out" mode
      el.removeEventListener('transitionend', endTransition);
      el.removeEventListener('animationend', endTransition);
      el.classList.remove(...classes.enterActive);
      el.classList.remove(...classes.enterTo);
      onAfterEnter?.(el);
    }
  }
}

/**
 * Run an exit transition on an element - common for both Transition and TransitionGroup
 */
export function exitTransition(
  classes: ReturnType<ReturnType<typeof createClassnames>>,
  events: TransitionEvents,
  el: Element,
  done?: VoidFunction,
  duration?: number
) {
  const {onBeforeExit, onExit, onAfterExit} = events;

  // Don't animate element if it's not in the DOM
  // This can happen when elements are changed under Suspense
  if(!el.parentNode) return done?.();

  let timeout: number;

  onBeforeExit?.(el);

  el.classList.add(...classes.exit);
  el.classList.add(...classes.exitActive);

  onExit?.(el, () => endTransition());

  nextFrame(() => {
    el.classList.remove(...classes.exit);
    el.classList.add(...classes.exitTo);

    if(!onExit || onExit.length < 2) {
      el.addEventListener('transitionend', endTransition);
      el.addEventListener('animationend', endTransition);

      if(duration !== undefined) {
        timeout = window.setTimeout(() => endTransition(), duration);
      }
    }
  });

  function endTransition(e?: Event) {
    if(!e || e.target === el) {
      // calling done() will remove element from the DOM,
      // but also trigger onChange callback in <TransitionGroup>.
      // Which is why the classes need to removed afterwards,
      // so that removing them won't change el styles when for the move transition
      clearTimeout(timeout);
      done?.();
      el.removeEventListener('transitionend', endTransition);
      el.removeEventListener('animationend', endTransition);
      el.classList.remove(...classes.exitActive);
      el.classList.remove(...classes.exitTo);
      onAfterExit?.(el);
    }
  }
}
