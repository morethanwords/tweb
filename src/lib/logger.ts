//import { DEBUG } from "./mtproto/mtproto_config";

export enum LogLevels {
  log = 1,
  warn = 2,
  error = 4,
  debug = 8
};

const _logTimer = Date.now();
function dT() {
  return '[' + ((Date.now() - _logTimer) / 1000).toFixed(3) + ']';
}

export function logger(prefix: string, level = LogLevels.log | LogLevels.warn | LogLevels.error) {
  if(process.env.NODE_ENV != 'development'/*  || true */) {
    level = LogLevels.error;
  }

  //level = LogLevels.log | LogLevels.warn | LogLevels.error | LogLevels.debug

  function Log(...args: any[]) {
    return level & LogLevels.log && console.log(dT(), prefix, ...args);
  }
  
  Log.warn = function(...args: any[]) {
    return level & LogLevels.warn && console.warn(dT(), prefix, ...args);
  };
  
  Log.info = function(...args: any[]) {
    return level & LogLevels.log && console.info(dT(), prefix, ...args);
  };
  
  Log.error = function(...args: any[]) {
    return level & LogLevels.error && console.error(dT(), prefix, ...args);
  };
  
  Log.trace = function(...args: any[]) {
    return level & LogLevels.log && console.trace(dT(), prefix, ...args);
  };

  /* Log.debug = function(...args: any[]) {
    return level & LogLevels.debug && console.log(dT(), prefix, ...args);
  }; */

  Log.debug = function(...args: any[]) {
    return level & LogLevels.debug && console.debug(dT(), prefix, ...args);
  };

  Log.setPrefix = function(_prefix: string) {
    prefix = '[' + _prefix + ']:';
  };

  Log.setPrefix(prefix);
  
  return Log;
};