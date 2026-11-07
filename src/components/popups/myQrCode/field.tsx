import type {MyDocument} from '@appManagers/appDocsManager';
import {getStandardEmojiUrl} from '@components/popups/myQrCode/emojiPresets';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import wrapSticker from '@components/wrappers/sticker';
import liteMode from '@helpers/liteMode';
import safePlay from '@helpers/dom/safePlay';
import LottiePlayer from '@lib/lottie/lottiePlayer';
import easeOutBack from '@helpers/easing/easeOutBack';
import rootScope from '@lib/rootScope';
import {Accessor, createEffect, on, onCleanup, onMount} from 'solid-js';
import {getMiddleware, Middleware} from '@helpers/middleware';
import {rgbIntToHex} from '@helpers/color';
import applyColorOnContext from '@helpers/canvas/applyColorOnContext';
import {loadEmojiStill} from '@components/wrappers/emojiPattern';
import {FontFamily} from '@config/font';
import {Appearance, themeEmojiKey, ThemeEmoji} from '@components/popups/myQrCode/theme';
import createLayerStack from '@components/popups/myQrCode/layerStack';
import {EDGE_BAND, GIFT_PERIOD, modelNodes, Node, placeEmojiField, symbolNodes} from '@components/popups/myQrCode/fieldNodes';
import attachFieldMotion, {fieldCanvasSize} from '@components/popups/myQrCode/fieldMotion';
import styles from '@components/popups/myQrCode.module.scss';

/**
 * What floats on the backdrop: the picked emoji, or a collectible gift's models and the symbols of its pattern. The
 * gift's is one canvas painted once for an appearance and a size, a repeating tile big enough to cover the surface at
 * any shift; it drifts and follows a drag by `transform` alone (`fieldMotion.ts`). The emoji are drawn
 * anew every frame, each copy at its place, as Android draws them. A change is a new canvas fading in over the old one.
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

/** `QrEmojiPanel.isTextColor`: an emoji made to take the text's colour is white on the pattern, on any backdrop */
const TEXT_COLOR_EMOJI = '#ffffff';
const isTextColorEmoji = (doc: MyDocument) => doc.attributes.some((attribute) => attribute._ === 'documentAttributeCustomEmoji' && attribute.pFlags.text_color);

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

