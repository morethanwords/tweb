import cloneDOMRect from '@helpers/dom/cloneDOMRect';
import throttleWith from '@helpers/schedulers/throttleWith';
import {useIsCleaned} from '@hooks/useIsCleaned';
import {
  Accessor,
  batch,
  JSX,
  onCleanup
} from 'solid-js';
import {createStore} from 'solid-js/store';
import {requestRAF} from './requestRAF';


type Id = string | number;

type RectMap = Map<
  Id,
  DOMRectEditable
>;

type Args<T> = {
  items: Accessor<T[]>;
  getId: (item: T) => Id;
  onReorder: (next: T[]) => void;
  container: () => HTMLElement | undefined;
};

type DragState = {
  id: Id;
  isDragging: boolean;
  startIndex: number;
  overIndex: number;
  deltaY: number;
  pointerStartY: number;
  scrollAdjustment: number;
};

export function createSortableList<T>(
  {container, items, getId, onReorder}: Args<T>
) {
  const elements = new Map<Id, HTMLElement>();
  const handles = new Map<Id, HTMLElement>();

  let containerRect: DOMRectEditable;
  const rects: RectMap = new Map();

  const intialDragState: DragState = {
    id: null,
    isDragging: false,
    startIndex: 0,
    overIndex: 0,
    deltaY: 0,
    pointerStartY: 0,
    scrollAdjustment: 0
  };

  const isCleaned = useIsCleaned();

  const EDGE = 40;
  const MAX_SCROLL = 6;

  const [dragState, setDragState] = createStore<DragState>(structuredClone(intialDragState));

  function findIndexById(id: Id) {
    return items().findIndex((x) => getId(x) === id);
  }

  function registerItem(id: Id) {
    return (el: HTMLElement) => {
      elements.set(id, el);
      onCleanup(() => elements.delete(id));
    };
  }

  function registerHandle(id: Id) {
    return (el: HTMLElement) => {
      handles.set(id, el);
      onCleanup(() => handles.delete(id));
    };
  }

  function measure() {
    rects.clear();

    if(!container()) return;
    containerRect = cloneDOMRect(container().getBoundingClientRect());

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
  }

  function startDrag(e: PointerEvent, id: Id) {
    if(e.button !== 0 && e.pointerType !== 'touch') return;

    e.preventDefault();

    requestRAF(() => {
      measure();

      const index = findIndexById(id);

      setDragState({
        isDragging: true,
        id,
        deltaY: 0,
        startIndex: index,
        overIndex: index,
        pointerStartY: e.clientY
      });

      window.addEventListener('pointermove', handlePointerMove, {
        passive: false
      });

      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    });
  }

  function updateOverIndex(y: number) {
    if(!containerRect) return;

    let idx = 0;

    const ids = items().map(getId);

    y -= containerRect.top;

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
    console.log('my-debug updateOverIndex', idx)
  }

  const handlePointerMove = throttleWith(requestRAF, (e: PointerEvent) => {
    if(!dragState.isDragging) return;

    setDragState({
      deltaY: e.clientY - dragState.pointerStartY
    });

    const y = e.clientY;

    batch(() => {
      updateOverIndex(y);
      loopAutoScroll(y);
    });
  });

  function autoScroll(y: number) {
    // return false;
    if(isCleaned() || !dragState.isDragging) return false;

    const localContainer = container();
    if(!localContainer) return false;

    const r = localContainer.getBoundingClientRect();

    let speed = 0;

    if(y < r.top + EDGE) {
      const t = 1 - Math.max(0, y - r.top) / EDGE;
      speed = -MAX_SCROLL * t;
    } else if(y > r.bottom - EDGE) {
      const t = 1 - Math.max(0, r.bottom - y) / EDGE;
      speed = MAX_SCROLL * t;
    }


    const scrollTop = localContainer.scrollTop;
    const scrollHeight = localContainer.scrollHeight;
    const clientHeight = localContainer.clientHeight;

    speed = Math.max(-scrollTop, Math.min(scrollHeight - scrollTop - clientHeight, speed));

    if(Math.abs(speed) < 0.1) return false;

    localContainer.scrollTop += speed;
    setDragState('scrollAdjustment', (prev) => prev + speed);

    // for(const [id, rect] of rects) {
    //   if(id === dragState.id) continue;
    //   rect.top += speed;
    //   rect.bottom += speed;
    // }
    // measure();
    updateOverIndex(y);

    return true;
  }

  let id = {};

  function loopAutoScroll(y: number) {
    id = {};

    const savedId = id;

    const frame = () => {
      if(id === savedId && autoScroll(y)) {
        requestRAF(frame);
      }
    };

    requestRAF(frame);
  }

  function endDrag() {
    if(!dragState.isDragging) return;

    onReorder(reorder(items(), dragState.startIndex, dragState.overIndex));

    rects.clear();
    setDragState(intialDragState);
  }

  function reorder(list: T[], from: number, to: number) {
    if(from === to) return list;
    const copy = list.slice();
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  }

  function removeWindowListeners() {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
  }

  onCleanup(() => {
    id = {};
    removeWindowListeners();
  });

  function handlePointerUp() {
    endDrag();
    removeWindowListeners();
  };


  function getProps(id: Id) {
    return {
      onPointerDown: (e) => startDrag(e, id)
    } satisfies JSX.HTMLAttributes<HTMLElement>;
  }

  const baseStyle = {
    'transition': 'transform 0.2s'
  } satisfies JSX.CSSProperties;

  function getStyle(id: Id): JSX.CSSProperties {
    if(!dragState.isDragging) {
      return baseStyle;
    }

    if(id === dragState.id) {
      const shift = dragState.deltaY + dragState.scrollAdjustment;
      const rect = rects.get(id);

      if(containerRect && rect) {
        // shift = Math.max(shift, -rect.top);
        // shift = Math.min(shift, rect.bottom);
      }

      return {
        'transform': `translateY(${shift}px)`,
        'transition': 'none',
        'z-index': 1
      };
    }

    const activeRect = rects.get(dragState.id);
    if(!activeRect) return {};

    const index = findIndexById(id);

    let shift = 0;

    if(index < dragState.startIndex && index >= dragState.overIndex) {
      shift = activeRect.height;
    } else if(index > dragState.startIndex && index <= dragState.overIndex) {
      shift = -activeRect.height;
    }

    return {
      transform: `translateY(${shift}px)`,
      ...baseStyle
    };
  }

  return {
    registerItem,
    registerHandle,
    draggingId: (): Id | null => dragState.id,
    getProps,
    getStyle
  };
}
