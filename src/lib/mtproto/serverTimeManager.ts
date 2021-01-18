import { tsNow } from '../../helpers/date';
import sessionStorage from '../sessionStorage';

export class ServerTimeManager {
  public timestampNow = tsNow(true);
  public midnightNoOffset = this.timestampNow - (this.timestampNow % 86400);
  public midnightOffseted = new Date();

  public midnightOffset = this.midnightNoOffset - (Math.floor(+this.midnightOffseted / 1000));

  public serverTimeOffset = 0; // in seconds
  public timeParams = {
    midnightOffset: this.midnightOffset,
    serverTimeOffset: this.serverTimeOffset
  };

  constructor() {
    this.midnightOffseted.setHours(0, 0, 0, 0);

    sessionStorage.get('server_time_offset').then((to) => {
      if(to) {
        this.serverTimeOffset = to;
        this.timeParams.serverTimeOffset = to;
      }
    });
  }
}

export default new ServerTimeManager();
