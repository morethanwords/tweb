/*
 * In-memory ring buffer that mirrors every logger() call so the session can be
 * exported to a file and symbolicated offline (see ./exportLogs +
 * src/scripts/symbolicate-logs.js).
 *
 * This is a LEAF module on purpose: logger.ts imports capture() on the hot
 * path, so we must not pull in anything heavy (no message ports, no managers)
 * or we'd create an import cycle / TDZ crash. The export side (./exportLogs)
 * lives in a separate module that is only loaded lazily, on demand.
 */

import DEBUG, {MOUNT_CLASS_TO} from '@config/debug';
import {IS_SERVICE_WORKER, IS_WEB_WORKER} from '@helpers/context';
import type {LogTypes} from '@lib/logger';

// Mirror of LogTypes — kept as literals to avoid a runtime import cycle with
// logger.ts (logger.ts -> logsBuffer.ts). Only used for the stack-capture mask.
const LEVEL_ERROR = 1;
const LEVEL_WARN = 2;
const WANTS_STACK = LEVEL_ERROR | LEVEL_WARN;

// Bound loggers embed ANSI reset codes into their prefix on non-WebKit; strip
// them so the exported file stays plain text.
const ANSI = /\x1b\[[0-9;]*m/g;

export type LogSource = 'main' | 'mtproto' | 'sw';

export type LogEntry = {
  t: number; // Date.now() — absolute, so entries from different contexts merge
  src: LogSource;
  level: number; // LogTypes bit
  prefix: string;
  args: any[]; // already clone-safe (bounded, no cycles) so it survives postMessage
  stack?: string;
};

// Which context this module instance lives in. The MTProto SharedWorker is a
// dedicated worker (IS_WEB_WORKER); leaf compute workers (crypto/lottie/…) also
// match but their buffer is never collected, so the tag is only cosmetic there.
export const SRC: LogSource = IS_SERVICE_WORKER ? 'sw' : IS_WEB_WORKER ? 'mtproto' : 'main';

// Tunables. Bounded so a single fat object (a message list, a Uint8Array) can't
// blow up memory or freeze the tab during serialization.
const RING_SIZE = 4000;
const MAX_ARGS = 24;
const MAX_DEPTH = 4;
const MAX_STRING = 2048;
const MAX_ARRAY = 64;
const MAX_KEYS = 64;

let enabled = DEBUG;
const ring: LogEntry[] = new Array(RING_SIZE);
let head = 0;
let count = 0;

function bounded(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + `…(${s.length})` : s;
}

// Bounded, cycle-safe, clone-safe serializer. Never throws.
function serialize(value: any, depth: number, seen: WeakSet<object>): any {
  if(value === undefined) return '[undefined]';
  if(value === null) return null;

  const t = typeof value;
  if(t === 'string') return bounded(value, MAX_STRING);
  if(t === 'number' || t === 'boolean') return value;
  if(t === 'bigint') return value.toString() + 'n';
  if(t === 'symbol') return value.toString();
  if(t === 'function') return `ƒ ${(value as Function).name || 'anonymous'}`;

  // objects
  if(value instanceof Error) {
    const out: any = {__error: value.name, message: value.message, stack: value.stack};
    // Capture custom own-enumerable fields too (e.g. BlockchainError.code,
    // CallError details) — name/message/stack are non-enumerable so for-in
    // only yields the extras.
    for(const key in value) {
      if(key === 'name' || key === 'message' || key === 'stack') continue;
      try {
        out[key] = serialize((value as any)[key], depth + 1, seen);
      } catch(err) {
        out[key] = '[unserializable]';
      }
    }
    return out;
  }

  if(typeof Node !== 'undefined' && value instanceof Node) {
    const el = value as Element;
    const id = el.id ? '#' + el.id : '';
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
    return `<${(value.nodeName || 'node').toLowerCase()}${id}${cls}>`;
  }

  if(ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    const len = (value as any).byteLength ?? (value as any).length;
    return `${value.constructor?.name || 'Buffer'}(${len})`;
  }

  if(seen.has(value)) return '[Circular]';
  if(depth >= MAX_DEPTH) return Array.isArray(value) ? `[Array(${value.length})]` : '[Object]';
  seen.add(value);

  try {
    if(Array.isArray(value)) {
      const out = value.slice(0, MAX_ARRAY).map((v) => serialize(v, depth + 1, seen));
      if(value.length > MAX_ARRAY) out.push(`…(+${value.length - MAX_ARRAY})`);
      return out;
    }

    if(value instanceof Map) {
      const out: any = {__map: value.size, entries: {}};
      let n = 0;
      for(const [k, v] of value) {
        if(n++ >= MAX_KEYS) {out.entries['…'] = `(+${value.size - MAX_KEYS})`; break;}
        out.entries[bounded(String(k), 128)] = serialize(v, depth + 1, seen);
      }
      return out;
    }

    if(value instanceof Set) {
      return {__set: value.size, values: serialize([...value].slice(0, MAX_ARRAY), depth + 1, seen)};
    }

    const out: any = {};
    let n = 0;
    for(const key in value) {
      if(n++ >= MAX_KEYS) {out['…'] = 'truncated'; break;}
      try {
        out[key] = serialize(value[key], depth + 1, seen);
      } catch(err) {
        out[key] = '[unserializable]';
      }
    }
    return out;
  } catch(err) {
    return '[unserializable]';
  } finally {
    seen.delete(value);
  }
}

function serializeArgs(args: any[]): any[] {
  const slice = args.length > MAX_ARGS ? args.slice(0, MAX_ARGS) : args;
  const seen = new WeakSet<object>();
  const out = slice.map((a) => {
    try {
      return serialize(a, 0, seen);
    } catch(err) {
      return '[unserializable]';
    }
  });
  if(args.length > MAX_ARGS) out.push(`…(+${args.length - MAX_ARGS} args)`);
  return out;
}

// Drop the leading frames that belong to the logging machinery itself, so the
// stack starts at the actual caller. Handles both V8 ("Error\n  at fn (file)")
// and SpiderMonkey/JSC ("fn@file") formats.
function trimStack(stack: string): string {
  if(!stack) return stack;
  let lines = stack.split('\n');
  // Our captures use a messageless `new Error()`; drop its bare "Error" header.
  if(lines.length && /^Error\s*$/.test(lines[0])) {
    lines = lines.slice(1);
  }
  // Skip the consecutive leading frames inside capture()/the logger wrapper.
  let i = 0;
  while(i < lines.length && (lines[i].includes('logsBuffer') || /\blogger\.[tj]s\b/.test(lines[i]))) {
    ++i;
  }
  return lines.slice(i).join('\n');
}

function pushEntry(e: LogEntry) {
  ring[head] = e;
  head = (head + 1) % RING_SIZE;
  if(count < RING_SIZE) count++;
}

/**
 * Hot path: called from every logger() invocation. Returns immediately (one
 * boolean check) unless buffering is enabled. Enabled === DEBUG by default, so
 * normal production users pay nothing; under dev / ?debug=1 it records the full
 * timeline. Never throws.
 */
export function capture(level: LogTypes, prefix: string, args: any[]): void {
  if(!enabled) return;
  try {
    const entry: LogEntry = {
      t: Date.now(),
      src: SRC,
      level,
      prefix: prefix ? prefix.replace(ANSI, '') : prefix,
      args: serializeArgs(args)
    };
    if(level & WANTS_STACK) {
      entry.stack = trimStack(new Error().stack || '');
    }
    pushEntry(entry);
  } catch(err) {
    // Logging must never break the app it's logging.
  }
}

/** Snapshot of this context's buffer, oldest-first. */
export function getLogEntries(): LogEntry[] {
  const out: LogEntry[] = new Array(count);
  const start = count < RING_SIZE ? 0 : head;
  for(let i = 0; i < count; ++i) {
    out[i] = ring[(start + i) % RING_SIZE];
  }
  return out;
}

export function clearLogBuffer(): void {
  head = count = 0;
}

export function setLogBufferEnabled(value: boolean): void {
  enabled = !!value;
}

export function isLogBufferEnabled(): boolean {
  return enabled;
}

if(MOUNT_CLASS_TO) {
  MOUNT_CLASS_TO.setLogBufferEnabled = setLogBufferEnabled;
  MOUNT_CLASS_TO.clearLogBuffer = clearLogBuffer;
  // NB: the export helpers (window.downloadLogs / collectLogs) are wired from
  // @lib/debug/mountLogExport (imported by src/index.ts), NOT here. This module
  // is a leaf reached by the universal logger() in every worker bundle; pulling
  // exportLogs -> apiManagerProxy in (even behind a literal dynamic import,
  // which Rollup still keeps in the graph) creates a circular worker import.
}
