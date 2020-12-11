import MTPNetworker from "./networker";
import { ConnectionStatusChange, InvokeApiOptions } from "../../types";
import MTTransport from "./transports/transport";

export class NetworkerFactory {
  public updatesProcessor: (obj: any, bool: boolean) => void = null;
  public onConnectionStatusChange: (info: ConnectionStatusChange) => void = null;

  public setUpdatesProcessor(callback: (obj: any, bool: boolean) => void) {
    this.updatesProcessor = callback;
  }

  public getNetworker(dcId: number, authKey: number[], authKeyID: Uint8Array, serverSalt: number[], transport: MTTransport, options: InvokeApiOptions) {
    //console.log('NetworkerFactory: creating new instance of MTPNetworker:', dcId, options);
    return new MTPNetworker(dcId, authKey, authKeyID, serverSalt, transport, options);
  }
}

export default new NetworkerFactory();
