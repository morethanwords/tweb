/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../../config/debug';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import deferredPromise, {CancellablePromise} from '../../helpers/cancellablePromise';
import noop from '../../helpers/noop';
import {DcId} from '../../types';

export class NetworkStats {
  public sent: number;
  public received: number;
  public awaitingChunks: Map<DcId, {length: number, deferred: CancellablePromise<void>}[]>;

  constructor() {
    this.sent = this.received = 0;
    this.awaitingChunks = new Map();
  }

  public addSent(dcId: DcId, length: number) {
    this.sent += length;
  }

  public addReceived(dcId: DcId, length: number) {
    this.received += length;

    const awaitingChunks = this.awaitingChunks.get(dcId);
    const awaitingLength = awaitingChunks?.length;
    if(awaitingLength) {
      for(let i = 0; i < awaitingLength; ++i) {
        const awaiting = awaitingChunks[i];
        if(length >= awaiting.length) {
          awaiting.deferred.resolve();
          break;
        }
      }
    }
  }

  public waitForChunk(dcId: DcId, length: number) {
    const deferred = deferredPromise<void>();
    let awaitingChunks = this.awaitingChunks.get(dcId);
    if(!awaitingChunks) {
      this.awaitingChunks.set(dcId, awaitingChunks = []);
    }

    const awaiting = {length, deferred};
    deferred.catch(noop).finally(() => {
      indexOfAndSplice(awaitingChunks, awaiting);
    });

    awaitingChunks.push(awaiting);
    return deferred;
  }
}

const networkStats = new NetworkStats();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.networkStats = networkStats);
export default networkStats;
