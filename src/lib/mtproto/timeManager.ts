import AppStorage from '../storage';
import { nextRandomInt, longFromInts } from '../bin_utils';

export class TimeManager {
  private lastMessageID = [0, 0];
  private timeOffset = 0;

  constructor() {
    AppStorage.get('server_time_offset').then((to: any) => {
      if(to) {
        this.timeOffset = to;
      }
    });
  }

  public generateID(): string {
    const timeTicks = Date.now(),
      timeSec = Math.floor(timeTicks / 1000) + this.timeOffset,
      timeMSec = timeTicks % 1000,
      random = nextRandomInt(0xFFFF);

    let messageID = [timeSec, (timeMSec << 21) | (random << 3) | 4];
    if(this.lastMessageID[0] > messageID[0] ||
      this.lastMessageID[0] == messageID[0] && this.lastMessageID[1] >= messageID[1]) {
      messageID = [this.lastMessageID[0], this.lastMessageID[1] + 4];
    }

    this.lastMessageID = messageID;

    const ret = longFromInts(messageID[0], messageID[1]);

    //console.log('[TimeManager]: Generated msg id', messageID, this.timeOffset, ret);

    return ret
  }

  public applyServerTime(serverTime: number, localTime?: number) {
    localTime = (localTime || Date.now()) / 1000 | 0;
    const newTimeOffset = serverTime - localTime;
    const changed = Math.abs(this.timeOffset - newTimeOffset) > 10;
    AppStorage.set({
      server_time_offset: newTimeOffset
    });

    this.lastMessageID = [0, 0];
    this.timeOffset = newTimeOffset;
    
    //console.log('[TimeManager]: Apply server time', serverTime, localTime, newTimeOffset, changed);

    return changed;
  }
}

export default new TimeManager();
