import {IS_SAFARI} from './userAgent';

/*
 * This is used as a workaround for a memory leak in Safari caused by using Transferable objects to
 * transfer data between WebWorkers and the main thread.
 * https://github.com/mapbox/mapbox-gl-js/issues/8771
 *
 * This should be removed once the underlying Safari issue is fixed.
 */

let CAN_USE_TRANSFERABLES: boolean;
if(!IS_SAFARI) CAN_USE_TRANSFERABLES = true;
else {
  try {
    const match = navigator.userAgent.match(/Version\/(.+?) /);
    CAN_USE_TRANSFERABLES = +match[1] >= 14;
  } catch(err) {
    CAN_USE_TRANSFERABLES = false;
  }
}

export default CAN_USE_TRANSFERABLES;
