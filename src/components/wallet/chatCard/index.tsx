/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createMemo, createRoot, createSignal, For, JSX, onCleanup, onMount, Show} from 'solid-js';
import type {Message, MessageAction} from '@layer';
import type {Appearance, GemView} from '@components/wallet/visual/gem/stage';
import type WalletGem from '@components/wallet/gem';
import type {CardGemHold} from '@components/wallet/chatCard/gemHold';
import type {Middleware} from '@helpers/middleware';
import {AnimationItemGroup} from '@components/animationIntersector';
import useAnimationPlaying from '@hooks/useAnimationPlaying';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import {toFriendlyTonAddress} from '@lib/wallet/tonAddress';
import {SERVICE_PEER_ID} from '@appManagers/constants';
import Modes from '@config/modes';
import liteMode from '@helpers/liteMode';
import classNames from '@helpers/string/classNames';
import buttonKeyDown from '@helpers/solid/buttonKeyDown';
import {isWalletReleased} from '@lib/wallet/release';
import idleController from '@helpers/idleController';
import {PeerTitleTsx} from '@components/peerTitleTsx';
import {absNanos, formatGrams, gramsToNumber, groupAddress} from '@components/wallet/format';
import {trackWalletCardAngle} from '@components/wallet/chatCard/angle';
import watchSendingTransfer from '@components/wallet/watchSendingTransfer';
import {decryptTransferComment, encryptedCommentCoverLength, keepCommentFocus, showCommentDecryptError, wrapCommentCover} from '@components/wallet/transferComment';
import {playWalletCardBurst} from '@components/wallet/chatCard/burst';
import {liftCardGlyphs, riseAt, takeFreshTransfer} from '@components/wallet/chatCard/arrival';
import {registerWalletChatCardTarget} from '@components/wallet/chatCard/targets';
import {observeWalletCards, WalletCardObserver} from '@components/wallet/chatCard/observe';
import {
  bumpDuration, bumpShape, GEM_COMPLETION, gemTransferPresentation, GemTransferPhase, GLARE_DURATION, GLARE_PAUSE,
  joinReadLine, READ_POP_AMPLITUDE, READ_PRESS, READ_PRESS_DEPTH, READ_ROLL_DURATION, readRollLands, readRollProgress,
  readRollSteps, REVEAL_CLOCK, REVEAL_COLOR, REVEAL_COLOR_DELAY, REVEAL_FILL, REVEAL_WORD, REVEAL_WORD_DELAY,
  sampleKeyframes, SENDING_SPEED, SETTLE_AMPLITUDE, SETTLE_BUMP, SPIN_DURATION
} from '@components/wallet/chatCard/motion';
import {requestWalletFrame} from '@components/wallet/frameLoop';
import {onAppWindowChange} from '@helpers/appWindow';
import styles from '@components/wallet/chatCard/chatCard.module.scss';
import stylesCommon from '@components/chat/bubbles/service.module.scss';
import {hotEffect, hotListen} from '@helpers/hotModule';
import getTextWidth from '@helpers/canvas/getTextWidth';
import {FontFamily, FontWeightBold} from '@config/font';
import rootScope from '@lib/rootScope';

/**
 * A Gram transfer in the chat — the desktop client's gram transfer card (history_view_gram_transfer.cpp): a small
 * wallet card with a diamond, the signed amount, the counterparty and its address, and a corner ribbon that says
 * sent, received or failed. Its sweep follows the cursor with every other card in sight. The diamond, the ribbon and
 * the address's ink are iOS's (ChatMessageTransferBubbleContentNode): a live gem that turns and floats, a click on
 * either side of it spins it that way.
 *
 * While this device sends the transfer, the ribbon is a ticking clock, the gem turns fast, the sweep turns and a
 * glare runs round the border; when the transfer settles, the ribbon fills from the clock, the gem and the sweep
 * spin back, stars fly and the bubble bumps. An unread incoming card does the same when it is read, after its digits
 * roll up from zero — one card at a time when several are read at once; as iOS does it, its glyphs lift one by one
 * as the glare crosses them, and a card that came while the chat was open rises in from below.
 *
 * A send started in the chat ends with the wallet's gem flying into this device's new card (chatCard/flight):
 * the card's own gem steps aside until it lands.
 *
 * A comment sits under the card. An encrypted one is covered and decrypted on a click with the wallet's key.
 */

type GramTransfer = MessageAction.messageActionGramTransfer;
type Look = 'rest' | 'sending' | 'roll' | 'reveal';
/** where the stars start: the card's size and the diamond's middle in it */
type BurstPlace = Omit<Parameters<typeof playWalletCardBurst>[0], 'canvas'>;

