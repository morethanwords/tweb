/*
 * await window.memoryReport() - a one-call snapshot of the structures that dominate this TAB'S
 * PROCESS. Not just this thread: Chrome hosts a same-origin SharedWorker inside an existing
 * renderer process for that site - the tab's own - so the figure Chrome's task manager charges to
 * "Telegram Web" covers the page plus the MTProto worker, the crypto pool, the lottie pool and the
 * per-tab compositor. `performance.memory` only ever reports the isolate that asks, which is how a
 * tab can read 125 MB of JS heap while its process holds 2.6 GB.
 *
 * So the report has two halves: what this thread can count directly, and a `memoryStats` round-trip
 * to every other isolate in the process. The `detached` numbers in the first half are the ones to
 * watch: an object still registered while its element is out of the DOM is one nothing will ever
 * come back for. On a healthy tab they stay near zero.
 *
 * Reads everything off MOUNT_CLASS_TO rather than importing the registries, so this module stays a
 * leaf and cannot introduce an import cycle into the render path (see mountLogExport.ts for why that
 * matters here).
 */

import {MOUNT_CLASS_TO} from '@config/debug';
import {canvasBytes, formatBytes, ThreadMemoryStats, withMemoryStatsTimeout} from '@lib/debug/memoryStats';

type Counted = {total: number, detached: number};

const describe = (counted: Counted, bytes?: number) => {
  const attached = counted.total - counted.detached;
  return `${counted.total} total | ${attached} attached | ${counted.detached} detached` +
    (bytes === undefined ? '' : ` | ${formatBytes(bytes)}`);
};

// * One row per isolate. A pool answers per worker, so lottie/crypto show up several times.
function collectThreadStats(ctx: any): Promise<ThreadMemoryStats>[] {
  const promises: Promise<ThreadMemoryStats>[] = [];

  const proxy = ctx.apiManagerProxy;
  if(proxy) {
    promises.push(withMemoryStatsTimeout(proxy.invoke('getMemoryStats', undefined), 'mtproto'));
  }

  const lottiePort = ctx.lottieMessagePort;
  lottiePort?.sendPorts?.forEach((_port: any, index: number) => {
    promises.push(withMemoryStatsTimeout(
      lottiePort.invokeLottie(index, 'memoryStats', undefined),
      `lottie #${index}`
    ));
  });

  const cryptoPort = ctx.cryptoMessagePort;
  cryptoPort?.sendPorts?.forEach((port: MessagePort, index: number) => {
    promises.push(withMemoryStatsTimeout(
      cryptoPort.invoke('memoryStats', undefined, undefined, port),
      `crypto #${index}`
    ));
  });

  // * The compositor is spawned lazily - no port means no worker, which is itself worth knowing
  const compositorPort = ctx.compositorMessagePort;
  if(compositorPort?.sendPorts?.length) {
    promises.push(withMemoryStatsTimeout(
      compositorPort.invokeCompositor('memoryStats', undefined),
      'compositor'
    ));
  }

  return promises;
}

function formatThreadRow(stats: ThreadMemoryStats) {
  // * jsHeap is normally absent off the main thread - performance.memory is window-only, so a
  // * worker cannot read its own isolate. The counts are what that thread can actually vouch for.
  const row: Record<string, string | number> = {
    jsHeap: stats.jsHeap === undefined ? 'unreadable' : formatBytes(stats.jsHeap)
  };

  for(const key in stats.details) {
    const value = stats.details[key];
    row[key] = /Bytes$/.test(key) ? formatBytes(value) : value;
  }

  return row;
}

