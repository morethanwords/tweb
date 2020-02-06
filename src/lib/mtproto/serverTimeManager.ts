import AppStorage from '../storage';
import { tsNow } from '../utils';

export class ServerTimeManager {
  public timestampNow = tsNow(true);
  public midnightNoOffset = this.timestampNow - (this.timestampNow % 86400);
  public midnightOffseted = new Date();

  public midnightOffset = this.midnightNoOffset - (Math.floor(+this.midnightOffseted / 1000));

  public serverTimeOffset = 0;
  public timeParams = {
    midnightOffset: this.midnightOffset,
    serverTimeOffset: this.serverTimeOffset
  };

  constructor() {
    this.midnightOffseted.setHours(0);
    this.midnightOffseted.setMinutes(0);
    this.midnightOffseted.setSeconds(0);

    AppStorage.get<number>('server_time_offset').then((to) => {
      if(to) {
        this.serverTimeOffset = to;
        this.timeParams.serverTimeOffset = to;
      }
    });
  }
}

export default new ServerTimeManager();