const TICKER_COLOR = '#0fddff';
/** CSS px for one of iOS's points: the card is iOS's, larger (its 18 pt digits are 22 px here) */
const IOS_POINT = 22 / 18;
/** the gem, CSS px: iOS's 38 pt diamond in a 64 pt view */
const GEM_CANVAS = 78;
const GEM_WIDTH = 46;
/** its own turn, rad/s (iOS DiamondStyle's default), and how far it floats up and down at rest, px */
const GEM_SPEED = 2 * Math.PI / 18 * 1.70775;
const GEM_FLOAT = 1.5 * IOS_POINT;
/** let go after a hold, it springs back (iOS: a downward expansion's damping and the finger's spin falling off) */
const GEM_HOLD_STYLE = {growDamping: .62, releaseDecay: 1.1};
/** the card takes the landed gem's hit (iOS animateDiamondLandingBump): 5 % at most, ringing 2.4 times a second */
const HOLD_LANDING = 1000;
const holdLanding = (power: number, elapsed: number) => {
  const t = elapsed / 1000;
  return elapsed >= HOLD_LANDING ? 1 : 1 - .05 * power * Math.sin(2 * Math.PI * 2.4 * t) * Math.exp(-t / .2);
};
/** the spin a settled or read transfer gives it, and a landed gem, rad/s; both fall off by e in .7 s */
const GEM_RELEASE_SPIN = 11;
const GEM_LANDING_SPIN = 4.5;
const GEM_SPIN_DECAY = .7;
const SPIN_TURN = 360;
const SENDING_TURN = SPIN_TURN / SENDING_SPEED * 1000;
const EASE_OUT_CUBIC = 'cubic-bezier(.33, 1, .68, 1)';
const EASE_OUT_QUAD = 'cubic-bezier(.5, 1, .89, 1)';
/** the ribbon's word (iOS): 11 px, smaller when it is wider than 52 px */
const RIBBON_FONT_SIZE = 11;
const RIBBON_WORD_WIDTH = 52;
/** a flight called off: the card's own gem fades back in this long, ms */
const GEM_RETURN = 150;
/** the hit of a landed gem, ms: the card dips and shrinks a little, rings twice and rests (iOS) */
const LANDING_DURATION = 1200;
const landingImpact = (elapsed: number) => {
  const t = elapsed / 1000;
  return elapsed >= LANDING_DURATION ? 0 : Math.sin(2 * Math.PI * 2.2 * t) * Math.exp(-t / .2);
};

let propertiesRegistered = false;
function registerProperties() {
  if(propertiesRegistered) return;
  propertiesRegistered = true;
  const register = (definition: PropertyDefinition) => {
    try {
      CSS.registerProperty(definition);
    } catch(err) {}
  };

  // * registered so that it animates: the glare's position, read by the border and by the address
  register({name: '--wallet-card-glare', syntax: '<length-percentage>', inherits: true, initialValue: '-100px'});
}

function isSending(message: Message.messageService) {
  return !!message.pFlags.is_outgoing && !(message as any).error;
}

function isFailed(message: Message.messageService) {
  return !!(message as any).error;
}


// * the cards settling or read at once share a frame: every read before any write, so the chat is not laid out once
// * per card. On the frames of the window the app is in — `sequentialDom` runs on the tab's, and a tab behind a
// * Document PiP window may be hidden and give none — and asked again of the new window when the app moves: a frame
// * asked of a window that closed never comes, and nothing after it would run.
const cardReads: VoidFunction[] = [], cardWrites: VoidFunction[] = [];
let cancelCardFrame: () => void;

function flushCardDom() {
  cancelCardFrame = undefined;
  const reads = cardReads.splice(0), writes = cardWrites.splice(0);
  for(const step of [...reads, ...writes]) {
    try {
      step();
    } catch(err) {
      console.error('wallet chat card:', err);
    }
  }
}

function batchCardDom(read: VoidFunction, write: VoidFunction) {
  cardReads.push(read);
  cardWrites.push(write);
  cancelCardFrame ??= requestWalletFrame(flushCardDom);
}

hotEffect(import.meta.hot, () => onAppWindowChange(() => {
  if(!cancelCardFrame) return;
  try {
    cancelCardFrame();
  } catch(err) {}
  cancelCardFrame = requestWalletFrame(flushCardDom);
}));

// * the ribbon's words are measured anew in another language
const [languageChanges, setLanguageChanges] = createRoot(() => createSignal(0));
hotListen(import.meta.hot, rootScope, 'language_change', () => setLanguageChanges((count) => count + 1));

// * the gem's renderer, and what a finger does to it, come with the first card that shows: the chat's own code stays
// * light
type GemKit = {WalletGem: typeof WalletGem, cool: Appearance, CardGemHold: typeof CardGemHold, holdGrow: number};
let gemKit: Promise<GemKit>;
function loadGemKit() {
  return gemKit ??= Promise.all([
    import('@components/wallet/gem'),
    import('@components/wallet/visual/gem/stage'),
    import('@components/wallet/chatCard/gemHold')
  ]).then(([{default: WalletGem}, {Appearance}, {CardGemHold, CARD_GEM_HOLD_GROW}]) => ({
    WalletGem,
    cool: Appearance.cool,
    CardGemHold,
    holdGrow: CARD_GEM_HOLD_GROW
  }));
}

