/*
 * Bubble sandbox — put a bubble of the open chat in any state by click, as many times as it takes to see the change
 * between two states (`bubbleTransitions`), or the lack of one.
 *
 * `showBubbleSandbox()` from the console of a running app, signed in, on a dev server (`src/index.ts`). The panel acts
 * on the bubbles of the open chat: the last one in view, or the ones picked. A state is the message as it is with some
 * of it changed (`states.ts`); putting a bubble in one hands the chat the events the worker would hand it for that
 * change — `message_edit`, `messages_reactions` — in this tab only (`dispatchEventSingle`), so nothing reaches Telegram
 * and the message stays as it is everywhere else. Closing the panel puts the bubbles back, and so does switching chats.
 *
 * Beside the states: the animation level, the speed every animation the page starts plays at, the direction and how
 * an edit shows in the time (the `message_primary_edited_date` app config flag) — each put back on close.
 *
 * For a script, `window.bubbleSandbox` drives the same controller while the panel is open.
 */

import {createMemo, createRoot, createSignal, For, Show} from 'solid-js';
import {render} from 'solid-js/web';
import {unwrap} from 'solid-js/store';
import {Message, MessageMedia, MessageReactions} from '@layer';
import rootScope from '@lib/rootScope';
import apiManagerProxy from '@lib/apiManagerProxy';
import {getCurrentAccount} from '@lib/accounts/getCurrentAccount';
import {joinDeepPath} from '@helpers/object/setDeepProperty';
import isLegacyMessageId from '@appManagers/utils/messageId/isLegacyMessageId';
import I18n from '@lib/langPack';
import Modes from '@config/modes';
import liteMode, {AnimationLevel} from '@helpers/liteMode';
import deepEqual from '@helpers/object/deepEqual';
import noop from '@helpers/noop';
import classNames from '@helpers/string/classNames';
import {hotEffect} from '@helpers/hotModule';
import {hotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import {appState, setAppStateSilent, useAppConfig} from '@stores/appState';
import {getSolidMessageBodyStructure} from '@components/chat/bubbleParts/solidMessageShell';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';
import type {MyMessage} from '@appManagers/appMessagesManager';
import type {StreamedMessageDraft} from '@appManagers/utils/messages/streamedMessageDrafts';
import type Chat from '@components/chat/chat';
import {
  buildMessage,
  DimensionId,
  getDimensions,
  getOption,
  LATE_REPLY_MID,
  LATE_REPLY_TEXT,
  MediaKind,
  ORIGINAL_STATE,
  SandboxState,
  StateContext
} from './states';
import styles from './bubbleSandbox.module.scss';

type Target = {
  storageKey: Chat['messagesStorageKey'],
  peerId: PeerId,
  mid: number,
  /** the message above it in the chat, to reply to */
  previousMid?: number,
  /** media of the chat's other messages */
  media: StateContext['media'],
  /** a voice message, and the text it was last shown as (`voice`) */
  isVoice: boolean,
  transcribed?: string,
  /** the message as it was before the panel showed it otherwise, which every state is made of */
  original?: Message.message,
  /** what it was last shown as; none: as it is */
  shown?: Message.message,
  /** what it was last edited into, which the next edit is laid against (`ChatBubbles.updateSolidMessageBody`) */
  edited?: Message.message
};

const STORAGE_KEY = 'bubble-sandbox';
// what a streamed answer says, and how much of it comes at a time and how often, as a bot's pieces come
const STREAM_TEXT = 'Sure! The train leaves at a quarter past seven from the second platform, so be there by seven. ' +
  'Take the tickets, the charger and something to eat: there is no buffet car on this one. ' +
  'If it is late, the next one is at nine, and I will wait for you at the entrance either way.';
const STREAM_PIECE = 14;
// how long a reply's quote reads "Loading"
const LATE_REPLY_AFTER = 1500;
const STREAM_EVERY = 160;
const SPEEDS = [1, 0.5, 0.25, 0.1];
const LEVELS: AnimationLevel[] = [0, 1, 2];
// as long as a change is shown (`bubbleTransitions`), and a moment to look at the end of it
const AUTO_CHANGE = 250;
const AUTO_PAUSE = 700;

type Stored = {speed?: number, shuffled?: DimensionId[], collapsed?: boolean, customText?: string};

function readStored(): Stored {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch{
    return {};
  }
}

function store(patch: Stored) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({...readStored(), ...patch}));
  } catch{}
}

