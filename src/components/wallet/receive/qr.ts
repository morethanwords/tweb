/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

// The Add Funds code, drawn the way iOS draws it (QrCode.swift, WalletReceiveQrRevealView.swift): the modules
// melt into each other ("blob": a dark module rounds only the corners with light on both sides, a light module
// fills a corner closed in by dark), the three finders are drawn as rounded rings with a rounded dot, and the
// centre is cleared for the live gem. Black on white in every theme: a scanner needs the contrast.

import {easing} from '@components/wallet/visual/gem/animation';

export type WalletQrMatrix = {
  /** modules per side with the one-module quiet zone */
  size: number,
  isDark: (x: number, y: number) => boolean
};

export type WalletQrLayout = {
  size: number,
  /** CSS px of the code's image: the white block minus its inset */
  imageSide: number,
  /** the side of a module, CSS px, whole device pixels */
  side: number,
  /** where the modules start inside the image, CSS px */
  padding: number,
  /** modules of the centre cutout: odd, cleared strictly inside */
  cutout: number,
  /** the cleared square where the gem stands, CSS px of the image */
  cutoutRect: {x: number, y: number, side: number},
  /** the finders' side in modules (7) */
  markerSize: number,
  pixelRatio: number
};

/** the modules of a finder plus its white separator and the quiet zone: they grow as one piece */
const MARKER_BLOCK = 9;

const floorToPixels = (value: number, pr: number) => Math.floor(value * pr) / pr;
const roundToPixels = (value: number, pr: number) => Math.round(value * pr) / pr;

/**
 * The modules of `data` (ECC Q): qr-code-styling's own encoder, which the app already loads for its codes. Its
 * drawing is not used — iOS's style is drawn here.
 */
export async function loadWalletQrMatrix(data: string): Promise<WalletQrMatrix> {
  const QRCodeStyling = await import('qr-code-styling' as any).then((m) => m.default);
  // * an SVG drawing big enough for any version: a smaller one throws inside its own promise
  const qr = new QRCodeStyling({type: 'svg', width: 177, height: 177, data, qrOptions: {errorCorrectionLevel: 'Q'}})._qr;
  const count: number = qr.getModuleCount();
  const dark = new Uint8Array(count * count);
  for(let y = 0; y < count; ++y) {
    for(let x = 0; x < count; ++x) {
      dark[y * count + x] = qr.isDark(y, x) ? 1 : 0;
    }
  }

  const size = count + 2;
  const cutout = cutoutModules(size);
  const start = (size - cutout) >> 1;
  const isCleared = (value: number) => value > start && value < start + cutout - 1;
  return {
    size,
    isDark: (x, y) => {
      if(x < 1 || y < 1 || x > count || y > count) return false;
      if(isCleared(x) && isCleared(y)) return false;
      return !!dark[(y - 1) * count + x - 1];
    }
  };
}

/** iOS's centre cutout (qrCodeCutout): about 30% of the side, odd, at most 23 modules */
function cutoutModules(size: number) {
  let cutout = Math.round(size * 0.297);
  if(size === 39) {
    cutout = 11;
  } else if(cutout % 2 === 0) {
    ++cutout;
  }

  return Math.min(23, cutout);
}

export function layoutWalletQr(matrix: WalletQrMatrix, imageSide: number, pixelRatio: number): WalletQrLayout {
  const {size} = matrix;
  const cutout = cutoutModules(size);
  const side = floorToPixels(imageSide / size, pixelRatio);
  const padding = roundToPixels((imageSide - side * size) / 2, pixelRatio);
  const cutoutSide = side * (cutout - 2);
  const cutoutOrigin = floorToPixels((imageSide - cutoutSide) / 2, pixelRatio);

  let markerSize = 0;
  for(let i = 1; i < size; ++i) {
    if(!matrix.isDark(i, 1)) {
      markerSize = i - 1;
      break;
    }
  }

  return {
    size,
    imageSide,
    side,
    padding,
    cutout,
    cutoutRect: {x: cutoutOrigin, y: cutoutOrigin, side: cutoutSide},
    markerSize,
    pixelRatio
  };
}