export default function WalletChatCard(props: {
  message: Message.messageService,
  /** the chat's animations: the gem plays and stands with them */
  animationGroup?: AnimationItemGroup,
  middleware?: Middleware
}) {
  registerProperties();

  const [message, setMessage] = createSignal(props.message);
  const transfer = () => message().action as GramTransfer;
  const out = !!props.message.pFlags.out;
  // * the service account's transfers name nobody
  const anonymous = props.message.peerId === SERVICE_PEER_ID;
  const counterpartyId = anonymous ? undefined : (out ? props.message.peerId : props.message.fromId);
  const animated = liteMode.isAvailable('animations');

  const [look, setLook] = createSignal<Look>(isSending(props.message) ? 'sending' : 'rest');
  const [bursting, setBursting] = createSignal(false);
  const [rollAt, setRollAt] = createSignal<number>();
  const [awaitingGem, setAwaitingGem] = createSignal(false);

  const initial = props.message.action as GramTransfer;
  // * what the current message says: the served one may differ from the draft (a paid send of the whole balance
  // * delivers what its real fee left, not what the quote did)
  const nanos = createMemo(() => absNanos(transfer().amount));
  const digits = createMemo(() => {
    const [whole, fraction = ''] = formatGrams(nanos(), 9, true).split('.');
    return {whole, fraction};
  });
  const whole = () => digits().whole, fraction = () => digits().fraction;
  const sign = out ? '−' : '+';
  const ticker = () => I18n.format('Wallet.Card.Ticker', true, [gramsToNumber(nanos())]);
  const address = toFriendlyTonAddress(initial.peer_address) || initial.peer_address;
  const addressLines = address ? groupAddress(address, 6) : [];

  // * the ribbon's colours live in the stylesheet: the increased contrast setting darkens them
  const ribbon = (): {key: LangPackKey, class: string} => {
    if(!out) return {key: 'WalletTransferStatusReceived', class: styles.isReceived};
    if(isFailed(message())) return {key: 'WalletTransferStatusFailed', class: styles.isFailed};
    return {key: 'WalletTransferStatusSent', class: styles.isSent};
  };
  const ribbonFontSize = createMemo(() => {
    languageChanges();
    const width = getTextWidth(I18n.format(ribbon().key, true), `${FontWeightBold} ${RIBBON_FONT_SIZE}px ${FontFamily}`);
    return width > RIBBON_WORD_WIDTH ? RIBBON_FONT_SIZE * RIBBON_WORD_WIDTH / width + 'px' : undefined;
  });

  let wrap: HTMLDivElement, card: HTMLDivElement, sweep: HTMLDivElement, gemBox: HTMLDivElement;
  let mark: HTMLDivElement, amountLine: HTMLDivElement, tickerElement: HTMLSpanElement, identity: HTMLDivElement;
  let addressElement: HTMLDivElement;
  let burstCanvas: HTMLCanvasElement, ribbonFill: HTMLDivElement, ribbonWord: HTMLSpanElement, clockFace: HTMLDivElement;
  let spin: Animation, glare: Animation;
  let destroyed = false;
  const timeouts: number[] = [];
  const later = (callback: () => void, delay: number) => {
    timeouts.push(window.setTimeout(() => !destroyed && callback(), Math.max(0, delay)));
  };

  // * the gem

  const awaitingRead = !out && !!props.message.pFlags.unread && animated;
  // * it came while the chat was open and looked at: hidden until its read a moment later, it rises in then; in a
  // * window nobody is using it stays in sight and pops when read, like any other card
  const rising = awaitingRead && takeFreshTransfer(props.message) && liteMode.isAvailable('motion') && !idleController.isIdle;

  const [gemParts, setGemParts] = createSignal<GemKit>();
  loadGemKit().then((kit) => !destroyed && setGemParts(kit));

  // * it plays and stands with the chat's other animations (animationIntersector): out of sight, while the app's
  // * window is not in use, under a popup or a peek that holds the chat's
  const [gemPlays, observeGemPlays] = useAnimationPlaying();

  /** the live gem, while there is one: none until its renderer comes, without WebGL2 or while it stands still */
  let gem: GemView;
  /** what the gem is doing with the transfer: its phase starts at the gem's next frame */
  let gemTransfer: {phase: GemTransferPhase, start?: number} = look() === 'sending' ? {phase: 'sending'} : undefined;
  const setGemTransfer = (phase?: GemTransferPhase) => gemTransfer = phase && {phase};

  // * the live gem can be held, pulled and thrown, as iOS's can — but not while its transfer goes or its card is read
  let gemHold: CardGemHold;
  const [holdable, setHoldable] = createSignal(false);
  const canHoldGem = () => look() !== 'sending' && look() !== 'roll' && !awaitingGem();
  const takeGem = (live: GemView) => {
    gem = live;
    gemHold = new (gemParts().CardGemHold)(live, gemBox, {
      point: IOS_POINT,
      restingCanvas: GEM_CANVAS,
      amount: () => Array.from(amountLine.children) as HTMLElement[],
      canHold: canHoldGem,
      onLand: landHeldGem
    });
    setHoldable(true);
    const hold = gemHold;
    return () => {
      hold.destroy();
      if(gem !== live) return;
      gem = undefined;
      gemHold = undefined;
      setHoldable(false);
    };
  };

  // * every frame the transfer's phase speeds the gem up, swells and lifts it, by the gem's own clock; held, it
  // * grows down over the amount and floats no more
  const moveGem = (live: GemView) => {
    let energy = 0, scale = 1, offset = 0;
    if(gemTransfer) {
      gemTransfer.start ??= live.elapsed;
      const t = live.elapsed - gemTransfer.start;
      ({energy, scale, offset} = gemTransferPresentation(gemTransfer.phase, t));
      if(gemTransfer.phase === 'completion' && t >= GEM_COMPLETION) {
        gemTransfer = undefined;
      }
    }

    const style = live.style;
    style.rotationSpeed = GEM_SPEED * (1 + 5 * energy);
    style.swayScale = 1 + 1.4 * energy;
    style.widthPoints = GEM_WIDTH * scale;
    style.verticalOffset = offset * IOS_POINT + (gemHold?.frame() ?? 0);
    style.floatAmplitude = GEM_FLOAT * (1 - (gemHold?.strength ?? 0));
  };

  /** the transfer settled or was read: the energy goes, with a spin when it went through */
  const releaseGem = (spins: boolean) => {
    setGemTransfer('completion');
    if(spins) gem?.kick(GEM_RELEASE_SPIN, GEM_SPIN_DECAY);
  };

  // * the held gem springs back, and as it lands the card dips and rings back, as hard as the gem had grown
  const landHeldGem = (power: number) => {
    if(destroyed || look() === 'sending' || !liteMode.isAvailable('motion')) return;
    bump(HOLD_LANDING, (elapsed) => holdLanding(power, elapsed));
  };

  // * the sweep, the glare and the bump

  // * the sweep turns as a layer (composited), only the glare repaints; both wait while the card is out of sight.
  // * Decorations that run: with reduced animations the ribbon's ticking clock says it alone
  let sendingObserver: WalletCardObserver;
  const startSendingLook = () => {
    if(!liteMode.isAvailable('motion')) return;
    spin = sweep.animate({transform: ['rotate(0deg)', 'rotate(360deg)']}, {
      duration: SENDING_TURN,
      iterations: Infinity
    });
    const cycle = GLARE_DURATION + GLARE_PAUSE;
    glare = card.animate([
      {'--wallet-card-glare': '-45px', 'offset': 0},
      {'--wallet-card-glare': 'calc(100% + 45px)', 'offset': GLARE_DURATION / cycle},
      {'--wallet-card-glare': 'calc(100% + 45px)', 'offset': 1}
    ] as Keyframe[], {duration: cycle, iterations: Infinity});
    sendingObserver = observeWalletCards((entries) => {
      const entry = entries[entries.length - 1];
      for(const animation of [spin, glare]) {
        if(!animation) continue;
        entry.isIntersecting ? animation.play() : animation.pause();
      }
    });
    sendingObserver.observe(card);
  };

  /** the spin from where the sweep is now to where the cursor wants it, one turn and the rest clockwise */
  const settleSpin = (from: number, delay = 0) => {
    const turn = SPIN_TURN + ((SPIN_TURN - (from % SPIN_TURN)) % SPIN_TURN);
    sweep.animate({transform: [`rotate(${from}deg)`, `rotate(${from + turn}deg)`]}, {
      duration: SPIN_DURATION,
      delay,
      easing: EASE_OUT_CUBIC
    });
  };

  const stopSendingLook = () => {
    sendingObserver?.disconnect();
    sendingObserver = undefined;
    let from = 0;
    if(spin) {
      from = ((+spin.currentTime || 0) % SENDING_TURN) / SENDING_TURN * SPIN_TURN;
      spin.cancel();
      spin = undefined;
    }

    if(glare) {
      // * the pass that runs ends, no other starts
      const cycle = GLARE_DURATION + GLARE_PAUSE;
      glare.effect.updateTiming({iterations: Math.floor((+glare.currentTime || 0) / cycle) + 1});
      glare = undefined;
    }

    return from;
  };

  const glarePass = (delay = 0) => {
    card.animate({'--wallet-card-glare': ['-45px', 'calc(100% + 45px)']} as PropertyIndexedKeyframes, {
      duration: GLARE_DURATION,
      delay
    });
  };

  const bump = (duration: number, scale: (elapsed: number) => number, delay = 0) => {
    wrap.animate(sampleKeyframes(duration, (elapsed) => ({transform: `scale(${scale(elapsed)})`})), {
      duration,
      delay,
      easing: 'linear'
    });
  };

  /**
   * `then` gets where the stars start on the card (`stars`), read in a frame's read phase before anything on the card
   * changes, and runs in its write phase: with several cards settling or read at once every read goes before every
   * write, and the chat is not laid out once per card. Without stars nothing is read and `then` runs at once.
   */
  const afterBurstRead = (stars: boolean, then: (place?: BurstPlace) => void) => {
    if(!stars) {
      then();
      return;
    }

    let place: BurstPlace;
    batchCardDom(() => {
      if(destroyed || !card.isConnected) return;
      const width = card.offsetWidth;
      // * the diamond's middle: its player stands in the mark, the mark in the card
      place = {
        width,
        height: card.offsetHeight,
        originX: width / 2,
        originY: mark.offsetTop + gemBox.offsetTop + gemBox.offsetHeight / 2,
        emitter: gemBox.offsetHeight * 2 / 3
      };
    }, () => !destroyed && then(place));
  };

  const burst = (place: BurstPlace) => {
    if(!place) return;
    setBursting(true);
    playWalletCardBurst({canvas: burstCanvas, ...place}).then(() => !destroyed && setBursting(false));
  };

  // * the ribbon

  const reveal = (fromClock: boolean) => {
    setLook('reveal');
    ribbonFill.animate({transform: ['scale(.15)', 'scale(1)']}, {duration: REVEAL_FILL, fill: 'forwards'});
    // * to the ribbon's colour, which the stylesheet gives the fill: nothing is read, no style is forced
    ribbonFill.animate([{backgroundColor: TICKER_COLOR, offset: 0}], {
      delay: REVEAL_COLOR_DELAY,
      duration: REVEAL_COLOR,
      easing: EASE_OUT_QUAD,
      fill: 'both'
    });
    ribbonWord.animate(liteMode.isAvailable('motion') ? {opacity: [0, 1], transform: ['translateY(8px)', 'none']} : {opacity: [0, 1]}, {
      delay: REVEAL_WORD_DELAY,
      duration: REVEAL_WORD,
      easing: EASE_OUT_QUAD,
      fill: 'backwards'
    });
    if(fromClock && clockFace) {
      clockFace.animate({transform: ['scale(1)', 'scale(0)']}, {duration: REVEAL_CLOCK, fill: 'forwards'});
    }

    later(() => setLook('rest'), REVEAL_COLOR_DELAY + REVEAL_COLOR);
  };

  // * this device's transfer settles

  const settle = () => {
    if(look() !== 'sending') return;
    const failed = isFailed(message());
    if(!animated) {
      setGemTransfer();
      setLook('rest');
      return;
    }

    // * the spin, the stars and the bump are movement: with reduced animations the ribbon fills where it stands
    const motion = liteMode.isAvailable('motion');
    afterBurstRead(motion && !failed, (place) => {
      const from = stopSendingLook();
      reveal(true);
      releaseGem(!failed);
      if(!motion) return;
      settleSpin(from);
      burst(place);
      bump(bumpDuration(SETTLE_BUMP), (elapsed) => 1 + SETTLE_AMPLITUDE * bumpShape(SETTLE_BUMP, elapsed));
    });
  };

  // * an incoming card is read

  let readTurn: ReturnType<typeof joinReadLine>;
  const read = () => {
    // * the rise is as tall as the card: read before anything on it changes
    const height = rising ? wrap.offsetHeight : 0;
    readTurn = joinReadLine();
    const at = readTurn.at;
    const delay = at - performance.now();
    // * with reduced animations nothing rolls, sweeps, spins or pops: in its turn the ribbon fills
    if(!liteMode.isAvailable('motion')) {
      later(() => reveal(false), delay);
      return;
    }

    setRollAt(at);
    setLook('roll');
    later(() => {
      setGemTransfer('receiving');
      glarePass();
      if(liteMode.isAvailable('motion')) liftGlyphs();
    }, delay);

    sweep.animate([
      {transform: 'rotate(0deg)', offset: 0, easing: 'linear'},
      {transform: `rotate(${SENDING_SPEED * READ_ROLL_DURATION / 1000}deg)`, offset: READ_ROLL_DURATION / (READ_ROLL_DURATION + SPIN_DURATION), easing: EASE_OUT_CUBIC},
      {transform: `rotate(${2 * SPIN_TURN}deg)`, offset: 1}
    ], {duration: READ_ROLL_DURATION + SPIN_DURATION, delay});

    const pressAt = READ_ROLL_DURATION;
    const press = (elapsed: number) => READ_PRESS_DEPTH * bumpShape(READ_PRESS, elapsed - pressAt);
    if(rising) {
      // * instead of the pop it rises in, and takes the same press when its digits land
      const duration = pressAt + bumpDuration(READ_PRESS);
      wrap.animate(sampleKeyframes(duration, (elapsed) => {
        const {y, scale, opacity} = riseAt(elapsed, height);
        return {transform: `translateY(${y}px) scale(${scale * (1 - press(elapsed))})`, opacity};
      }), {duration, delay, easing: 'linear', fill: 'backwards'});
      wrap.style.opacity = '';
    } else {
      bump(pressAt + bumpDuration(READ_PRESS), (elapsed) => 1 +
        READ_POP_AMPLITUDE * bumpShape(SETTLE_BUMP, elapsed) -
        press(elapsed), delay);
    }

    later(() => afterBurstRead(true, (place) => {
      setRollAt(undefined);
      reveal(false);
      releaseGem(true);
      burst(place);
    }), delay + READ_ROLL_DURATION);
  };

  /** the glyphs lift one by one as the glare crosses them; the text is put back together once they rest */
  const liftGlyphs = () => {
    if(!card.isConnected) return;
    const {restoreAt, restore} = liftCardGlyphs({
      card,
      amountGlyphs: Array.from(amountLine.querySelectorAll<HTMLElement>('.' + styles.glyph)),
      amountTexts: [tickerElement],
      texts: [identity],
      address: addressElement,
      glyphClass: styles.glyph,
      liftingClass: styles.isLifting,
      delay: 0,
      sheenDuration: GLARE_DURATION
    });
    later(restore, restoreAt);
  };

  const watchRead = () => {
    const observer = observeWalletCards((entries) => {
      if(!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      idleController.getFocusPromise().then(() => !destroyed && card.isConnected && read());
    }, {threshold: .5});
    observer.observe(card);
    onCleanup(() => observer.disconnect());
  };

  // * events

  // * only a transfer this device made waits for the served message: a sending one, or one that failed here and
  // * may still turn out sent
  const stopWatchingSend = props.message.pFlags.is_outgoing ? watchSendingTransfer(props.message, {
    onSent: (served) => {
      setMessage(served);
      settle();
    },
    onError: (error) => {
      if(look() !== 'sending') return;
      setMessage({...message(), error} as Message.messageService);
      settle();
    }
  }) : undefined;

  // * the gem a send from this chat throws lands here (chatCard/flight): its slot, its waiting, its landing

  const gemSlot = () => {
    if(!card.isConnected) return;
    const rect = gemBox.getBoundingClientRect();
    if(!rect.width) return;
    return {x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width * GEM_WIDTH / GEM_CANVAS};
  };

  const awaitGem = (awaiting: boolean) => {
    if(awaitingGem() === awaiting) return;
    setAwaitingGem(awaiting);
    // * the flight is off: the card's own gem fades back
    if(!awaiting && liteMode.isAvailable('animations')) {
      mark.animate({opacity: [0, 1]}, {duration: GEM_RETURN});
    }
  };

  // * the card's gem goes on from the flying one's pose, takes the send's hit again and whirls (iOS acceptTransferDiamond)
  const landGem = (flying: GemView) => {
    setAwaitingGem(false);
    if(gem) {
      gem.adopt(flying);
      gem.kick(GEM_LANDING_SPIN, GEM_SPIN_DECAY);
      if(gemTransfer?.phase === 'sending') setGemTransfer('sending');
    }

    if(liteMode.isAvailable('motion')) {
      card.animate(sampleKeyframes(LANDING_DURATION, (elapsed) => {
        const impact = landingImpact(elapsed);
        return {transform: `translateY(${4 * impact}px) scale(${1 - .025 * impact})`};
      }), {duration: LANDING_DURATION, easing: 'linear'});
    }
  };

  onMount(() => {
    onCleanup(trackWalletCardAngle(card));
    observeGemPlays({
      group: props.animationGroup,
      observeElement: gemBox,
      controlled: props.middleware,
      type: 'dots'
    });
    if(look() === 'sending') {
      startSendingLook();
    } else if(awaitingRead) {
      if(rising) wrap.style.opacity = '0';
      watchRead();
    }

    if(isSending(props.message) && props.message.random_id) {
      onCleanup(registerWalletChatCardTarget(String(props.message.random_id), {
        slot: gemSlot,
        await: awaitGem,
        land: landGem
      }));
    }
  });

  onCleanup(() => {
    destroyed = true;
    timeouts.forEach((timeout) => clearTimeout(timeout));
    sendingObserver?.disconnect();
    spin?.cancel();
    glare?.cancel();
    readTurn?.leave();
    stopWatchingSend?.();
  });

  // * until the wallet's release the card only shows the transfer: its details are the wallet's
  const released = isWalletReleased();

  // * the first transfer's "Your first Grams!" comes first, the details after it closes
  const openDetails = async() => {
    const [{showWalletFirstGramsIfPending}, {default: showWalletTransactionPopup}] = await Promise.all([
      import('@components/wallet/firstGrams'),
      import('@components/wallet/transactionPopup')
    ]);
    await showWalletFirstGramsIfPending().catch(() => {});
    // * from a chat the popup stands alone, and its button opens the wallet (tdesktop: ShowTransactionDetails)
    showWalletTransactionPopup({
      message: message(),
      decryptComment: () => decryptTransferComment(message(), out),
      openWallet: () => import('@components/wallet').then(({default: showWalletPopup}) => showWalletPopup())
    });
  };

  const label = () => `${sign}${whole()}${fraction() ? '.' + fraction() : ''} ${ticker()}, ${I18n.format(look() === 'sending' ? 'WalletSending' : ribbon().key, true)}`;

  return (
    <div ref={wrap} class={classNames(stylesCommon.addon, styles.wrap)}>
      <div
        ref={card}
        class={classNames(styles.card, !released && styles.isPlain)}
        // * not a button till the release, but still named for assistive technology: the amount is hidden from it below
        role={released ? 'button' : 'group'}
        tabindex={released && Modes.a11y ? 0 : undefined}
        aria-label={label()}
        // * a press on the gem was the gem's
        onClick={released ? (event: MouseEvent) => !gemHold?.tookClick(event) && openDetails() : undefined}
        onKeyDown={released ? buttonKeyDown : undefined}
      >
        <div class={styles.backdrop} aria-hidden="true">
          <div class={styles.sweepTurn}>
            <div ref={sweep} class={styles.sweep} />
          </div>
          <div class={styles.soft} />
        </div>
        <div class={styles.glare} />
        <div ref={mark} class={classNames(styles.mark, awaitingGem() && styles.isHidden)}>
          <div ref={gemBox} class={classNames(styles.gem, holdable() && canHoldGem() && styles.isHoldable)}>
            <Show when={gemParts()}>{(parts) => {
              const {WalletGem, cool, holdGrow} = parts();
              return (
                <WalletGem
                  size={GEM_CANVAS}
                  widthPoints={GEM_WIDTH}
                  appearance={cool}
                  // * a gem on its way in draws in its place
                  visible={() => gemPlays() && !awaitingGem()}
                  holdStill={() => !liteMode.isAvailable('stickers_chat')}
                  style={{rotationSpeed: GEM_SPEED, floatAmplitude: GEM_FLOAT, lightBackground: false, dragGrow: holdGrow, ...GEM_HOLD_STYLE}}
                  fallbackClass={styles.gemFlat}
                  pointerByHost
                  onGem={takeGem}
                  beforeFrame={moveGem}
                />
              );
            }}</Show>
          </div>
        </div>
        {/* * the signed digits read left to right in either direction; the ticker reads after them (chatCard.module.scss) */}
        <div ref={amountLine} class={styles.amount} dir="ltr" aria-hidden="true">
          <Show
            when={rollAt() !== undefined}
            fallback={<>
              <span class={styles.whole}>{sign}{whole()}</span>
              {fraction() && <span class={styles.fraction}>.{fraction()}</span>}
            </>}
          >
            <RollingAmount sign={sign} whole={whole()} fraction={fraction()} at={rollAt()} />
          </Show>
          <span ref={tickerElement} class={styles.ticker}>{ticker()}</span>
        </div>
        <div ref={identity} class={styles.identity}>
          <Show
            when={counterpartyId}
            fallback={i18n(anonymous ? 'Wallet.Card.Anonymous' : (out ? 'WalletRecipient' : 'WalletSender'))}
          >
            <PeerTitleTsx peerId={counterpartyId} class={styles.name} />
          </Show>
        </div>
        <Show when={addressLines.length}>
          <div ref={addressElement} class={styles.address}>{addressLines.join('\n')}</div>
        </Show>
        <Show when={bursting()}>
          <canvas ref={burstCanvas} class={styles.burst} />
        </Show>
        <div
          class={classNames(
            styles.ribbon,
            ribbon().class,
            look() !== 'rest' && styles.isBare,
            look() === 'roll' && styles.isHidden
          )}
        >
          <Show when={look() === 'reveal'}>
            <div ref={ribbonFill} class={styles.ribbonFill} />
          </Show>
          <Show when={look() === 'sending' || (look() === 'reveal' && out)}>
            <div ref={clockFace} class={classNames(styles.clock, animated && styles.isTicking)}>
              <span class={styles.clockMinute} />
              <span class={styles.clockHour} />
            </div>
          </Show>
          <div class={styles.ribbonText} style={{'font-size': ribbonFontSize()}}>
            <span
              ref={ribbonWord}
              class={classNames(styles.ribbonWord, look() === 'sending' && styles.isHidden)}
            >
              {i18n(ribbon().key)}
            </span>
          </div>
        </div>
      </div>
      <Show when={transfer().comment || transfer().pFlags.comment_encrypted}>
        <TransferComment message={message()} out={out} />
      </Show>
    </div>
  );
}

/**
 * The amount while its card is read: every digit is a drum that starts at zero and rolls a whole turn and on up
 * to its value, the leftmost landing first.
 */
function RollingAmount(props: {sign: string, whole: string, fraction: string, at: number}) {
  const text = props.whole + (props.fraction ? '.' + props.fraction : '');
  const {steps, rolling} = readRollSteps(text);
  const strips: Array<{element: HTMLElement, count: number, lands: number}> = [];
  let index = 0;
  const cells = [...text].map((char, i) => {
    const count = steps[i];
    if(count <= 0) {
      return {char: count === 0 ? '0' : char, count: 0};
    }

    return {char, count, lands: readRollLands(index++, rolling)};
  });

  onMount(() => {
    const delay = props.at - performance.now();
    for(const {element, count, lands} of strips) {
      element.animate(sampleKeyframes(lands, (elapsed) => ({
        transform: `translateY(${-100 * count / (count + 1) * readRollProgress(elapsed / lands)}%)`
      }), 1000 / 30), {duration: lands, delay, fill: 'both', easing: 'linear'});
    }
  });

  const cell = (item: typeof cells[0]) => {
    if(!item.count) {
      return <span class={styles.glyph}>{item.char}</span>;
    }

    return (
      <span class={classNames(styles.drum, styles.glyph)}>
        <span
          ref={(element) => strips.push({element, count: item.count, lands: item.lands})}
          class={styles.strip}
        >
          {Array.from({length: item.count + 1}, (_, i) => i % 10).join('\n')}
        </span>
      </span>
    );
  };

  const wholeCells = cells.slice(0, props.whole.length);
  const fractionCells = cells.slice(props.whole.length);
  return (
    <>
      <span class={styles.whole}><span class={styles.glyph}>{props.sign}</span><For each={wholeCells}>{cell}</For></span>
      {props.fraction && <span class={styles.fraction}><For each={fractionCells}>{cell}</For></span>}
    </>
  );
}

/**
 * The comment under the card. A comment this device typed into a transfer it is still sending is covered but
 * needs no key; one that came encrypted from the server is covered by as many letters as it may hold and opens
 * with the wallet's key: on this device when it holds the key, in the wallet window when it does not.
 */
function TransferComment(props: {message: Message.messageService, out: boolean}) {
  const transfer = () => props.message.action as GramTransfer;
  const encrypted = () => !!transfer().pFlags.comment_encrypted;
  const own = () => encrypted() && !!props.message.pFlags.is_outgoing;
  const [plain, setPlain] = createSignal<string>();
  const [busy, setBusy] = createSignal(false);
  let container: HTMLDivElement;
  const keepFocus = () => keepCommentFocus(container);

  const cover = () => {
    const text = own() ? transfer().comment : 'x'.repeat(encryptedCommentCoverLength(transfer().comment));
    return wrapCommentCover(text, 'white');
  };

  const open = async() => {
    if(busy() || plain() !== undefined) return;
    if(own()) {
      setPlain(transfer().comment);
      keepFocus();
      return;
    }

    setBusy(true);
    try {
      const text = await decryptTransferComment(props.message, props.out);
      if(text !== undefined) {
        setPlain(text);
        keepFocus();
      }
    } catch(err) {
      // * the cover stays: the alert says why, and a tap tries again
      const {isUserCancel} = await import('@components/wallet/send');
      if(!isUserCancel(err)) showCommentDecryptError(err, open);
    } finally {
      setBusy(false);
    }
  };

  const content = (): JSX.Element => {
    if(!encrypted()) return wrapEmojiText(transfer().comment);
    if(plain() !== undefined) return wrapEmojiText(plain());
    // * until the wallet's release the cover stays: decrypting it is the wallet's
    const released = isWalletReleased();
    return (
      <span
        class={classNames(styles.cover, !released && styles.isPlain)}
        role={released ? 'button' : undefined}
        tabindex={released && Modes.a11y ? 0 : undefined}
        aria-label={released ? I18n.format('Wallet.Card.DecryptComment', true) : undefined}
        aria-busy={busy() || undefined}
        onClick={released ? (e) => {
          e.stopPropagation();
          open();
        } : undefined}
        onKeyDown={released ? buttonKeyDown : undefined}
      >
        {cover()}
      </span>
    );
  };

  return <div ref={container} class={styles.comment} tabindex={Modes.a11y ? -1 : undefined}>{content()}</div>;
}
