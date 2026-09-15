/*
 * A crash-proof memory time series for long-lived tabs.
 *
 * A heap snapshot is the precise instrument, but it cannot be taken on a tab that has already grown
 * to gigabytes: serialising a 1.5 GB heap OOM-killed the very renderer we were investigating and
 * took four days of evidence with it. The lesson is not "never snapshot" - it is that the evidence
 * must accumulate BEFORE the tab gets big, and must survive the renderer dying.
 *
 * So this samples `memoryReport({quiet: true})` on an interval and appends the numbers to
 * localStorage, which lives in the browser process: a renderer crash, an OOM kill or a tab discard
 * leaves every sample intact, and the watch resumes by itself on the next load. What it answers is
 * the question a single snapshot cannot: WHICH counter grew while the tab sat there, and when it
 * started. Point the snapshot at the suspect afterwards, early, while the heap is still small
 * enough to serialise.
 *
 * Console API (main thread only): memoryWatch(minutes) to start, memoryWatchSummary() to read what
 * moved, downloadMemoryWatch() to hand the samples over, memoryWatchStop() / clearMemoryWatch().
 */

import {MOUNT_CLASS_TO} from '@config/debug';
import createDownloadAnchor from '@helpers/dom/createDownloadAnchor';
import memoryReport, {MemoryMetrics} from './memoryReport';

const CONFIG_KEY = 'memory_watch';
const LOG_KEY = 'memory_watch_log';
const DEFAULT_INTERVAL_MINUTES = 15;
// * The app keeps its own state in localStorage, so a diagnostic must not be the reason a write of
// * that state fails. Trimming by SIZE rather than by sample count is what bounds it: the oldest
// * rows go until the payload fits, whatever the metric count grew to. 256 KB of the columnar
// * encoding below is roughly 500 samples with every isolate answering - several days at the
// * default spacing, and proportionally more on a tab with fewer workers
const MAX_BYTES = 256 * 1024;
// * a visibility change should not be able to spam samples on a tab the user keeps switching to
const MIN_SAMPLE_GAP = 30 * 1000;

type WatchConfig = {intervalMinutes: number, startedAt: number};
type WatchSample = {t: number, m: MemoryMetrics};
// * Columnar: the metric NAMES are written once instead of once per sample, which is most of what a
// * row would otherwise cost (1364 bytes per sample as objects, ~130-500 as a row). `keys` only ever grows (a worker that answers late adds its own at
// * the end), so a short row is simply one taken before that key existed
type WatchLog = {v: 1, keys: string[], rows: number[][]};

let interval: number;
let lastSampleAt = 0;
let sampling = false;

// * Raw localStorage on purpose, NOT @lib/localStorage: that controller is schema-typed, routes
// * through the passcode/encryption layer and disables itself on the first error - all of which a
// * crash-proof diagnostic must not depend on. The browser process owns this store, which is why
// * the samples outlive the renderer that wrote them
function readJSON<T>(key: string): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  } catch(e) {
    return undefined;
  }
}

function readRaw(): WatchLog {
  const log = readJSON<WatchLog>(LOG_KEY);
  return log?.v === 1 && Array.isArray(log.keys) && Array.isArray(log.rows) ? log : {v: 1, keys: [], rows: []};
}

function readLog(): WatchSample[] {
  const {keys, rows} = readRaw();
  return rows.map((row) => {
    const m: MemoryMetrics = {};
    // * row[0] is the timestamp, the rest line up with `keys`; a value missing from a short row is
    // * absent rather than zero, which is what `summary` wants to see
    keys.forEach((key, index) => {
      const value = row[index + 1];
      if(value !== undefined && value !== null) m[key] = value;
    });
    return {t: row[0], m};
  });
}

// * Quota is the one failure that must not be silent: a watch that stopped recording looks exactly
// * like a tab that stopped growing. Drop the oldest rows until it fits, and if even a trimmed
// * payload is refused (another origin consumer filled the quota), say so and stand down.
function writeLog(log: WatchLog) {
  let payload = JSON.stringify(log);
  while(payload.length > MAX_BYTES && log.rows.length > 1) {
    log.rows.splice(0, Math.max(1, Math.ceil(log.rows.length / 10)));
    payload = JSON.stringify(log);
  }

  try {
    localStorage.setItem(LOG_KEY, payload);
    return true;
  } catch(e) {
    try {
      log.rows.splice(0, Math.ceil(log.rows.length / 2));
      localStorage.setItem(LOG_KEY, JSON.stringify(log));
      return true;
    } catch(e2) {
      console.error('[memoryWatch] cannot persist samples, stopping the watch', e2);
      stop();
      return false;
    }
  }
}

async function sample(reason: string) {
  if(sampling) return;
  sampling = true;
  try {
    const report = await memoryReport({quiet: true});
    // * a report without metrics would otherwise throw below on a key an earlier sample recorded
    const metrics = report.metrics || {};
    const log = readRaw();
    for(const key in metrics) {
      if(!log.keys.includes(key)) log.keys.push(key);
    }

    const row: number[] = [Date.now()];
    // * `null` for a metric this sample has no value for - JSON keeps it, and readLog drops it back
    // * out, so a thread that stopped answering reads as a gap instead of a plausible zero
    log.keys.forEach((key) => row.push(metrics[key] ?? null));
    log.rows.push(row);

    lastSampleAt = Date.now();
    writeLog(log);
  } catch(e) {
    console.error('[memoryWatch] sample failed', reason, e);
  } finally {
    sampling = false;
  }
}

