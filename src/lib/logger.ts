/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import DEBUG from "../config/debug";

export enum LogTypes {
  None = 0,
  Error = 1,
  Warn = 2,
  Log = 4,
  Debug = 8
};

export const LOG_LEVELS = [LogTypes.None, LogTypes.Error, LogTypes.Warn, LogTypes.Log, LogTypes.Debug];

const _logTimer = Date.now();
function dT() {
  return '[' + ((Date.now() - _logTimer) / 1000).toFixed(3) + ']';
}

export function logger(prefix: string, type: LogTypes = LogTypes.Log | LogTypes.Warn | LogTypes.Error, ignoreDebugReset = false) {
  if(!DEBUG && !ignoreDebugReset/*  || true */) {
    type = LogTypes.Error;
  }

  //level = LogLevels.log | LogLevels.warn | LogLevels.error | LogLevels.debug

  function Log(...args: any[]) {
    return type & LogTypes.Log && console.log(dT(), prefix, ...args);
  }
  
  Log.warn = function(...args: any[]) {
    return type & LogTypes.Warn && console.warn(dT(), prefix, ...args);
  };
  
  Log.info = function(...args: any[]) {
    return type & LogTypes.Log && console.info(dT(), prefix, ...args);
  };
  
  Log.error = function(...args: any[]) {
    return type & LogTypes.Error && console.error(dT(), prefix, ...args);
  };
  
  Log.trace = function(...args: any[]) {
    return type & LogTypes.Log && console.trace(dT(), prefix, ...args);
  };

  /* Log.debug = function(...args: any[]) {
    return level & LogLevels.debug && console.log(dT(), prefix, ...args);
  }; */

  Log.debug = function(...args: any[]) {
    return type & LogTypes.Debug && console.debug(dT(), prefix, ...args);
  };

  Log.setPrefix = function(_prefix: string) {
    prefix = '[' + _prefix + ']:';
  };

  Log.setPrefix(prefix);

  Log.setLevel = function(level: 0 | 1 | 2 | 3 | 4) {
    type = LOG_LEVELS.slice(0, level + 1).reduce((acc, v) => acc | v, 0) as any;
  };
  
  return Log;
};
