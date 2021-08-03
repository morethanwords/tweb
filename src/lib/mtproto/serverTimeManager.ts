/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type { ApplyServerTimeOffsetTask } from './timeManager';
import { MOUNT_CLASS_TO } from '../../config/debug';
// import { tsNow } from '../../helpers/date';
import sessionStorage from '../sessionStorage';
import apiManager from './mtprotoworker';

export class ServerTimeManager {
  /* private midnightNoOffset: number;
  private midnightOffseted: Date;

  private midnightOffset: number; */

  public serverTimeOffset: number; // in seconds
  /* private timeParams: {
    midnightOffset: number,
    serverTimeOffset: number
  }; */

  constructor() {
    /* const timestampNow = tsNow(true);
    this.midnightNoOffset = timestampNow - (timestampNow % 86400);
    this.midnightOffseted = new Date();
    this.midnightOffseted.setHours(0, 0, 0, 0);
    
    this.midnightOffset = this.midnightNoOffset - (Math.floor(+this.midnightOffseted / 1000)); */

    this.serverTimeOffset = 0;
    /* this.timeParams = {
      midnightOffset: this.midnightOffset,
      serverTimeOffset: this.serverTimeOffset
    }; */

    sessionStorage.get('server_time_offset').then((to) => {
      if(to) {
        this.serverTimeOffset = to;
        // this.timeParams.serverTimeOffset = to;
      }
    });

    apiManager.addTaskListener('applyServerTimeOffset', (task: ApplyServerTimeOffsetTask) => {
      this.serverTimeOffset = task.payload;
    });
  }
}

const serverTimeManager = new ServerTimeManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.serverTimeManager = serverTimeManager);
export default serverTimeManager;
