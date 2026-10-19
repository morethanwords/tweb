import {Browser, CDPSession, Page} from '@playwright/test';

/*
 * What a tab costs, measured from outside it.
 *
 * Inside the page only the main isolate's heap is readable (`performance.memory` is window-only),
 * while Chrome charges the tab for every SharedWorker it hosts in the same renderer - the MTProto
 * worker, the crypto and lottie pools - and for what no JavaScript heap shows at all: Blink's DOM
 * (Oilpan), ArrayBuffers and wasm memories (PartitionAlloc), shared memory. The browser's DevTools
 * protocol sees all of it:
 * - every isolate's JS heap: attach to each page / worker target and ask `Runtime.getHeapUsage`;
 * - the renderer's memory by allocator: a memory-infra dump, the same one chrome://tracing records;
 * - the DOM's own counters: `Memory.getDOMCounters`.
 * Plus the app's own counts (`memoryReport()`), which say which of its structures hold the memory.
 *
 * Below the probe, the session that memorySoakApp.spec.ts plays: conversations scrolled through, the
 * emoji and sticker panels, the profile sidebar - each round ending where it started.
 */

export type IsolateHeap = {kind: string, url: string, used: number, total: number, backing: number};

export type ProcessMemory = {
  pid: number,
  footprint: number,
  // * top-level allocators of the memory-infra dump: v8, blink_gc, partition_alloc, malloc, ...
  allocators: Record<string, number>
};

export type MemoryCheckpoint = {
  label: string,
  at: number,
  isolates: IsolateHeap[],
  // * JS heap per kind of isolate, summed over a pool's members
  heaps: Record<string, number>,
  dom: {documents: number, nodes: number, jsEventListeners: number},
  process?: ProcessMemory,
  metrics: Record<string, number>
};

const MB = 1024 * 1024;
const ALLOCATORS = ['v8', 'blink_gc', 'partition_alloc', 'malloc', 'shared_memory', 'cc', 'gpu', 'canvas', 'skia', 'web_cache', 'font_caches', 'discardable'];

// * which of the app's threads a target is, by the script it runs
const kindOf = (type: string, url: string) => {
  if(type === 'page') return 'page';
  if(type === 'service_worker') return 'sw';
  // * `index.worker.ts?worker_file` in dev, `index.worker-<hash>.js` built - the part before the dot
  const name = (url.split('?')[0].split('/').pop() || '').split('.')[0];
  if(name === 'index') return 'mtproto';
  if(name === 'tlottie') return 'lottie';
  return name || type;
};

export const formatMB = (bytes: number) => (bytes / MB).toFixed(1);

export class MemoryProbe {
  private browserCdp: CDPSession;
  private pageCdp: CDPSession;
  private sessions = new Map<string, string>(); // targetId -> sessionId
  private blobKinds = new Map<string, string>(); // targetId -> kind
  private replies = new Map<number, (message: any) => void>();
  private lastId = 0;

  private constructor(private browser: Browser, private page: Page) {}

  public static async attach(browser: Browser, page: Page) {
    const probe = new MemoryProbe(browser, page);
    probe.browserCdp = await browser.newBrowserCDPSession();
    probe.pageCdp = await page.context().newCDPSession(page);
    probe.browserCdp.on('Target.receivedMessageFromTarget', ({message}) => {
      const parsed = JSON.parse(message);
      const reply = parsed.id && probe.replies.get(parsed.id);
      if(reply) {
        probe.replies.delete(parsed.id);
        reply(parsed);
      }
    });
    probe.browserCdp.on('Target.detachedFromTarget', ({sessionId}) => {
      for(const [targetId, id] of probe.sessions) {
        if(id === sessionId) probe.sessions.delete(targetId);
      }
    });
    return probe;
  }

