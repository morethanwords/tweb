/*
 * Main-thread-only: collects the log ring buffers from every context (this
 * window + the MTProto SharedWorker), merges them chronologically and downloads
 * an NDJSON file. Loaded lazily (dynamic import from logsBuffer) so none of this
 * — nor the message-port import — is paid for unless logs are actually exported.
 *
 * Offline symbolication of the captured stacks: src/scripts/symbolicate-logs.js
 */

import DEBUG from '@config/debug';
import Modes, {setKeptFlag} from '@config/modes';
import createDownloadAnchor from '@helpers/dom/createDownloadAnchor';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';
import apiManagerProxy from '@lib/apiManagerProxy';
import {clearLogBuffer, getLogEntries, LogEntry, setLogBufferEnabled} from './logsBuffer';
import {clearMemoryWatch, getMemoryLogEntries} from './memoryWatch';

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

  // * memoryWatch's samples and the records set in between, in line with what was logged around them
  all.push(...getMemoryLogEntries());

  all.sort((a, b) => a.t - b.t);
  return all;
}

/** The envelope every debug export starts with - memoryWatch writes the same one. */
export function buildExportMeta(count: number, extra?: Record<string, any>): LogsMeta {
  return {
    __meta: true,
    version: import.meta.env.VITE_VERSION,
    versionFull: import.meta.env.VITE_VERSION_FULL,
    mode: import.meta.env.MODE,
    ua: navigator.userAgent,
    href: location.href,
    exportedAt: new Date().toISOString(),
    count,
    ...extra
  };
}

/**
 * The export as an NDJSON file (meta line first, then one entry per line), to download or to send; `count` is how
 * many entries it holds.
 */
export async function createLogsFile(filename?: string): Promise<{file: File, count: number}> {
  const entries = await collectLogs();
  const lines = [JSON.stringify(buildExportMeta(entries.length))];
  for(const e of entries) {
    lines.push(JSON.stringify(e));
  }

  const file = new File(
    [lines.join('\n')],
    filename || `tweb-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`,
    {type: 'application/x-ndjson'}
  );
  return {file, count: entries.length};
}

export function downloadLogsFile(file: File) {
  const url = URL.createObjectURL(file);
  createDownloadAnchor(url, file.name, () => setTimeout(() => URL.revokeObjectURL(url), 10000));
}

export async function downloadLogs(filename?: string): Promise<void> {
  const {file} = await createLogsFile(filename);
  downloadLogsFile(file);
}

/**
 * Logs collected without the rest of debug mode, in every thread of this tab and from now on in every tab of the
 * site (Modes.logs). Debug mode collects them whatever this says.
 */
export function setLogsCollected(collected: boolean) {
  setKeptFlag('logs', collected);

  const enabled = DEBUG || collected;
  setLogBufferEnabled(enabled);
  if(!Modes.noWorker) {
    MTProtoMessagePort.getMasterInstance()?.invokeVoid('setLogBufferEnabled', enabled);
  }

  apiManagerProxy.serviceMessagePort?.invokeVoid('setLogBufferEnabled', enabled);
}

/**
 * Drops what every thread of this tab has collected, and the memory watch's history the export carries with it, so
 * the next export holds only what happens after.
 */
export function clearLogs() {
  clearLogBuffer();
  if(!Modes.noWorker) {
    MTProtoMessagePort.getMasterInstance()?.invokeVoid('clearLogs', undefined);
  }

  apiManagerProxy.serviceMessagePort?.invokeVoid('clearLogs', undefined);
  clearMemoryWatch();
}
