/*
 * window.memoryReport() - a one-call snapshot of the structures that dominate this tab's memory.
 *
 * Chrome cannot answer "which subsystem is holding the gigabytes": the DevTools Memory tab only
 * accounts for the JS heap, and ImageBitmap / OffscreenCanvas backing stores - the bulk of what a
 * chat client keeps around - are external to it. So the app has to count its own registries.
 *
 * The `detached` numbers are the ones to watch: an object still registered while its element is out
 * of the DOM is one nothing will ever come back for. On a healthy tab they stay near zero.
 *
 * Reads everything off MOUNT_CLASS_TO rather than importing the registries, so this module stays a
 * leaf and cannot introduce an import cycle into the render path (see mountLogExport.ts for why that
 * matters here).
 */

import {MOUNT_CLASS_TO} from '@config/debug';

type Counted = {total: number, detached: number};

const formatBytes = (bytes: number) => (bytes / 1048576).toFixed(1) + ' MB';

const canvasBytes = (canvas: {width?: number, height?: number}) =>
  ((canvas?.width || 0) * (canvas?.height || 0) * 4);

const describe = (counted: Counted, bytes?: number) => {
  const attached = counted.total - counted.detached;
  return `${counted.total} total | ${attached} attached | ${counted.detached} detached` +
    (bytes === undefined ? '' : ` | ${formatBytes(bytes)}`);
};

export default function memoryReport() {
  const ctx: any = MOUNT_CLASS_TO;
  const report: Record<string, any> = {};

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

  report.domNodes = document.getElementsByTagName('*').length;
  report.domVideos = document.querySelectorAll('video').length;
  report.chatStack = ctx.appImManager?.chats?.length ?? -1;

  console.table(report);
  if(Object.keys(byGroup).length) {
    console.warn('[memoryReport] detached animation items by group:');
    console.table(byGroup);
  }

  return report;
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.memoryReport = memoryReport);
