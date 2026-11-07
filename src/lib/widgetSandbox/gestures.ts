/**
 * Who gets a press over a widget (docs/sdk-v1.md §5.5): taps and double taps are always the widget's; holds and drags
 * the widget claims per element with `touch-action`, reported on every press. The renderer plays the bubble by the
 * same policy (`bubbleGestures`): it ends a press the bubble takes for the widget with `pointercancel` and says what
 * the bubble does with it. Here the chat's own recognizers follow the claim: swipe-to-reply keeps off a touch the
 * widget drags horizontally, and off one from the widget's leading edge strip (the back gesture's); the hold that
 * selects a message keeps off the widget (the renderer gives the bubble's holds to it, at the policy's 500 ms), and the
 * right click that opens its menu off one the widget claims. Vertical drags need
 * nothing: the browser honours the widget's `touch-action` by itself. Only the Shadow DOM renderer's touches reach the
 * chat at all; an iframe keeps its own.
 */

import {EDGE_STRIP_PX, type GestureClaim} from 'widget-sandbox/shared/gesture-policy';
import I18n from '@lib/langPack';

/** On a widget's block: the chat's own recognizers find the widget a press is over by it. */
export const WIDGET_ATTRIBUTE = 'data-widget-block';
const claims = new WeakMap<Element, GestureClaim>();

/** The latest press of the widget in `element` claimed `claim`. */
export function setWidgetClaim(element: HTMLElement, claim: GestureClaim) {
  claims.set(element, claim);
}

/** `target` is in a widget: the shared gesture policy decides its presses, not the chat's own timing. */
export function isWidgetTarget(target: EventTarget) {
  return !!(target as Element)?.closest?.(`[${WIDGET_ATTRIBUTE}]`);
}

/** The claim of the latest press of the widget `target` is in, if it is in one. */
export function getWidgetClaim(target: EventTarget) {
  const element = (target as Element)?.closest?.(`[${WIDGET_ATTRIBUTE}]`);
  return element && claims.get(element);
}

/** A touch at `clientX` over a widget that is not the bubble's swipe-to-reply: the widget drags it, or it is the back gesture. */
export function isWidgetHorizontalDragTarget(target: EventTarget, clientX: number) {
  const element = (target as Element)?.closest?.(`[${WIDGET_ATTRIBUTE}]`);
  if(!element) return false;
  if(claims.get(element)?.x) return true;
  const rect = element.getBoundingClientRect();
  return (I18n.getIsRTL() ? rect.right - clientX : clientX - rect.left) < EDGE_STRIP_PX;
}
