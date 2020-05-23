import { MTPNetworker } from "./networker";

export class NetworkerFactory {
  public updatesProcessor: (obj: any, bool: boolean) => void = null;

  public setUpdatesProcessor(callback: (obj: any, bool: boolean) => void) {
    this.updatesProcessor = callback;
  }

  public getNetworker(dcID: number, authKey: number[], authKeyID: Uint8Array, serverSalt: number[], options: any) {
    //console.log(dT(), 'NetworkerFactory: creating new instance of MTPNetworker:', dcID, options);
    return new MTPNetworker(dcID, authKey, authKeyID, serverSalt, options);
  }
}

export default new NetworkerFactory();
