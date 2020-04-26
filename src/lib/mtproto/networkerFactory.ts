import { MTPNetworker } from "./networker";

export class NetworkerFactory {
  public updatesProcessor: (obj: any, bool: boolean) => void = null;
  //public offlineInited = false;
  public akStopped = false;

  /* public startAll() {
    if(this.akStopped) {
      this.akStopped = false;

      if(this.updatesProcessor) {
        this.updatesProcessor({
          _: 'new_session_created'
        }, true);
      }
    }
  }

  public stopAll() {
    this.akStopped = true;
  } */

  public setUpdatesProcessor(callback: (obj: any, bool: boolean) => void) {
    this.updatesProcessor = callback;
  }

  public getNetworker(dcID: number, authKey: number[], authKeyID: Uint8Array, serverSalt: number[], options: any) {
    //console.log(dT(), 'NetworkerFactory: creating new instance of MTPNetworker:', dcID, options);
    return new MTPNetworker(dcID, authKey, authKeyID, serverSalt, options);
  }
}

export default new NetworkerFactory();
