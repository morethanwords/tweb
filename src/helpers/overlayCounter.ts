/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import EventListenerBase from './eventListenerBase';

export class OverlayCounter extends EventListenerBase<{
  change: (isActive: boolean) => void
}> {
  public overlaysActive = 0;

  get isOverlayActive() {
    return this.overlaysActive > 0;
  }

  set isOverlayActive(value: boolean) {
    this.overlaysActive += value ? 1 : -1;
    this.dispatchEvent('change', this.isOverlayActive);
  }
}

const overlayCounter = new OverlayCounter();
export default overlayCounter;