function isMarkerModule(layout: WalletQrLayout, x: number, y: number) {
  const {size, markerSize} = layout;
  return (y < markerSize + 1 && (x < markerSize + 1 || x > size - markerSize - 2)) ||
    (y > size - markerSize - 2 && x < markerSize + 1);
}

/** A rectangle with its own radius per corner (0 = square) */
function roundedRect(path: Path2D, x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number) {
  path.moveTo(x + tl, y);
  path.lineTo(x + w - tr, y);
  if(tr) path.arcTo(x + w, y, x + w, y + tr, tr);
  path.lineTo(x + w, y + h - br);
  if(br) path.arcTo(x + w, y + h, x + w - br, y + h, br);
  path.lineTo(x + bl, y + h);
  if(bl) path.arcTo(x, y + h, x, y + h - bl, bl);
  path.lineTo(x, y + tl);
  if(tl) path.arcTo(x, y, x + tl, y, tl);
  path.closePath();
}

/**
 * The finished code, black on transparent, onto `canvas` sized `imageSide` × the pixel ratio
 */
export function paintWalletQr(canvas: HTMLCanvasElement, matrix: WalletQrMatrix, layout: WalletQrLayout) {
  const {size, side, padding, pixelRatio: pr} = layout;
  const px = Math.round(layout.imageSide * pr);
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
  ctx.fillStyle = ctx.strokeStyle = '#000';

  const at = matrix.isDark;
  const modules = new Path2D();
  const outer = side / 3, inner = side / 4;
  for(let y = 0; y < size; ++y) {
    for(let x = 0; x < size; ++x) {
      if(isMarkerModule(layout, x, y)) {
        continue;
      }

      const left = padding + x * side, top = padding + y * side;
      const up = at(x, y - 1), down = at(x, y + 1), before = at(x - 1, y), after = at(x + 1, y);
      if(at(x, y)) {
        // * a corner rounds only where both of its sides are light
        roundedRect(
          modules, left, top, side, side,
          !up && !before ? outer : 0,
          !up && !after ? outer : 0,
          !down && !after ? outer : 0,
          !down && !before ? outer : 0
        );
        continue;
      }

      // * a light module closed in by dark on a corner fills it with a concave fillet
      if(up && before && at(x - 1, y - 1)) {
        modules.moveTo(left, top);
        modules.lineTo(left + inner, top);
        modules.arc(left + inner, top + inner, inner, -Math.PI / 2, -Math.PI, true);
        modules.closePath();
      }

      if(up && after && at(x + 1, y - 1)) {
        const right = left + side;
        modules.moveTo(right, top);
        modules.lineTo(right, top + inner);
        modules.arc(right - inner, top + inner, inner, 0, -Math.PI / 2, true);
        modules.closePath();
      }

      if(down && after && at(x + 1, y + 1)) {
        const right = left + side, bottom = top + side;
        modules.moveTo(right, bottom);
        modules.lineTo(right - inner, bottom);
        modules.arc(right - inner, bottom - inner, inner, Math.PI / 2, 0, true);
        modules.closePath();
      }

      if(down && before && at(x - 1, y + 1)) {
        const bottom = top + side;
        modules.moveTo(left, bottom);
        modules.lineTo(left, bottom - inner);
        modules.arc(left + inner, bottom - inner, inner, Math.PI, Math.PI / 2, true);
        modules.closePath();
      }
    }
  }

  ctx.fill(modules);

  // * the finders: a ring a module wide and a dot, a little larger than the modules they replace
  const markerSide = floorToPixels((layout.markerSize - 1) * side * 1.05, pr);
  const dotSide = markerSide - side * 3;
  ctx.lineWidth = side;
  const marker = (x: number, y: number) => {
    const ring = new Path2D(), dot = new Path2D();
    const radius = markerSide / 3.5, dotRadius = dotSide / 3.5;
    roundedRect(ring, padding + x + side / 2, padding + y + side / 2, markerSide, markerSide, radius, radius, radius, radius);
    roundedRect(dot, padding + x + side * 2, padding + y + side * 2, dotSide, dotSide, dotRadius, dotRadius, dotRadius, dotRadius);
    ctx.stroke(ring);
    ctx.fill(dot);
  };

  marker(side, side);
  marker((size - 2) * side - markerSide, side);
  marker(side, (size - 2) * side - markerSide);
}

