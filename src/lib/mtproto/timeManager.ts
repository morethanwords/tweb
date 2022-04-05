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
import { nextRandomUint } from '../../helpers/random';
import { MOUNT_CLASS_TO } from '../../config/debug';
import { WorkerTaskVoidTemplate } from '../../types';
import { notifySomeone } from '../../helpers/context';
import longFromInts from '../../helpers/long/longFromInts';

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

export class TimeManager {
  private lastMessageId: [number, number] = [0, 0];
  private timeOffset: number = 0;

  constructor() {
    sessionStorage.get('server_time_offset').then((to) => {
      if(to) {
        this.timeOffset = to;
      }
    });
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

    const ret = longFromInts(messageId[0], messageId[1]);

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

      /// #if MTPROTO_WORKER
      const task: ApplyServerTimeOffsetTask = {
        type: 'applyServerTimeOffset',
        payload: newTimeOffset
      };
      notifySomeone(task);
      /// #endif
    }
    
    //console.log('[TimeManager]: Apply server time', serverTime, localTime, newTimeOffset, changed);

    return changed;
  }
}

const timeManager = new TimeManager();
MOUNT_CLASS_TO.timeManager = timeManager;
export default timeManager;
