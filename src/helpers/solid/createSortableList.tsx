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
import {createStore, SetStoreFunction, Store} from 'solid-js/store';
import styles from './createSortableList.module.scss';
import {requestRAF} from './requestRAF';
import {subscribeOn} from './subscribeOn';


type Id = string | number; // probably could be anything

export type CreateSortableListArgs<T> = {
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

type DragContext<T> = CreateSortableListArgs<T> & {
  elements: Map<Id, HTMLElement>;
  rects: RectMap;

  // Will get assigned as properties (context.containerRect = ...)
  containerRect?: DOMRectEditable;
  containerScrollHeight?: number;
  cancelFinishingAnimation?: () => void;

  dragState: Store<DragState>;
  setDragState: SetStoreFunction<DragState>;
  resetDragState: () => void;
  finishingAnimationState: Store<FinishingAnimationState>;
  setFinishingAnimationState: SetStoreFunction<FinishingAnimationState>;
  scrollAdjustment: Accessor<number>;
};

const autoScrollThreshold = 60;
const autoScrollSpeedBase = 6;

export const createSortableList = <T, >(args: CreateSortableListArgs<T>) => {
  const context = createDragContextValue(args);

  const startDrag = useStartDrag(context);

  watchScrollPosition(context);
  attachGrabbingClassname(context);

  onCleanup(() => {
    context.cancelFinishingAnimation?.();
  });

  const itemRef = (id: Id) => (el: HTMLElement) => {
    context.elements.set(id, el);
    onCleanup(() => context.elements.delete(id));
  };

  const dragHandleProps = (id: Id) => ({
    onPointerDown: (e) => startDrag(e, id)
  } satisfies JSX.HTMLAttributes<HTMLElement>);

  const itemStyle = useItemStyle(context);

  return {
    isDragging: () => context.dragState.isDragging,
    draggingId: () => context.dragState.id,

    itemRef,
    itemStyle,
    dragHandleProps
  };
};

const createDragContextValue = <T, >({container, items, getId, onReorder}: CreateSortableListArgs<T>): DragContext<T> => {
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

  const [dragState, setDragState] = createStore<DragState>(
    // Unlink from initial state so it doesn't mutate it directly
    structuredClone(intialDragState)
  );

  const [finishingAnimationState, setFinishingAnimationState] = createStore<FinishingAnimationState>({id: null, shift: 0});

  const scrollAdjustment = createMemo(() => dragState.currentScrollTop - dragState.initialScrollTop);

  const resetDragState = () => setDragState(intialDragState);

  return {
    container,
    items,
    getId,
    onReorder,

    elements: new Map<Id, HTMLElement>(),
    rects: new Map<Id, DOMRectEditable>(),

    dragState,
    setDragState,
    resetDragState,
    finishingAnimationState,
    setFinishingAnimationState,

    scrollAdjustment
  };
}

const useFindIndexById = <T, >(context: DragContext<T>) => (id: Id) => {
  const {items, getId} = context;
  return items().findIndex((x) => getId(x) === id);
};

const useGetRectAtIndex = <T, >(context: DragContext<T>) => (index: number) => {
  const {items, getId, rects} = context;
  if(index < 0 || index >= items().length) return null;
  return rects.get(getId(items()[index]));
};

const useCalculateShift = <T, >(context: DragContext<T>) => {
  const {dragState, scrollAdjustment, items, rects} = context;
  const getRectAtIndex = useGetRectAtIndex(context);

  return (id: Id) => {
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
};

const useMeasureElements = <T, >(context: DragContext<T>) => () =>  {
  const {rects, elements, container, items, getId} = context;

  rects.clear();

  const localContainer = container();
  if(!localContainer) return;

  context.containerRect = cloneDOMRect(localContainer.getBoundingClientRect());
  context.containerScrollHeight = localContainer.scrollHeight;

  for(const item of items()) {
    const id = getId(item);
    const el = elements.get(id);
    if(!el) continue;

    const cloned = cloneDOMRect(el.getBoundingClientRect());

    const {containerRect} = context;

    cloned.top -= containerRect.top;
    cloned.bottom -= containerRect.top;
    cloned.left -= containerRect.left;
    cloned.right -= containerRect.left;

    rects.set(id, cloned);
  }
};

const useUpdateOverIndex = <T, >(context: DragContext<T>) => (y: number) => {
  const {containerRect, scrollAdjustment, items, getId, setDragState, rects} = context;
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
};

const useStartDrag = <T, >(context: DragContext<T>) => {
  const {setDragState, container} = context;

  const findIndexById = useFindIndexById(context);
  const measureElements = useMeasureElements(context);

  const handlePointerMove = useHandlePointerMove(context);
  const handlePointerUp = useHandlePointerUp(context, () => removeListeners);

  const setListeners = () => {
    window.addEventListener('pointermove', handlePointerMove, {passive: false});
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const removeListeners = () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  };

  onCleanup(() => {
    removeListeners();
  });

  return (e: PointerEvent, id: Id) => {
    if(e.button !== 0 && e.pointerType !== 'touch') return;

    e.preventDefault();

    context.cancelFinishingAnimation?.();

    requestRAF(() => {
      measureElements();

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

      setListeners();
    });
  }
};

const useHandlePointerMove = <T, >(context: DragContext<T>) => {
  const {dragState, setDragState} = context;

  const updateOverIndex = useUpdateOverIndex(context);
  const loopAutoScroll = useLoopAutoScroll(context);

  return throttleWith(requestRAF, (e: PointerEvent) => {
    if(!dragState.isDragging) return;

    const y = e.clientY;

    batch(() => {
      setDragState({
        deltaY: y - dragState.pointerStartY
      });
      updateOverIndex(y);
      loopAutoScroll(y);
    });
  }, false);
};

const useHandlePointerUp = <T, >(context: DragContext<T>, getRemoveListeners: () => () => void) => {
  const endDrag = useEndDrag(context);

  return () => {
    const removeListeners = getRemoveListeners();

    endDrag();
    removeListeners();
  };
};

const useStartAutoScroll = <T, >(context: DragContext<T>) => {
  const isCleaned = useIsCleaned();
  const updateOverIndex = useUpdateOverIndex(context);

  return (y: number) => {
    const {dragState, container, containerRect, containerScrollHeight} = context;

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
  }
};

const useLoopAutoScroll = <T, >(context: DragContext<T>) => {
  const {dragState} = context;
  const autoScroll = useStartAutoScroll(context);

  let autoScrollRef = {};

  onCleanup(() => {
    autoScrollRef = {};
  });

  return (y: number) => {
    if(!dragState.isDragging) return;

    autoScrollRef = {};

    const savedRef = autoScrollRef;

    const frame = () => {
      if(autoScrollRef === savedRef && autoScroll(y)) {
        requestRAF(frame);
      }
    };

    requestRAF(frame);
  }
};

const useEndDrag = <T, >(context: DragContext<T>) => {
  const calculateShift = useCalculateShift(context);

  return () => {
    const {dragState, onReorder, items, rects, setFinishingAnimationState, getId, resetDragState} = context;

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
      resetDragState();
      onReorder(reorder(items(), startIndex, overIndex));

      if(shift === 0) return;

      setFinishingAnimationState({
        id,
        shift
      });

      context.cancelFinishingAnimation = animateValue(shift, 0, 200, (value) => {
        setFinishingAnimationState('shift', value);
      }, {
        onEnd: () => {
          setFinishingAnimationState({id: null, shift: 0});
        }
      });
    });

    rects.clear();
  }
};

