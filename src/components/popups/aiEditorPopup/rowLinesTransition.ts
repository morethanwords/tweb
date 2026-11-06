import {getTransition} from '@config/transitions';
import liteMode from '@helpers/liteMode';

/*
 * The lines of a row (`Row`) part as a subtitle comes under its title, and close up as it goes, instead of the row
 * being laid out anew in one frame (FLIP). `prepare()` notes where everything stands before the change; right after
 * it (a microtask: the change is Solid's, finished by then, and nothing is painted in between) the title and the
 * toggle go from there to where the change put them, the new subtitle comes out from under the title as it rises and
 * the old one (a copy: its element is gone) goes back under it as it comes down; one subtitle changed for another
 * crossfades where it stands. The card the row stands on grows or shrinks with it, so what is under it moves along
 * rather than jumps. Reduced: nothing travels - the lines are where they go at once - but the card still grows or
 * shrinks, a subtitle that comes fades in, and one changed for another crossfades.
 */

const DURATION = 250;
const DURATION_REDUCED = 200;
// * what goes, quicker than what comes
const FADE_OUT = 150;

type Parts = {
  title: HTMLElement,
  subtitle: HTMLElement,
  toggle: HTMLElement
};

type Snapshot = {
  row: DOMRect,
  rects: Map<HTMLElement, DOMRect>,
  parts: Parts,
  card: number
};

const getParts = (row: HTMLElement): Parts => ({
  // * not the right parts, which take the same class
  title: row.querySelector('.row-title:not(.row-title-right)'),
  subtitle: row.querySelector('.row-subtitle:not(.row-subtitle-right)'),
  toggle: row.querySelector('.checkbox-field-toggle')
});

// * where a part stands in its row
const getOffset = (rect: DOMRect, row: DOMRect) => ({x: rect.left - row.left, y: rect.top - row.top});

export default function createRowLinesTransition(getRow: () => HTMLElement) {
  let animations: Animation[] = [];
  let ghost: HTMLElement;
  let clipped: HTMLElement;

  const getCard = (row: HTMLElement) => row.closest<HTMLElement>('.sidebar-left-section');

  // * what is still moving stays where it is now: the next change goes on from there
  const settle = () => {
    animations.forEach((animation) => animation.cancel());
    animations = [];
    ghost?.remove();
    ghost = undefined;
    clipped?.style.removeProperty('overflow');
    clipped = undefined;
  };

  const play = (before: Snapshot) => {
    const row = getRow();
    const card = row && getCard(row);
    if(!card?.isConnected || !row.getClientRects().length) {
      return;
    }

    const motion = liteMode.isAvailable('motion');
    const options: KeyframeAnimationOptions = {
      duration: motion ? DURATION : DURATION_REDUCED,
      easing: getTransition('standard').easing
    };
    const rowRect = row.getBoundingClientRect();
    const parts = getParts(row);
    const animate = (element: HTMLElement, keyframes: Keyframe[], animationOptions = options) => {
      const animation = element.animate(keyframes, animationOptions);
      animations.push(animation);
      return animation;
    };

    // * the way a part has come: from where it stood in the row to where it stands now
    const getShift = (from: HTMLElement, to: HTMLElement) => {
      const rect = from && to && before.rects.get(from);
      if(!rect) return {x: 0, y: 0};
      const was = getOffset(rect, before.row), is = getOffset(to.getBoundingClientRect(), rowRect);
      return {x: was.x - is.x, y: was.y - is.y};
    };
    const slide = (element: HTMLElement, shift: {x: number, y: number}) => {
      if(!motion || !element || (Math.abs(shift.x) < .5 && Math.abs(shift.y) < .5)) return;
      animate(element, [{translate: `${shift.x}px ${shift.y}px`}, {translate: '0 0'}]);
    };

    const titleShift = getShift(before.parts.title, parts.title);
    slide(parts.title, titleShift);
    slide(parts.toggle, getShift(before.parts.toggle, parts.toggle));

    // * half the way the title goes: the new line comes from under it, the old one goes back under it
    const lineShift = motion ? titleShift.y / 2 : 0;
    const oldSubtitle = before.parts.subtitle;
    const newSubtitle = parts.subtitle;
    if(newSubtitle && newSubtitle !== oldSubtitle) {
      const comingOut = !oldSubtitle && lineShift;
      animate(newSubtitle, [
        {opacity: 0, translate: `0 ${comingOut ? -lineShift : 0}px`},
        // * seen once the title is off it: under it, their letters would cross
        ...(comingOut ? [{opacity: 0, offset: .4}] : []),
        {opacity: 1, translate: '0 0'}
      ]);
    }

    // * one gone with none in its place, reduced: the title is already down where it would fade, so it goes at once
    if(oldSubtitle && oldSubtitle !== newSubtitle && (newSubtitle || motion)) {
      const rect = before.rects.get(oldSubtitle);
      const {x, y} = getOffset(rect, before.row);
      ghost = oldSubtitle.cloneNode(true) as HTMLElement;
      ghost.setAttribute('aria-hidden', 'true');
      Object.assign(ghost.style, {
        position: 'absolute',
        // * in a grid row its class gives it the subtitle's area, which would be what `top` counts from
        gridArea: 'auto',
        left: x + 'px',
        top: y + 'px',
        width: rect.width + 'px',
        margin: '0'
      });
      row.append(ghost);
      const leaving = ghost;
      const goingIn = !newSubtitle && lineShift;
      animate(leaving, [
        {opacity: 1, translate: '0 0'},
        // * gone before it is under the title
        ...(goingIn ? [{opacity: 0, offset: .6}] : []),
        {opacity: 0, translate: `0 ${goingIn ? lineShift : 0}px`}
      ], {...options, duration: FADE_OUT, fill: 'forwards'}).finished.then(() => {
        leaving.remove();
        if(ghost === leaving) ghost = undefined;
      }, () => {});
    }

    const height = card.getBoundingClientRect().height;
    if(Math.abs(height - before.card) >= .5) {
      // * the row has its new height at once: the card shows as much of it as it has grown to
      clipped = card;
      card.style.overflow = 'hidden';
      animate(card, [{height: before.card + 'px'}, {height: height + 'px'}]).finished.then(() => {
        if(clipped !== card) return;
        card.style.removeProperty('overflow');
        clipped = undefined;
      }, () => {});
    }
  };

  // * before the row changes. Another change before the first is played was not seen either: the screen still shows
  // * what the first one noted
  let pending = false;
  const prepare = () => {
    if(pending) return;
    const row = getRow();
    const card = row && getCard(row);
    if(!card?.isConnected || !row.getClientRects().length || !liteMode.isAvailable('animations')) {
      settle();
      return;
    }

    const parts = getParts(row);
    const rects = new Map<HTMLElement, DOMRect>();
    for(const part of Object.values(parts)) {
      if(part) rects.set(part, part.getBoundingClientRect());
    }

    const before: Snapshot = {
      row: row.getBoundingClientRect(),
      rects,
      parts,
      card: card.getBoundingClientRect().height
    };
    settle();
    pending = true;
    queueMicrotask(() => {
      pending = false;
      play(before);
    });
  };

  return {prepare};
}
