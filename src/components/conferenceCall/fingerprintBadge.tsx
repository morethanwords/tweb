import {createMemo, createSignal, createUniqueId, For, onCleanup, Show} from 'solid-js';
import classNames from '@helpers/string/classNames';
import liteMode from '@helpers/liteMode';
import {STANDARD_TRANSITION_EASING} from '@helpers/standardTransition';
import {emojiFingerprint} from '@lib/calls/e2e/emojiFingerprint';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import I18n, {i18n} from '@lib/langPack';
import A11yButton from '@components/a11yButton';
import appNavigationController, {NavigationItem} from '@components/appNavigationController';
import Modes from '@config/modes';

/*
 * The call's encryption key, as Telegram for macOS has it (GroupCallSecureEmojiView.swift) and in
 * the call popups' own look: a pill under the header — "End-to-End Encrypted" between two of the
 * key's four emoji on either side — that a click turns into a card in the middle of the dimmed
 * panel, the emoji grown into a row over a title and what they are for. A click on the card or the
 * dim, or Escape, folds it back; no button for it (as on iOS, and tdesktop only has a tooltip): the
 * card is the one control, and a button inside it could only have pretended to be another. Until
 * the participants agree on a key, every emoji spins like a slot machine's reel. In a wide panel a
 * track as big as the panel carries the pill over the participants' column, or into the header
 * beside its buttons while the column is hidden (the styles move it, by transform).
 *
 * It is one element changing its shape, and only transforms and opacity move, so the compositor
 * runs it all: a size animated with it waited for the main thread, and stuttered whenever the call
 * kept that busy. While it moves, the card's background is drawn by a surface of nine pieces — the
 * corners slide, the edges stretch along themselves, the middle both ways — so the corners never
 * squash however the width and the height change; at rest the pill and the card are plain boxes,
 * each as wide as it needs. The emoji glide (FLIP) from their places in the pill to theirs in the
 * card. The pill's label fades rather than glides: on its way to the card's title it would cross
 * the emoji spreading out.
 */

// Opening, macOS's spring, whose curve TGUIKit gives as this bezier (ContainableController.swift:
// listViewAnimationCurveSystem). Folding starts gently instead, so the text inside fades out before
// the card closes over it.
const OPEN_DURATION = 450;
const OPEN_EASING = 'cubic-bezier(.23, 1, .32, 1)';
const FOLD_DURATION = 350;
const FOLD_EASING = STANDARD_TRANSITION_EASING;
// the label is gone before the emoji spread over it, and back once they have folded in
const LABEL_OUT_DURATION = 50;
const LABEL_IN_DURATION = 120;
const DETAILS_OUT_DURATION = 100;
// distinct emoji on a reel; it shows them twice over, so a turn ends where it began
const REEL_LENGTH = 4;

type Box = {left: number, top: number, width: number, height: number};

const center = (rect: Box) => ({
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2
});

const SURFACE_PIECES = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'] as const;
type SurfacePiece = typeof SURFACE_PIECES[number];

/**
 * The surface's pieces' transforms for a box `width`×`height`, the surface itself being laid out
 * as the open card, `open`, centred on the card, with corners of `radius`.
 */
function getSurfaceTransforms(width: number, height: number, open: {width: number, height: number}, radius: number) {
  const dx = (open.width - width) / 2;
  const dy = (open.height - height) / 2;
  const sx = Math.max(0, width - 2 * radius) / (open.width - 2 * radius);
  const sy = Math.max(0, height - 2 * radius) / (open.height - 2 * radius);
  const transforms: {[piece in SurfacePiece]: string} = {
    tl: `translate(${dx}px, ${dy}px)`,
    t: `translateY(${dy}px) scaleX(${sx})`,
    tr: `translate(${-dx}px, ${dy}px)`,
    l: `translateX(${dx}px) scaleY(${sy})`,
    c: `scale(${sx}, ${sy})`,
    r: `translateX(${-dx}px) scaleY(${sy})`,
    bl: `translate(${dx}px, ${-dy}px)`,
    b: `translateY(${-dy}px) scaleX(${sx})`,
    br: `translate(${-dx}px, ${-dy}px)`
  };
  return transforms;
}

export interface FingerprintBadgeProps {
  /** The call's `emoji_hash`; none while the participants still agree on the key. */
  emojiHash?: Uint8Array;
  class?: string;
}