const watchScrollPosition = <T, >(context: DragContext<T>) => {
  const {container, dragState, setDragState} = context;

  createEffect(() => {
    const localContainer = container();
    if(!localContainer) return;

    subscribeOn(localContainer)('scroll', throttleWith(requestRAF, () => {
      if(!dragState.isDragging) return;

      setDragState({
        currentScrollTop: localContainer.scrollTop
      });
    }, false), {passive: true});
  });
};

const attachGrabbingClassname = <T, >(context: DragContext<T>) => {
  const {dragState} = context;

  createEffect(() => {
    if(!dragState.isDragging) return;

    document.body.classList.add(styles.grabbing);

    onCleanup(() => {
      document.body.classList.remove(styles.grabbing);
    });
  });
};

const useItemStyle = <T, >(context: DragContext<T>) => {
  const findIndexById = useFindIndexById(context);
  const getRectAtIndex = useGetRectAtIndex(context);
  const calculateShift = useCalculateShift(context);

  return (id: Id) => {
    const {dragState, finishingAnimationState, rects} = context;

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
};

const baseMovingStyle = {
  'position': 'relative',
  'transition': 'none',
  'z-index': 1
} satisfies JSX.CSSProperties;

const reorder = <T, >(list: T[], from: number, to: number) => {
  if(from === to) return list;
  const copy = list.slice();
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
};
