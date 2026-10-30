// The send after the button press — a port of WalletFlow from the iOS demo,
// without the screens and the data.
//
// The gem of the amount screen, tossed, falls along a parabola into the new
// top row of the history. The row opens while the screen slides away, rises
// over the list and sags from the hit (TransferRow). Then the gem lives in it
// and spins fast while the transfer goes; when it went through, stars fly out
// of the gem across the row and the gem shrinks into the icon next to the amount.
//
// The sequence, as the design drives it:
//
//   const flight = flow.launch({gem, from, width, spin});  // from the amount screen's gem (client px)
//   gem.style.hideStone = true;                             // the screen's gem stays behind as stars
//   // scroll the history to the top and go back to the wallet screen, then:
//   clock.after(ROW_DELAY, () => {
//     // build the row (see transferRow.ts) and prepend it to the list
//     flow.addRow(flight, elements, {onMorph, onFinish});
//   });
//   // onLand(row): the design completes PENDING seconds later —
//   //   clock.after(PENDING, () => {row.complete(); /* balance, «Just now» */});
//   // a real transfer calls row.complete() on confirmation (before the landing it waits for it).
//
//   flow.frame(clock.now());   // every frame while `flow.active` (rows first, then the flight)
//   flow.destroy();

import {GemView, Appearance} from '@components/wallet/visual/gem/stage';
import {clock} from '@components/wallet/visual/clock';
import {pixelRatio} from '@components/wallet/visual/dom';
import isDocumentRTL from '@helpers/dom/isDocumentRTL';
import {Vec2} from '@components/wallet/visual/math';
import {TransferRow, TransferRowCallbacks, TransferRowElements} from '@components/wallet/visual/flow/transferRow';
import {
  FLY_CANVAS,
  GEM_INK,
  PENDING_GEM,
  ROW_DELAY,
  ROW_HEIGHT,
  ROW_SPIN,
  toss,
  TRAVEL
} from '@components/wallet/visual/flow/timing';

export interface Flight {
  launch: number,
  from: Vec2,
  fromWidth: number,
  fromSpin: number,
  row: TransferRow,
  landed: boolean
}

export interface SendLaunch {
  /** The gem being thrown: its pose, motion and clock are adopted. */
  gem: GemView,
  /** The gem's centre at the start, client px. */
  from: Vec2,
  /** Its width at the start, points. */
  width: number,
  /** Its rotation speed at the start, rad/s. */
  spin: number
}

export interface SendFlowOptions {
  /** The history list the rows are prepended to: the target until the row exists. */
  list: HTMLElement,
  /** Where the fixed flight canvas goes; document.body by default. */
  parent?: HTMLElement,
  /** The gem landed in its row. */
  onLand?: (row: TransferRow, now: number) => void
}

export class SendFlow {
  public flights: Flight[];
  public rows: TransferRow[];
  /** The gem in flight — above everything, only while it flies. */
  public flyCanvas: HTMLCanvasElement;
  public fly: GemView;
  private list: HTMLElement;
  private onLand: (row: TransferRow, now: number) => void;

  /** Throws when WebGL2 is unavailable. */
  constructor({list, parent = document.body, onLand}: SendFlowOptions) {
    this.list = list;
    this.onLand = onLand;
    this.flights = [];
    this.rows = [];
    this.flyCanvas = document.createElement('canvas');
    this.flyCanvas.setAttribute('aria-hidden', 'true');
    this.flyCanvas.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:100;display:none';
    this.fly = new GemView(this.flyCanvas, {appearance: Appearance.blue, swayScale: 1.6, lightBackground: true});
    this.fly.setSize(FLY_CANVAS, pixelRatio());
    Object.assign(this.flyCanvas.style, {width: `${FLY_CANVAS}px`, height: `${FLY_CANVAS}px`});
    parent.append(this.flyCanvas);
  }

  /** The send went off: the gem is thrown from the place of the amount screen's gem. */
  public launch({gem, from, width, spin}: SendLaunch, now = clock.now()): Flight {
    const flight: Flight = {launch: now, from, fromWidth: width, fromSpin: spin, row: null, landed: false};
    this.fly.adopt(gem);
    this.fly.style.rotationSpeed = spin;
    this.fly.style.widthPoints = width;
    this.fly.bursts = [];
    this.flyCanvas.style.display = 'block';
    this.flights.push(flight);
    return flight;
  }

  /**
   * The flight's row is in the list (ROW_DELAY after the throw): it starts
   * rising, and the gem falls into it.
   */
  public addRow(flight: Flight, elements: TransferRowElements, callbacks?: TransferRowCallbacks): TransferRow {
    const row = new TransferRow(elements, flight.launch + ROW_DELAY, callbacks);
    flight.row = row;
    this.rows.push(row);
    return row;
  }

  /**
   * Rows first — they move (lift, hit, opening), then the flying gems: each
   * aims at where its row stands on screen in this frame, with all its
   * shifts. One layout read per frame, after all the writes.
   */
  public frame(now: number) {
    for(const row of this.rows) row.frame(now);
    for(const flight of this.flights) this.flightFrame(flight, now);
    this.flights = this.flights.filter((f) => !f.landed);
    if(!this.flights.length) this.flyCanvas.style.display = 'none';
    this.rows = this.rows.filter((row) => !row.finished);
  }

  public get active(): boolean {
    return this.flights.length > 0 || this.rows.length > 0;
  }

  private flightFrame(flight: Flight, now: number) {
    const t = Math.min(1, Math.max(0, (now - flight.launch) / TRAVEL));
    let slot: Vec2, slotWidth = PENDING_GEM * GEM_INK;
    if(flight.row) {
      // The row's gem canvas already stands in its place — with the lift, the
      // hit, the row's opening and the page's slide-in: fall there.
      const r = flight.row.gemCanvas.getBoundingClientRect();
      slot = [r.left + r.width / 2, r.top + r.height / 2];
      slotWidth *= r.width / FLY_CANVAS;
    } else {
      // * the new row's gem stands at its inline end: the right one, the left one right to left
      const r = this.list.getBoundingClientRect();
      const inset = 8 + 12 + PENDING_GEM / 2;
      slot = [isDocumentRTL(this.list.ownerDocument) ? r.left + inset : r.right - inset, r.top + 8 + ROW_HEIGHT / 2];
    }
    const p = toss(flight.from, slot, 44, t);
    // At the top of the throw the gem is bigger — as if it flew closer to us.
    const width = (flight.fromWidth + (slotWidth - flight.fromWidth) * t) * (1 + 0.28 * Math.sin(Math.PI * Math.min(1, t / 0.75)));
    this.fly.style.widthPoints = width;
    this.fly.style.rotationSpeed = flight.fromSpin + (ROW_SPIN - flight.fromSpin) * Math.min(1, t / 0.6);
    this.flyCanvas.style.transform = `translate(${p[0] - FLY_CANVAS / 2}px, ${p[1] - FLY_CANVAS / 2}px)`;
    this.fly.render(now);
    if(t >= 1 && flight.row) this.land(flight, now);
  }

  /** Landed: the row takes the gem over in the same frame the flying one disappears. */
  private land(flight: Flight, now: number) {
    flight.landed = true;
    flight.row.land(this.fly, now);
    this.onLand?.(flight.row, now);
  }

  /** Releases the rows' gems, the flying gem and its canvas. */
  public destroy() {
    for(const row of this.rows) row.destroy();
    this.rows = [];
    this.flights = [];
    this.fly.destroy();
    this.flyCanvas.remove();
  }
}
