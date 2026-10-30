/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import liteMode from '@helpers/liteMode';
import {requestWalletFrame} from '@components/wallet/frameLoop';
import {getAppWindow} from '@helpers/appWindow';
import {offsetIn} from '@components/wallet/visual/dom';
import {DESIGN} from '@components/wallet/visual/card/layout';
import {ca, CAMatrix, clamp01, smoothstep01} from '@components/wallet/visual/math';
import type {WalletCard} from '@components/wallet/visual/card/card';

/**
 * The main screen's scroll, as iOS plays it (WalletScreen.updateScrolling and WalletCardComponent): the card
 * folds back and shrinks around its middle while it lags behind the history; its name, address and QR chip
 * fade and blur away; its balance — gem, amount and fiat — leaves it and flies into the header's middle,
 * where a copy in the text colour takes over below the card's bottom edge; the title gives way to the card
 * coming up under it, and an edge of the background fades in under the header. Let go half way, the card
 * settles folded or unfolded. With reduced animations nothing travels: the card scrolls away with the history,
 * and the header's title and balance cross-fade as it goes.
 *
 * Positions are read off the screen as they stand, left to right: right to left the same sums mirror the flight.
 * Everything is written in one frame per scroll, transforms, opacities and clips only; what it measures is
 * measured when something changes size.
 */

/** the card and the buttons under it (iOS cardSpacing) */
const CARD_SPACING = 12;
const COLLAPSED_SCALE = 0.19;
const COLLAPSED_PITCH = Math.PI / 3;
/** the fold's camera, in points of the 361-wide iOS card */
const CAMERA = 650;
/** the card lags behind the history by this share of the fold's travel, most half way */
const LAG = 0.6;
const DETAILS_BLUR = 8;
const TITLE_BLUR = 8;
/** the header's edge is fully there after this much scroll */
const EDGE_DISTANCE = 20;
/** a row revealed by the scroll stands this far below the header, and this far above the bottom (iOS) */
const REVEAL_TOP = 16;
const REVEAL_BOTTOM = 24;
/** the header's gram icon holds the gem with this much air around it (iOS) */
const ICON_INSET = 0.0545;
/** where scrollend is missing, a scroll that stood still this long has ended */
const HAS_SCROLLEND = typeof window !== 'undefined' && 'onscrollend' in (window as object);
const SCROLL_STILL = 150;

type Rect = {x: number, y: number, w: number, h: number};

const rect = (x: number, y: number, w: number, h: number): Rect => ({x, y, w, h});
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const cx = (r: Rect) => r.x + r.w / 2;
const cy = (r: Rect) => r.y + r.h / 2;
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return rect(x, y, Math.max(a.x + a.w, b.x + b.w) - x, Math.max(a.y + a.h, b.y + b.h) - y);
};

const rectOf = (element: HTMLElement, root: Element): Rect => {
  const {x, y} = offsetIn(element, root);
  return rect(x, y, element.offsetWidth, element.offsetHeight);
};

/** A point through a CATransform3D-style matrix about the origin: the perspective divide included */
function project(m: CAMatrix, x: number, y: number): [number, number] {
  const X = x * m[0] + y * m[4] + m[12];
  const Y = x * m[1] + y * m[5] + m[13];
  let W = x * m[3] + y * m[7] + m[15];
  if(Math.abs(W) < 0.0001) W = 0.0001;
  return [X / W, Y / W];
}

/** The bounds of a rect (relative to the origin) through a matrix */
function projectRect(m: CAMatrix, r: Rect): Rect {
  const points = [project(m, r.x, r.y), project(m, r.x + r.w, r.y), project(m, r.x, r.y + r.h), project(m, r.x + r.w, r.y + r.h)];
  const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return rect(x, y, Math.max(...xs) - x, Math.max(...ys) - y);
}

