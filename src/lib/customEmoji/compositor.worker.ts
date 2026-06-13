import applyColorOnContext from '@helpers/canvas/applyColorOnContext';
import listenMessagePort from '@helpers/listenMessagePort';
import compositorMessagePort from '@lib/customEmoji/compositorMessagePort';
import {CUSTOM_EMOJI_FADE_IN_DURATION, CUSTOM_EMOJI_FRAME_INTERVAL} from '@lib/customEmoji/constants';

type CompositorGroup = {playerReqId: number, textColored: boolean, skipFade: boolean, offsets: number[], fadeStartTime: number, painted: boolean};
type CompositorRenderer = {canvas: OffscreenCanvas, context: OffscreenCanvasRenderingContext2D, dpr: number, color: string, fadeEnabled: boolean, groups: Map<DocId, CompositorGroup>, dirty: boolean, suspended: boolean};

const renderers: Map<number, CompositorRenderer> = new Map();
const latestFrames: Map<number, ImageBitmap> = new Map(); // playerReqId -> latest frame
const decodePorts: Map<number, MessagePort> = new Map(); // rlottie workerId -> port

let flushTimeout: number;

const withRenderer = (rendererId: number, callback: (renderer: CompositorRenderer) => void) => {
  const renderer = renderers.get(rendererId);
  if(renderer) callback(renderer);
};

const forEachRendererReferencing = (playerReqId: number, callback: (renderer: CompositorRenderer) => void) => {
  for(const renderer of renderers.values()) {
    for(const group of renderer.groups.values()) {
      if(group.playerReqId === playerReqId) {
        callback(renderer);
        break;
      }
    }
  }
};

const isPlayerReferenced = (playerReqId: number) => {
  let referenced = false;
  forEachRendererReferencing(playerReqId, () => {
    referenced = true;
  });

  return referenced;
};

// without this, dead players' last bitmaps accumulate for the tab's lifetime
const releasePlayerFrameIfOrphan = (playerReqId: number) => {
  if(isPlayerReferenced(playerReqId)) {
    return;
  }

  latestFrames.get(playerReqId)?.close?.();
  latestFrames.delete(playerReqId);
};

// the exact op sequence of the UI renderer paint (customEmoji/renderer.ts render()) minus DOM;
// returns whether a fade is still in progress (so the flush loop keeps repainting for alpha)
const paintRenderer = (rendererId: number, renderer: CompositorRenderer) => {
  const {canvas, context, dpr} = renderer;
  context.clearRect(0, 0, canvas.width, canvas.height);

  let fading = false;
  const now = performance.now();
  for(const [groupId, group] of renderer.groups) {
    if(!group.offsets.length) {
      continue;
    }

    const frame = latestFrames.get(group.playerReqId);
    if(!frame) {
      continue;
    }

    let alpha = 1;
    if(!group.skipFade && renderer.fadeEnabled) {
      if(!group.fadeStartTime) {
        group.fadeStartTime = now; // start the fade on first paint
      }

      alpha = Math.min(1, (now - group.fadeStartTime) / CUSTOM_EMOJI_FADE_IN_DURATION);
      if(alpha < 1) {
        fading = true;
      }
    }

    if(alpha < 1) {
      context.globalAlpha = alpha;
    }

    for(let i = 0; i < group.offsets.length; i += 3) {
      const top = Math.round(group.offsets[i] * dpr);
      const left = Math.round(group.offsets[i + 1] * dpr);
      let frameWidth = frame.width;
      let frameHeight = frame.height;

      const elementWidth = Math.round(group.offsets[i + 2] * dpr);
      if(elementWidth !== frameWidth) {
        frameWidth = elementWidth;
        frameHeight = elementWidth;
      }

      if(left < 0 || left > canvas.width - frameWidth) {
        continue;
      }

      context.drawImage(frame, left, top, frameWidth, frameHeight);

      if(group.textColored && renderer.color) {
        applyColorOnContext(context, renderer.color, left, top, frameWidth, frameHeight);
      }
    }

    if(alpha < 1) {
      context.globalAlpha = 1;
    }

    if(!group.painted) {
      group.painted = true; // one-shot; re-armed by resetFade
      compositorMessagePort.invokeVoid('groupPainted', {rendererId, groupId});
    }
  }

  return fading;
};

const flush = () => {
  flushTimeout = undefined;

  let anyFading = false;
  for(const [rendererId, renderer] of renderers) {
    if(!renderer.dirty || renderer.suspended) {
      continue;
    }

    const fading = paintRenderer(rendererId, renderer);
    renderer.dirty = fading; // keep fading renderers dirty so alpha animates even when frames pause
    anyFading ||= fading;
  }

  if(anyFading) {
    scheduleFlush(); // re-arm while anything is dirty, self-stop otherwise
  }
};

const scheduleFlush = () => {
  if(flushTimeout !== undefined) {
    return;
  }

  // single coalescing timer; no rAF anywhere (timer discipline matches the rlottie workers)
  flushTimeout = setTimeout(flush, CUSTOM_EMOJI_FRAME_INTERVAL) as any as number;
};

