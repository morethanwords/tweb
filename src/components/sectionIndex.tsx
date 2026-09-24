import {createEffect, createMemo, For, onCleanup, onMount} from 'solid-js';
import {cancelAnimationByKey} from '@helpers/animation';
import clamp from '@helpers/number/clamp';
import wheelDeltaToPixels from '@helpers/dom/wheelDeltaToPixels';
import {I18n} from '@lib/langPack';
import styles from '@components/sectionIndex.module.scss';

/**
 * The fast-scroll strip of section letters along the side of an alphabetical list - a port of
 * tdesktop's `PeerListSectionIndex`. A press on a letter scrolls the list to its section and a drag
 * along the strip runs through them; the letters of the sections on screen are lit; when there
 * are more letters than fit, every n-th one is kept; and the letters under the pointer swell like
 * the Dock's icons as it comes near.
 */

export type SectionIndexLetter = {
  letter: string,
  /** where the section starts in the list's own coordinates */
  top: number
};

// * the strip's metrics, tdesktop's `peer_list_section_index.style`
const COLUMN_WIDTH = 22;
const APPROACH_WIDTH = 32;
const SLOT_HEIGHT = 15;
const MIN_SLOT_HEIGHT = 12;
const VERTICAL_INSET = 10;

// * the magnification, tdesktop's `peer_list_section_index.cpp`
const MAX_BOOST = 1.8;
const EASE = 0.6;
const FISHEYE_REACH_SLOTS = 2.2;
const BULGE_RESERVE_SLOTS = 2.5;

type Slot = {
  letter: string,
  /** the letter's index among all of them - the kept ones skip some when not all fit */
  sourceIndex: number,
  /** the centre of the slot at rest */
  y: number
};

/** Where the letters go in a strip of this height: every n-th of them when they do not all fit */
export function layoutSectionIndexSlots(letters: SectionIndexLetter[], height: number) {
  const count = letters.length;
  if(!count || height <= 0) {
    return {slots: [] as Slot[], pitch: 0};
  }

  const fullHeight = Math.max(height - 2 * VERTICAL_INSET, MIN_SLOT_HEIGHT);
  // room for the bulge the letters swell into under the pointer
  const reserve = BULGE_RESERVE_SLOTS * SLOT_HEIGHT | 0;
  const usable = Math.max(fullHeight - reserve, MIN_SLOT_HEIGHT);
  const maxFit = Math.max(usable / MIN_SLOT_HEIGHT | 0, 1);
  const skip = count <= maxFit ? 1 : Math.ceil(count / maxFit);
  const kept: number[] = [];
  for(let i = 0; i < count; i += skip) {
    kept.push(i);
  }

  // the last letter always stays, so the strip reaches the end of the list
  if(kept[kept.length - 1] !== count - 1) {
    kept.push(count - 1);
  }

  const pitch = Math.min(SLOT_HEIGHT, usable / kept.length | 0);
  const blockTop = VERTICAL_INSET + Math.max(0, (fullHeight - kept.length * pitch) / 2 | 0);
  const slots = kept.map((sourceIndex, idx): Slot => ({
    letter: letters[sourceIndex].letter,
    sourceIndex,
    y: blockTop + pitch * idx + (pitch / 2 | 0)
  }));

  return {slots, pitch};
}

