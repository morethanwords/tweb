// https://github.com/solidjs-community/solid-transition-group

import {type FlowComponent, type JSX} from 'solid-js';
import {createClassnames, enterTransition, exitTransition} from './common';
import {createSwitchTransition} from '@solid-primitives/transition-group';
import {resolveFirst} from '@solid-primitives/refs';

export type TransitionEvents = {
  /**
   * Function called before the enter transition starts.
   * The {@link element} is not yet rendered.
   */
  onBeforeEnter?: (element: Element) => void;
  /**
   * Function called when the enter transition starts.
   * The {@link element} is rendered to the DOM.
   *
   * Call {@link done} to end the transition - removes the enter classes,
   * and calls {@link TransitionEvents.onAfterEnter}.
   * If the parameter for {@link done} is not provided, it will be called on `transitionend` or `animationend`.
   */
  onEnter?: (element: Element, done: () => void) => void;
  /**
   * Function called after the enter transition ends.
   * The {@link element} is removed from the DOM.
   */
  onAfterEnter?: (element: Element) => void;
  /**
   * Function called before the exit transition starts.
   * The {@link element} is still rendered, exit classes are not yet applied.
   */
  onBeforeExit?: (element: Element) => void;
  /**
   * Function called when the exit transition starts, after the exit classes are applied
   * ({@link TransitionProps.enterToClass} and {@link TransitionProps.exitActiveClass}).
   * The {@link element} is still rendered.
   *
   * Call {@link done} to end the transition - removes exit classes,
   * calls {@link TransitionEvents.onAfterExit} and removes the element from the DOM.
   * If the parameter for {@link done} is not provided, it will be called on `transitionend` or `animationend`.
   */
  onExit?: (element: Element, done: () => void) => void;
  /**
   * Function called after the exit transition ends.
   * The {@link element} is removed from the DOM.
   */
  onAfterExit?: (element: Element) => void;
};

/**
 * Props for the {@link Transition} component.
 */
export type TransitionProps = TransitionEvents & {
  /**
   * Used to automatically generate transition CSS class names.
   * e.g. `name: 'fade'` will auto expand to `.fade-enter`, `.fade-enter-active`, etc.
   * Defaults to `"s"`.
   */
  name?: string;
  /**
   * CSS class applied to the entering element for the entire duration of the enter transition.
   * Defaults to `"s-enter-active"`.
   */
  enterActiveClass?: string;
  /**
   * CSS class applied to the entering element at the start of the enter transition, and removed the frame after.
   * Defaults to `"s-enter"`.
   */
  enterClass?: string;
  /**
   * CSS class applied to the entering element after the enter transition starts.
   * Defaults to `"s-enter-to"`.
   */
  enterToClass?: string;
  /**
   * CSS class applied to the exiting element for the entire duration of the exit transition.
   * Defaults to `"s-exit-active"`.
   */
  exitActiveClass?: string;
  /**
   * CSS class applied to the exiting element at the start of the exit transition, and removed the frame after.
   * Defaults to `"s-exit"`.
   */
  exitClass?: string;
  /**
   * CSS class applied to the exiting element after the exit transition starts.
   * Defaults to `"s-exit-to"`.
   */
  exitToClass?: string;
  /**
   * Whether to apply transition on initial render. Defaults to `false`.
   */
  appear?: boolean;
  /**
   * Controls the timing sequence of leaving/entering transitions.
   * Available modes are `"outin"` and `"inout"`;
   * Defaults to simultaneous.
   */
  mode?: 'inout' | 'outin';
  /**
   * The duration of the transition, in milliseconds.
   * Defaults to `300`.
   */
  duration?: number;
};

const TRANSITION_MODE_MAP = {
  inout: 'in-out',
  outin: 'out-in'
} as const;

/**
 * The `<Transition>` component lets you apply enter and leave animations on element passed to `props.children`.
 *
 * It only supports transitioning a single element at a time.
 *
 * @param props {@link TransitionProps}
 */
export const Transition: FlowComponent<TransitionProps> = (props) => {
  const classnames = createClassnames(props);

  return createSwitchTransition(
    resolveFirst(() => props.children),
    {
      mode: TRANSITION_MODE_MAP[props.mode!],
      appear: props.appear,
      onEnter(el, done) {
        enterTransition(classnames(), props, el, done, props.duration);
      },
      onExit(el, done) {
        exitTransition(classnames(), props, el, done, props.duration);
      }
    }
  ) as unknown as JSX.Element;
};