const onDecodedFrame = ({data}: MessageEvent<{reqId: number, frame: ImageBitmap}>) => {
  latestFrames.get(data.reqId)?.close?.();

  let dirty = false;
  forEachRendererReferencing(data.reqId, (renderer) => {
    renderer.dirty = dirty = true;
  });

  if(!dirty) {
    // no group references the player: either a trailing in-flight frame racing a detach
    // (the decode ports have no FIFO with the RPC port) or an early frame before attachGroup -
    // nothing would ever close the bitmap, and a live player posts the next one within ~16 ms
    data.frame.close?.();
    latestFrames.delete(data.reqId);
    return;
  }

  latestFrames.set(data.reqId, data.frame);
  scheduleFlush();
};

compositorMessagePort.addMultipleEventsListeners({
  attachRenderer: ({rendererId, canvas, dpr, fadeEnabled}) => {
    renderers.set(rendererId, {
      canvas,
      context: canvas.getContext('2d'),
      dpr,
      color: undefined,
      fadeEnabled,
      groups: new Map(),
      dirty: false,
      suspended: false
    });
  },

  detachRenderer: ({rendererId}) => withRenderer(rendererId, (renderer) => {
    renderers.delete(rendererId);
    for(const group of renderer.groups.values()) {
      releasePlayerFrameIfOrphan(group.playerReqId);
    }
  }),

  resizeRenderer: ({rendererId, width, height}) => withRenderer(rendererId, (renderer) => {
    renderer.canvas.width = width; // resizing clears the canvas
    renderer.canvas.height = height;
    renderer.dirty = true;
    scheduleFlush();
  }),

  configRenderer: (payload) => withRenderer(payload.rendererId, (renderer) => {
    if('color' in payload) renderer.color = payload.color;
    if('fadeEnabled' in payload) renderer.fadeEnabled = payload.fadeEnabled;
    if('dpr' in payload) renderer.dpr = payload.dpr;
    renderer.dirty = true;
    scheduleFlush();
  }),

  attachGroup: ({rendererId, groupId, playerReqId, textColored, skipFade}) => withRenderer(rendererId, (renderer) => {
    const existing = renderer.groups.get(groupId);
    if(existing) {
      // re-attach (reactions re-render, instantView shared renderer): preserve offsets and
      // fadeStartTime so a visible group neither blanks nor re-fades; reset only painted
      // so groupPainted re-arms
      const previousPlayerReqId = existing.playerReqId;
      existing.playerReqId = playerReqId;
      existing.textColored = textColored;
      existing.skipFade = skipFade;
      existing.painted = false;
      if(previousPlayerReqId !== playerReqId) {
        releasePlayerFrameIfOrphan(previousPlayerReqId);
      }
      return;
    }

    renderer.groups.set(groupId, {
      playerReqId,
      textColored,
      skipFade,
      offsets: [],
      fadeStartTime: 0,
      painted: false
    });
  }),

  detachGroup: ({rendererId, groupId}) => {
    const renderer = renderers.get(rendererId);
    const group = renderer?.groups.get(groupId);
    if(!group) {
      return;
    }

    renderer.groups.delete(groupId);
    renderer.dirty = true;

    // a detach means the player died globally (it is sent when the last synced-player
    // middleware drops) - sweep every renderer's groups still referencing it, otherwise
    // they would retain the dead player's last bitmap until those renderers detach entirely
    for(const otherRenderer of renderers.values()) {
      for(const [otherGroupId, otherGroup] of otherRenderer.groups) {
        if(otherGroup.playerReqId === group.playerReqId) {
          otherRenderer.groups.delete(otherGroupId);
          otherRenderer.dirty = true;
        }
      }
    }

    releasePlayerFrameIfOrphan(group.playerReqId);
    scheduleFlush();
  },

  resetFade: ({rendererId, groupId}) => {
    const group = renderers.get(rendererId)?.groups.get(groupId);
    if(!group) {
      return;
    }

    group.fadeStartTime = 0;
    group.painted = false; // fades + notifies again on viewport re-entry
  },

  setOffsets: ({batch}) => {
    for(const {rendererId, groups} of batch) {
      const renderer = renderers.get(rendererId);
      if(!renderer) {
        continue;
      }

      for(const {groupId, offsets} of groups) {
        const group = renderer.groups.get(groupId);
        if(group) {
          group.offsets = offsets; // empty array => group not painted
        }
      }

      renderer.dirty = true;
    }

    scheduleFlush();
  },

  clearRenderer: ({rendererId}) => withRenderer(rendererId, (renderer) => {
    renderer.context.clearRect(0, 0, renderer.canvas.width, renderer.canvas.height);
    renderer.dirty = false;
  }),

  // legacy freeze parity for "every element paused but still on-screen" (groups keep their
  // offsets): a synced player shared with a playing surface (emoji-set popup over the panel)
  // keeps delivering frames - hold the last painted pixels and defer repaints until resume
  suspendRenderer: ({rendererId, suspended}) => withRenderer(rendererId, (renderer) => {
    renderer.suspended = suspended;
    if(!suspended && renderer.dirty) { // catch up to the frames that arrived while frozen
      scheduleFlush();
    }
  }),

  decodePort: ({workerId}, _, event) => {
    const port = event.ports[0];
    decodePorts.set(workerId, port);
    port.onmessage = onDecodedFrame;
    port.start?.();
  }
});

listenMessagePort(compositorMessagePort);
