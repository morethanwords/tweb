/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import SwipeHandler, {getEvent} from '@components/swipeHandler';
import {toastNew} from '@components/toast';
import rootScope from '@lib/rootScope';
import {appSettings, setAppSettings} from '@stores/appSettings';
import {
  MIN_SIDEBAR_WIDTH,
  SIDEBAR_COLLAPSE_FACTOR,
  setUserPreferredLeft,
  setUserPreferredRight
} from '@helpers/updateColumnWidths';

export type ColumnResizeSide = 'left' | 'right';

export type InstallColumnResizeOptions = {
  /** The column element to attach the handle to. Becomes the handle's `.relative` parent. */
  columnEl: HTMLElement;
  side: ColumnResizeSide;
  /**
   * Optional left-column-only hooks. Called whenever the drag crosses the
   * collapse threshold so the caller can toggle the `is-collapsed` class
   * and any related state.
   */
  isCollapsed?: () => boolean;
  setCollapsed?: (collapsed: boolean) => void;
  /** Called when the collapsed state actually flips. */
  onCollapsedChange?: () => void;
  /**
   * Optional check used for the collapse threshold. When this returns true,
   * the drag cannot collapse the column (e.g. tabs are open). Left only.
   */
  preventCollapse?: () => boolean;
  /** Side-effect to run on every swipe tick (after width is updated). */
  onSwipeTick?: () => void;
};

/**
 * Attach a `.sidebar-resize-handle` to a column. The handle drives
 * `setUserPreferredLeft` or `setUserPreferredRight` (which own the CSS vars
 * and localStorage). When the user holds Shift during the drag, the OTHER
 * column is resized in lock-step with the dragged one.
 */
export default function installColumnResize(opts: InstallColumnResizeOptions): void {
  const {columnEl, side, isCollapsed, setCollapsed, onCollapsedChange, preventCollapse, onSwipeTick} = opts;
  const otherBodyClass = side === 'left' ? 'resizing-left-sidebar' : 'resizing-right-sidebar';

  const handle = document.createElement('div');
  handle.classList.add('sidebar-resize-handle', `sidebar-resize-handle-${side}`);
  columnEl.append(handle);

  new SwipeHandler({
    element: handle,
    setCursorTo: document.body,
    onStart: () => {
      handle.classList.add('is-active');
      document.body.classList.add(otherBodyClass);
      if(!appSettings.seenTooltips.sidebarResize) {
        setAppSettings('seenTooltips', 'sidebarResize', true);
        toastNew({langPackKey: 'Sidebar.Resize.ShiftTip'});
      }
    },
    onSwipe: (_, __, _e) => {
      const e = getEvent(_e);
      const rect = columnEl.getBoundingClientRect();
      // The handle sits on the inner edge of its column; width is the
      // distance from the OUTER edge to the pointer.
      const rawWidth = side === 'left' ?
        Math.round(e.clientX - rect.left) :
        Math.round(rect.right - e.clientX);

      const isShift = (e as MouseEvent).shiftKey === true;

      if(side === 'left') {
        const wasCollapsed = !!isCollapsed?.();
        const collapsed = !preventCollapse?.() && rawWidth < MIN_SIDEBAR_WIDTH * SIDEBAR_COLLAPSE_FACTOR;
        setUserPreferredLeft(collapsed ? 0 : rawWidth);
        setCollapsed?.(collapsed);
        if(collapsed !== wasCollapsed) onCollapsedChange?.();
        if(isShift) {
          // Mirror to the right column — clamped to its valid range, no
          // collapse semantics. setUserPreferredRight handles the clamp.
          setUserPreferredRight(collapsed ? MIN_SIDEBAR_WIDTH : rawWidth);
        }
      } else {
        setUserPreferredRight(rawWidth);
        if(isShift) setUserPreferredLeft(rawWidth);
      }

      rootScope.dispatchEvent('resizing_left_sidebar');
      onSwipeTick?.();
    },
    onReset: () => {
      handle.classList.remove('is-active');
      document.body.classList.remove(otherBodyClass);
    }
  });
}
