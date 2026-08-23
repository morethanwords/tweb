import {doubleRaf} from '@helpers/schedulers';

export default function focusSearchInput(container: HTMLElement) {
  const focus = (onlyIfBlurred = false) => {
    const input = container.querySelector<HTMLElement>('.topbar-search-input');
    if(!input) {
      return false;
    }

    const {activeElement, body, documentElement} = input.ownerDocument;
    if(onlyIfBlurred && activeElement !== input && activeElement !== body && activeElement !== documentElement) {
      return false;
    }

    input.focus({preventScroll: true});
    return true;
  };

  if(!focus()) {
    queueMicrotask(focus);
  }

  doubleRaf().then(() => focus(true));
}
