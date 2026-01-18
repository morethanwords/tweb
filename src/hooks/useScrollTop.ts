import {type Accessor, createEffect, createSignal, onCleanup} from 'solid-js';
import {requestRAF} from '@helpers/solid/requestRAF';


export function useScrollTop(element: Accessor<HTMLElement | null | undefined>) {
  const [scrollTop, setScrollTop] = createSignal(0);

  let isRAFing = false;

  const requestMetricsUpdate = (el: HTMLElement) => {
    if(isRAFing) return;
    isRAFing = true;

    requestRAF(() => {
      isRAFing = false;
      setScrollTop(el.scrollTop);
    });
  };

  createEffect(() => {
    const el = element();

    if(!el) {
      setScrollTop(0);
      return;
    }

    requestMetricsUpdate(el);

    const onScroll = () => requestMetricsUpdate(el);
    el.addEventListener('scroll', onScroll, {passive: true});

    onCleanup(() => {
      el.removeEventListener('scroll', onScroll);
    });
  });

  return scrollTop;
}
