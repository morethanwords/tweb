import {type Accessor, createEffect, createSignal, onCleanup} from 'solid-js';
import {requestRAF} from '@helpers/solid/requestRAF';


export function useScrollPosition(
  element: Accessor<HTMLElement | null | undefined>,
  axis: 'x' | 'y' = 'y'
) {
  const [scrollPosition, setScrollPosition] = createSignal(0);

  let isRAFing = false;

  const requestMetricsUpdate = (el: HTMLElement) => {
    if(isRAFing) return;
    isRAFing = true;

    requestRAF(() => {
      isRAFing = false;
      setScrollPosition(axis === 'y' ? el.scrollTop : el.scrollLeft);
    });
  };

  createEffect(() => {
    const el = element();

    if(!el) {
      setScrollPosition(0);
      return;
    }

    requestMetricsUpdate(el);

    const onScroll = () => requestMetricsUpdate(el);
    el.addEventListener('scroll', onScroll, {passive: true});

    onCleanup(() => {
      el.removeEventListener('scroll', onScroll);
    });
  });

  return scrollPosition;
}