const getKey = (target: {peerId: PeerId, mid: number}) => `${target.peerId}_${target.mid}`;

function getChat(): Chat {
  return hotReloadGuard.appImManager?.chat;
}

function asMessage(message: MyMessage) {
  return message?._ === 'message' && !message.pending ? message : undefined;
}

/** a bubble of one message with a text of its own: an album has one per item */
function getBubbleMessage(chat: Chat, bubble: HTMLElement) {
  if(!bubble.dataset.mid || !bubble.dataset.peerId || bubble.classList.contains('is-album')) return;
  return asMessage(chat.getMessageByPeer(bubble.dataset.peerId.toPeerId(), +bubble.dataset.mid));
}

/** from where it is kept rather than through the chat, which forgets it as it goes to another one */
function getTargetMessage(target: Target) {
  return asMessage(apiManagerProxy.getMessageFromStorage(target.storageKey, target.mid));
}

/**
 * Puts the message in this tab's copy of where it is kept, as the worker does with one it changed
 * (`ApiManagerProxy.onMirrorTask`): what renders it reads it from there too (a file, by its message)
 */
function mirrorMessage(target: Pick<Target, 'storageKey' | 'mid'>, message: Message.message) {
  // where it is read from (`getMessageFromStorage`): a chat's history keeps the ids of the global one there
  const storageKey = target.storageKey.endsWith('history') && isLegacyMessageId(target.mid) ?
    apiManagerProxy.getGlobalHistoryMessagesStorage() :
    target.storageKey;
  (apiManagerProxy as unknown as {onMirrorTask: (payload: object) => void}).onMirrorTask({
    name: 'messages',
    key: joinDeepPath(storageKey, target.mid),
    value: message,
    accountNumber: getCurrentAccount()
  });
}

function getBubbles(chat: Chat) {
  return Array.from(chat.bubbles.chatInner.querySelectorAll<HTMLElement>('.bubble[data-mid]'));
}

function getVisibleBubbles(chat: Chat) {
  const view = chat.bubbles.scrollable.container.getBoundingClientRect();
  return getBubbles(chat).filter((bubble) => {
    const rect = bubble.getBoundingClientRect();
    return rect.bottom > view.top && rect.top < view.bottom && getBubbleMessage(chat, bubble);
  });
}

// a photo, a video, a file and a link preview, as the chat's bubbles show them
function getChatMedia(chat: Chat, bubbles: HTMLElement[]) {
  const media: StateContext['media'] = {};
  for(const bubble of bubbles) {
    const found = getBubbleMessage(chat, bubble)?.media;
    const kind: MediaKind = found?._ === 'messageMediaPhoto' ? 'photo' :
      found?._ === 'messageMediaWebPage' ? 'webpage' :
      found?._ !== 'messageMediaDocument' || bubble.classList.contains('round') ? undefined :
      bubble.classList.contains('video') ? 'video' :
      bubble.classList.contains('document-message') ? 'document' :
      undefined;
    if(kind) media[kind] ??= found;
  }

  return media;
}

function makeTarget(chat: Chat, bubble: HTMLElement): Target {
  const message = getBubbleMessage(chat, bubble);
  const bubbles = getBubbles(chat);
  let previousMid: number;
  for(let index = bubbles.indexOf(bubble) - 1; index >= 0 && !previousMid; --index) {
    previousMid = getBubbleMessage(chat, bubbles[index])?.mid;
  }

  return {
    storageKey: chat.messagesStorageKey,
    peerId: message.peerId,
    mid: message.mid,
    previousMid,
    media: getChatMedia(chat, bubbles),
    isVoice: bubble.classList.contains('voice-message')
  };
}

