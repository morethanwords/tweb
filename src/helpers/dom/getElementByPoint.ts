/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../../config/debug';

export function getElementByPoint(container: HTMLElement, verticalSide: 'top' | 'bottom', horizontalSide: 'center' | 'left'): HTMLElement {
  // return null;
  const rect = container.getBoundingClientRect();
  const x = horizontalSide === 'center' ? Math.ceil(rect.left + ((rect.right - rect.left) / 2) + 1) : Math.ceil(rect.left + 1);
  const y = verticalSide === 'bottom' ? Math.floor(rect.top + rect.height - 1) : Math.ceil(rect.top + 1);
  return document.elementFromPoint(x, y) as any;
};

MOUNT_CLASS_TO.getElementByPoint = getElementByPoint;
