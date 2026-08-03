import createDateBubble from '@components/chat/dateBubble';
import {
  findSharedMediaScrollDateItemIndex,
  SHARED_MEDIA_SCROLL_DATE_HIDE_TIMEOUT
} from '@components/sharedMediaScrollDate';

export default function createSharedMediaScrollDateBadge(options: {
  mount: (element: HTMLElement) => void,
  getAnchorTop: () => number,
  getItems: () => ArrayLike<Element>
}) {
  let element: HTMLElement;
  let timestamp: number;
  let hideTimeout: number;

  const hide = () => {
    window.clearTimeout(hideTimeout);
    hideTimeout = 0;
    element?.classList.remove('is-visible');
  };

  const update = (canShow: boolean) => {
    if(!canShow) {
      hide();
      return;
    }

    const items = options.getItems();
    if(!items.length) {
      hide();
      return;
    }

    const anchorTop = options.getAnchorTop();
    const bounds = new Map<number, DOMRect>();
    const getItemBottom = (index: number) => {
      let rect = bounds.get(index);
      if(!rect) {
        rect = items[index].getBoundingClientRect();
        bounds.set(index, rect);
      }

      return rect.bottom;
    };
    const index = findSharedMediaScrollDateItemIndex(items.length, anchorTop, getItemBottom);
    const nextTimestamp = index === -1 ? 0 : +(items[index] as HTMLElement).dataset.timestamp;
    if(!nextTimestamp) {
      hide();
      return;
    }

    if(timestamp !== nextTimestamp) {
      const date = new Date(nextTimestamp * 1000);
      date.setHours(0, 0, 0, 0);
      const nextElement = createDateBubble(nextTimestamp, date);

      if(element) {
        element.replaceChildren(...Array.from(nextElement.childNodes));
      } else {
        element = nextElement;
        element.classList.add('search-super-scroll-date');
        options.mount(element);
      }

      timestamp = nextTimestamp;
    }

    window.clearTimeout(hideTimeout);
    element.classList.add('is-visible');
    hideTimeout = window.setTimeout(hide, SHARED_MEDIA_SCROLL_DATE_HIDE_TIMEOUT);
  };

  const reset = () => {
    hide();
    timestamp = undefined;
  };

  const destroy = () => {
    reset();
    element?.remove();
    element = undefined;
  };

  return {destroy, hide, reset, update};
}