/** iOS flattens the card's own transform before the scroll's goes on it */
function flatten(m: CAMatrix): CAMatrix {
  const out = m.slice();
  out[2] = out[6] = out[14] = 0;
  out[10] = 1;
  return out;
}

const mix = (m: CAMatrix, k: number): CAMatrix => {
  const identity = ca.identity();
  return m.map((value, index) => identity[index] + (value - identity[index]) * k);
};

/** the choreography of a scroller: what plays in the history (a send) asks it to reveal a row */
const registry: WeakMap<Element, WalletCardScroll> = new WeakMap();

export function getWalletCardScroll(scroller: Element) {
  return scroller && registry.get(scroller);
}

export type WalletCardScrollCard = {
  root: HTMLElement,
  /** takes the scroll's transform */
  fold: HTMLElement,
  shadow: HTMLElement,
  shading: HTMLElement,
  /** the card's design units */
  design: HTMLElement,
  balance: HTMLElement,
  gemSlot: HTMLElement,
  gemClip: HTMLElement,
  amount: HTMLElement,
  fraction: HTMLElement,
  currency: HTMLElement,
  fiat: HTMLElement,
  /** fade and blur away as the card folds: the name, the address */
  details: HTMLElement[],
  /** the 3D card; none for the flat one */
  card?: WalletCard
};

/** The card's balance on its way to the header: a copy in the layer over the history */
export type WalletCardScrollFlight = {
  root: HTMLElement,
  group: HTMLElement,
  primary: HTMLElement,
  icon: HTMLElement,
  gem?: HTMLCanvasElement,
  text: HTMLElement,
  amount: HTMLElement,
  fraction: HTMLElement,
  currency: HTMLElement,
  secondary: HTMLElement
};

export type WalletCardScrollHeader = {
  /** the header's layer: its corner is the screen's */
  top: HTMLElement,
  title: HTMLElement,
  edge: HTMLElement,
  /** cuts the balance off above the card's bottom edge */
  navClip: HTMLElement,
  navPrimary: HTMLElement,
  navIcon: HTMLElement,
  navText: HTMLElement,
  navFiat: HTMLElement
};

export class WalletCardScroll {
  /** 0 — the card in place, 1 — folded away under the header */
  public fraction = 0;
  /** called on every scroll frame: what stands on the card (the Gram tooltip) goes */
  public onScroll: () => void;
  /** the card folded away completely or came back */
  public onFolded: (folded: boolean) => void;

  private scroller: HTMLElement;
  private room: HTMLElement;
  private card: WalletCardScrollCard;
  private flight: WalletCardScrollFlight;
  private header: WalletCardScrollHeader;

  // * measured
  private cardRect: Rect;
  private s = 1;
  private k = 1;
  /** design units, relative to the card */
  private primaryD: Rect;
  private secondaryD: Rect;
  private iconD: Rect;
  private textD: Rect;
  /** the amount's whole line, the ticker included: right to left the ticker stands before the digits */
  private lineD: Rect;
  /** screen px */
  private navP: Rect;
  private navS: Rect;
  /** relative to navP */
  private navIconRect: Rect;
  private navTextRect: Rect;
  private titleBottom = 0;
  private headerBottom = 0;
  private measured = false;

  private scrollTop = 0;
  /** cancels the frame asked for the scroll, while one is */
  private cancelFrame: () => void;
  private flying = false;
  private folded = false;
  private programmatic = false;
  /** cancels the wait for the scroll to stand still */
  private cancelSettle: () => void;
  private resizeObserver: ResizeObserver;
  private destroyed = false;

  constructor(options: {
    scroller: HTMLElement,
    /** the last piece of the history: it makes room for the fold */
    room: HTMLElement,
    card: WalletCardScrollCard,
    flight: WalletCardScrollFlight,
    header: WalletCardScrollHeader
  }) {
    this.scroller = options.scroller;
    this.room = options.room;
    this.card = options.card;
    this.flight = options.flight;
    this.header = options.header;
    registry.set(this.scroller, this);

    this.scroller.addEventListener('scroll', this.onScrollEvent, {passive: true});
    if(HAS_SCROLLEND) {
      this.scroller.addEventListener('scrollend', this.onScrollEnd);
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.measure();
      this.update();
    });

