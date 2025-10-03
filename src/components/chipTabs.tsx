import {createContext, createEffect, JSX, on, onCleanup, onMount, Ref, useContext} from 'solid-js';

import styles from './chipTabs.module.scss';
import classNames from '../helpers/string/classNames';
import findUpClassName from '../helpers/dom/findUpClassName';
import {fastRaf} from '../helpers/schedulers';
import getVisibleRect from '../helpers/dom/getVisibleRect';
import Scrollable from './scrollable2';
import fastSmoothScroll from '../helpers/fastSmoothScroll';
import createContextMenu from '../helpers/dom/createContextMenu';
import {ButtonMenuItemOptionsVerifiable} from './buttonMenu';

interface ChipTabsContextValue {
  value: string,
  onClick: (event: MouseEvent, value: string) => void
  updateCurrent: () => void
}

const ChipTabsContext = createContext<ChipTabsContextValue>(null);

export function ChipTab(props: {
  class?: string
  children: JSX.Element
  value: string
}) {
  const ctx = useContext(ChipTabsContext);
  onCleanup(() => fastRaf(ctx.updateCurrent));
  return (
    <div
      class={classNames(styles.chip, ctx.value === props.value && styles.active, props.class)}
      onClick={(event: MouseEvent) => ctx.onClick(event, props.value)}
      data-value={props.value}
    >
      {props.children}
    </div>
  )
}

export function ChipTabs(props: {
  class?: string
  value: string,
  view: 'surface' | 'secondary' | 'primary',
  onChange: (value: string) => boolean | void,
  contextMenuButtons?: (itemId: string) => ButtonMenuItemOptionsVerifiable[],
  children: JSX.Element
  ref?: Ref<HTMLDivElement>
  center?: boolean
  needIntersectionObserver?: boolean
}) {
  let scrollable!: HTMLDivElement;
  let chosenRef!: HTMLDivElement;

  function updateChosen(categoryRect: DOMRect) {
    const scrollableRect = scrollable.getBoundingClientRect();
    chosenRef.style.width = `${categoryRect.width}px`;
    chosenRef.style.left = `${categoryRect.left - scrollableRect.left + scrollable.scrollLeft}px`;
  }

  function handleClick(event: MouseEvent, value: string) {
    const result = props.onChange(value);
    if(result === false) return;
    const categoryEl = findUpClassName(event.target as HTMLElement, styles.chip);

    fastRaf(() => {
      const categoryRect = categoryEl.getBoundingClientRect();
      updateChosen(categoryRect);

      const visibleRect = getVisibleRect(categoryEl, scrollable, false, categoryRect, undefined, true);
      if(!visibleRect || visibleRect.overflow.horizontal) {
        fastSmoothScroll({
          element: categoryEl,
          container: scrollable,
          position: 'center',
          axis: 'x'
        });
      }
    });
  }

  let updatedOnce = false
  function updateCurrent() {
    const categoryEl = scrollable.querySelector(`[data-value="${props.value}"]`);
    if(categoryEl) {
      const rect = categoryEl.getBoundingClientRect();
      if(rect.width === 0 && rect.height === 0) return;
      updateChosen(rect);
    }
    if(!updatedOnce) {
      chosenRef.classList.add(styles.animate);
      updatedOnce = true;
    }
  }

  createEffect(on(() => props.value, (value) => fastRaf(updateCurrent)))

  if(props.needIntersectionObserver) {
    onMount(() => {
      const observer = new IntersectionObserver((mutations) => {
        mutations.forEach((mutation) => {
          if(mutation.isIntersecting) {
            updateCurrent();
            observer.disconnect();
          }
        });
      }, {
        threshold: 1
      });

      observer.observe(scrollable.parentElement);

      onCleanup(() => observer.disconnect());
    })
  }

  if(props.contextMenuButtons) {
    let chosenElement: HTMLElement;
    onMount(() => {
      createContextMenu({
        listenTo: scrollable,
        findElement: (event) => findUpClassName(event.target as HTMLElement, styles.chip),
        onOpen: (event, target) => {
          chosenElement = target;
        },
        buttons: [],
        filterButtons: async() => props.contextMenuButtons(chosenElement.dataset.value)
      })
    })
  }

  return (
    <ChipTabsContext.Provider
      value={{
        get value() {
          return props.value;
        },
        onClick: handleClick,
        updateCurrent
      }}
    >
      <div
        class={classNames(
          props.class,
          styles.container,
          styles[props.view],
          props.view === 'primary' && styles.primary,
          props.center && styles.center
        )}
        ref={props.ref}
      >
        <Scrollable axis="x" ref={scrollable}>
          <div class={styles.chosen} ref={chosenRef} />
          {props.children}
        </Scrollable>
      </div>
    </ChipTabsContext.Provider>
  )
}
