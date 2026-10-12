// The test runners' side of the machine-wide queue for heavy test runs — how it
// works and why: scripts/test-queue.sh.
//
// A Playwright config names this file as its globalSetup, which waits until the
// queue has the run's workers free — the workers of the config as resolved, so a
// config that spreads another one and changes them is counted right — and wraps
// its `workers` in playwrightWorkers(), which takes fewer for a run narrowed to
// some files or tests. vite.config.ts sets vitest's maxWorkers from
// vitestWorkers(), which waits while the config loads.
import type {FullConfig} from '@playwright/test';
import {execFileSync, spawn} from 'child_process';
import {existsSync} from 'fs';
import os from 'os';
import path from 'path';

const SCRIPT = path.resolve('scripts/test-queue.sh');
// what a run narrowed to some files or tests asks for, so that a few of them share the machine
const NARROWED = Number(process.env.TWEB_TEST_QUEUE_NARROWED) || 4;

// how a command line's flags take values, to tell them from the file filters
type ArgSpec = {
  values: Set<string>,
  // takes every argument up to the next flag
  variadic?: Set<string>,
  // takes the next argument only when it is one of these
  optional?: Map<string, Set<string>>,
  // an unknown --flag takes the next argument unless it looks like a path (vitest has too many to list)
  guess?: boolean
};

const PLAYWRIGHT_ARGS: ArgSpec = {
  values: new Set([
    '-c', '--config', '-g', '--grep', '-G', '--grep-invert', '-j', '--workers', '--reporter', '--retries',
    '--timeout', '--global-timeout', '--repeat-each', '--shard', '--output', '--max-failures', '--trace',
    '--browser', '--tsconfig', '--test-list', '--test-list-invert', '--ui-host', '--ui-port',
    '--update-source-method', '--last-failed-file', '--run-agents'
  ]),
  variadic: new Set(['--project']),
  optional: new Map(['-u', '--update-snapshots'].map((flag) => [flag, new Set(['all', 'changed', 'missing', 'none'])]))
};
const PLAYWRIGHT_NARROWING_FLAGS = ['-g', '--grep', '-G', '--grep-invert', '--last-failed', '--last-failed-file', '--only-changed', '--test-list'];
const PLAYWRIGHT_UI_FLAGS = ['--ui', '--ui-host', '--ui-port'];
const VITEST_ARGS: ArgSpec = {
  values: new Set([
    '-c', '--config', '-r', '--root', '--dir', '--reporter', '--outputFile', '--pool', '--maxWorkers',
    '--project', '--shard', '--environment', '-t', '--testNamePattern', '--exclude', '--retry', '--bail',
    '--mode', '--testTimeout', '--hookTimeout', '--teardownTimeout'
  ]),
  guess: true
};
const VITEST_COMMANDS = new Set(['run', 'watch', 'dev', 'bench']);

