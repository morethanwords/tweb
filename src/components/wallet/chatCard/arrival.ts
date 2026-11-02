/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {Message} from '@layer';
import type {MyMessage} from '@appManagers/appMessagesManager';
import rootScope from '@lib/rootScope';
import I18n from '@lib/langPack';
import sequentialDom from '@helpers/sequentialDom';
import {sampleKeyframes} from '@components/wallet/chatCard/motion';
import {hotListen} from '@helpers/hotModule';

/**
 * What iOS adds when an incoming transfer card is read (ChatMessageTransferBubbleContentNode,
 * WalletTransferArrivalAnimation): a card that came while its chat was open rises in from below, and every glyph
 * on the card lifts for a moment as the sheen passes over it.
 */

export const RISE_DURATION = 800;
export const LIFT_DURATION = 800;
/** the sheen (the card's glare) runs this far past either edge of the card, px */
export const SHEEN_OVERRUN = 45;
/** a transfer that came this long ago is not fresh any more, ms */
const FRESH_FOR = 60e3;

/** the amount's glyphs lift higher and grow more than the name's and the address's */
const LIFT_AMOUNT = {rise: 1.2, grow: .1};
const LIFT_TEXT = {rise: .9, grow: .08};

// * incoming transfers that came while the app was open, by chat and message: their cards rise in when read
const fresh: Map<string, number> = new Map();
const freshKey = (message: {peerId?: PeerId, mid?: number}) => message.peerId + '_' + message.mid;

hotListen(import.meta.hot, rootScope, 'history_multiappend', (message: MyMessage) => {
  if(message?._ !== 'messageService' || message.action?._ !== 'messageActionGramTransfer' || message.pFlags.out) {
    return;
  }

  const now = Date.now();
  fresh.forEach((at, key) => now - at > FRESH_FOR && fresh.delete(key));
  fresh.set(freshKey(message), now);
});

/** whether the card's transfer came while its chat was open; asked once, by the card */
export function takeFreshTransfer(message: Message.messageService) {
  const key = freshKey(message);
  const at = fresh.get(key);
  fresh.delete(key);
  return at !== undefined && Date.now() - at <= FRESH_FOR;
}

/**
 * The fresh card's rise: from 70 px lower at .86 of its size, on a spring (ω 13, ζ 9) with its bottom edge where
 * it lands; it shows in its first 120 ms
 */
export function riseAt(elapsed: number, height: number) {
  const t = elapsed / 1000;
  const spring = t < RISE_DURATION / 1000 ? 1 - Math.exp(-9 * t) * (Math.cos(13 * t) + 9 / 13 * Math.sin(13 * t)) : 1;
  const scale = .86 + .14 * spring;
  return {
    y: 70 * (1 - spring) + (1 - scale) * height / 2,
    scale,
    opacity: Math.min(1, t / .12)
  };
}

/** a glyph's lift after the sheen crossed it: up and back down, a bit past, and still in 0.8 s */
export function liftAt(elapsed: number) {
  const t = elapsed / 1000;
  return t > 0 && t < LIFT_DURATION / 1000 ? Math.sin(2 * Math.PI * 1.7 * t) * Math.exp(-t / .2) : 0;
}

const liftKeyframes: Map<typeof LIFT_AMOUNT, Keyframe[]> = new Map();
function getLiftKeyframes(kind: typeof LIFT_AMOUNT) {
  let keyframes = liftKeyframes.get(kind);
  if(!keyframes) {
    liftKeyframes.set(kind, keyframes = sampleKeyframes(LIFT_DURATION, (elapsed) => {
      const lift = liftAt(elapsed);
      return {transform: `translateY(${-kind.rise * lift}px) scale(${1 + kind.grow * lift})`};
    }));
  }

  return keyframes;
}

const segmenter = typeof Intl !== 'undefined' && (Intl as any).Segmenter ? new (Intl as any).Segmenter(undefined, {granularity: 'grapheme'}) : undefined;
function graphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (item: {segment: string}) => item.segment) : Array.from(text);
}

/**
 * Wraps every visible character of `root` into a span of `glyphClass`; whitespace stays text. `restore` puts the
 * very same text nodes back, so whoever renders them keeps hold of them.
 */
