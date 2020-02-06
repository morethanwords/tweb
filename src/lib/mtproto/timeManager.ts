import AppStorage from '../storage';
import { tsNow } from '../utils';
import { nextRandomInt, longFromInts, dT } from '../bin_utils';

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
    var timeTicks = tsNow(),
      timeSec = Math.floor(timeTicks / 1000) + this.timeOffset,
      timeMSec = timeTicks % 1000,
      random = nextRandomInt(0xFFFF);

    var messageID = [timeSec, (timeMSec << 21) | (random << 3) | 4];
    if(this.lastMessageID[0] > messageID[0] ||
      this.lastMessageID[0] == messageID[0] && this.lastMessageID[1] >= messageID[1]) {
      messageID = [this.lastMessageID[0], this.lastMessageID[1] + 4];
    }

    this.lastMessageID = messageID;

    // console.log('generated msg id', messageID, timeOffset)

    return longFromInts(messageID[0], messageID[1]);
  }

  public applyServerTime(serverTime: number, localTime?: number) {
    var newTimeOffset = serverTime - Math.floor((localTime || tsNow()) / 1000);
    var changed = Math.abs(this.timeOffset - newTimeOffset) > 10;
    AppStorage.set({
      server_time_offset: newTimeOffset
    });

    this.lastMessageID = [0, 0];
    this.timeOffset = newTimeOffset;
    console.log(dT(), 'Apply server time', serverTime, localTime, newTimeOffset, changed);

    return changed;
  }
}

export default new TimeManager();