export default function SectionIndex(props: {
  letters: SectionIndexLetter[],
  /**
   * the strip's height - the list's own, which the list has measured already: measured here, the
   * strip would come up a frame after its letters were asked for, empty until then
   */
  height: number,
  /** the sections that have rows on screen, lit on the strip */
  visibleLetters: Set<string>,
  /** a letter is picked - the list is to be scrolled to where its section starts */
  onJump: (top: number, animate: boolean) => void,
  /** the list the strip lies over: the wheel over the strip scrolls it */
  scrollable: HTMLElement,
  /**
   * where the pointer is followed as it comes near the strip - the letters start swelling before
   * it is over them, while what lies under that stretch keeps its own clicks
   */
  approachElement: HTMLElement
}) {
  let root: HTMLDivElement;
  const letterElements: HTMLElement[] = [];

  const layout = createMemo(() => layoutSectionIndexSlots(props.letters, props.height));

  let scales: number[] = [];
  let cursorX = -1, cursorY = -1;
  let current = -1;
  let scrubbing = false;
  let frame: number;

  const isRTL = () => I18n.getIsRTL();

  /** How much a letter swells: by how near the pointer is to it, and to the strip */
  const getSlotScale = (slotY: number) => {
    const {pitch} = layout();
    if(cursorY < 0 || !pitch) {
      return 1;
    }

    const vertical = clamp(Math.abs(slotY - cursorY) / (FISHEYE_REACH_SLOTS * pitch), 0, 1);
    const verticalFalloff = Math.cos(Math.PI / 2 * vertical);

    // how far out in the approach the pointer still is, from the strip's edge
    const away = isRTL() ?
      clamp((cursorX - COLUMN_WIDTH) / APPROACH_WIDTH, 0, 1) :
      clamp(-cursorX / APPROACH_WIDTH, 0, 1);
    const horizontalFalloff = 1 - away * away * (3 - 2 * away);

    return 1 + (MAX_BOOST - 1) * verticalFalloff * horizontalFalloff;
  };

  const paint = () => {
    const {slots, pitch} = layout();
    const count = slots.length;
    if(!count) {
      return;
    }

    // * swollen letters push the others apart, and the column grows out of its middle. It is one
    // * formula at rest and swollen alike - at rest it puts every letter exactly where the layout
    // * did - so the letters settle as they shrink, whichever way the pointer has gone: tdesktop
    // * puts them back at rest the moment the pointer is gone, and they jump there in one frame
    const half = pitch / 2 | 0;
    const extra = scales.reduce((sum, scale) => sum + scale * pitch, 0) - count * pitch;
    let edge = slots[0].y - half - extra / 2;
    for(let i = 0; i < count; ++i) {
      const element = letterElements[i];
      const scale = scales[i];
      const size = scale * pitch;
      const center = edge + (size - pitch) / 2 + half;
      edge += size;
      if(!element) {
        continue;
      }

      element.style.transform = `translateY(${center - pitch / 2}px)` + (scale > 1.001 ? ` scale(${scale})` : '');
      element.classList.toggle(styles.active, current === i || props.visibleLetters.has(slots[i].letter));
    }
  };

  /** One frame of the letters easing towards the size the pointer asks of them */
  const animateFrame = () => {
    frame = undefined;

    let moving = false;
    layout().slots.forEach((slot, idx) => {
      const target = getSlotScale(slot.y);
      const delta = target - scales[idx];
      if(Math.abs(delta) > 0.002) {
        scales[idx] += delta * EASE;
        moving = true;
      } else {
        scales[idx] = target;
      }
    });

    paint();

    if(moving) {
      frame = requestAnimationFrame(animateFrame);
    }
  };

  const startAnimation = () => {
    frame ??= requestAnimationFrame(animateFrame);
  };

  /**
   * Follows the pointer while it is over the strip, its approach - the stretch of the list beside
   * it - or the gap between the strip and the edge, and lets go of it anywhere else
   */
  const setCursor = (e: PointerEvent) => {
    const rect = root.getBoundingClientRect();
    const outerRect = props.approachElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const left = isRTL() ? outerRect.left - rect.left : -APPROACH_WIDTH;
    const right = isRTL() ? COLUMN_WIDTH + APPROACH_WIDTH : outerRect.right - rect.left;
    const inside = scrubbing || (x >= left && x <= right && y >= 0 && y <= rect.height);
    const [wasX, wasY] = [cursorX, cursorY];
    cursorX = inside ? x : -1;
    cursorY = inside ? y : -1;
    if(wasX !== cursorX || wasY !== cursorY) {
      startAnimation();
    }
  };

  /**
   * The pointer has left the list: the letters settle back. Not by where it left - an event of
   * leaving can still carry a point on the very edge, which the strip would take as near
   */
  const onLeave = () => {
    if(scrubbing || cursorY < 0) {
      return;
    }

    cursorX = cursorY = -1;
    startAnimation();
  };

  const getSlotAtY = (y: number) => {
    let best = -1, bestDistance = 0;
    layout().slots.forEach((slot, idx) => {
      const distance = Math.abs(slot.y - y);
      if(best < 0 || distance < bestDistance) {
        best = idx;
        bestDistance = distance;
      }
    });

    return best;
  };

  const scrubTo = (slotIdx: number, animate: boolean) => {
    if(slotIdx < 0 || slotIdx === current) {
      return;
    }

    current = slotIdx;
    props.onJump(props.letters[layout().slots[slotIdx].sourceIndex].top, animate);
    paint();
  };

  const onPointerDown = (e: PointerEvent) => {
    if(e.button !== 0) {
      return;
    }

    e.preventDefault();
    root.setPointerCapture(e.pointerId);
    scrubbing = true;
    setCursor(e);
    // the press glides to the letter, a drag along the strip follows the pointer at once
    scrubTo(getSlotAtY(cursorY), true);
  };

  // * the approach holds the strip, so this hears the pointer over both - and while the strip
  // * holds it captured, wherever it goes, since a captured pointer's events still bubble up here
  const onPointerMove = (e: PointerEvent) => {
    setCursor(e);
    if(scrubbing) {
      scrubTo(getSlotAtY(cursorY), false);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if(!scrubbing) {
      return;
    }

    scrubbing = false;
    current = -1;
    setCursor(e);
    paint();
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const {scrollable} = props;
    cancelAnimationByKey(scrollable);
    scrollable.scrollTop += wheelDeltaToPixels(e.deltaY, e.deltaMode, scrollable.clientHeight);
  };

  // * a new set of letters, or a strip of another height, starts from letters at rest - and swells
  // * again at once if the pointer is still by it
  createEffect(() => {
    scales = layout().slots.map(() => 1);
    queueMicrotask(() => cursorY < 0 ? paint() : startAnimation());
  });

  createEffect(() => {
    props.visibleLetters;
    paint();
  });

  onMount(() => {
    const {approachElement} = props;
    approachElement.addEventListener('pointermove', onPointerMove);
    approachElement.addEventListener('pointerleave', onLeave);
    root.addEventListener('wheel', onWheel, {passive: false});

    onCleanup(() => {
      approachElement.removeEventListener('pointermove', onPointerMove);
      approachElement.removeEventListener('pointerleave', onLeave);
      if(frame !== undefined) {
        cancelAnimationFrame(frame);
      }
    });
  });

  return (
    // * a shortcut for the pointer alone: the list it scrolls is there to be read and moved through
    <div
      ref={root}
      class={styles.index}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <For each={layout().slots}>
        {(slot, idx) => (
          <span
            ref={(element) => letterElements[idx()] = element}
            class={styles.letter}
            style={{height: layout().pitch + 'px', 'line-height': layout().pitch + 'px'}}
          >
            {slot.letter}
          </span>
        )}
      </For>
    </div>
  );
}