function splitGlyphs(root: HTMLElement, glyphClass: string) {
  const texts: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for(let node = walker.nextNode(); node; node = walker.nextNode()) {
    texts.push(node as Text);
  }

  const glyphs: HTMLElement[] = [];
  const replaced: Array<[Text, ChildNode[]]> = [];
  for(const text of texts) {
    const nodes: ChildNode[] = [];
    for(const part of graphemes(text.data)) {
      if(/^\s+$/.test(part)) {
        const last = nodes[nodes.length - 1];
        if(last instanceof Text) last.data += part;
        else nodes.push(document.createTextNode(part));
        continue;
      }

      const span = document.createElement('span');
      span.className = glyphClass;
      span.textContent = part;
      glyphs.push(span);
      nodes.push(span);
    }

    if(!nodes.length) continue;
    text.replaceWith(...nodes);
    replaced.push([text, nodes]);
  }

  return {
    glyphs,
    restore: () => {
      for(const [text, nodes] of replaced) {
        // * re-rendered meanwhile: what is there now is not ours
        const parent = nodes[0].parentNode;
        if(!parent) continue;
        parent.insertBefore(text, nodes[0]);
        nodes.forEach((node) => node.remove());
      }
    }
  };
}

export type LiftParts = {
  card: HTMLElement,
  /** the amount's glyph cells, there already (the read's rolling amount) */
  amountGlyphs: HTMLElement[],
  /** text cut into glyphs for the time of the lift: on the amount's line (the ticker), and the rest (the name) */
  amountTexts: HTMLElement[],
  texts: HTMLElement[],
  /** the address, whose colour is the sheen: each of its glyphs paints the sheen at its own place */
  address?: HTMLElement,
  glyphClass: string,
  liftingClass: string,
  /** the sheen starts crossing the card in this long, ms, and takes `sheenDuration` to cross it */
  delay: number,
  sheenDuration: number
};

/**
 * Every glyph of the card lifts as the sheen crosses its middle, one after another from the inline start (the sheen
 * runs from there: from the right right to left), the sheen starting `delay` after the call. `restore` puts the card's text back as it was, once the last glyph rests
 * (`restoreAt`, ms after the call), or stops the lift that has not started yet.
 *
 * The text is cut in a write phase and measured in the next frame's read phase, before the glyphs start in its
 * write phase: a card that comes with a message forces no layout of the chat.
 */
export function liftCardGlyphs(parts: LiftParts) {
  const start = performance.now();
  // * the sheen is past the card's far edge by then: no glyph starts later
  const lastDelay = parts.delay + parts.sheenDuration;
  let splits: ReturnType<typeof splitGlyphs>[] = [], restored = false;

  sequentialDom.mutate(() => {
    if(restored || !parts.card.isConnected) return;
    const cut = (elements: HTMLElement[]) => elements.filter(Boolean).map((element) => splitGlyphs(element, parts.glyphClass));
    const amountSplit = cut(parts.amountTexts);
    const textSplit = cut(parts.texts);
    const addressSplit = cut(parts.address ? [parts.address] : []);
    splits = [...amountSplit, ...textSplit, ...addressSplit];

    const amount = new Set([...parts.amountGlyphs, ...amountSplit.flatMap((item) => item.glyphs)]);
    const address = new Set(addressSplit.flatMap((item) => item.glyphs));
    const glyphs = [...amount, ...textSplit.flatMap((item) => item.glyphs), ...address];

    // * all read at once, before anything moves; in the card's own box, so its bump or rise does not count
    // * `from`: where the glyph begins from the card's inline-start edge, the sheen's way; `middle`, its middle
    let width: number, places: {glyph: HTMLElement, from: number, middle: number}[];
    const rtl = I18n.getIsRTL();
    sequentialDom.measure(() => {
      if(restored || !parts.card.isConnected) return;
      width = parts.card.offsetWidth;
      places = glyphs.map((glyph) => {
        const left = glyph.offsetLeft, glyphWidth = glyph.offsetWidth;
        const from = rtl ? width - left - glyphWidth : left;
        return {glyph, from, middle: from + glyphWidth / 2};
      });
    });

    sequentialDom.mutate(() => {
      if(restored || !places) return;
      // * the address's glyphs paint the sheen themselves from now on, each at its own place (cut, they still showed
      // * the address's own)
      parts.address?.classList.add(parts.liftingClass);
      // * the sheen started with the call: the glyphs keep to it
      const elapsed = performance.now() - start;
      for(const {glyph, from, middle} of places) {
        if(address.has(glyph)) {
          glyph.style.setProperty('--glyph-x', from + 'px');
        }

        const delay = Math.min(lastDelay, parts.delay + (middle + SHEEN_OVERRUN) / (width + 2 * SHEEN_OVERRUN) * parts.sheenDuration);
        glyph.animate(getLiftKeyframes(amount.has(glyph) ? LIFT_AMOUNT : LIFT_TEXT), {
          duration: LIFT_DURATION,
          delay: delay - elapsed,
          easing: 'linear'
        });
      }
    });
  });

  return {
    restoreAt: lastDelay + LIFT_DURATION,
    restore: () => {
      restored = true;
      splits.forEach((item) => item.restore());
      parts.address?.classList.remove(parts.liftingClass);
    }
  };
}