/** Core Animation's easeOut, which the iOS reveal and fades use */
export const easeOut = (t: number) => easing(t, 0, 0, 0.58, 1);
const easeInOut = (t: number) => easing(t, 0.42, 0, 0.58, 1);

/** the finders' pop: Core Animation's spring (mass 3, stiffness 1000), clamped to critical damping */
const MARKER_OMEGA = Math.sqrt(1000 / 3);
const markerSpring = (t: number) => t >= 0.5 ? 1 : 1 - (1 + MARKER_OMEGA * t) * Math.exp(-MARKER_OMEGA * t);

const BATCHES = 48;
const BATCH_FADE = 0.12;
const REVEAL_DELAY = 0.03;
const REVEAL_DURATION = 0.5;
/** the whole reveal, seconds */
export const WALLET_QR_REVEAL_TIME = REVEAL_DELAY + REVEAL_DURATION;

/**
 * The code comes in as on iOS: the modules fade in 48 batches that sweep inward while winding clockwise around
 * the gem, with a little jitter, and the three finders pop from their centres. The finished code is drawn under
 * a mask, so the rounded corners and fillets come in as drawn.
 */
export class WalletQrReveal {
  private batches: Path2D[];
  private markers: {x: number, y: number, side: number}[];

  constructor(private target: HTMLCanvasElement, private code: HTMLCanvasElement, private layout: WalletQrLayout) {
    const {size, side, padding} = layout;
    this.batches = Array.from({length: BATCHES}, () => new Path2D());
    const center = (size - 1) / 2;
    for(let y = 0; y < size; ++y) {
      for(let x = 0; x < size; ++x) {
        if((y < MARKER_BLOCK && (x < MARKER_BLOCK || x >= size - MARKER_BLOCK)) || (y >= size - MARKER_BLOCK && x < MARKER_BLOCK)) {
          continue;
        }

        const inward = Math.min(x, y, size - 1 - x, size - 1 - y) / center;
        const dx = x - center, dy = y - center;
        const angle = (Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI);
        const spiral = angle + Math.hypot(dx, dy) / center * 1.25;
        const phase = inward * 0.55 + (spiral - Math.floor(spiral)) * 0.4 + Math.random() * 0.05;
        const batch = Math.min(BATCHES - 1, Math.floor(phase * (BATCHES - 1)));
        this.batches[batch].rect(padding + x * side, padding + y * side, side, side);
      }
    }

    const block = MARKER_BLOCK * side;
    this.markers = [[0, 0], [size - MARKER_BLOCK, 0], [0, size - MARKER_BLOCK]].map(([x, y]) => ({
      x: padding + x * side,
      y: padding + y * side,
      side: block
    }));
  }

  /** The reveal `elapsed` seconds in; false once it is over and the finished code is drawn */
  public frame(elapsed: number) {
    if(elapsed >= WALLET_QR_REVEAL_TIME) {
      this.finish();
      return false;
    }

    const {pixelRatio: pr, imageSide} = this.layout;
    const ctx = this.target.getContext('2d');
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.clearRect(0, 0, imageSide, imageSide);

    const spread = REVEAL_DURATION - BATCH_FADE;
    this.batches.forEach((path, index) => {
      const alpha = easeOut((elapsed - REVEAL_DELAY - index / (BATCHES - 1) * spread) / BATCH_FADE);
      if(alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.clip(path);
      ctx.drawImage(this.code, 0, 0, imageSide, imageSide);
      ctx.restore();
    });

    const markerTime = elapsed - REVEAL_DELAY;
    if(markerTime > 0) {
      const scale = Math.max(0.01, markerSpring(markerTime));
      ctx.globalAlpha = easeInOut(markerTime / BATCH_FADE);
      for(const marker of this.markers) {
        const half = marker.side / 2;
        ctx.save();
        ctx.translate(marker.x + half, marker.y + half);
        ctx.scale(scale, scale);
        ctx.drawImage(this.code, marker.x * pr, marker.y * pr, marker.side * pr, marker.side * pr, -half, -half, marker.side, marker.side);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
    }

    return true;
  }

  /** The finished code at once */
  public finish() {
    const ctx = this.target.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.target.width, this.target.height);
    ctx.drawImage(this.code, 0, 0);
  }
}
