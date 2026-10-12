import liteMode from '@helpers/liteMode';

/*
 * The rows of a list laid out in normal flow glide to where a DOM change put them (FLIP): the
 * ones a row was added or removed above, and a row moved to another place. That is how the chat
 * list's rows go to their new places (VerticalVirtualList tweens their `top`: 120 ms, `ease`), and
 * as there, an added row appears where it belongs and a removed one is gone at once.
 *
 * Positions are read on screen, so a row the scroll kept in place does not move, and a change
 * that comes mid-glide starts the row from where it is. Only what can be seen glides: rows that
 * stay out of the viewport just go to their places, and a list in a hidden tab or a hidden column
 * is not measured at all — a long list pays for the handful of rows on screen.
 */

export type ListGlideOptions = {
  duration?: number,
  easing?: string,
  /** On a row while it glides — the chat list makes its moving rows opaque. */
  movingClassName?: string,
  /** On a row carried further than its own height: it rides over the rows it passes. */
  liftedClassName?: string,
  /** What the list scrolls in: rows that neither start nor end nor pass inside it do not glide. */
  getViewport?: () => HTMLElement
};

export default function createListGlide(list: HTMLElement, options: ListGlideOptions = {}) {
  const {duration = 120, easing = 'ease', movingClassName, liftedClassName, getViewport} = options;
  const glides = new Map<HTMLElement, Animation>();
  let before: Map<Element, number>;
  let blocked = 0;

  const settle = (element: HTMLElement) => {
    if(movingClassName) element.classList.remove(movingClassName);
    if(liftedClassName) element.classList.remove(liftedClassName);
  };

  const play = () => {
    const tops = before;
    before = undefined;

    // where the rows really are, without what is left of their glides
    const stopped = [...glides.keys()];
    glides.forEach((animation) => animation.cancel());
    glides.clear();

    // every read before any write
    const moves: Array<{element: HTMLElement, offset: number, lifted: boolean}> = [];
    if(list.isConnected) {
      const viewport = getViewport?.()?.getBoundingClientRect();
      for(const element of Array.from(list.children) as HTMLElement[]) {
        const top = tops.get(element);
        if(top === undefined) {
          continue;
        }

        const rect = element.getBoundingClientRect();
        const offset = top - rect.top;
        if(Math.abs(offset) < 1 ||
          (viewport && (Math.max(top, rect.top) + rect.height <= viewport.top || Math.min(top, rect.top) >= viewport.bottom))) {
          continue;
        }

        moves.push({element, offset, lifted: Math.abs(offset) > rect.height});
      }
    }

    stopped.forEach(settle);
    moves.forEach(({element, offset, lifted}) => {
      if(movingClassName) element.classList.add(movingClassName);
      if(liftedClassName) element.classList.toggle(liftedClassName, lifted);
      const animation = element.animate([
        {transform: `translateY(${offset}px)`},
        {transform: 'none'}
      ], {duration, easing});
      glides.set(element, animation);
      animation.finished.then(() => {
        if(glides.get(element) === animation) {
          glides.delete(element);
          settle(element);
        }
      }, () => {});
    });
  };

  return {
    /** Runs `callback`, which changes the list's rows, and glides them from where they were. */
    mutate(callback: () => void) {
      if(!before &&
        !blocked &&
        list.isConnected &&
        !document.hidden &&
        liteMode.isAvailable('motion') &&
        list.checkVisibility?.({visibilityProperty: true}) !== false) {
        before = new Map();
        for(const element of Array.from(list.children)) {
          before.set(element, element.getBoundingClientRect().top);
        }

        // after every change made in this task
        queueMicrotask(play);
      }

      callback();
    },

    /** Changes made until the returned callback is called just happen, as the first fill of a list. */
    block() {
      ++blocked;
      let released = false;
      return () => {
        if(!released) {
          released = true;
          --blocked;
        }
      };
    }
  };
}
