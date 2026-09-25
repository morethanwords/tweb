import apiManagerProxy from '@lib/apiManagerProxy';
import {
  isObjectURL,
  type ObjectURLPinUpdate,
  type SharedObjectURLUpdate
} from '@helpers/objectUrlUtils';
import Modes from '@config/modes';

export {createObjectURL, revokeObjectURL, ObjectURLScope} from '@helpers/objectUrlScope';

type SharedObjectURLUpdateListener = (update: SharedObjectURLUpdate) => void;

let pendingPinUpdates: ObjectURLPinUpdate[] = [];

function queuePinUpdate(update: ObjectURLPinUpdate) {
  pendingPinUpdates.push(update);
  if(pendingPinUpdates.length > 1) {
    return;
  }

  queueMicrotask(() => {
    const updates = pendingPinUpdates;
    pendingPinUpdates = [];
    apiManagerProxy.invokeVoid('updateObjectURLPins', updates);
  });
}

// * Keeps a worker-owned shared blob URL alive for a consumer that needs the
// * URL itself to stay resolvable — a playing media element, MediaSession
// * artwork, wallpaper CSS — even after the worker-side LRU evicts it.
// * Plain <img> consumers don't need this: the decoded bitmap survives
// * revocation, and a later re-render re-requests the URL from the worker.
export function pinObjectURL(url: string) {
  // * nothing is revoked under the kill switch, so pins are pointless traffic
  if(!isObjectURL(url) || Modes.noObjectUrlRevoke) {
    return () => {};
  }

  let pinned = true;
  queuePinUpdate({url, active: true});
  return () => {
    if(pinned) {
      pinned = false;
      queuePinUpdate({url, active: false});
    }
  };
}

export function createSharedObjectURL(blob: Blob, owner: string) {
  return apiManagerProxy.invoke('createSharedObjectURL', {blob, owner});
}

export function setSharedObjectURL(owner: string, url: string) {
  apiManagerProxy.invokeVoid('setSharedObjectURL', {owner, url});
}

export function releaseSharedObjectURL(owner: string, url: string) {
  if(isObjectURL(url)) {
    apiManagerProxy.invokeVoid('releaseSharedObjectURL', {owner, url});
  }
}

export function addSharedObjectURLUpdateListener(listener: SharedObjectURLUpdateListener) {
  return apiManagerProxy.addSharedObjectURLUpdateListener(listener);
}
