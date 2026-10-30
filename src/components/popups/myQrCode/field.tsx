import type {MyDocument} from '@appManagers/appDocsManager';
import {getStandardEmojiUrl} from './emojiPresets';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import wrapSticker from '@components/wrappers/sticker';
import liteMode from '@helpers/liteMode';
import rootScope from '@lib/rootScope';
import {Accessor, createEffect, on, onCleanup, onMount} from 'solid-js';
import {getMiddleware, Middleware} from '@helpers/middleware';
import {rgbIntToHex} from '@helpers/color';
import applyColorOnContext from '@helpers/canvas/applyColorOnContext';
import {loadEmojiStill} from '@components/wrappers/emojiPattern';
import {FontFamily} from '@config/font';
import {Appearance, themeEmojiKey, ThemeEmoji} from './theme';
import createLayerStack from './layerStack';
import {EDGE_BAND, EMOJI_PERIOD, emojiNodes, FieldPeriod, GIFT_PERIOD, modelNodes, Node, symbolNodes} from './fieldNodes';
import attachFieldMotion, {fieldCanvasSize} from './fieldMotion';
import styles from '@components/popups/myQrCode.module.scss';

/**
 * What floats on the backdrop: the picked emoji, or a collectible gift's models and the symbols of its pattern. One
 * canvas painted once for an appearance and a size, a repeating tile big enough to cover the surface at any turn and
 * shift; it turns, drifts and follows a drag by `transform` alone (`fieldMotion.ts`). A change is a new canvas fading in
 * over the old one.
 */

function drawRotated(ctx: CanvasRenderingContext2D, node: Node, draw: (size: number) => void) {
  ctx.save();
  ctx.globalAlpha = node.alpha;
  ctx.translate(node.x, node.y);
  ctx.rotate(node.angle * Math.PI / 180);
  draw(node.size);
  ctx.restore();
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return {canvas, ctx};
}

type Picture = HTMLImageElement | HTMLCanvasElement | string;

/** `QrEmojiPanel.isTextColor`: an emoji made to take the text's colour is white on the pattern, on any backdrop */
const TEXT_COLOR_EMOJI = '#ffffff';
const isTextColorEmoji = (doc: MyDocument) => doc.attributes.some((attribute) => attribute._ === 'documentAttributeCustomEmoji' && attribute.pFlags.text_color);

async function loadPicture(emoji: ThemeEmoji, middleware: Middleware): Promise<Picture | undefined> {
  if(!emoji.documentId) {
    const image = new Image();
    image.src = getStandardEmojiUrl(emoji.emoticon);
    return image.decode().then(() => image, () => emoji.emoticon);
  }

  try {
    const doc = await rootScope.managers.appEmojiManager.getCustomEmojiDocument(emoji.documentId);
    const image = await loadDocument(doc, middleware, 96);
    return image && isTextColorEmoji(doc) ? tint(image, TEXT_COLOR_EMOJI) : image;
  } catch{}
}

async function loadDocument(doc: Parameters<typeof loadEmojiStill>[0]['docId'], middleware: Middleware, size: number) {
  try {
    return await loadEmojiStill({docId: doc, middleware, emojiSize: size});
  } catch{}
}

/** The symbol in the pattern's colour, once: the tint is not worth redoing for every copy of it */
function tint(image: HTMLImageElement, color: string) {
  const {canvas, ctx} = createCanvas(64, 64);
  ctx.drawImage(image, 0, 0, 64, 64);
  applyColorOnContext(ctx, color, 0, 0, 64, 64);
  return canvas;
}

