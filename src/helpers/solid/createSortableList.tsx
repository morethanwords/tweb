import {animateValue} from '@helpers/animateValue';
import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import throttleWith from '@helpers/schedulers/throttleWith';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {
  Accessor,
  batch,
  createEffect,
  createMemo,
  JSX,
  onCleanup
} from 'solid-js';
import {createStore} from 'solid-js/store';
import {requestRAF} from './requestRAF';
import {subscribeOn} from './subscribeOn';
import styles from './createSortableList.module.scss';


type Id = string | number; // probably could be anything

type Args<T> = {
  items: Accessor<T[]>;
  getId: (item: T) => Id;
  onReorder: (next: T[]) => void;
  container: () => HTMLElement | undefined;
};

type RectMap = Map<
  Id,
  DOMRectEditable
>;

type DragState = {
  id: Id;
  isDragging: boolean;
  startIndex: number;
  overIndex: number;
  deltaY: number;
  pointerStartY: number;
  initialScrollTop: number;
  currentScrollTop: number;
};

type FinishingAnimationState = {
  id: Id;
  shift: number;
};

const autoScrollThreshold = 60;
const autoScrollSpeedBase = 6;

export function createSortableList<T>({
  container,
  items,
  getId,
  onReorder
}: Args<T>) {
  const elements = new Map<Id, HTMLElement>();

  let containerRect: DOMRectEditable;
  let containerScrollHeight: number;
  let autoScrollRef = {};
  let cancelFinishingAnimation: () => void;

  const rects: RectMap = new Map();

  const intialDragState: DragState = {
    id: null,
    isDragging: false,
    startIndex: 0,
    overIndex: 0,
    deltaY: 0,
    pointerStartY: 0,
    initialScrollTop: 0,
    currentScrollTop: 0
  };

  const isCleaned = useIsCleaned();

  const [dragState, setDragState] = createStore<DragState>(structuredClone(intialDragState));
  const [finishingAnimationState, setFinishingAnimationState] = createStore<FinishingAnimationState>({id: null, shift: 0});

  const scrollAdjustment = createMemo(() => dragState.currentScrollTop - dragState.initialScrollTop);


  const findIndexById = (id: Id) => {
    return items().findIndex((x) => getId(x) === id);
  };

  const getRectAtIndex = (index: number) => {
    if(index < 0 || index >= items().length) return null;
    return rects.get(getId(items()[index]));
  };

  const calculateShift = (id: Id) => {
    let shift = dragState.deltaY + scrollAdjustment();
    const rect = rects.get(id);
    const firstRect = getRectAtIndex(0);
    const lastRect = getRectAtIndex(items().length - 1);

    if(rect && firstRect && lastRect) {
      shift = Math.max(shift, firstRect.top - rect.top);
      shift = Math.min(shift, lastRect.bottom - rect.bottom);
    }

    return shift;
  };


  const measure = () => {
    rects.clear();

    const localContainer = container();
    if(!localContainer) return;
    containerRect = cloneDOMRect(localContainer.getBoundingClientRect());
    containerScrollHeight = localContainer.scrollHeight;

    for(const item of items()) {
      const id = getId(item);
      const el = elements.get(id);
      if(!el) continue;

      const cloned = cloneDOMRect(el.getBoundingClientRect());

      cloned.top -= containerRect.top;
      cloned.bottom -= containerRect.top;
      cloned.left -= containerRect.left;
      cloned.right -= containerRect.left;

      rects.set(id, cloned);
    }
  };

  const updateOverIndex = (y: number) => {
    if(!containerRect) return;

    let idx = 0;

    const ids = items().map(getId);

    y += - containerRect.top + scrollAdjustment();

    for(let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const rect = rects.get(id);
      if(rect && y >= rect.top) {
        idx = i;
      }
    }

    setDragState({
      overIndex: idx
    });
  }

  const startDrag = (e: PointerEvent, id: Id) => {
    if(e.button !== 0 && e.pointerType !== 'touch') return;

    e.preventDefault();

    cancelFinishingAnimation?.();

    requestRAF(() => {
      measure();

      const index = findIndexById(id);

      setDragState({
        isDragging: true,
        id,
        deltaY: 0,
        startIndex: index,
        overIndex: index,
        initialScrollTop: container()?.scrollTop,
        currentScrollTop: container()?.scrollTop,
        pointerStartY: e.clientY
      });

      window.addEventListener('pointermove', handlePointerMove, {
        passive: false
      });

      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    });
  };

  const handlePointerMove = throttleWith(requestRAF, (e: PointerEvent) => {
    if(!dragState.isDragging) return;

    const y = e.clientY;

    batch(() => {
      setDragState({
        deltaY: y - dragState.pointerStartY
      });
      updateOverIndex(y);
      loopAutoScroll(y);
    });
  });

  const handlePointerUp = () => {
    endDrag();
    removeWindowListeners();
  };

  const autoScroll = (y: number) => {
    if(isCleaned() || !dragState.isDragging) return false;

    const localContainer = container();
    if(!localContainer || !containerRect || !containerScrollHeight) return false;

    let speed = 0;

    if(y < containerRect.top + autoScrollThreshold) {
      const t = 1 - Math.max(0, y - containerRect.top) / autoScrollThreshold;
      speed = -autoScrollSpeedBase * t;
    } else if(y > containerRect.bottom - autoScrollThreshold) {
      const t = 1 - Math.max(0, containerRect.bottom - y) / autoScrollThreshold;
      speed = autoScrollSpeedBase * t;
    }

    const scrollTop = localContainer.scrollTop;
    const scrollHeight = containerScrollHeight;
    const clientHeight = containerRect.height;

    speed = Math.max(-scrollTop, Math.min(scrollHeight - scrollTop - clientHeight, speed));
    speed = Math.round(speed);

    if(Math.abs(speed) === 0) return false;

    localContainer.scrollTop = scrollTop + speed;
    updateOverIndex(y);

    return true;
  };


  const loopAutoScroll = (y: number) => {
    autoScrollRef = {};

    const savedRef = autoScrollRef;

    const frame = () => {
      if(autoScrollRef === savedRef && autoScroll(y)) {
        requestRAF(frame);
      }
    };

    requestRAF(frame);
  };

  const endDrag = () => {
    if(!dragState.isDragging) return;

    const {startIndex, overIndex, id} = dragState;

    const fromRect = rects.get(getId(items()[startIndex]));
    const toRect = rects.get(getId(items()[overIndex]));
    const moved = toRect && fromRect ? (
      overIndex < startIndex ?
        toRect.top - fromRect.top :
        toRect.bottom - fromRect.bottom
    ) : 0;

    const shift = calculateShift(id) - moved;

    batch(() => {
      setDragState(intialDragState);
      onReorder(reorder(items(), startIndex, overIndex));

      if(shift === 0) return;

      setFinishingAnimationState({
        id,
        shift
      });

      cancelFinishingAnimation = animateValue(shift, 0, 200, (value) => {
        setFinishingAnimationState('shift', value);
      }, {
        onEnd: () => {
          setFinishingAnimationState({id: null, shift: 0});
        }
      });
    });

    rects.clear();
  }

  const reorder = (list: T[], from: number, to: number) => {
    if(from === to) return list;
    const copy = list.slice();
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  }


  const removeWindowListeners = () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  };


  createEffect(() => {
    const localContainer = container();
    if(!localContainer) return;

    subscribeOn(localContainer)('scroll', () => {
      if(!dragState.isDragging) return;

      setDragState({
        currentScrollTop: localContainer.scrollTop
      });
    }, {passive: true});
  });

  createEffect(() => {
    if(!dragState.isDragging) return;

    document.body.classList.add(styles.grabbing);

    onCleanup(() => {
      document.body.classList.remove(styles.grabbing);
    });
  });

  onCleanup(() => {
    autoScrollRef = {};
    cancelFinishingAnimation?.();
    removeWindowListeners();
  });


  const itemRef = (id: Id) => (el: HTMLElement) => {
    elements.set(id, el);
    onCleanup(() => elements.delete(id));
  };

  const handleProps = (id: Id) => ({
    onPointerDown: (e) => startDrag(e, id)
  } satisfies JSX.HTMLAttributes<HTMLElement>);

  const baseMovingStyle = {
    'position': 'relative',
    'transition': 'none',
    'z-index': 1
  } satisfies JSX.CSSProperties;

  const itemStyle = (id: Id) => {
    if(id === finishingAnimationState.id) {
      return {
        'transform': `translateY(${finishingAnimationState.shift}px)`,
        ...baseMovingStyle
      };
    }

    if(!dragState.isDragging) {
      return {};
    }

    if(id === dragState.id) {
      return {
        'transform': `translateY(${calculateShift(id)}px)`,
        ...baseMovingStyle
      };
    }

    const activeRect = rects.get(dragState.id);
    const prevRect = getRectAtIndex(dragState.startIndex - 1);
    const nextRect = getRectAtIndex(dragState.startIndex + 1);

    if(!activeRect) return {};

    const index = findIndexById(id);

    let shift = 0;

    if(index < dragState.startIndex && index >= dragState.overIndex) {
      shift = activeRect.height + (prevRect ? activeRect.top - prevRect.bottom : 0);
    } else if(index > dragState.startIndex && index <= dragState.overIndex) {
      shift = -activeRect.height - (nextRect ? nextRect.top - activeRect.bottom : 0);
    }

    return {
      transform: `translateY(${shift}px)`,
      transition: 'transform 0.2s'
    };
  }

  return {
    draggingId: (): Id | null => dragState.id,

    itemRef,
    handleProps,
    itemStyle
  };
}