/** Paints the gift's field; `undefined` for a theme with none, or when it was left before the art came. */
async function paintGiftField(appearance: Appearance, width: number, height: number, middleware: Middleware): Promise<HTMLCanvasElement | undefined> {
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

function fieldKey(appearance: Appearance, width: number, height: number) {
  const art = appearance.kind === 'emoji' ?
    appearance.emojis.map(themeEmojiKey).join() :
    appearance.kind === 'gift' ? String(appearance.gift?.id) : '';
  return [appearance.kind, art, width, height].join('|');
}

/** The field as it stands at rest on the surface (not shifted), edges faded as the screen's mask does */
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

// the largest copy is about 48 px, and a player's frames cost by their pixels
const LIVE_EMOJI_SIZE = 48 * Math.min(window.devicePixelRatio || 1, 2);
// `QrShareView.popIn`: once the screen has opened, each copy pops in on its own, in an order of its own each time
const APPEAR_MS = 380, APPEAR_SPREAD_MS = 300;

/** Where the card's middle is on the surface: the emoji shrink and pale from it to the edges */
export type FieldFocus = () => {x: number, y: number};

/**
 * The emoji pattern as Android draws it: every frame, each copy at its place with the emoji's current frame (one
 * playback position for all its copies). The players stand out of sight and draw on the page's thread, so a frame is
 * read off them as it is drawn, not from another thread for every copy.
 */
function createLiveEmojiField(options: {
  emojis: ThemeEmoji[],
  width: number,
  height: number,
  focus: FieldFocus,
  /** When the screen's open ended (`performance.now()`), none while it opens: a field there from the open shows its copies only after it, each popping in */
  opened: Accessor<number | undefined>,
  middleware: Middleware,
  onLoad: () => void
}) {
  const {emojis, width, height, middleware} = options;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const {canvas, ctx} = createCanvas(width, height);
  const players = document.createElement('div');
  players.style.cssText = 'position: fixed; inset-block-start: -200px; width: 96px; height: 96px; pointer-events: none;';
  players.setAttribute('aria-hidden', 'true');
  document.body.append(players);
  middleware.onClean(() => players.remove());

  const managers = bindManagersToSession(rootScope.managers);
  const tinted: ReturnType<typeof createCanvas>[] = [];
  // the animated emoji's players: they play while the field's frames are read (`setPlaying`), and stand still otherwise
  const sources: {play: () => void, pause: () => void}[] = [];
  let playing = liteMode.isAvailable('motion');
  const holders = emojis.map((emoji, index) => {
    const div = document.createElement('div');
    players.append(div);
    if(!emoji.documentId) {
      const image = new Image();
      image.onload = () => middleware() && options.onLoad();
      image.src = getStandardEmojiUrl(emoji.emoticon);
      div.append(image);
      return div;
    }

    managers.appEmojiManager.getCustomEmojiDocument(emoji.documentId)
    .then((doc) => {
      if(isTextColorEmoji(doc)) tinted[index] = createCanvas(LIVE_EMOJI_SIZE, LIVE_EMOJI_SIZE);
      return doc;
    })
    .then((doc) => wrapSticker({doc, div, middleware, width: LIVE_EMOJI_SIZE, height: LIVE_EMOJI_SIZE, play: liteMode.isAvailable('motion'), loop: true, group: 'none', withThumb: false, exportLoad: 2, noOffscreen: true}))
    .then(({load}) => load())
    .then((loaded) => {
      if(!middleware()) return;
      // Chrome holds a muted video that autoplays out of sight on its first frame, as the players stand here: a video
      // emoji is played by the script, which it lets run
      const video = div.querySelector('video');
      const source = video ?
        {play: () => safePlay(video), pause: () => video.pause()} :
        loaded instanceof LottiePlayer ? loaded : undefined;
      if(source) {
        sources.push(source);
        playing ? source.play() : source.pause();
      }

      options.onLoad();
    })
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

  // the current frames, once a draw: a text-coloured emoji in white, once for all its copies
  const currentFrames = () => emojis.map((_, index) => {
    const frame = frameOf(index), paint = tinted[index];
    if(!frame || !paint) return frame;
    paint.ctx.globalCompositeOperation = 'source-over';
    paint.ctx.clearRect(0, 0, LIVE_EMOJI_SIZE, LIVE_EMOJI_SIZE);
    paint.ctx.drawImage(frame, 0, 0, LIVE_EMOJI_SIZE, LIVE_EMOJI_SIZE);
    paint.ctx.globalCompositeOperation = 'source-in';
    paint.ctx.fillStyle = TEXT_COLOR_EMOJI;
    paint.ctx.fillRect(0, 0, LIVE_EMOJI_SIZE, LIVE_EMOJI_SIZE);
    return paint.canvas;
  });

  // a field there from the open: its copies wait for it and pop in after, each emoji's from when it has a frame
  const popIn = options.opened() === undefined && liteMode.isAvailable('motion');
  const readyAt: number[] = [];
  const salt = Math.random();
  const appearDelay = (seed: number) => {
    const x = Math.sin((seed + salt * 17.31) * 12.9898 + salt * 78.233) * 43758.5453;
    return (x - Math.floor(x)) * APPEAR_SPREAD_MS;
  };

  /** Draws the field on `target` as it stands; `now` times the copies' pop-in, none for the field at rest */
  const paint = (target: CanvasRenderingContext2D, x: number, y: number, time: number, now?: number) => {
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, target.canvas.width, target.canvas.height);
    target.textAlign = 'center';
    target.textBaseline = 'middle';
    const frames = currentFrames();
    if(now !== undefined) frames.forEach((frame, index) => {
      if(frame || !emojis[index].documentId) readyAt[index] ??= now;
    });
    // the motion switched off on the way: every copy is there at once
    const popping = popIn && now !== undefined && liteMode.isAvailable('motion');
    const openedAt = popping ? options.opened() : 0;
    if(openedAt === undefined) return;

    const focus = options.focus();
    placeEmojiField({width, height, x, y, time, focusX: focus.x, focusY: focus.y, count: emojis.length}, (placed) => {
      const emoji = emojis[placed.index], frame = frames[placed.index];
      if(!frame && emoji.documentId) return;
      let size = placed.size;
      if(popping) {
        const appear = (now - Math.max(openedAt, readyAt[placed.index]) - appearDelay(placed.seed)) / APPEAR_MS;
        if(appear <= 0) return;
        if(appear < 1) size *= easeOutBack(appear);
      }

      const rad = placed.angle * Math.PI / 180, cos = Math.cos(rad) * dpr, sin = Math.sin(rad) * dpr;
      target.globalAlpha = placed.alpha;
      target.setTransform(cos, sin, -sin, cos, placed.x * dpr, placed.y * dpr);
      if(frame) {
        target.drawImage(frame, -size / 2, -size / 2, size, size);
      } else {
        target.font = `${size * 0.85}px ${FontFamily}`;
        target.fillText(emoji.emoticon, 0, 0);
      }
    });
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.globalAlpha = 1;
  };

  // the field at rest, kept once every emoji has a frame in it
  let stillCanvas: HTMLCanvasElement;
  return {
    canvas,
    draw: (x: number, y: number, time: number) => paint(ctx, x, y, time, performance.now()),
    setPlaying: (next: boolean) => {
      if(playing === next) return;
      playing = next;
      sources.forEach((source) => next ? source.play() : source.pause());
    },
    /** The field at rest (not moved, every copy in), for the exported picture */
    still() {
      if(stillCanvas) return stillCanvas;
      // a picture of an emoji still on its way would be kept drawn as the font's
      const complete = emojis.every((_, index) => frameOf(index));
      const still = createCanvas(width, height);
      paint(still.ctx, 0, 0, 0);
      if(complete) stillCanvas = still.canvas;
      return still.canvas;
    }
  };
}

export function PatternField(props: {
  appearance: Accessor<Appearance>,
  width: Accessor<number>,
  height: Accessor<number>,
  focus: FieldFocus,
  /** When the screen's open ended (`performance.now()`), none while it opens */
  opened: Accessor<number | undefined>,
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
  // the emoji field drawn at rest for the export, as the live one is drawn
  let stillField: (() => HTMLCanvasElement) | undefined;
  let settled: {source: HTMLCanvasElement, width: number, height: number, canvas: HTMLCanvasElement};

  onMount(() => {
    stack = createLayerStack(mover);
    motion = attachFieldMotion(host.parentElement, mover, props.canDrag);
  });

  // the screen open, or the motion come or gone: the field is drawn as it now stands, and moves on if it may (the
  // loop stops itself without the motion, and only a press or a new field started it again)
  createEffect(on([props.opened, () => liteMode.isAvailable('motion')], () => motion?.refresh(), {defer: true}));

  props.fieldRef?.(() => {
    if(stillField) return stillField();
    const source = stack?.current;
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
    const {appearance, width, height} = input;
    if(appearance.kind === 'emoji' && appearance.emojis.length) {
      host.style.maskImage = 'none'; // the squeeze is its edge, and a mask over a redrawn canvas is paid every frame
      // a field after another one takes its place once it has something to show: the old one stays till then
      let shown = false;
      const show = () => {
        if(shown || !current()) return;
        shown = true;
        stack.set(live.canvas);
      };
      const live = createLiveEmojiField({
        emojis: appearance.emojis,
        width,
        height,
        focus: props.focus,
        opened: props.opened,
        middleware: current,
        onLoad: () => {
          show();
          // below the full level nothing loops: a picture that came late is drawn by this update alone
          motion.update(layout);
        }
      });
      const layout = {draw: live.draw, setPlaying: live.setPlaying};
      stillField = live.still;
      if(!stack.current) show();
      else setTimeout(show, 1000);
      motion.update(layout);
      return;
    }

    stillField = undefined;
    host.style.maskImage = '';
    const size = appearance.kind === 'gift' && appearance.giftArt ? fieldCanvasSize(width, height, GIFT_PERIOD.width, GIFT_PERIOD.height) : undefined;
    (size ? paintGiftField(appearance, size.width, size.height, current) : Promise.resolve(undefined)).then((canvas) => {
      if(!current()) return;
      stack.set(canvas);
      motion.update(canvas && {
        surfaceWidth: width,
        surfaceHeight: height,
        canvasWidth: size.width,
        canvasHeight: size.height,
        periodWidth: GIFT_PERIOD.width,
        periodHeight: GIFT_PERIOD.height
      });
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