/** Paints the appearance's field; `undefined` for a theme with none, or when it was left before the art came. */
async function paintField(appearance: Appearance, width: number, height: number, middleware: Middleware): Promise<HTMLCanvasElement | undefined> {
  if(appearance.kind === 'emoji') {
    const pictures = await Promise.all(appearance.emojis.map((emoji) => loadPicture(emoji, middleware)));
    if(!middleware()) return;
    const {canvas, ctx} = createCanvas(width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for(const node of emojiNodes(width, height, pictures.length)) {
      const picture = pictures[node.index];
      if(!picture) continue;
      drawRotated(ctx, node, (size) => {
        if(typeof(picture) === 'string') {
          ctx.font = `${size * 0.85}px ${FontFamily}`;
          ctx.fillText(picture, 0, 0);
        } else {
          ctx.drawImage(picture, -size / 2, -size / 2, size, size);
        }
      });
    }

    return canvas;
  }

  if(appearance.kind === 'gift' && appearance.giftArt) {
    const [model, pattern] = await Promise.all([
      appearance.giftArt.model && loadDocument(appearance.giftArt.model as any, middleware, 128),
      appearance.giftArt.pattern && loadDocument(appearance.giftArt.pattern as any, middleware, 64)
    ]);
    if(!middleware()) return;
    const {canvas, ctx} = createCanvas(width, height);
    const models = model ? modelNodes(width, height) : [];
    if(pattern) {
      const symbol = tint(pattern, rgbIntToHex(appearance.backdrop.pattern_color));
      for(const node of symbolNodes(width, height, models)) {
        drawRotated(ctx, node, (size) => ctx.drawImage(symbol, -size / 2, -size / 2, size, size));
      }
    }

    for(const node of models) {
      drawRotated(ctx, node, (size) => ctx.drawImage(model, -size / 2, -size / 2, size, size));
    }

    return canvas;
  }
}

/** The tile the appearance's pattern repeats by; `undefined` for a theme with no pattern */
function fieldPeriod(appearance: Appearance): FieldPeriod | undefined {
  if(appearance.kind === 'emoji') return EMOJI_PERIOD;
  if(appearance.kind === 'gift' && appearance.giftArt) return GIFT_PERIOD;
}

function fieldKey(appearance: Appearance, width: number, height: number) {
  const art = appearance.kind === 'emoji' ?
    appearance.emojis.map(themeEmojiKey).join() :
    appearance.kind === 'gift' ? String(appearance.gift?.id) : '';
  return [appearance.kind, art, width, height].join('|');
}

/** The field as it stands at rest on the surface (upright, not shifted), edges faded as the screen's mask does */
function settledField(source: HTMLCanvasElement, width: number, height: number) {
  const dpr = source.width / parseFloat(source.style.width);
  const {canvas, ctx} = createCanvas(width, height);
  ctx.drawImage(source, ((source.width / dpr - width) / 2) * dpr, ((source.height / dpr - height) / 2) * dpr, width * dpr, height * dpr, 0, 0, width, height);
  ctx.globalCompositeOperation = 'destination-in';
  for(const [x, y] of [[1, 0], [0, 1]]) {
    const gradient = ctx.createLinearGradient(0, 0, x * width, y * height);
    const band = EDGE_BAND / (x ? width : height);
    gradient.addColorStop(0, 'transparent');
    gradient.addColorStop(band, '#000');
    gradient.addColorStop(1 - band, '#000');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  return canvas;
}

// Android's `placeInner`: the EdgeSqueeze band, d' = band * e^(d / band - 1), the size by the same factor, never below 9 px
const SQUEEZE_BAND = 90;
const SQUEEZE_MIN_SIZE = 9;
const SQUEEZE_EDGE_FADE = 12;
const smoothStep = (from: number, to: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};
// the largest copy is about 48 px, and a player's frames cost by their pixels
const LIVE_EMOJI_SIZE = 48 * Math.min(window.devicePixelRatio || 1, 2);

/**
 * The emoji pattern as Android draws it: every frame, each copy at its place with the emoji's current frame (one
 * playback position for all its copies), squeezed towards the screen's edges. The players stand out of sight.
 */
function createLiveEmojiField(emojis: ThemeEmoji[], width: number, height: number, canvasWidth: number, canvasHeight: number, middleware: Middleware, onLoad: () => void) {
  const {canvas, ctx} = createCanvas(width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const nodes = emojiNodes(canvasWidth, canvasHeight, emojis.length);
  const players = document.createElement('div');
  players.style.cssText = 'position: fixed; inset-block-start: -200px; width: 96px; height: 96px; pointer-events: none;';
  players.setAttribute('aria-hidden', 'true');
  document.body.append(players);
  middleware.onClean(() => players.remove());

  const managers = bindManagersToSession(rootScope.managers);
  const tinted: ReturnType<typeof createCanvas>[] = [];
  const holders = emojis.map((emoji, index) => {
    const div = document.createElement('div');
    players.append(div);
    if(!emoji.documentId) {
      const image = new Image();
      image.onload = () => middleware() && onLoad();
      image.src = getStandardEmojiUrl(emoji.emoticon);
      div.append(image);
      return div;
    }

    managers.appEmojiManager.getCustomEmojiDocument(emoji.documentId)
    .then((doc) => {
      if(isTextColorEmoji(doc)) tinted[index] = createCanvas(LIVE_EMOJI_SIZE, LIVE_EMOJI_SIZE);
      return doc;
    })
    .then((doc) => wrapSticker({doc, div, middleware, width: LIVE_EMOJI_SIZE, height: LIVE_EMOJI_SIZE, play: liteMode.isAvailable('motion'), loop: true, group: 'none', withThumb: false, exportLoad: 2}))
    .then(({load}) => load())
    .then(() => middleware() && onLoad())
    .catch(() => {});
    return div;
  });

  type Frame = HTMLCanvasElement | HTMLVideoElement | HTMLImageElement;
  const elements: Frame[] = [];
  const frameOf = (index: number) => {
    const element = elements[index] ??= holders[index]?.querySelector<Frame>('canvas, video, img');
    if(!element) return;
    if(element instanceof HTMLVideoElement) return element.readyState >= 2 ? element : undefined;
    if(element instanceof HTMLImageElement) return element.naturalWidth ? element : undefined;
    return element.width ? element : undefined;
  };

  const draw = (angle: number, x: number, y: number) => {
    ctx.clearRect(0, 0, width, height);
    const rad = angle * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const margin = SQUEEZE_BAND * 1.3;
    const frames = emojis.map((_, index) => {
      const frame = frameOf(index), paint = tinted[index];
      if(!frame || !paint) return frame;
      // the current frame in white, once for all its copies
      paint.ctx.globalCompositeOperation = 'source-over';
      paint.ctx.clearRect(0, 0, LIVE_EMOJI_SIZE, LIVE_EMOJI_SIZE);
      paint.ctx.drawImage(frame, 0, 0, LIVE_EMOJI_SIZE, LIVE_EMOJI_SIZE);
      paint.ctx.globalCompositeOperation = 'source-in';
      paint.ctx.fillStyle = TEXT_COLOR_EMOJI;
      paint.ctx.fillRect(0, 0, LIVE_EMOJI_SIZE, LIVE_EMOJI_SIZE);
      return paint.canvas;
    });
    for(const node of nodes) {
      const fieldX = node.x - canvasWidth / 2 + x, fieldY = node.y - canvasHeight / 2 + y;
      let screenX = width / 2 + fieldX * cos - fieldY * sin, screenY = height / 2 + fieldX * sin + fieldY * cos;
      if(screenX < -margin || screenX > width + margin || screenY < -margin || screenY > height + margin) continue;

      let factor = 1;
      const squeeze = (value: number, end: number) => {
        const atStart = value <= end - value;
        const near = atStart ? value : end - value;
        if(near >= SQUEEZE_BAND) return value;
        const g = Math.exp(near / SQUEEZE_BAND - 1);
        factor = Math.min(factor, g);
        return atStart ? SQUEEZE_BAND * g : end - SQUEEZE_BAND * g;
      };
      screenX = squeeze(screenX, width);
      screenY = squeeze(screenY, height);
      // what the squeeze has pressed into the corners is gone by then: `EdgeSqueeze.alpha`, and the last 12 px at the edge
      let alpha = smoothStep(0.08, 0.25, factor);
      if(alpha <= 0.004) continue;

      const emoji = emojis[node.index];
      const frame = frames[node.index];
      if(!frame && emoji.documentId) continue;
      const size = node.size * Math.max(factor, Math.min(node.size, SQUEEZE_MIN_SIZE) / node.size);
      const half = size / 2;
      alpha *= smoothStep(0, SQUEEZE_EDGE_FADE, Math.min(screenX - half, width - screenX - half, screenY - half, height - screenY - half));
      if(alpha <= 0.004) continue;
      ctx.globalAlpha = alpha;
      ctx.save();
      ctx.translate(screenX, screenY);
      // the field turns, each emoji keeps its own tilt (`QrShareView`: `rot + slotRot`, no turn of the field in it)
      ctx.rotate(node.angle * Math.PI / 180);
      if(frame) {
        ctx.drawImage(frame, -size / 2, -size / 2, size, size);
      } else {
        ctx.font = `${size * 0.85}px ${FontFamily}`;
        ctx.fillText(emoji.emoticon, 0, 0);
      }
      ctx.restore();
    }
  };

  return {canvas, draw};
}

export function PatternField(props: {
  appearance: Accessor<Appearance>,
  width: Accessor<number>,
  height: Accessor<number>,
  /** Whether a press that landed on the element may start a drag of the field */
  canDrag: (target: HTMLElement) => boolean,
  /** Hands over a way to the field at rest, for the exported picture to cut a piece of */
  fieldRef?: (get: () => HTMLCanvasElement | undefined) => void
}) {
  let host: HTMLDivElement;
  let mover: HTMLDivElement;
  let stack: ReturnType<typeof createLayerStack<HTMLCanvasElement>>;
  let motion: ReturnType<typeof attachFieldMotion>;
  let middleware = getMiddleware();
  // what the export cuts from while the field on screen is drawn live
  let stillField: HTMLCanvasElement;
  let settled: {source: HTMLCanvasElement, width: number, height: number, canvas: HTMLCanvasElement};

  onMount(() => {
    stack = createLayerStack(mover);
    motion = attachFieldMotion(host.parentElement, mover, props.canDrag);
  });

  props.fieldRef?.(() => {
    const source = stillField ?? stack?.current;
    if(!source) return;
    const width = props.width(), height = props.height();
    if(settled?.source !== source || settled.width !== width || settled.height !== height) {
      settled = {source, width, height, canvas: settledField(source, width, height)};
    }

    return settled.canvas;
  });

  createEffect(on(() => {
    const width = props.width(), height = props.height();
    if(!width || !height) return;
    const appearance = props.appearance();
    return {appearance, width, height, key: fieldKey(appearance, width, height)};
  }, (input, previous) => {
    if(!input || input.key === previous?.key) return;

    middleware.destroy();
    middleware = getMiddleware();
    const current = middleware.get();
    const period = fieldPeriod(input.appearance);
    const size = period && fieldCanvasSize(input.width, input.height, period.width, period.height);
    (period ? paintField(input.appearance, input.appearance.kind === 'emoji' ? input.width : size.width, input.appearance.kind === 'emoji' ? input.height : size.height, current) : Promise.resolve(undefined)).then((canvas) => {
      if(!current()) return;
      const layout = canvas && {
        surfaceWidth: input.width,
        surfaceHeight: input.height,
        canvasWidth: size.width,
        canvasHeight: size.height,
        periodWidth: period.width,
        periodHeight: period.height
      };
      const appearance = input.appearance;
      if(canvas && appearance.kind === 'emoji') {
        stillField = canvas;
        host.style.maskImage = 'none'; // the squeeze is its edge, and a mask over a redrawn canvas is paid every frame
        // below the full level nothing loops: a picture that came late is drawn by this update alone
        const live = createLiveEmojiField(appearance.emojis, input.width, input.height, size.width, size.height, current, () => motion.update(liveLayout));
        const liveLayout = {...layout, draw: live.draw};
        stack.set(live.canvas);
        motion.update(liveLayout);
        return;
      }

      stillField = undefined;
      host.style.maskImage = '';
      stack.set(canvas);
      motion.update(layout);
    });
  }));

  onCleanup(() => {
    middleware.destroy();
    motion?.destroy();
    stack?.destroy();
  });

  return (
    <div ref={host} class={styles.field} aria-hidden="true">
      <div ref={mover} class={styles.fieldMover} />
    </div>
  );
}
