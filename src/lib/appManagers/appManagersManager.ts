/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import callbackify from "../../helpers/callbackify";
import deferredPromise, { CancellablePromise } from "../../helpers/cancellablePromise";
import cryptoMessagePort from "../crypto/cryptoMessagePort";
import MTProtoMessagePort from "../mtproto/mtprotoMessagePort";
import appStateManager from "./appStateManager";
import { AppStoragesManager } from "./appStoragesManager";
import createManagers from "./createManagers";

type Managers = Awaited<ReturnType<typeof createManagers>>;

export class AppManagersManager {
  private managers: Managers | Promise<Managers>;
  private cryptoPortAttached: boolean;
  private cryptoPortPromise: CancellablePromise<void>;

  constructor() {
    this.cryptoPortPromise = deferredPromise();
    this.cryptoPortPromise.then(() => {
      this.cryptoPortPromise = undefined;
    });
  }

  public start() {
    const port = MTProtoMessagePort.getInstance<false>();

    port.addEventListener('manager', ({name, method, args}) => {
      return callbackify(this.getManagers(), (managers) => {
        // @ts-ignore
        const manager = managers[name];
        return manager[method].apply(manager, args);
      });
    });

    port.addEventListener('cryptoPort', (payload, source, event) => {
      if(this.cryptoPortAttached) {
        return;
      }
      
      this.cryptoPortAttached = true;
      const port = event.ports[0];
      cryptoMessagePort.attachPort(port);
      this.cryptoPortPromise.resolve();
    });
  }

  public async createManagers() {
    const appStoragesManager = new AppStoragesManager();
    
    await Promise.all([
      // new Promise(() => {}),
      appStoragesManager.loadStorages(),
      this.cryptoPortPromise
    ]);

    const managers = await createManagers(appStoragesManager, appStateManager.userId);
    return this.managers = managers;
  }

  public getManagers() {
    return this.managers ??= this.createManagers();
  }
}

const appManagersManager = new AppManagersManager();
export default appManagersManager;
