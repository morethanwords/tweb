/**
 * Removes an element with what it and its children play: a loop runs on in a removed element while it is held, and an
 * animation that keeps its last frame would show again if the element came back
 */
export default function removeWithAnimations(element: Element) {
  element.getAnimations({subtree: true}).forEach((animation) => animation.cancel());
  element.remove();
}
