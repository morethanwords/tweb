/**
 * The press a peek is waiting on or showing, for a gesture of the same press to settle with: the first
 * to take it keeps it, the way a long press and a pan are settled on Android. A slideshow that starts
 * paging cancels a peek not yet shown; a peek that has shown keeps the slideshow still until the
 * release. A module of its own, so that those gestures do not pull in the peek and what it draws with.
 */
export type MediaPeekPress = {
  // * what the press started on
  element: HTMLElement,
  isShown: () => boolean,
  // * gives the press up: no peek comes of it
  cancel: () => void
};

let press: MediaPeekPress;

// * gives back what forgets the press, once it is over
export function setMediaPeekPress(value: MediaPeekPress) {
  press = value;
  return () => {
    if(press === value) {
      press = undefined;
    }
  };
}

function getPressIn(container: Element) {
  return press && container.contains(press.element) ? press : undefined;
}

// * whether a press that started inside `container` shows a peek
export function isMediaPeekShownIn(container: Element) {
  return !!getPressIn(container)?.isShown();
}

// * a press that started inside `container` is taken by something else: the peek it waits on never shows
export function cancelMediaPeekIn(container: Element) {
  const press = getPressIn(container);
  if(press && !press.isShown()) {
    press.cancel();
  }
}
