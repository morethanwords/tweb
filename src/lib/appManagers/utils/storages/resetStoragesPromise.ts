/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deferredPromise, {CancellablePromise} from '../../../../helpers/cancellablePromise';
import type {StoragesResults} from './loadStorages';

const RESET_STORAGES_PROMISE: CancellablePromise<{
  storages: Set<keyof StoragesResults>,
  callback: () => void
}> = deferredPromise();
export default RESET_STORAGES_PROMISE;