  // * The app's own targets only: the page and the workers of its origin - by URL, or by a blob of it:
  // * every member of the crypto and lottie pools but the first runs from a blob the MTProto worker
  // * minted (registerThreadedWorker)
  private async targets() {
    const origin = new URL(this.page.url()).origin;
    const {targetInfos} = await this.browserCdp.send('Target.getTargets');
    return targetInfos.filter((target) => {
      return ['page', 'shared_worker', 'worker', 'service_worker'].includes(target.type) &&
        (target.url.startsWith(origin + '/') || target.url.startsWith('blob:' + origin + '/'));
    });
  }

  // * A blob says nothing of what it runs, so the worker is asked: each pool mounts its message port
  private async kindOfTarget(target: {targetId: string, type: string, url: string}) {
    if(!target.url.startsWith('blob:')) {
      return kindOf(target.type, target.url);
    }

    let kind = this.blobKinds.get(target.targetId);
    if(!kind) {
      const {result} = await this.sendTo(target.targetId, 'Runtime.evaluate', {
        expression: `self.lottieMessagePort ? 'lottie' : self.cryptoMessagePort ? 'crypto' : 'blob'`,
        returnByValue: true
      });
      this.blobKinds.set(target.targetId, kind = result.value);
    }

    return kind;
  }

  // * A worker target is reached through the browser's session: Playwright's own API has no handle
  // * on a SharedWorker at all. Not flattened, so the messages go through `sendMessageToTarget`.
  private async sendTo<T = any>(targetId: string, method: string, params: object = {}, timeout = 15000): Promise<T> {
    let sessionId = this.sessions.get(targetId);
    if(!sessionId) {
      ({sessionId} = await this.browserCdp.send('Target.attachToTarget', {targetId, flatten: false}));
      this.sessions.set(targetId, sessionId);
    }

    const id = ++this.lastId;
    let timer: ReturnType<typeof setTimeout>;
    const reply = new Promise<any>((resolve, reject) => {
      timer = setTimeout(() => {
        this.replies.delete(id);
        reject(new Error(`${method} on ${targetId}: no answer in ${timeout} ms`));
      }, timeout);
      this.replies.set(id, (message) => {
        clearTimeout(timer);
        message.error ? reject(new Error(`${method}: ${message.error.message}`)) : resolve(message.result);
      });
    });

    try {
      await this.browserCdp.send('Target.sendMessageToTarget', {sessionId, message: JSON.stringify({id, method, params})});
    } catch(err) {
      // * the target went away: nothing will answer, and the wait must not outlive the call
      clearTimeout(timer);
      this.replies.delete(id);
      reply.catch(() => {});
      throw err;
    }

    return reply;
  }

  // * Workers come and go (a spoiler worker leaves with its last spoiler): one that vanished between
  // * listing and asking is skipped. One still there that did not answer fails the measurement - a
  // * missing reading would pass for memory that did not grow
  private async forEachTarget<T>(callback: (target: {targetId: string, type: string, url: string}) => Promise<T>) {
    const results: T[] = [];
    for(const target of await this.targets()) {
      try {
        results.push(await callback(target));
      } catch(err) {
        const {targetInfos} = await this.browserCdp.send('Target.getTargets');
        if(targetInfos.some(({targetId}) => targetId === target.targetId)) {
          throw err;
        }

        console.warn(`[memory] ${target.type} ${target.url} is gone: ${(err as Error).message}`);
      }
    }

    return results;
  }

  // * Twice: the first pass can leave finalizers whose work frees more on the second
  public async collectGarbage() {
    for(let i = 0; i < 2; ++i) {
      await this.forEachTarget((target) => this.sendTo(target.targetId, 'HeapProfiler.collectGarbage'));
    }
  }

  public async isolates(): Promise<IsolateHeap[]> {
    return this.forEachTarget(async(target) => {
      const usage = await this.sendTo(target.targetId, 'Runtime.getHeapUsage');
      return {
        kind: await this.kindOfTarget(target),
        url: target.url,
        used: usage.usedSize,
        total: usage.totalSize,
        backing: usage.backingStorageSize || 0
      };
    });
  }