export default async function memoryReport() {
  const ctx: any = MOUNT_CLASS_TO;
  const report: Record<string, any> = {};

  // * Fire the round-trips first so the workers answer while this thread counts its own structures
  const threadPromises = collectThreadStats(ctx);

  const memory = (performance as any).memory;
  report.jsHeap = memory ? formatBytes(memory.usedJSHeapSize) : 'n/a';
  report.uptimeMinutes = Math.round(performance.now() / 60000);

  const renderers: Counted = {total: 0, detached: 0};
  let rendererBytes = 0, rendererDetachedBytes = 0;
  ctx.emojiRenderers?.forEach((renderer: any) => {
    ++renderers.total;
    const bytes = canvasBytes(renderer.canvas);
    rendererBytes += bytes;
    if(!renderer.isConnected) {
      ++renderers.detached;
      rendererDetachedBytes += bytes;
    }
  });
  report.customEmojiRenderers = describe(renderers, rendererBytes);
  report.customEmojiRenderersDetachedBytes = formatBytes(rendererDetachedBytes);

  const items: Counted = {total: 0, detached: 0};
  const byGroup: Record<string, number> = {};
  ctx.animationIntersector?.byPlayer?.forEach((item: any) => {
    ++items.total;
    if(item.el?.isConnected) return;
    ++items.detached;
    const key = `${item.group || '(none)'} | ${item.type || '?'}`;
    byGroup[key] = (byGroup[key] || 0) + 1;
  });
  report.animationItems = describe(items);
  // * Only the detached ones are broken down - a healthy tab leaves this empty
  report.detachedByGroup = byGroup;

  const players: Counted = {total: 0, detached: 0};
  let playerBytes = 0;
  const allPlayers: any[] = Object.values(ctx.lottieLoader?.players || {});
  const asArray = (value: any): any[] => Array.isArray(value) ? value : (value ? [value] : []);
  for(const player of allPlayers) {
    ++players.total;
    const canvases = asArray(player.canvas);
    let attached = false;
    for(const canvas of canvases) {
      playerBytes += canvasBytes(canvas);
      if(canvas.isConnected) attached = true;
    }

    // * An 'emoji' offscreen player owns no canvas of its own - it paints onto its renderer's - so
    // * fall back to its containers. LottiePlayer.el is an ARRAY: reading .isConnected off it
    // * directly is always undefined and would report every such player as detached.
    if(!attached) attached = asArray(player.el).some((el) => el.isConnected);
    if(!attached) ++players.detached;
  }
  report.lottiePlayers = describe(players, playerBytes);

  let frames = 0, frameBytes = 0;
  ctx.framesCache?.cache?.forEach((entry: any) => {
    entry.frames?.forEach((frame: any) => frameBytes += frame.byteLength || 0);
    entry.framesNew?.forEach((frame: any) => frameBytes += canvasBytes(frame));
    frames += (entry.frames?.size || 0) + (entry.framesNew?.size || 0);
  });
  report.lottieFrameCache = `${ctx.framesCache?.cache?.size || 0} caches | ${frames} frames | ${formatBytes(frameBytes)}`;

  const canvases = document.querySelectorAll('canvas');
  let domCanvasBytes = 0;
  canvases.forEach((canvas) => domCanvasBytes += canvasBytes(canvas));
  report.domCanvases = `${canvases.length} | ${formatBytes(domCanvasBytes)}`;

  // * The worker's data caches are mirrored here 1:1, so counting the mirror is the cheapest
  // * estimate of what the MTProto isolate is carrying - and no RPC is needed for it.
  const mirrors = ctx.apiManagerProxy?.mirrors;
  let mirroredMessages = 0;
  for(const peerId in mirrors?.messages) {
    mirroredMessages += Object.keys(mirrors.messages[peerId] || {}).length;
  }
  report.mirroredMessages = mirroredMessages;
  report.mirroredPeers = Object.keys(mirrors?.peers || {}).length;
  report.mirroredThumbs = Object.keys(mirrors?.thumbs || {}).length;

  report.domNodes = document.getElementsByTagName('*').length;
  report.domVideos = document.querySelectorAll('video').length;
  report.chatStack = ctx.appImManager?.chats?.length ?? -1;
  report.downloads = Object.keys(ctx.appDownloadManager?.downloads || {}).length;

  const threads = await Promise.all(threadPromises);
  const byThread: Record<string, any> = {};
  for(const stats of threads) {
    byThread[stats.thread] = formatThreadRow(stats);
  }

  report.otherIsolates = threads.length;

  console.table(report);
  console.log(
    '[memoryReport] other isolates in this process (SharedWorkers included). Their JS heaps are ' +
    'unreadable from inside - compare the counts below against Chrome\'s per-process footprint:'
  );
  console.table(byThread);
  if(Object.keys(byGroup).length) {
    console.warn('[memoryReport] detached animation items by group:');
    console.table(byGroup);
  }

  return {...report, threads: byThread};
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.memoryReport = memoryReport);
