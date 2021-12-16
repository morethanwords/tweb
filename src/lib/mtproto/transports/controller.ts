/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { TransportType } from "../dcConfigurator";

export class MTTransportController {
  private opened: Map<TransportType, number>;

  constructor() {
    this.opened = new Map();
  }

  public setTransportOpened(type: TransportType, value: boolean) {
    let length = this.opened.get(type) || 0;
    
    length += value ? 1 : -1;
    
    this.opened.set(type, length);
  }
}

export default new MTTransportController();