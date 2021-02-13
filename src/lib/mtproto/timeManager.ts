import sessionStorage from '../sessionStorage';
import { longFromInts } from './bin_utils';
import { nextRandomInt } from '../../helpers/random';
import { MOUNT_CLASS_TO } from '../../config/debug';

/*
let lol: any = {};
for(var i = 0; i < 100; i++) {
    timeManager.generateId();
}
*/

export class TimeManager {
  private lastMessageId = [0, 0];
  private timeOffset = 0;

  constructor() {
    sessionStorage.get('server_time_offset').then((to: any) => {
      if(to) {
        this.timeOffset = to;
      }
    });
  }

  public generateId(): string {
    const timeTicks = Date.now(),
      timeSec = Math.floor(timeTicks / 1000) + this.timeOffset,
      timeMSec = timeTicks % 1000,
      random = nextRandomInt(0xFFFF);

    let messageId = [timeSec, (timeMSec << 21) | (random << 3) | 4];
    if(this.lastMessageId[0] > messageId[0] ||
      this.lastMessageId[0] === messageId[0] && this.lastMessageId[1] >= messageId[1]) {
      messageId = [this.lastMessageId[0], this.lastMessageId[1] + 4];
    }

    this.lastMessageId = messageId;

    const ret = longFromInts(messageId[0], messageId[1]);

    /* if(lol[ret]) {
      console.error('[TimeManager]: Generated SAME msg id', messageId, this.timeOffset, ret);
    }
    lol[ret] = true;

    console.log('[TimeManager]: Generated msg id', messageId, this.timeOffset, ret); */

    return ret
  }

  public applyServerTime(serverTime: number, localTime?: number) {
    localTime = (localTime || Date.now()) / 1000 | 0;
    const newTimeOffset = serverTime - localTime;
    const changed = Math.abs(this.timeOffset - newTimeOffset) > 10;
    sessionStorage.set({
      server_time_offset: newTimeOffset
    });

    this.lastMessageId = [0, 0];
    this.timeOffset = newTimeOffset;
    
    //console.log('[TimeManager]: Apply server time', serverTime, localTime, newTimeOffset, changed);

    return changed;
  }
}

const timeManager = new TimeManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.timeManager = timeManager);
export default timeManager;
