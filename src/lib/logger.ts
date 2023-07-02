/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import DEBUG from '../config/debug';
import {IS_FIREFOX, IS_SAFARI} from '../environment/userAgent';
import {IS_SERVICE_WORKER, IS_WEB_WORKER} from '../helpers/context';
import dT from '../helpers/dT';

export enum LogTypes {
  None = 0,
  Error = 1,
  Warn = 2,
  Log = 4,
  Debug = 8
};

export const LOG_LEVELS = [LogTypes.None, LogTypes.Error, LogTypes.Warn, LogTypes.Log, LogTypes.Debug];

const IS_WEBKIT = IS_SAFARI || IS_FIREFOX;

// let getCallerFunctionNameFromLine: (line: string) => string;
// if(IS_WEBKIT) {
//   getCallerFunctionNameFromLine = (line) => {
//     const splitted = line.split('@');
//     return splitted[0];
//   };
// } else {
//   getCallerFunctionNameFromLine = (line: string) => {
//     const splitted = line.trim().split(' ');
//     if(splitted.length === 3) {
//       return splitted[1].slice(splitted[1].lastIndexOf('.') + 1);
//     }
//   };
// }

const STYLES_SUPPORTED = !IS_WEBKIT;
// const LINE_INDEX = IS_WEBKIT ? 2 : 3;

// function getCallerFunctionName() {
//   const stack = new Error().stack;
//   const lines = stack.split('\n');
//   const line = lines[LINE_INDEX] || lines[lines.length - 1];
//   // const match = line.match(/\.([^\.]+?)\s/);
//   // line = match ? match[1] : line.trim();
//   const caller = getCallerFunctionNameFromLine(line) || '<anonymous>';
//   return '[' + caller + ']';
// }

export const LOGGER_STYLES = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  // Foreground (text) colors
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
  },
  // Background colors
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m'
  }
};

export type Logger = {
  (...args: any[]): void;
  warn(...args: any[]): void;
  info(...args: any[]): void;
  error(...args: any[]): void;
  trace(...args: any[]): void;
  debug(...args: any[]): void;
  assert(...args: any[]): void;
  // log(...args: any[]): void;
  group(...args: any[]): void;
  groupCollapsed(...args: any[]): void;
  groupEnd(...args: any[]): void;
  setPrefix(newPrefix: string): void;
  setLevel(level: 0 | 1 | 2 | 3 | 4): void;
  bindPrefix(prefix: string, type?: LogTypes): Logger;
};

const methods: ['debug' | 'info' | 'warn' | 'error' | 'assert' | 'trace'/*  | 'log' */ | 'group' | 'groupCollapsed' | 'groupEnd', LogTypes][] = [
  ['debug', LogTypes.Debug],
  ['info', LogTypes.Log],
  ['warn', LogTypes.Warn],
  ['error', LogTypes.Error],
  ['assert', LogTypes.Error],
  ['trace', LogTypes.Log],
  ['group', LogTypes.Log],
  ['groupCollapsed', LogTypes.Log],
  ['groupEnd', LogTypes.Log]
  // ["log", LogTypes.Log]
];

export function logger(prefix: string, type: LogTypes = LogTypes.Log | LogTypes.Warn | LogTypes.Error, ignoreDebugReset = false, style = ''): Logger {
  let originalPrefix: string;
  if(!DEBUG && !ignoreDebugReset/*  || true */) {
    type = LogTypes.Error;
  }

  if(!STYLES_SUPPORTED) {
    style = '';
  } else if(!style) {
    if(IS_SERVICE_WORKER) style = LOGGER_STYLES.fg.yellow;
    else if(IS_WEB_WORKER) style = LOGGER_STYLES.fg.cyan;
  }

  const originalStyle = style;
  if(style) style = `%s ${style}%s`;
  else style = '%s';

  // level = LogLevels.log | LogLevels.warn | LogLevels.error | LogLevels.debug

  const log: Logger = function(...args: any[]) {
    return type & LogTypes.Log && console.log(style, dT(), prefix, /* getCallerFunctionName(), */ ...args);
  } as any;

  methods.forEach(([method, logType]) => {
    log[method] = function(...args: any[]) {
      return type & logType && console[method](style, dT(), prefix, /* getCallerFunctionName(), */ ...args);
    };
  });

  log.setPrefix = function(newPrefix: string) {
    originalPrefix = newPrefix;
    prefix = '[' + newPrefix + ']';
  };

  log.setPrefix(prefix);

  log.setLevel = function(level: 0 | 1 | 2 | 3 | 4) {
    type = LOG_LEVELS.slice(0, level + 1).reduce((acc, v) => acc | v, 0) as any;
  };

  log.bindPrefix = function(prefix: string, _type = type) {
    return logger(`${originalPrefix}] [${prefix}`, _type, ignoreDebugReset, originalStyle);
  };

  return log;
};