  // * One memory-infra dump of every process; the page's renderer is the one labelled with its title
  public async processMemory(): Promise<ProcessMemory> {
    const events: any[] = [];
    const onData = ({value}: {value: any[]}) => events.push(...value);
    const complete = new Promise<void>((resolve) => this.browserCdp.once('Tracing.tracingComplete', () => resolve()));
    this.browserCdp.on('Tracing.dataCollected', onData);
    try {
      await this.browserCdp.send('Tracing.start', {
        traceConfig: {
          includedCategories: ['disabled-by-default-memory-infra'],
          excludedCategories: ['*'],
          memoryDumpConfig: {triggers: []}
        },
        transferMode: 'ReportEvents'
      } as any);
      await this.browserCdp.send('Tracing.requestMemoryDump', {deterministic: true, levelOfDetail: 'detailed'} as any);
      await this.browserCdp.send('Tracing.end');
      await complete;
    } finally {
      this.browserCdp.off('Tracing.dataCollected', onData);
    }

    const title = await this.page.title();
    const labels = new Map<number, string>();
    const dumps = new Map<number, {totals?: any, allocators?: any}>();
    for(const event of events) {
      if(event.ph === 'M' && event.name === 'process_labels') labels.set(event.pid, String(event.args?.labels || ''));
      // * totals and allocators can arrive in separate events for one process - keep the last of each
      const dump = event.ph === 'v' && event.args?.dumps;
      if(dump) {
        const entry = dumps.get(event.pid) || {};
        if(dump.process_totals) entry.totals = dump.process_totals;
        if(dump.allocators) entry.allocators = dump.allocators;
        dumps.set(event.pid, entry);
      }
    }

    const hex = (value: string) => value ? parseInt(value, 16) : 0;
    const footprintOf = (pid: number) => hex(dumps.get(pid)?.totals?.private_footprint_bytes);
    const renderers = [...dumps.keys()].filter((pid) => dumps.get(pid).allocators?.blink_gc);
    const pid = renderers.find((pid) => title && labels.get(pid)?.includes(title)) ??
      renderers.sort((a, b) => footprintOf(b) - footprintOf(a))[0];
    if(pid === undefined) {
      return undefined;
    }

    const allocators: Record<string, number> = {};
    for(const name of ALLOCATORS) {
      const attrs = dumps.get(pid).allocators?.[name]?.attrs;
      const size = hex(attrs?.effective_size?.value) || hex(attrs?.size?.value);
      if(size) allocators[name] = size;
    }

    return {pid, footprint: footprintOf(pid), allocators};
  }

  public async checkpoint(label: string): Promise<MemoryCheckpoint> {
    await this.collectGarbage();
    const isolates = await this.isolates();
    const heaps: Record<string, number> = {};
    for(const isolate of isolates) {
      heaps[isolate.kind] = (heaps[isolate.kind] || 0) + isolate.used;
    }

    const dom = await this.pageCdp.send('Memory.getDOMCounters');
    const metrics = await this.page.evaluate(async() => {
      const report = await (window as any).memoryReport?.({quiet: true});
      return (report?.metrics || {}) as Record<string, number>;
    });
    const process = await this.processMemory();
    return {label, at: Date.now(), isolates, heaps, dom, process, metrics};
  }
}

// * One line per checkpoint: what a person reads to see where it went
export function describeCheckpoint(checkpoint: MemoryCheckpoint) {
  const heaps = Object.entries(checkpoint.heaps)
  .sort(([, a], [, b]) => b - a)
  .map(([kind, bytes]) => `${kind} ${formatMB(bytes)}`)
  .join(', ');
  const process = checkpoint.process ?
    `footprint ${formatMB(checkpoint.process.footprint)} (` +
      Object.entries(checkpoint.process.allocators).sort(([, a], [, b]) => b - a).slice(0, 5)
      .map(([name, bytes]) => `${name} ${formatMB(bytes)}`).join(', ') + ')' :
    'no memory-infra dump';
  const metrics = checkpoint.metrics;
  const lottieHeap = Object.keys(metrics).filter((key) => /^lottie_\d+\.wasmHeapBytes$/.test(key))
  .reduce((sum, key) => sum + metrics[key], 0);
  return `${checkpoint.label.padEnd(10)} JS MB: ${heaps} | ${process} | DOM ${checkpoint.dom.nodes} nodes, ` +
    `${checkpoint.dom.jsEventListeners} listeners | lottie wasm ${formatMB(lottieHeap)} MB`;
}