function diffReactions(before: MessageReactions, after: MessageReactions) {
  const beforeResults = before?.results || [];
  const afterResults = after?.results || [];
  const find = (results: typeof beforeResults, result: typeof beforeResults[number]) => {
    return results.find((other) => reactionsEqual(other.reaction, result.reaction));
  };

  return {
    changedResults: afterResults.filter((result) => {
      const previous = find(beforeResults, result);
      return !previous || previous.count !== result.count || previous.chosen_order !== result.chosen_order;
    }),
    removedResults: beforeResults.filter((result) => !find(afterResults, result))
  };
}

/** whether the chat changes the bubble where it stands or renders it anew, and for what */
function describeEdit(before: Message.message, after: Message.message) {
  const a = getSolidMessageBodyStructure(before) as Record<string, unknown>;
  const b = getSolidMessageBodyStructure(after) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !deepEqual(a[key], b[key]));
  return keys.length ? `rendered anew (${keys.join(', ')})` : 'in place';
}

/**
 * Every animation the page starts plays at this speed (the transitions run on WAAPI); CSS ones keep theirs —
 * DevTools' Animations panel slows those too
 */
let restoreAnimate: () => void;
function setAnimationSpeed(rate: number) {
  restoreAnimate?.();
  restoreAnimate = undefined;
  if(rate === 1) return;

  const animate = Element.prototype.animate;
  Element.prototype.animate = function(this: Element, ...args: Parameters<Element['animate']>) {
    const animation = animate.apply(this, args);
    animation.playbackRate = rate;
    return animation;
  };
  restoreAnimate = () => Element.prototype.animate = animate;
}

let close: () => void;

