/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import ctx from "../environment/ctx";
import noop from "./noop";

// It's better to use timeout instead of interval, because interval can be corrupted
export default function eachMinute(callback: () => any, runFirst = true) {
  const cancel = () => {
    clearTimeout(timeout);
  };

  // replace callback to run noop and restore after
  const _callback = callback;
  if(!runFirst) {
    callback = noop;
  }

  let timeout: number;
  (function run() {
    callback();
    timeout = ctx.setTimeout(run, (60 - new Date().getSeconds()) * 1000);
  })();

  callback = _callback;

  return cancel;
}