export default function FingerprintBadge(props: FingerprintBadgeProps) {
  const emojis = createMemo(() => props.emojiHash ? emojiFingerprint(props.emojiHash) : undefined);
  // what the reels spin through: random ones from the key's own table, as macOS picks them
  const reelEmojis = emojiFingerprint(crypto.getRandomValues(new Uint8Array(8 * 4 * REEL_LENGTH)));
  const [expanded, setExpanded] = createSignal(false);

  const titleText = () => I18n.format(emojis() ? 'ConferenceEncrypted' : 'ConferenceEncryptedSyncing', true);
  const label = () => {
    const list = emojis();
    return list ? `${titleText()}: ${list.join(' ')}` : titleText();
  };

  let track: HTMLDivElement;
  let card: HTMLElement;
  let surface: HTMLElement;
  const pieces = {} as {[piece in SurfacePiece]: HTMLElement};
  let labelEl: HTMLElement;
  let details: HTMLElement;
  const slots: HTMLElement[] = [];
  const infoId = createUniqueId();

  const navigationItem: NavigationItem = {
    type: 'dropdown',
    noBlurOnPop: Modes.a11y,
    onPop: () => {
      morph(false);
    }
  };

  // only the morph's own: the press's scale transition carries on under it
  const running: Animation[] = [];
  let morphEnd: () => void;
  // the card's surface takes over its fill, and what carries it holds still
  const setMorphing = (morphing: boolean) => {
    card.classList.toggle('is-morphing', morphing);
    track.classList.toggle('is-morphing', morphing);
  };
  const morph = (expand: boolean) => {
    if(expanded() === expand) {
      return;
    }

    if(expand) {
      appNavigationController.pushItem(navigationItem);
    } else {
      appNavigationController.removeItem(navigationItem);
    }

    const animates = liteMode.isAvailable('animations') && card.isConnected;
    const animate = animates && liteMode.isAvailable('motion');
    // Every box below is read on screen, where a press leaves the pill at `scale: .97` and on its
    // way back to 1 for a while yet. The morph runs inside the card, in its own units: divided by
    // that, its surface ends at the card's full size instead of 3% short of it — which the card's
    // own fill made up in the last frame, growing on every side.
    const scale = parseFloat(getComputedStyle(card).scale) || 1;
    // Where everything is on screen now, mid-morph included: then the card is where its surface's
    // corners are, whatever its own box.
    let from: Box = card.getBoundingClientRect();
    if(morphEnd) {
      const topLeft = pieces.tl.getBoundingClientRect();
      const bottomRight = pieces.br.getBoundingClientRect();
      from = {
        left: topLeft.left,
        top: topLeft.top,
        width: bottomRight.right - topLeft.left,
        height: bottomRight.bottom - topLeft.top
      };
    }

    const slotsFrom = slots.map((slot) => slot.getBoundingClientRect());
    const labelFrom = labelEl.getBoundingClientRect();
    const detailsFrom = !expand && animate ? details.getBoundingClientRect() : undefined;
    // the open card's box, which the surface is laid out as
    let open = expand ? undefined : {width: card.offsetWidth, height: card.offsetHeight};

    morphEnd?.();
    running.splice(0).forEach((animation) => animation.cancel());

    // before the new shape's style is computed: what carries the pill in a wide panel would start
    // a transition of its own there, carrying the card away from what is measured below
    if(animate) {
      setMorphing(true);
    }

    setExpanded(expand);

    if(!animate) {
      // * reduced animations: no morph - the card takes its new shape at once and fades into it
      if(animates) {
        running.push(card.animate([{opacity: 0}, {opacity: 1}], {duration: 200, easing: 'ease-out'}));
      }

      return;
    }

    open ??= {width: card.offsetWidth, height: card.offsetHeight};
    const radius = parseFloat(getComputedStyle(card).borderTopLeftRadius);
    surface.style.width = open.width + 'px';
    surface.style.height = open.height + 'px';

    // every place it goes to, read before anything starts moving
    const to = card.getBoundingClientRect();
    const slotsTo = slots.map((slot) => slot.getBoundingClientRect());
    const labelTo = labelEl.getBoundingClientRect();

    const fromCenter = center(from);
    const toCenter = center(to);
    const dx = (fromCenter.x - toCenter.x) / scale;
    const dy = (fromCenter.y - toCenter.y) / scale;
    const options: KeyframeAnimationOptions = expand ?
      {duration: OPEN_DURATION, easing: OPEN_EASING} :
      {duration: FOLD_DURATION, easing: FOLD_EASING};
    const run = (element: HTMLElement, keyframes: Keyframe[], animationOptions = options) => {
      const animation = element.animate(keyframes, animationOptions);
      running.push(animation);
      return animation;
    };

    const cardAnimation = run(card, [{transform: `translate(${dx}px, ${dy}px)`}, {transform: 'none'}]);

    const surfaceFrom = getSurfaceTransforms(from.width / scale, from.height / scale, open, radius);
    const surfaceTo = getSurfaceTransforms(to.width / scale, to.height / scale, open, radius);
    // held at the end until the card's own fill is back
    SURFACE_PIECES.forEach((piece) => {
      run(pieces[piece], [{transform: surfaceFrom[piece]}, {transform: surfaceTo[piece]}], {...options, fill: 'forwards'});
    });

    slots.forEach((slot, index) => {
      const slotFrom = slotsFrom[index];
      const slotTo = slotsTo[index];
      run(slot, [{
        transform: `translate(${(slotFrom.left - slotTo.left) / scale - dx}px, ${(slotFrom.top - slotTo.top) / scale - dy}px) scale(${slotFrom.height / slotTo.height})`
      }, {
        transform: 'none'
      }]);
    });

    // The label rides with the top edge, and fades on a clock of its own: keyframe offsets would
    // follow the eased progress, which the opening curve rushes through at the start.
    const labelShift = `translate(${(center(labelFrom).x - center(labelTo).x) / scale - dx}px, ${(labelFrom.top - labelTo.top) / scale - dy}px)`;
    run(labelEl, [{transform: labelShift}, {transform: 'none'}]);
    run(labelEl, [{opacity: expand ? 1 : 0}, {opacity: expand ? 0 : 1}], expand ?
      {duration: LABEL_OUT_DURATION, easing: 'ease-out'} :
      {duration: LABEL_IN_DURATION, delay: FOLD_DURATION - LABEL_IN_DURATION, easing: 'ease-in', fill: 'backwards'});

    // what it folds back from fades where it was, before the card closes over it
    if(detailsFrom) {
      Object.assign(details.style, {
        display: 'block',
        position: 'absolute',
        top: ((detailsFrom.top - to.top) / scale - dy) + 'px',
        left: ((detailsFrom.left - to.left) / scale - dx) + 'px',
        width: detailsFrom.width / scale + 'px'
      });
      run(details, [{opacity: 1}, {opacity: 0}], {duration: DETAILS_OUT_DURATION, easing: 'ease-out', fill: 'forwards'});
    }

    morphEnd = () => {
      morphEnd = undefined;
      setMorphing(false);
      if(detailsFrom) {
        details.removeAttribute('style');
      }
    };

    cardAnimation.finished.then(() => morphEnd?.(), () => {});
  };

  onCleanup(() => {
    appNavigationController.removeItem(navigationItem);
  });

  const slot = (index: number) => (
    <span class="conference-encryption-emoji" ref={(element) => slots[index] = element}>
      <Show
        when={emojis()?.[index]}
        keyed
        fallback={liteMode.isAvailable('motion') ? (
          <span class="conference-encryption-reel">
            <For each={[0, 1, 2, 3, 0, 1, 2]}>
              {(position) => <span>{wrapEmojiText(reelEmojis[index * REEL_LENGTH + position])}</span>}
            </For>
          </span>
        ) : (
          // a reel that cannot spin would stand still on four random emoji, which read as a key
          <span class="conference-encryption-emoji-pending" />
        )}
      >
        {(emoji) => <span class="conference-encryption-emoji-value">{wrapEmojiText(emoji)}</span>}
      </Show>
    </span>
  );

  return (
    <div class={classNames('conference-encryption', expanded() && 'is-expanded', props.class)}>
      <div class="conference-encryption-overlay" onClick={() => morph(false)} />
      <div class="conference-encryption-track" ref={track}>
        <A11yButton
          ref={(element) => card = element}
          // static, the state in classList: a reactive class would drop the `is-morphing` the morph
          // adds, if the key landed mid-way
          class="conference-encryption-card"
          classList={{'is-expanded': expanded(), 'is-syncing': !emojis()}}
          aria-label={label()}
          // no key yet: the same words, but not yet a key to compare
          aria-busy={emojis() ? undefined : 'true'}
          aria-expanded={expanded()}
          aria-describedby={expanded() ? infoId : undefined}
          onClick={() => morph(!expanded())}
          onFocusOut={(e: FocusEvent) => {
            // a keyboard leaving the open card leaves it closed behind
            if(expanded() && !card.contains(e.relatedTarget as Node)) morph(false);
          }}
        >
          <span class="conference-encryption-surface" ref={surface} aria-hidden="true">
            <For each={SURFACE_PIECES}>
              {(piece) => <span class={'conference-encryption-surface-' + piece} ref={(element) => pieces[piece] = element} />}
            </For>
          </span>
          {slot(0)}
          {slot(1)}
          <span class="conference-encryption-label" ref={labelEl} aria-hidden="true">{titleText()}</span>
          {slot(2)}
          {slot(3)}
          <span class="conference-encryption-details" ref={details} aria-hidden="true">
            <span class="conference-encryption-title">{titleText()}</span>
            <span class="conference-encryption-info" id={infoId}>{i18n('ConferenceEncryptedInfo')}</span>
          </span>
        </A11yButton>
      </div>
      <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{label()}</span>
    </div>
  );
}