// * A hidden tab is throttled and may be frozen outright, so the interval alone cannot be trusted to
// * fire. Sampling on every visibility change closes the gap from both ends: the reading taken as
// * the tab goes away bounds the freeze, and the one on return dates it
function onVisibilityChange() {
  if(Date.now() - lastSampleAt < MIN_SAMPLE_GAP) return;
  sample('visibilitychange');
}

function start(intervalMinutes = DEFAULT_INTERVAL_MINUTES) {
  stopTimer();

  // * keep the original start time across reloads - it dates the series, and a resumed watch is
  // * still the same observation
  const previous = readJSON<WatchConfig>(CONFIG_KEY);
  const config: WatchConfig = {intervalMinutes, startedAt: previous?.startedAt || Date.now()};
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch(e) {
    console.error('[memoryWatch] cannot persist the config - the watch will not survive a reload', e);
  }

  interval = window.setInterval(() => sample('interval'), intervalMinutes * 60 * 1000);
  document.addEventListener('visibilitychange', onVisibilityChange);
  sample('start');

  console.log(
    `[memoryWatch] sampling every ${intervalMinutes} min into localStorage['${LOG_KEY}']. ` +
    'It survives a reload and a renderer crash. memoryWatchSummary() to read it.'
  );
}

function stopTimer() {
  if(interval) {
    clearInterval(interval);
    interval = undefined;
  }

  document.removeEventListener('visibilitychange', onVisibilityChange);
}

function stop() {
  stopTimer();
  try {
    localStorage.removeItem(CONFIG_KEY);
  } catch(e) {}
  console.log('[memoryWatch] stopped. The samples are kept - clearMemoryWatch() to drop them.');
}

// * first / last / delta per metric, ordered by what grew most, which is the whole point of keeping
// * the series: it names the counter to snapshot next
function summary() {
  const log = readLog();
  if(log.length < 2) {
    console.warn('[memoryWatch] not enough samples yet:', log.length);
    return log;
  }

  const first = log[0], last = log[log.length - 1];
  const rows: Record<string, any> = {};
  const keys = new Set([...Object.keys(first.m || {}), ...Object.keys(last.m || {})]);
  const growth: [string, number][] = [];
  for(const key of keys) {
    const from = first.m?.[key] ?? 0;
    const to = last.m?.[key] ?? 0;
    let peak = 0;
    for(const entry of log) peak = Math.max(peak, entry.m?.[key] ?? 0);
    growth.push([key, to - from]);
    rows[key] = {from, to, delta: to - from, peak};
  }

  growth.sort((a, b) => b[1] - a[1]);
  const ordered: Record<string, any> = {};
  for(const [key] of growth) ordered[key] = rows[key];

  const hours = (last.t - first.t) / 3600000;
  console.log(
    `[memoryWatch] ${log.length} samples over ${hours.toFixed(1)} h ` +
    `(${new Date(first.t).toLocaleString()} -> ${new Date(last.t).toLocaleString()}), biggest growth first:`
  );
  console.table(ordered);
  return ordered;
}

async function download(filename?: string) {
  const log = readLog();
  // * dynamic, like mountLogExport does it: exportLogs statically imports apiManagerProxy, and that
  // * import must not be reachable from a module a worker bundle might pull in
  const {buildExportMeta} = await import('./exportLogs');
  const meta = buildExportMeta(log.length, {watch: readJSON<WatchConfig>(CONFIG_KEY)});

  const payload = [JSON.stringify(meta)].concat(log.map((entry) => JSON.stringify(entry))).join('\n');
  const url = URL.createObjectURL(new Blob([payload], {type: 'application/x-ndjson'}));
  const name = filename || `tweb-memory-${new Date().toISOString().replace(/[:.]/g, '-')}.ndjson`;
  createDownloadAnchor(url, name, () => setTimeout(() => URL.revokeObjectURL(url), 10000));
}

function clear() {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch(e) {}
  console.log('[memoryWatch] samples dropped.');
}

if(MOUNT_CLASS_TO) {
  MOUNT_CLASS_TO.memoryWatch = start;
  MOUNT_CLASS_TO.memoryWatchStop = stop;
  MOUNT_CLASS_TO.memoryWatchSummary = summary;
  MOUNT_CLASS_TO.memoryWatchLog = readLog;
  MOUNT_CLASS_TO.downloadMemoryWatch = download;
  MOUNT_CLASS_TO.clearMemoryWatch = clear;

  // * resume by itself, otherwise the series ends at the first reload - which is exactly when a tab
  // * that has been observed for days is most likely to be restarted
  const config = readJSON<WatchConfig>(CONFIG_KEY);
  if(config?.intervalMinutes) {
    start(config.intervalMinutes);
  }
}
