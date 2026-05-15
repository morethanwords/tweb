// Modified from the original: https://github.com/solidjs-community/solid-transition-group
// Note: the main difference is that here we resolve the first level of children, not recursively every nested element

import { getFirstChild } from '@solid-primitives/refs';
import { createListTransition } from '@vendor/createListTransition';
import { children, createMemo, FlowComponent, JSX } from 'solid-js';
import { createClassnames, enterTransition, exitTransition } from './common';
import { TransitionProps } from "./transition";

/**
 * Props for the {@link TransitionGroup} component.
 */
export type TransitionGroupProps = Omit<TransitionProps, "mode"> & {
  /**
   * CSS class applied to the moving elements for the entire duration of the move transition.
   * Defaults to `"s-move"`.
   */
  moveClass?: string;
};

/**
 * The `<TransitionGroup>` component lets you apply enter and leave animations on elements passed to `props.children`.
 *
 * It supports transitioning multiple elements at a time and moving elements around.
 *
 * Note: Only the first level of children is resolved, not recursively every nested element
 *
 * Make sure to add the 'transition' property through the `moveClass` prop. Otherwise it will be instant.
 *
 * @param props {@link TransitionGroupProps}
 */
export const TransitionGroup: FlowComponent<TransitionGroupProps> = props => {
  const classnames = createClassnames(props);

  const resolved = children(() => props.children).toArray;

  const els = createMemo(() => resolved()
    .map(el => getFirstChild(el, (item): item is HTMLElement => item instanceof HTMLElement || item instanceof SVGElement))
    .filter((el): el is HTMLElement | SVGElement => el !== null)
  );

  return createListTransition(els, {
    appear: props.appear,
    exitMethod: "keep-index",
    onChange({ added, removed, finishRemoved, list }) {
      const classes = classnames();

      // ENTER
      for (const el of added) {
        enterTransition(classes, props, el);
      }

      // MOVE
      const toMove: { el: HTMLElement | SVGElement; rect: DOMRect }[] = [];
      // get rects of elements before the changes to the DOM
      for (const el of list) {
        if (el.isConnected && (el instanceof HTMLElement || el instanceof SVGElement)) {
          toMove.push({ el, rect: el.getBoundingClientRect() });
        }
      }

      // wait for th new list to be rendered
      queueMicrotask(() => {
        const moved: (HTMLElement | SVGElement)[] = [];

        for (const { el, rect } of toMove) {
          if (el.isConnected) {
            const newRect = el.getBoundingClientRect(),
              dX = rect.left - newRect.left,
              dY = rect.top - newRect.top;
            if (dX || dY) {
              // set els to their old position before transition
              el.style.transform = `translate(${dX}px, ${dY}px)`;
              el.style.transitionDuration = "0s";
              moved.push(el);
            }
          }
        }

        document.body.offsetHeight; // force reflow

        for (const el of moved) {
          el.classList.add(...classes.move);

          // clear transition - els will move to their new position
          el.style.transform = el.style.transitionDuration = "";

          function endTransition(e: Event) {
            if (e.target === el || /transform$/.test((e as TransitionEvent).propertyName)) {
              el.removeEventListener("transitionend", endTransition);
              el.classList.remove(...classes.move);
            }
          }
          el.addEventListener("transitionend", endTransition);
        }
      });

      // EXIT
      for (const el of removed) {
        exitTransition(classes, props, el, () => finishRemoved([el]));
      }
    },
  }) as unknown as JSX.Element;
};