    const h = this.header;
    [this.scroller, this.scroller.firstElementChild, this.card.root, this.card.balance, this.card.fiat,
      h.navPrimary, h.navFiat, h.title].forEach((element) => element && this.resizeObserver.observe(element));
  }

  public get isFlying() {
    return this.flying;
  }

  private onScrollEvent = () => {
    this.onScroll?.();
    if(!HAS_SCROLLEND) {
      // * no scrollend: the scroll ended when it stands still for a moment
      // * on the window the app is in: a Document PiP one runs its timers while the tab sleeps
      this.cancelSettle?.();
      const win = getAppWindow(), timer = win.setTimeout(this.onScrollEnd, SCROLL_STILL);
      this.cancelSettle = () => win.clearTimeout(timer);
    }

    this.cancelFrame ||= requestWalletFrame(this.onFrame);
  };

  private onFrame = () => {
    this.cancelFrame = undefined;
    this.scrollTop = this.scroller.scrollTop;
    this.update();
  };

  /** let go half way: the card settles folded or unfolded (iOS snappedCardScrollOffset) */
  private onScrollEnd = () => {
    if(this.destroyed) return;
    if(this.programmatic) {
      this.programmatic = false;
      return;
    }

    // * the scroll moving on by itself is movement: with reduced animations the card stays where it was let go
    if(!liteMode.isAvailable('motion') || !this.measured) return;
    const offset = this.scroller.scrollTop;
    const start = this.start(), distance = this.distance();
    const maximum = this.scroller.scrollHeight - this.scroller.clientHeight;
    if(start + distance > maximum || offset <= start || offset >= start + distance) {
      return;
    }

    this.scrollTo(offset < start + distance * 0.5 ? start : start + distance, true);
  };

  private scrollTo(top: number, smooth: boolean) {
    if(Math.abs(this.scroller.scrollTop - top) < 1) return;
    this.programmatic = true;
    this.scroller.scrollTo({top, behavior: smooth && liteMode.isAvailable('motion') ? 'smooth' : 'auto'});
  }

  /** the header's balance, tapped: back to the top */
  public scrollToTop() {
    this.scrollTo(0, true);
  }

  /** a row the history just got (a transfer sent): scrolled into view under the header when it is not (iOS) */
  public reveal(row: HTMLElement) {
    if(!row?.isConnected) return;
    const {y} = offsetIn(row, this.scroller);
    const top = this.headerBottom + REVEAL_TOP;
    const offset = this.scroller.scrollTop, height = this.scroller.clientHeight;
    if(y >= offset + top && y + row.offsetHeight <= offset + height - REVEAL_BOTTOM) {
      return;
    }

    const maximum = this.scroller.scrollHeight - height;
    this.scrollTo(Math.max(0, Math.min(maximum, y - top)), false);
  }

  private start() {
    // * nothing stands above the card in this window: the fold starts with the scroll
    return 0;
  }

  private distance() {
    return this.cardRect.h + CARD_SPACING;
  }

  public measure() {
    const {card, header} = this;
    if(this.destroyed || !card.root.isConnected || !card.root.offsetWidth) return;
    const root = card.root;
    this.cardRect = rect(root.offsetLeft, offsetIn(root, this.scroller).y, root.offsetWidth, root.offsetHeight);
    this.s = this.cardRect.w / DESIGN.width;
    this.k = this.cardRect.w / 361;

    const design = card.design;
    const slot = rectOf(card.gemSlot, design);
    const amount = rectOf(card.amount, design), fraction = rectOf(card.fraction, design);
    const amountBox = rectOf(card.amount.parentElement, design);
    // * the gem and the digits, not the currency: it fades before the balance goes far (iOS primary balance)
    this.textD = rect(amount.x, amountBox.y, fraction.x + fraction.w - amount.x, amountBox.h);
    this.lineD = amountBox;
    this.iconD = slot;
    this.primaryD = union(slot, this.textD);
    this.secondaryD = rectOf(card.fiat, design);

    const top = header.top;
    this.navP = rectOf(header.navPrimary, top);
    this.navS = rectOf(header.navFiat, top);
    const icon = rectOf(header.navIcon, top), text = rectOf(header.navText, top);
    this.navIconRect = rect(icon.x - this.navP.x, icon.y - this.navP.y, icon.w, icon.h);
    this.navTextRect = rect(text.x - this.navP.x, text.y - this.navP.y, text.w, text.h);
    const title = rectOf(header.title, top);
    this.titleBottom = title.y + title.h;
    this.headerBottom = header.title.parentElement.offsetHeight;

    this.layoutFlight();
    this.makeRoom();
    this.measured = true;
    this.scrollTop = this.scroller.scrollTop;
  }

  /** the copy laid out as the card's balance, in the card's design units */
  private layoutFlight() {
    const {flight, primaryD, secondaryD, iconD, textD, lineD} = this;
    Object.assign(flight.primary.style, {width: `${primaryD.w}px`, height: `${primaryD.h}px`});
    Object.assign(flight.secondary.style, {width: `${secondaryD.w}px`, height: `${secondaryD.h}px`});
    Object.assign(flight.icon.style, {
      left: `${iconD.x - primaryD.x}px`, top: `${iconD.y - primaryD.y}px`, width: `${iconD.w}px`, height: `${iconD.h}px`
    });
    // * the line is laid out as the card's, its digits where the card's are; it scales about the digits' corner
    Object.assign(flight.text.style, {
      left: `${lineD.x - primaryD.x}px`, top: `${textD.y - primaryD.y}px`, transformOrigin: `${textD.x - lineD.x}px 0`
    });
    if(flight.gem && this.card.card) {
      // * the card's gem canvas, centred where the card centres it
      const size = DESIGN.gemCanvas, [x, y] = this.card.card.gemCenter();
      Object.assign(flight.gem.style, {
        width: `${size}px`, height: `${size}px`,
        left: `${x - iconD.x - size / 2}px`, top: `${y - iconD.y - size / 2}px`
      });
    }

    this.syncText();
  }

  /** the copy reads what the card's balance reads, the running count included */
  public syncText() {
    const {flight, card} = this;
    if(flight.amount.textContent !== card.amount.textContent) flight.amount.textContent = card.amount.textContent;
    if(flight.fraction.textContent !== card.fraction.textContent) flight.fraction.textContent = card.fraction.textContent;
    if(flight.secondary.textContent !== card.fiat.textContent) flight.secondary.textContent = card.fiat.textContent;
  }

  /**
   * A history long enough to scroll lets the card fold away completely (iOS minimum content height); a short
   * one keeps the window short
   */
  private makeRoom() {
    const scroller = this.scroller, room = this.room;
    const current = room.offsetHeight;
    const natural = scroller.scrollHeight - current;
    const height = scroller.clientHeight;
    const needed = natural > height ? Math.max(0, height + this.start() + this.distance() + 1 - natural) : 0;
    if(Math.abs(needed - current) > 0.5) room.style.height = `${needed}px`;
  }

  /** the card's own transform moved (tilt): the balance in flight follows it */
  public onCardFrame() {
    if(this.flying) this.update();
  }

  public update() {
    if(this.destroyed || !this.measured) return;
    const y = this.scrollTop;
    const {card, flight, header, cardRect: E} = this;
    const animations = liteMode.isAvailable('animations'), motion = liteMode.isAvailable('motion');
    const start = this.start(), distance = this.distance();
    const fraction = clamp01((y - start) / distance);
    this.fraction = fraction;

    header.edge.style.opacity = String(clamp01(y / EDGE_DISTANCE));

    if(!motion) {
      // * nothing travels: the card scrolls away with the history, under the header's edge as the rows do, and the
      // * header's title gives way to the balance as it goes - cross-fading while its lower half passes under the
      // * header with reduced animations, at once with none
      this.setFlying(false);
      card.root.style.zIndex = '0';
      card.fold.style.transform = card.fold.style.opacity = '';
      card.shading.style.opacity = '';
      card.details.forEach((element) => element.style.opacity = element.style.filter = '');
      card.card?.setScroll(0, 0);
      card.card?.setChip(1, 0);
      const goneAt = E.y + E.h - this.headerBottom;
      const gone = y >= goneAt;
      const shown = animations ? smoothstep01((y - goneAt) / (E.h / 2) + 1) : +gone;
      header.title.style.opacity = shown ? String(1 - shown) : '';
      header.title.style.filter = '';
      header.navPrimary.style.transform = header.navFiat.style.transform = '';
      header.navClip.style.clipPath = shown ? '' : 'inset(100%)';
      header.navClip.style.opacity = shown && shown < 1 ? String(shown) : '';
      this.setFolded(gone);
      return;
    }

    card.root.style.zIndex = '';
    header.navClip.style.opacity = '';
    // * the card lags behind the history (iOS cardScrollOffset)
    const lag = LAG * distance * fraction * (1 - fraction);
    const offset = y - lag;
    const pitch = motion ? COLLAPSED_PITCH * fraction * (2 - fraction) : 0;
    const scale = 1 + (COLLAPSED_SCALE - 1) * fraction;
    let scroll = ca.identity();
    if(motion) scroll[11] = -fraction / (CAMERA * this.k);
    scroll = ca.rotate(scroll, pitch, 1, 0, 0);
    scroll = ca.scale(scroll, scale, scale);
    card.fold.style.transform = fraction > 0 ? ca.css(ca.concat(scroll, ca.translation(0, lag))) : '';

    // * where the folded card stands on screen
    const centerX = E.x + E.w / 2, centerY = E.y + E.h / 2 - offset;
    const renderedTop = centerY + project(scroll, 0, -E.h / 2)[1];
    const edgeY = centerY + project(scroll, 0, E.h / 2)[1];
    const renderedMid = (renderedTop + edgeY) / 2;
    // * it fades out only once its middle went past the window's top (iOS cardVisibilityAlpha)
    const fadeDistance = Math.min(24, Math.max(1, (edgeY - renderedTop) / 2));
    card.fold.style.opacity = String(1 - smoothstep01(-renderedMid / fadeDistance));

    // * the details go between 0.3 and 0.6 of the fold, blurring
    const details = smoothstep01((fraction - 0.3) / 0.3);
    card.details.forEach((element) => {
      element.style.opacity = details ? String(1 - details) : '';
      element.style.filter = details ? `blur(${details * DETAILS_BLUR}px)` : '';
    });
    card.card?.setChip(1 - details, details * DETAILS_BLUR);
    const pitchFraction = pitch / COLLAPSED_PITCH;
    card.card?.setScroll(fraction, pitchFraction);
    card.shading.style.opacity = pitchFraction ? String(smoothstep01(pitchFraction)) : '';
    if(!card.card) {
      const wave = Math.sin(Math.PI * fraction);
      card.shadow.style.opacity = String(0.12 * wave * wave);
    }

    // * the title gives way to the card coming up under it (iOS headerTransitionFraction)
    let titleFade = 0;
    if(y > 0) {
      const fadeStart = this.titleBottom + 24, fadeStop = this.titleBottom;
      titleFade = smoothstep01((fadeStart - renderedTop) / Math.max(1, fadeStart - fadeStop));
    }

    header.title.style.opacity = titleFade ? String(1 - titleFade) : '';
    header.title.style.filter = titleFade ? `blur(${titleFade * TITLE_BLUR}px)` : '';

    this.updateBalance(y, offset, scroll, centerX, centerY, renderedMid, edgeY);
    this.setFolded(fraction >= 1);
  }

  private updateBalance(y: number, offset: number, scroll: CAMatrix, centerX: number, centerY: number, cardMid: number, edgeY: number) {
    const {card, flight, header, cardRect: E, s} = this;
    const start = this.start();
    const flying = y > start;
    this.setFlying(flying);
    header.navClip.style.clipPath = `polygon(0 ${edgeY}px, 100% ${edgeY}px, 100% 100%, 0 100%)`;
    if(!flying) {
      header.navPrimary.style.transform = header.navFiat.style.transform = '';
      return;
    }

    // * where the card draws the balance, by its own tilt: the flight starts there (iOS balance source frames)
    const own = card.card?.cardMatrix || ca.identity();
    const half = (r: Rect) => rect(r.x * s - E.w / 2, r.y * s - E.h / 2, r.w * s, r.h * s);
    const base = (r: Rect) => rect(0, 0, r.w * s, r.h * s);
    const ownP = projectRect(own, half(this.primaryD)), ownS = projectRect(own, half(this.secondaryD));
    const toScreen = (r: Rect) => rect(r.x + E.x + E.w / 2, r.y + E.y + E.h / 2, r.w, r.h);
    const sourceP = toScreen(ownP), sourceS = toScreen(ownS);
    const targetP = this.navP, targetS = this.navS;
    const navFrame = union(targetP, targetS);

    // * iOS updateBalanceTransition: the balance follows the card, catches up with the header and settles there
    const travel = Math.max(1, E.y + E.h / 2 - start - cy(navFrame));
    const t = clamp01((offset - start) / travel);
    const b = t + Math.pow(t, 6) * (1 - t);
    const horizontal = 1 - Math.pow(1 - b, 3);
    const sourceUnion = union(sourceP, sourceS);
    const following = lerp(cy(sourceUnion) - offset, cardMid, b);
    const arrival = Math.max(1, navFrame.h / 2);
    const toHeader = following - cy(navFrame);
    const centerYB = toHeader >= arrival ? following :
      cy(navFrame) + Math.pow(Math.max(0, toHeader + arrival), 2) / (4 * arrival);
    const verticalOffset = centerYB - lerp(cy(sourceUnion), cy(navFrame), b);
    const frame = (source: Rect, target: Rect): Rect => {
      const w = lerp(source.w, target.w, b), h = lerp(source.h, target.h, b);
      const x = lerp(cx(source), cx(target), horizontal), yy = lerp(cy(source), cy(target), b) + verticalOffset;
      return rect(x - w / 2, yy - h / 2, w, h);
    };

    const primary = frame(sourceP, targetP), secondary = frame(sourceS, targetS);

    // * the header's copy, below the card's bottom edge
    const place = (element: HTMLElement, from: Rect, to: Rect) => {
      element.style.transform = `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${to.w / from.w}, ${to.h / from.h})`;
    };

    place(header.navPrimary, targetP, primary);
    place(header.navFiat, targetS, secondary);

    // * the card's copy, above it: it keeps the card's tilt and fold until it is nearly there (iOS collapse b³)
    const collapse = b * b * b;
    const residual = mix(ca.concat(flatten(own), scroll), 1 - collapse);
    flight.root.style.clipPath = `polygon(0 0, 100% 0, 100% ${edgeY}px, 0 ${edgeY}px)`;
    const box = (element: HTMLElement, target: Rect, projected: Rect, rest: Rect, design: Rect) => {
      // * the residual transform scales what it holds: the box is sized so the result is the frame (iOS reference size)
      const reference = rect(0, 0, lerp(projected.w, rest.w, collapse), lerp(projected.h, rest.h, collapse));
      const sx = target.w / reference.w * s, sy = target.h / reference.h * s;
      element.style.transform = `translate(${cx(target)}px, ${cy(target)}px) scale(${sx}, ${sy}) translate(${-design.w / 2}px, ${-design.h / 2}px)`;
    };

    box(flight.primary, primary, ownP, base(this.primaryD), this.primaryD);
    box(flight.secondary, secondary, ownS, base(this.secondaryD), this.secondaryD);

    // * the residual turns about the card's middle; the balance's middle is put back where it belongs
    const together = union(primary, secondary);
    const [px, py] = project(residual, cx(together) - centerX, cy(together) - centerY);
    const correction = [cx(together) - (centerX + px), cy(together) - (centerY + py)];
    flight.group.style.transformOrigin = `${centerX}px ${centerY}px`;
    flight.group.style.transform = `translate(${correction[0]}px, ${correction[1]}px) ${ca.css(residual)}`;

    // * the gem and the digits take the header's proportions on the way (iOS content fraction)
    const content = smoothstep01(b);
    const {primaryD, iconD, textD, navIconRect, navTextRect} = this;
    const kx = primaryD.w / targetP.w, ky = primaryD.h / targetP.h;
    const inset = navIconRect.w * ICON_INSET;
    const iconTo = rect((navIconRect.x + inset) * kx, (navIconRect.y + inset) * ky, (navIconRect.w - inset * 2) * kx, (navIconRect.h - inset * 2) * ky);
    const textTo = rect(navTextRect.x * kx, navTextRect.y * ky, navTextRect.w * kx, navTextRect.h * ky);
    const iconFrom = rect(iconD.x - primaryD.x, iconD.y - primaryD.y, iconD.w, iconD.h);
    const textFrom = rect(textD.x - primaryD.x, textD.y - primaryD.y, textD.w, textD.h);
    const iconNow = rect(lerp(iconFrom.x, iconTo.x, content), lerp(iconFrom.y, iconTo.y, content),
      lerp(iconFrom.w, iconTo.w, content), lerp(iconFrom.h, iconTo.h, content));
    const textNow = rect(lerp(textFrom.x, textTo.x, content), lerp(textFrom.y, textTo.y, content),
      lerp(textFrom.w, textTo.w, content), lerp(textFrom.h, textTo.h, content));
    // * the gem keeps its shape: one scale, by the width
    flight.icon.style.transform = `translate(${cx(iconNow) - cx(iconFrom)}px, ${cy(iconNow) - cy(iconFrom)}px) scale(${iconNow.w / iconFrom.w})`;
    flight.text.style.transform = `translate(${textNow.x - textFrom.x}px, ${textNow.y - textFrom.y}px) scale(${textNow.w / textFrom.w}, ${textNow.h / textFrom.h})`;
    // * the currency goes first, over the first quarter of the fold (iOS)
    flight.currency.style.opacity = String(1 - smoothstep01(Math.min(1, this.fraction / 0.25)));
  }

  /** the card's own balance and the copy swap: one of them shows */
  private setFlying(flying: boolean) {
    if(this.flying === flying) return;
    this.flying = flying;
    const {card, flight} = this;
    const visibility = flying ? 'hidden' : '';
    card.balance.style.visibility = card.fiat.style.visibility = card.gemClip.style.visibility = visibility;
    flight.root.hidden = !flying;
    if(flying) this.syncText();
    card.card?.setGemMirror(flying ? flight.gem : null);
  }

  private setFolded(folded: boolean) {
    if(this.folded === folded) return;
    this.folded = folded;
    this.onFolded?.(folded);
  }

  public destroy() {
    this.destroyed = true;
    if(registry.get(this.scroller) === this) registry.delete(this.scroller);
    this.cancelFrame?.();
    this.cancelSettle?.();
    this.resizeObserver.disconnect();
    this.scroller.removeEventListener('scroll', this.onScrollEvent);
    this.scroller.removeEventListener('scrollend', this.onScrollEnd);
    this.card.card?.setGemMirror(null);
  }
}