function showBubbleSandbox() {
  if(close) return;
  if(!hotReloadGuard.appImManager) {
    throw new Error('showBubbleSandbox: the app is not up yet — sign in first');
  }

  // what the panel computes goes with it
  createRoot((disposeRoot) => {
    const stored = readStored();
    const dimensions = getDimensions();
    const now = Math.floor(Date.now() / 1000);
    const initialLevel = liteMode.getAnimationLevel();
    const initialRTL = I18n.getIsRTL();
    const initialEditedAsTime = !!useAppConfig()?.message_primary_edited_date;

    const known = new Map<string, Target>();
    const [selected, setSelected] = createSignal<string[]>([]);
    const [state, setState] = createSignal<SandboxState>(ORIGINAL_STATE);
    const [previous, setPrevious] = createSignal<SandboxState>();
    const [report, setReport] = createSignal('');
    const [picking, setPicking] = createSignal(false);
    const [auto, setAuto] = createSignal(false);
    const [collapsed, setCollapsed] = createSignal(!!stored.collapsed);
    const [speed, setSpeed] = createSignal(SPEEDS.includes(stored.speed) ? stored.speed : 1);
    const [shuffled, setShuffled] = createSignal<DimensionId[]>(
      stored.shuffled || dimensions.filter((dimension) => dimension.shuffle).map((dimension) => dimension.id)
    );
    const [customText, setCustomText] = createSignal(stored.customText ?? '**Own** text');
    // a custom emoji to react with: the first of the default statuses, which the app keeps
    const [customEmojiId, setCustomEmojiId] = createSignal<DocId>();
    rootScope.managers.appStickersManager.getLocalStickerSet('inputStickerSetEmojiDefaultStatuses').then((set) => {
      setCustomEmojiId(set?.documents?.[0]?.id);
    }, noop);
    setAnimationSpeed(speed());

    const getContext = (target: Target): StateContext => ({
      now,
      previousMid: target.previousMid,
      media: target.media,
      isSaved: target.peerId === rootScope.myId,
      myId: rootScope.myId,
      hasViews: !!(target.original ?? getTargetMessage(target))?.views,
      customText: customText(),
      customEmojiId: customEmojiId(),
      isVoice: target.isVoice
    });

    const selectedTargets = () => selected().map((key) => known.get(key)).filter(Boolean);
    // what the options can be for: the first bubble picked stands for the rest
    const context = createMemo(() => {
      const target = selectedTargets()[0];
      return target && getContext(target);
    });

    /** with nothing picked, the last bubble in view: a chat just opened has none in view yet */
    const ensureTargets = () => {
      if(!selected().length) selectDefault();
      return selectedTargets();
    };

    /** shows the bubble in the state, by the events the worker would send for that change */
    const showIn = (target: Target, next: SandboxState, force?: boolean) => {
      const message = target.original ??= getTargetMessage(target);
      if(!message) {
        known.delete(getKey(target));
        return;
      }

      const built = buildMessage(dimensions, message, next, getContext(target));
      mirrorMessage(target, deepEqual(next, ORIGINAL_STATE) ? message : built);
      const shown = target.shown ?? message;
      let edit: string;
      // what has a way of its own into the chat goes that way, as from the worker
      if(shown.views !== built.views) {
        rootScope.dispatchEventSingle('messages_views', [{peerId: target.peerId, mid: target.mid, views: built.views}]);
      }

      if(!!shown.pFlags.pinned !== !!built.pFlags.pinned) {
        rootScope.dispatchEventSingle('peer_pinned_messages', {
          peerId: target.peerId,
          mids: [target.mid],
          pinned: !!built.pFlags.pinned
        });
      }

      if(!deepEqual(shown.reactions, built.reactions)) {
        rootScope.dispatchEventSingle('messages_reactions', [{message: built, ...diffReactions(shown.reactions, built.reactions)}]);
      }

      const ownWay = (message: Message.message): Message.message => ({
        ...message,
        reactions: undefined,
        views: undefined,
        pFlags: {...message.pFlags, pinned: undefined}
      });
      if(force || !deepEqual(ownWay(shown), ownWay(built))) {
        edit = describeEdit(target.edited ?? message, built);
        rootScope.dispatchEventSingle('message_edit', {
          storageKey: target.storageKey,
          peerId: target.peerId,
          mid: target.mid,
          message: built
        });
        target.edited = built;
      }

      // what a reply quotes comes a moment after it, as a message the chat asked the server for (the one made up the
      // last time is gone first)
      if(next.reply === 'late' && built.reply_to_mid === LATE_REPLY_MID && shown.reply_to_mid !== LATE_REPLY_MID) {
        mirrorMessage({storageKey: target.storageKey, mid: LATE_REPLY_MID}, undefined);
        window.setTimeout(() => {
          if(target.shown?.reply_to_mid !== LATE_REPLY_MID) return;
          mirrorMessage({storageKey: target.storageKey, mid: LATE_REPLY_MID}, {
            _: 'message',
            id: LATE_REPLY_MID,
            mid: LATE_REPLY_MID,
            peerId: target.peerId,
            peer_id: message.peer_id,
            from_id: message.from_id,
            fromId: message.fromId,
            pFlags: {},
            date: message.date,
            message: LATE_REPLY_TEXT
          });
          rootScope.dispatchEventSingle('messages_downloaded', {peerId: target.peerId, mids: [LATE_REPLY_MID]});
        }, LATE_REPLY_AFTER);
      }

      // a voice message's text comes by an event of its own, as from the server
      const transcription = getOption(dimensions.find(({id}) => id === 'voice'), next.voice).transcription;
      if(target.isVoice && transcription && target.transcribed !== next.voice) {
        rootScope.dispatchEventSingle('message_transcribed', {peerId: target.peerId, mid: target.mid, ...transcription});
        target.transcribed = next.voice;
      }

      target.shown = built;
      return edit;
    };

    const apply = (next: SandboxState, {force, keepHistory}: {force?: boolean, keepHistory?: boolean} = {}) => {
      const targets = ensureTargets();
      if(!keepHistory && !deepEqual(next, state())) setPrevious(state());
      setState(next);
      const edits = targets.map((target) => showIn(target, next, force)).filter(Boolean);
      const counts = new Map<string, number>();
      edits.forEach((edit) => counts.set(edit, (counts.get(edit) || 0) + 1));
      setReport(edits.length ?
        'Edit: ' + [...counts].map(([edit, count]) => (edits.length > 1 ? `${count} ` : '') + edit).join(', ') :
        'No edit');
    };

    const setOption = (dimension: DimensionId, option: string) => apply({...state(), [dimension]: option});

    const shuffle = () => {
      const [target] = ensureTargets();
      const ticked = dimensions.filter((dimension) => shuffled().includes(dimension.id));
      if(!target || !ticked.length) return;
      const targetContext = getContext(target);
      for(let attempt = 0; attempt < 10; ++attempt) {
        const next = {...state()};
        for(const dimension of ticked) {
          const options = dimension.options.filter((option) => !option.isDisabled?.(targetContext));
          next[dimension.id] = options[Math.floor(Math.random() * options.length)].id;
        }

        if(!deepEqual(next, state())) {
          apply(next);
          return;
        }
      }
    };

    const back = () => previous() && apply(previous());

    /**
     * every bubble the panel has shown something in, as it is, and what it made up for them gone
     * @param force made anew all the same: what the app shows in it changed (how an edit shows in the time)
     */
    const putBack = (force?: boolean) => {
      for(const target of known.values()) {
        const original = target.original;
        showIn(target, ORIGINAL_STATE, force);
        // a voice message's text it was shown with is its row's own, which only a bubble rendered anew forgets: its
        // message as it is, but for a mark on its media, is no message its bubble was made of
        if(target.transcribed && original?.media) {
          rootScope.dispatchEventSingle('message_edit', {
            storageKey: target.storageKey,
            peerId: target.peerId,
            mid: target.mid,
            message: {...original, media: {...original.media, sandboxRendersAnew: true} as unknown as MessageMedia}
          });
        }

        target.shown = target.edited = target.original = target.transcribed = undefined;
        mirrorMessage({storageKey: target.storageKey, mid: LATE_REPLY_MID}, undefined);
      }
    };

    const restore = () => {
      if(!deepEqual(state(), ORIGINAL_STATE)) setPrevious(state());
      setState(ORIGINAL_STATE);
      putBack();
      setReport('Put back');
    };

    const select = (bubbles: HTMLElement[], add?: boolean) => {
      const chat = getChat();
      const keys = add ? [...selected()] : [];
      for(const bubble of bubbles) {
        const target = makeTarget(chat, bubble);
        const key = getKey(target);
        if(!known.has(key)) known.set(key, target);
        const index = keys.indexOf(key);
        if(index === -1) keys.push(key);
        else if(add) keys.splice(index, 1);
      }

      setSelected(keys);
      if(bubbles.length === 1) chat.bubbles.highlightBubble(bubbles[0]);
    };

    const selectDefault = () => {
      const chat = getChat();
      const bubble = chat && getVisibleBubbles(chat).pop();
      setSelected([]);
      if(bubble) select([bubble]);
    };

    const describeTargets = createMemo(() => {
      const targets = selectedTargets();
      if(!targets.length) return 'The last bubble in view';
      if(targets.length > 1) return `${targets.length} bubbles`;
      const [target] = targets;
      const message = target.original ?? getTargetMessage(target);
      const text = message?.message.replace(/\s+/g, ' ') || 'no text';
      return `#${target.mid}: ${text.length > 32 ? text.slice(0, 32) + '…' : text}`;
    });

    // picking: the next click on a bubble picks it (with Shift: adds it, or drops it), and does nothing else
    const onPick = (e: MouseEvent) => {
      const chat = getChat();
      const bubble = (e.target as HTMLElement).closest?.<HTMLElement>('.bubble[data-mid]');
      if(!chat || !bubble || !chat.bubbles.chatInner.contains(bubble)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if(e.type !== 'click' || !getBubbleMessage(chat, bubble)) return;
      select([bubble], e.shiftKey);
      if(!e.shiftKey) setPickingAndListen(false);
    };
    const onPickKey = (e: KeyboardEvent) => {
      if(e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setPickingAndListen(false);
    };
    const PICK_EVENTS = ['pointerdown', 'mousedown', 'click', 'contextmenu'] as const;
    const togglePicking = (value: boolean) => {
      for(const type of PICK_EVENTS) {
        if(value) document.addEventListener(type, onPick, {capture: true});
        else document.removeEventListener(type, onPick, {capture: true});
      }
      if(value) document.addEventListener('keydown', onPickKey, {capture: true});
      else document.removeEventListener('keydown', onPickKey, {capture: true});
      document.body.classList.toggle(styles.picking, value);
    };
    const setPickingAndListen = (value: boolean) => {
      if(value === picking()) return;
      togglePicking(value);
      setPicking(value);
    };

    // a bot's answer streamed into the chat, as the worker hands one out piece by piece (`streamed_message_update`): in
    // this tab only, and gone at its end (`streamed_message_remove`), as a stream that was cancelled
    const [streaming, setStreaming] = createSignal<{stop: () => void}>();
    const stopStream = () => streaming()?.stop();
    const stream = () => {
      stopStream();
      const chat = getChat();
      const [target] = ensureTargets();
      const author = target && (target.original ?? getTargetMessage(target));
      if(!chat || !author) return;

      // a temporary id after every message there, as the worker makes one
      const mids = getBubbles(chat).map((bubble) => +bubble.dataset.mid).filter(Number.isFinite);
      const tempId = +(Math.max(0, ...mids) + 0.0099).toFixed(4);
      const date = Math.floor(Date.now() / 1000);
      const draft = {
        key: 'bubble-sandbox',
        peerId: chat.peerId,
        threadId: chat.threadId || 0,
        authorId: author.fromId,
        randomId: '0',
        tempId,
        revision: 0,
        date,
        updatedAt: Date.now(),
        expiresAt: Infinity,
        content: {kind: 'text', text: {_: 'textWithEntities', text: '', entities: []}},
        canStop: false,
        keepOnStop: false
      } as StreamedMessageDraft;

      let length = 0;
      const send = (initial: boolean) => {
        const message: Message.message = {
          _: 'message',
          id: tempId,
          mid: tempId,
          peerId: chat.peerId,
          peer_id: author.peer_id,
          from_id: author.from_id,
          fromId: author.fromId,
          pFlags: {currentlyTyping: true},
          date,
          message: STREAM_TEXT.slice(0, length),
          entities: []
        };
        mirrorMessage({storageKey: chat.messagesStorageKey, mid: tempId}, message);
        rootScope.dispatchEventSingle('streamed_message_update', {draft, message, initial});
      };

      length = STREAM_PIECE;
      send(true);
      const interval = window.setInterval(() => {
        if(length >= STREAM_TEXT.length) {
          window.clearInterval(interval);
          return;
        }

        length += STREAM_PIECE;
        send(false);
      }, STREAM_EVERY);
      setStreaming({
        stop: () => {
          window.clearInterval(interval);
          setStreaming(undefined);
          rootScope.dispatchEventSingle('streamed_message_remove', {draft, reason: 'cancelled'});
        }
      });
    };

    let autoTimeout: number;
    const runAuto = () => {
      shuffle();
      autoTimeout = window.setTimeout(runAuto, AUTO_CHANGE / speed() + AUTO_PAUSE);
    };
    const toggleAuto = (value = !auto()) => {
      clearTimeout(autoTimeout);
      setAuto(value);
      if(value) runAuto();
    };

    const changeSpeed = (rate: number) => {
      setSpeed(rate);
      setAnimationSpeed(rate);
      store({speed: rate});
    };

    const setEditedAsTime = (value: boolean) => {
      setAppStateSilent('appConfig', {...unwrap(appState.appConfig), message_primary_edited_date: value || undefined});
      // the time is made anew with every edit (`ChatBubbles.updateSolidMessageBodyTime`)
      apply(state(), {force: true, keepHistory: true});
    };

    // while the chat it leaves is still the open one: what it shows goes back with it
    const onPeerChanging = () => {
      toggleAuto(false);
      stopStream();
      putBack();
      known.clear();
      setSelected([]);
      setPrevious(undefined);
      setState(ORIGINAL_STATE);
      setReport('');
    };
    const appImManager = hotReloadGuard.appImManager;
    appImManager.addEventListener('peer_changing', onPeerChanging);

    const element = document.createElement('div');
    document.body.append(element);

    const Choice = <T, >(props: {
      label: string,
      values: T[],
      value: T,
      name: (value: T) => string,
      onChange: (value: T) => void,
      dir?: 'ltr'
    }) => (
      <div class={styles.setting} role="group" aria-label={props.label}>
        <span class={styles.settingLabel}>{props.label}</span>
        <For each={props.values}>
          {(value) => (
            <button
              class={styles.option}
              dir={props.dir}
              aria-pressed={props.value === value}
              onClick={() => props.onChange(value)}
            >
              {props.name(value)}
            </button>
          )}
        </For>
      </div>
    );

    const dispose = render(() => (
      <div
        class={classNames(styles.panel, collapsed() && styles.collapsed)}
        role="complementary"
        aria-label="Bubble sandbox"
        // the app's shortcuts are on the body: a key pressed here (Space on a button repeats its click) stays here
        on:keydown={(e) => e.stopPropagation()}
      >
        <div class={styles.header}>
          <button
            class={styles.title}
            aria-expanded={!collapsed()}
            onClick={() => {
              setCollapsed((value) => !value);
              store({collapsed: collapsed()});
            }}
          >
            {collapsed() ? '▸' : '▾'} Bubble states
          </button>
          <button class={styles.close} title="Close and put the bubbles back" aria-label="Close" onClick={() => close()}>
            ×
          </button>
        </div>

        <Show when={!collapsed()}>
          <div class={styles.target}>
            <span class={styles.targetName}>{describeTargets()}</span>
            <button
              class={styles.option}
              aria-pressed={picking()}
              title="Click a bubble to pick it; Shift+click adds one or drops it; Escape stops"
              onClick={() => setPickingAndListen(!picking())}
            >
              Pick
            </button>
            <button
              class={styles.option}
              title="Every bubble with a message in view"
              onClick={() => select(getVisibleBubbles(getChat()))}
            >
              In view
            </button>
          </div>

          <For each={dimensions}>
            {(dimension) => (
              <div class={styles.dimension} role="group" aria-label={dimension.label}>
                <label class={styles.dimensionLabel} title="Taken by Shuffle and Auto">
                  <input
                    type="checkbox"
                    checked={shuffled().includes(dimension.id)}
                    onChange={(e) => {
                      const ids = shuffled().filter((id) => id !== dimension.id);
                      if(e.currentTarget.checked) ids.push(dimension.id);
                      setShuffled(ids);
                      store({shuffled: ids});
                    }}
                  />
                  {dimension.label}
                </label>
                <div class={styles.options}>
                  <For each={dimension.options}>
                    {(option) => (
                      <button
                        class={styles.option}
                        aria-pressed={getOption(dimension, state()[dimension.id]) === option}
                        disabled={!!context() && option.isDisabled?.(context())}
                        onClick={() => setOption(dimension.id, option.id)}
                      >
                        {option.label}
                      </button>
                    )}
                  </For>
                </div>
                <Show when={dimension.id === 'text'}>
                  <textarea
                    class={styles.customText}
                    dir="auto"
                    rows={2}
                    placeholder="Own text, with **markdown**; Ctrl+Enter shows it"
                    value={customText()}
                    onInput={(e) => {
                      setCustomText(e.currentTarget.value);
                      store({customText: e.currentTarget.value});
                    }}
                    on:keydown={(e) => {
                      if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        apply({...state(), text: 'custom'}, {force: state().text === 'custom'});
                      }
                    }}
                  />
                </Show>
              </div>
            )}
          </For>

          <div class={styles.actions}>
            <button class={styles.action} onClick={shuffle} title="Another state of what is ticked">
              Shuffle
            </button>
            <button class={styles.action} disabled={!previous()} onClick={back} title="The state before this one">
              Back
            </button>
            <button
              class={styles.action}
              aria-pressed={auto()}
              title="Shuffle again and again"
              onClick={() => toggleAuto()}
            >
              Auto
            </button>
            <button class={styles.action} onClick={restore} title="The bubbles as they are">
              Restore
            </button>
          </div>
          <div class={styles.actions}>
            <button
              class={styles.action}
              aria-pressed={!!streaming()}
              title="A bot's answer coming in pieces at the end of the chat, from the author of the bubble picked; again: it goes"
              onClick={() => streaming() ? stopStream() : stream()}
            >
              Stream
            </button>
          </div>
          <div class={styles.report} aria-live="polite">{report()}</div>

          <Choice
            label="Level"
            values={LEVELS}
            value={liteMode.getAnimationLevel()}
            name={(level) => ['Off', 'Reduced', 'Full'][level]}
            onChange={(level) => liteMode.setAnimationLevel(level)}
          />
          <Choice label="Speed" values={SPEEDS} value={speed()} name={(rate) => `${rate}×`} onChange={changeSpeed} dir="ltr" />
          <Choice
            label="Direction"
            values={[false, true]}
            value={I18n.isRTL()}
            name={(rtl) => rtl ? 'RTL' : 'LTR'}
            onChange={(rtl) => I18n.forceRTL(rtl)}
          />
          <Choice
            label="Edited as"
            values={[false, true]}
            value={!!useAppConfig()?.message_primary_edited_date}
            name={(asTime) => asTime ? 'Time' : 'Label'}
            onChange={setEditedAsTime}
          />

          <div class={styles.note}>
            Nothing reaches Telegram: the bubbles change in this tab only. A click on a bubble itself does the real thing.
          </div>
        </Show>
      </div>
    ), element);

    selectDefault();

    close = () => {
      close = undefined;
      toggleAuto(false);
      stopStream();
      setPickingAndListen(false);
      appImManager.removeEventListener('peer_changing', onPeerChanging);
      // how an edit shows in the time as it was, and the times made anew with it
      const editedAsChanged = !!useAppConfig()?.message_primary_edited_date !== initialEditedAsTime;
      if(editedAsChanged) {
        setAppStateSilent('appConfig', {
          ...unwrap(appState.appConfig),
          message_primary_edited_date: initialEditedAsTime || undefined
        });
      }

      putBack(editedAsChanged);
      setAnimationSpeed(1);
      if(liteMode.getAnimationLevel() !== initialLevel) liteMode.setAnimationLevel(initialLevel);
      if(I18n.getIsRTL() !== initialRTL) I18n.forceRTL(Modes.rtl || undefined);
      dispose();
      disposeRoot();
      element.remove();
      delete (window as any).bubbleSandbox;
    };

    (window as any).bubbleSandbox = {
      state,
      report,
      /** the bubbles it acts on */
      bubbles: () => selectedTargets().map((target) => getChat()?.bubbles.getBubble(target.peerId, target.mid)),
      apply: (patch: Partial<SandboxState>) => apply({...state(), ...patch}),
      shuffle,
      back,
      restore,
      /** a streamed answer at the end of the chat; again, or `stop`: it goes */
      stream: (stop?: boolean) => stop ? stopStream() : stream(),
      select: (bubbles: HTMLElement[], add?: boolean) => select(bubbles, add),
      close: () => close?.()
    };
  });
}

// The console's way in, from the latest code: `src/index.ts` only loads the module, which puts its opener there. It
// exports nothing on purpose: it takes its own hot updates, and what it exported its importers would hold in the first
// evaluation's version (`hotRegistry.keepExports`), so an edit would reload the page. Edited, it takes no reload:
// the panel, if it is open, opens again on the new code, its bubbles put back first as on closing.
if(import.meta.hot) import.meta.hot.accept();
hotEffect(import.meta.hot, () => {
  (window as any).showBubbleSandbox = showBubbleSandbox;
  if(import.meta.hot?.data.reopen) {
    delete import.meta.hot.data.reopen;
    showBubbleSandbox();
  }

  return () => {
    if(!close) return;
    import.meta.hot.data.reopen = true;
    close();
  };
});
