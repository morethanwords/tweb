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

import sessionStorage from '../sessionStorage';
import {nextRandomUint} from '../../helpers/random';
import {WorkerTaskVoidTemplate} from '../../types';
import ulongFromInts from '../../helpers/long/ulongFromInts';
import {AppManager} from '../appManagers/manager';

/*
let lol: any = {};
for(var i = 0; i < 100; i++) {
    timeManager.generateId();
}
*/

export interface ApplyServerTimeOffsetTask extends WorkerTaskVoidTemplate {
  type: 'applyServerTimeOffset',
  payload: TimeManager['timeOffset']
};

export class TimeManager extends AppManager {
  private lastMessageId: [number, number];
  private timeOffset: number;

  /* private midnightNoOffset: number;
  private midnightOffseted: Date;

  private midnightOffset: number; */

  /* private timeParams: {
    midnightOffset: number,
    serverTimeOffset: number
  }; */

  protected after() {
    this.lastMessageId = [0, 0];
    this.timeOffset = 0;

    sessionStorage.get('server_time_offset').then((to) => {
      if(to) {
        this.timeOffset = to;
      }
    });


    // * migrated from ServerTimeManager
    /* const timestampNow = tsNow(true);
    this.midnightNoOffset = timestampNow - (timestampNow % 86400);
    this.midnightOffseted = new Date();
    this.midnightOffseted.setHours(0, 0, 0, 0);

    this.midnightOffset = this.midnightNoOffset - (Math.floor(+this.midnightOffseted / 1000)); */

    /* this.timeParams = {
      midnightOffset: this.midnightOffset,
      serverTimeOffset: this.serverTimeOffset
    }; */
  }

  public getServerTimeOffset() {
    return this.timeOffset;
  }

  public generateId(): string {
    const timeTicks = Date.now(),
      timeSec = Math.floor(timeTicks / 1000) + this.timeOffset,
      timeMSec = timeTicks % 1000,
      random = nextRandomUint(16);

    let messageId: TimeManager['lastMessageId'] = [timeSec, (timeMSec << 21) | (random << 3) | 4];
    if(this.lastMessageId[0] > messageId[0] ||
      this.lastMessageId[0] === messageId[0] && this.lastMessageId[1] >= messageId[1]) {
      messageId = [this.lastMessageId[0], this.lastMessageId[1] + 4];
    }

    this.lastMessageId = messageId;

    const ret = ulongFromInts(messageId[0], messageId[1]).toString(10);

    // if(lol[ret]) {
    //   console.error('[TimeManager]: Generated SAME msg id', messageId, this.timeOffset, ret);
    // }
    // lol[ret] = true;

    // console.log('[TimeManager]: Generated msg id', messageId, this.timeOffset, ret);

    return ret
  }

  public applyServerTime(serverTime: number, localTime?: number) {
    localTime = (localTime || Date.now()) / 1000 | 0;
    const newTimeOffset = serverTime - localTime;
    const changed = Math.abs(this.timeOffset - newTimeOffset) > 10;
    this.lastMessageId = [0, 0];

    if(this.timeOffset !== newTimeOffset) {
      sessionStorage.set({
        server_time_offset: newTimeOffset
      });

      this.timeOffset = newTimeOffset;
    }

    // console.log('[TimeManager]: Apply server time', serverTime, localTime, newTimeOffset, changed);

    return changed;
  }
}
