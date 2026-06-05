/*
 * Main-thread-only: collects the log ring buffers from every context (this
 * window + the MTProto SharedWorker), merges them chronologically and downloads
 * an NDJSON file. Loaded lazily (dynamic import from logsBuffer) so none of this
 * — nor the message-port import — is paid for unless logs are actually exported.
 *
 * Offline symbolication of the captured stacks: src/scripts/symbolicate-logs.js
 */

import Modes from '@config/modes';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import apiManagerProxy from '@lib/apiManagerProxy';
import {getLogEntries, LogEntry} from './logsBuffer';

const WORKER_TIMEOUT = 5000;

export type LogsMeta = {
  __meta: true;
  version: string;
  versionFull: string;
  mode: string;
  ua: string;
  href: string;
  exportedAt: string;
  count: number;
};

/** Merge this window's buffer with the MTProto worker's, oldest-first. */
export async function collectLogs(): Promise<LogEntry[]> {
  const all = getLogEntries();

  // In noWorker mode the worker shares this realm (and this very buffer), so
  // pulling it back would only duplicate entries.
  if(!Modes.noWorker) {
    try {
      const master = MTProtoMessagePort.getMasterInstance();
      const workerLogs = await master?.invoke('getLogs', undefined, undefined, undefined, undefined, WORKER_TIMEOUT);
      if(workerLogs?.length) {
        all.push(...workerLogs);
      }
    } catch(err) {
      // Worker unreachable / no listener — export what we have from the window.
      console.error('[logs] failed to collect worker logs:', err);
    }
  }

  // ServiceWorker buffer (downloads, push notifications, stream interception,
  // cache). Its own context, so it has a separate ring buffer.
  if(!Modes.noServiceWorker) {
    try {
      const swLogs = await apiManagerProxy.serviceMessagePort?.invoke('getLogs', undefined, undefined, undefined, undefined, WORKER_TIMEOUT);
      if(swLogs?.length) {
        all.push(...swLogs);
      }
    } catch(err) {
      // SW asleep / unregistered — export the rest.
      console.error('[logs] failed to collect service worker logs:', err);
    }
  }

  all.sort((a, b) => a.t - b.t);
  return all;
}

function buildMeta(count: number): LogsMeta {
  return {
    __meta: true,
    version: import.meta.env.VITE_VERSION,
    versionFull: import.meta.env.VITE_VERSION_FULL,
    mode: import.meta.env.MODE,
    ua: navigator.userAgent,
    href: location.href,
    exportedAt: new Date().toISOString(),
    count
  };
}

/** Build the NDJSON payload (meta line first, then one entry per line). */
export async function serializeLogs(): Promise<string> {
  const entries = await collectLogs();
  const lines = [JSON.stringify(buildMeta(entries.length))];
  for(const e of entries) {
    lines.push(JSON.stringify(e));
  }
  return lines.join('\n');
}

export async function downloadLogs(filename?: string): Promise<void> {
  const payload = await serializeLogs();
  const blob = new Blob([payload], {type: 'application/x-ndjson'});
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `tweb-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
  document.body.append(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
