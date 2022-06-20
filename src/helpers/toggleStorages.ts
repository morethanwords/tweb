/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import CacheStorageController from "../lib/cacheStorage";
import AppStorage from "../lib/storage";
import sessionStorage from "../lib/sessionStorage";
import noop from "./noop";

export default function toggleStorages(enabled: boolean) {
  return Promise.all([
    AppStorage.toggleStorage(enabled),
    CacheStorageController.toggleStorage(enabled),
    sessionStorage.toggleStorage(enabled)
  ]).then(noop, noop);
}