// * The conversations a session goes through: the first rows of the chat list
export async function pickPeers(page: Page, count: number) {
  return page.evaluate((count) => {
    const ids = [...document.querySelectorAll<HTMLElement>('#column-left .chatlist-chat[data-peer-id]')]
    .map((row) => row.dataset.peerId)
    .filter((peerId) => peerId && peerId !== '0');
    return [...new Set(ids)].slice(0, count);
  }, count);
}

// * One round of an ordinary session, ending where it started: the chat list, no conversation open
export async function playRound(page: Page, peers: string[]) {
  for(const peerId of peers) {
    await page.evaluate((peerId) => (window as any).appImManager.setPeer({peerId: +peerId}), peerId);
    await page.waitForFunction((peerId) => String((window as any).appImManager.chat?.peerId) === peerId,
      peerId, {timeout: 30_000});
    // * an empty conversation has no bubbles to wait for - a moment is enough then
    await page.waitForFunction(() => document.querySelectorAll('#column-center .bubble').length > 0,
      null, {timeout: 10_000}).catch(() => {});
    await page.waitForTimeout(1500);

    // * up through the history and back, which loads it, renders it and lets it go off screen
    for(let i = 0; i < 4; ++i) {
      await page.evaluate(() => {
        const container = (window as any).appImManager.chat?.bubbles?.scrollable?.container as HTMLElement;
        if(container) container.scrollTop -= 1500;
      });
      await page.waitForTimeout(800);
    }

    await page.evaluate(() => {
      const container = (window as any).appImManager.chat?.bubbles?.scrollable?.container as HTMLElement;
      if(container) container.scrollTop = container.scrollHeight;
    });
    await page.waitForTimeout(800);
  }

  await browsePanels(page);
  await openProfile(page);

  await page.evaluate(() => (window as any).appImManager.setPeer({peerId: 0}));
  await page.waitForTimeout(2000);
}

// * The emoji and sticker panels of the conversation that is open, scrolled through; skipped where
// * there is no composer to open them from (a channel one cannot post to)
async function browsePanels(page: Page) {
  const toggle = page.locator('#column-center .toggle-emoticons').first();
  if(!await toggle.isVisible().catch(() => false)) {
    return;
  }

  await toggle.click();
  await page.waitForTimeout(1500);
  for(const tab of ['.emoji-tabs-stickers', '.emoji-tabs-emoji']) {
    const button = page.locator(`.emoji-dropdown ${tab}`).first();
    if(!await button.isVisible().catch(() => false)) {
      continue;
    }

    // * a real click: the tabs listen through attachClickEvent, which ignores el.click()
    await button.click();
    await page.waitForTimeout(1000);
    // * From the top every round, to the same depths: the panel keeps where it was scrolled, and a
    // * round that went on from there would load new content and grow for no fault of the code
    for(let i = 0; i <= 6; ++i) {
      await page.evaluate((top) => {
        const scrollables = [...document.querySelectorAll<HTMLElement>('.emoji-dropdown .scrollable')]
        .filter((element) => element.offsetParent && element.scrollHeight > element.clientHeight);
        const container = scrollables[scrollables.length - 1];
        if(container) container.scrollTop = top;
      }, i * 600);
      await page.waitForTimeout(500);
    }
  }

  await toggle.click();
  await page.waitForTimeout(1000);
}

async function openProfile(page: Page) {
  const info = page.locator('#column-center .chat-info').first();
  if(!await info.isVisible().catch(() => false)) {
    return;
  }

  await info.click();
  await page.waitForTimeout(2500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
}