// workers for the whole machine, as the queue counts them; 0 when the queue cannot run here
let budgetCache: number;
function budget() {
  if(budgetCache === undefined) {
    try {
      budgetCache = Number(execFileSync('bash', [SCRIPT, 'budget'], {stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8'})) || 0;
    } catch{
      budgetCache = 0;
    }
  }
  return budgetCache;
}

function enabled() {
  return !process.env.CI && process.env.TWEB_TEST_QUEUE !== '0' && existsSync(SCRIPT) && budget() > 0;
}

// the file filters and the flags of a test runner's command line
function parseArgs(args: string[], spec: ArgSpec) {
  const filters: string[] = [], flags = new Set<string>();
  for(let i = 0; i < args.length; ++i) {
    const arg = args[i];
    if(arg === '--') continue;
    if(!arg.startsWith('-')) {
      filters.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const flag = eq === -1 ? arg : arg.slice(0, eq);
    flags.add(flag);
    if(eq !== -1) continue;
    const next = args[i + 1];
    if(spec.variadic?.has(flag)) {
      while(i + 1 < args.length && !args[i + 1].startsWith('-')) ++i;
    } else if(spec.values.has(flag) || (next !== undefined && spec.optional?.get(flag)?.has(next))) {
      ++i;
    } else if(spec.guess && flag.startsWith('--') && next !== undefined && !next.startsWith('-') && !next.includes('/')) {
      ++i;
    }
  }
  return {filters, flags};
}

// `playwright test` itself, not its UI, watch or test-server modes: those run globalSetup again and again
function playwrightTestRun() {
  return process.argv[2] === 'test' && !process.env.PWTEST_WATCH &&
    !process.argv.some((arg) => PLAYWRIGHT_UI_FLAGS.some((flag) => arg === flag || arg.startsWith(flag + '=')));
}

// Playwright's own reading of `workers`: a count, or a percentage of the CPUs
function toCount(workers: number | string) {
  if(typeof workers === 'string' && workers.endsWith('%')) {
    return Math.max(1, Math.floor(os.cpus().length * parseInt(workers, 10) / 100));
  }
  return Math.max(1, Number(workers) || 1);
}

// Waits for `need` workers and returns how many the run got — or nothing, when it runs without the queue.
function take(label: string, need: number) {
  // Taken once per process tree: a second ticket of a run that already holds its workers would wait for them
  // forever.
  if(process.env.TWEB_TEST_QUEUE_HELD) return;
  // pids repeat across the sandboxes' pid namespaces
  const id = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const holder = spawn('bash', [SCRIPT, 'hold', id, String(process.pid), String(need), label], {detached: true, stdio: 'ignore'});
  holder.on('error', () => {}); // the wait below gives up on a holder that never came up
  holder.unref();
  try {
    const out = execFileSync('bash', [SCRIPT, 'wait', id, String(process.pid)], {stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8'});
    process.env.TWEB_TEST_QUEUE_HELD = id;
    return Number(out.trim()) || undefined;
  } catch(err) {
    // The ticket goes with its holder (detached, so its own process group): left waiting at the head of the
    // queue, it would hold up every run behind it.
    try {
      process.kill(-holder.pid);
    } catch{}
    // Ctrl-C or a kill that reached the wait is meant for the whole run
    const signal = (err as {signal?: string}).signal;
    if(signal) throw new Error(`[test-queue] stopped by ${signal} while waiting for its turn`);
    console.warn(`[test-queue] running without the queue: ${String((err as Error).message).split('\n')[0]}`);
  }
}

/**
 * The `workers` of a Playwright config: its own value, but no more than NARROWED
 * for a run narrowed to some files or tests and no more than the whole budget.
 * (A `--workers` on the command line overrides it, as always.)
 */
export function playwrightWorkers(workers: number | string): number | string {
  // a worker process reads the config too
  if(process.env.TEST_WORKER_INDEX !== undefined || !playwrightTestRun() || !enabled()) return workers;
  const {filters, flags} = parseArgs(process.argv.slice(3), PLAYWRIGHT_ARGS);
  const narrowed = filters.length > 0 || PLAYWRIGHT_NARROWING_FLAGS.some((flag) => flags.has(flag));
  return Math.min(toCount(workers), narrowed ? NARROWED : Infinity, budget());
}

// globalSetup of the Playwright configs: wait until the run's workers are free
export default function waitForTestQueue(config: FullConfig) {
  if(!playwrightTestRun() || !enabled()) return;
  const label = path.basename(config.configFile || 'playwright.config.ts').replace(/^playwright\.|\.?config\.[cm]?[jt]s$/g, '') || 'e2e';
  take(label, Math.min(config.workers, budget()));
}

/**
 * vitest's maxWorkers: a full run waits for the whole budget and gets it; a run of
 * some files or tests, a watch session and anything that is not vitest get
 * `undefined`, vitest's own default, at once.
 */
export function vitestWorkers(): number | undefined {
  if(!process.env.VITEST || process.env.VITEST_POOL_ID || !enabled()) return;
  const {filters, flags} = parseArgs(process.argv.slice(2), VITEST_ARGS);
  const command = VITEST_COMMANDS.has(filters[0]) ? filters.shift() : undefined;
  // vitest's own reading: --run and --watch win over the command, a terminal means watch
  const watch = flags.has('--run') ? false :
    flags.has('--watch') || flags.has('-w') || command === 'watch' || command === 'dev' || (command !== 'run' && !!process.stdin.isTTY);
  if(watch || command === 'bench' || filters.length || flags.has('-t') || flags.has('--testNamePattern') || flags.has('--changed')) return;
  return take('vitest', budget());
}
