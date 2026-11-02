/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '@components/popups/indexTsx';
import {createEffect, createSignal, For, on, onCleanup, Show} from 'solid-js';
import type {WalletCustodyRecord} from '@lib/wallet/vault';
import MediaHeader from '@components/mediaHeader';
import Row from '@components/rowTsx';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import updateScrollRegionFocusable from '@helpers/dom/scrollRegion';
import Modes from '@config/modes';
import {bindActiveWindowListener, getAppWindow, onAppWindowChange} from '@helpers/appWindow';
import PasscodeLockScreenController from '@components/passcodeLock/passcodeLockScreenController';
import {useWallet} from '@components/wallet/context';
import {WalletHeader} from '@components/wallet/parts';
import {ensureWalletKey, isUserCancel} from '@components/wallet/send';
import {guardWalletBackupDisable, showWalletWriteDownTooQuick, WalletBackupFlow} from '@components/wallet/rotation';
import {showWalletAlert, showWalletError} from '@components/wallet/alerts';
import {isBackupWriteDownTooQuick} from '@lib/wallet/rotation';
import styles from '@components/wallet/wallet.module.scss';
import phraseStyles from '@components/wallet/screens/phrase.module.scss';

/** how often the words look whether the app was locked: the lock screen has no event of its own */
const LOCK_CHECK_INTERVAL = 1000;

/** what iOS's recovery info warns of, each with its own icon */
const WARNINGS: {icon: Icon, text: LangPackKey}[] = [
  {icon: 'eyecross', text: 'Wallet.Phrase.WarnShare'},
  {icon: 'warning_filled', text: 'Wallet.Phrase.WarnSteal'},
  {icon: 'shield', text: 'Wallet.Phrase.WarnSupport'}
];

type WakeLockSentinelLike = {release: () => Promise<void>, addEventListener: (type: 'release', listener: () => void) => void};

/**
 * Keeps the screen on while the words are up: writing 24 words down takes longer than a screen stays lit (iOS:
 * pushIdleTimerExtension). The browser lets go of it whenever the page is hidden; it is asked for again once the
 * words are back.
 */
function useScreenWakeLock(active: () => boolean) {
  const wakeLock = (navigator as Navigator & {wakeLock?: {request: (type: 'screen') => Promise<WakeLockSentinelLike>}}).wakeLock;
  let sentinel: WakeLockSentinelLike, requesting = false, disposed = false;
  const release = () => {
    sentinel?.release().catch(() => {});
    sentinel = undefined;
  };

  const request = () => {
    if(!wakeLock || sentinel || requesting || getAppWindow().document.visibilityState !== 'visible') return;
    requesting = true;
    wakeLock.request('screen').then((value) => {
      requesting = false;
      if(disposed || !active()) {
        value.release().catch(() => {});
        return;
      }

      sentinel = value;
      value.addEventListener('release', () => {
        if(sentinel === value) sentinel = undefined;
      });
    }, () => requesting = false);
  };

  createEffect(() => active() ? request() : release());
  onCleanup(() => {
    disposed = true;
    release();
  });
}

/**
 * The secret phrase. Shown from the keys, iOS's recovery info comes first — what the phrase is, three warnings —
 * then the words, from this device's key or reassembled from Telegram's backup (which also installs the key here).
 * Written down to turn the backup off, the words come ready (`words`); Continue takes them as written only once they
 * have been up a while, and leaving asks first: it drops the disable. The words cannot be selected, keep the screen
 * on, and leave the screen while the page is hidden or the app locked.
 */
export default function WalletPhraseScreen(props: {params?: {
  mode?: 'disableBackup' | 'rotation',
  parked?: WalletCustodyRecord,
  /** to write down: the current phrase, or the new phrase of the key update prepared under the question */
  words?: string[],
  flow?: WalletBackupFlow
}}) {
  const wallet = useWallet();
  const store = wallet.store;
  const [words, setWords] = createSignal<string[]>();
  const [busy, setBusy] = createSignal(false);
  // * the page is hidden or the app locked: the words are not on screen meanwhile
  const [covered, setCovered] = createSignal(false);
  // * an old wallet's phrase, from the conflict screen: its key is on this device, nothing is asked of the server
  const parked = props.params?.parked;
  const mode = props.params?.mode;
  // * turning the backup off: the words have to be written down, a quiz checks three of them
  const writeDown = mode === 'disableBackup' || mode === 'rotation';
  const rotation = mode === 'rotation';
  const flow = props.params?.flow;
  const given = props.params?.words;
  let handedOver = false, disposed = false;
  // * a reveal on its way counts only while nothing covered the words since it was asked for (see cover)
  let revealAttempt = 0;
  let grid: HTMLOListElement;
  // * when the words to write down first came up
  let shownAt = 0;
  if(given) {
    setWords(given);
    shownAt = Date.now();
  }

  if(writeDown) guardWalletBackupDisable(wallet, flow);

  const shownWords = () => covered() ? undefined : words();
  useScreenWakeLock(() => !!shownWords());

  // * the Show button the focus was on is gone: with the keyboard layer it goes to the words it revealed
  const showWords = (value: string[]) => {
    setWords(value);
    shownAt ||= Date.now();
    if(Modes.a11y) grid?.focus({preventScroll: true});
  };

  const reveal = async() => {
    if(busy()) return;
    const attempt = ++revealAttempt;
    const current = () => attempt === revealAttempt;
    setBusy(true);
    try {
      if(parked) {
        const parkedWords = await store.session.revealParked(parked);
        if(current()) showWords(parkedWords);
        return;
      }

      await ensureWalletKey(store, 'Wallet.Phrase.PasswordText');
      if(!current()) return;
      const revealed = await store.session.revealPhrase(store.status());
      if(current()) showWords(revealed);
    } catch(err) {
      if(isUserCancel(err) || disposed) {
        return;
      } else if((err as any)?.type === 'WALLET_KEY_MISSING') {
        wallet.router.replace('restore', {});
      } else if(parked && (err as any)?.type === 'ROTATION_PENDING') {
        // * an old wallet whose key update the chain has not settled yet: which phrase is valid is not known
        showWalletAlert({title: 'Wallet.Backup.PhraseUpdatePendingTitle', text: 'Wallet.Conflict.UpdatePendingText'});
      } else {
        showWalletError(err, 'Wallet.Phrase.ErrorTitle', parked ? 'Wallet.Phrase.Error' : undefined);
      }
    } finally {
      setBusy(false);
    }
  };

  // * shown from the keys, the words go for good and are asked for again; to write down, they come back. A reveal
  // * still on its way is dropped too: the words come back only from Show pressed on an uncovered screen
  const cover = (value: boolean) => {
    setCovered(value);
    if(value && !given) {
      ++revealAttempt;
      setWords(undefined);
    }
  };

  // * the window the app is in: in Document PiP the tab behind it may be hidden while the words are on screen
  const hidden = () => getAppWindow().document.visibilityState === 'hidden';
  const onVisibility = () => cover(hidden() || !!PasscodeLockScreenController.getIsLocked());
  const unbindVisibility = bindActiveWindowListener((win) => win.document, 'visibilitychange', onVisibility);
  const unwatchWindow = onAppWindowChange(onVisibility);
  const lockCheck = window.setInterval(() => {
    if(!!PasscodeLockScreenController.getIsLocked() !== covered() && !hidden()) onVisibility();
  }, LOCK_CHECK_INTERVAL);

  onCleanup(() => {
    disposed = true;
    ++revealAttempt;
    unbindVisibility();
    unwatchWindow();
    clearInterval(lockCheck);
    setWords(undefined);
    if(given) given.fill('');
    if(!handedOver) {
      if(rotation) store.session.abandonRotation();
      flow?.end();
    }
  });

  const title: LangPackKey = rotation ? 'Wallet.Backup.NewPhraseTitle' : 'Wallet.Phrase.Title';
  const text: LangPackKey = rotation ? 'Wallet.Backup.NewPhraseText' : 'Wallet.Phrase.Info';

  // * the words are text only: with the a11y layer the region they scroll in takes focus itself, so the keyboard
  // * can scroll it (also under a question over it, which leaves nothing in it focusable)
  let body: HTMLDivElement;
  createEffect(on(shownWords, () => queueMicrotask(() => updateScrollRegionFocusable(body, I18n.format(title, true)))));

  return (
    <>
      <WalletHeader back />
      <div ref={body} class={styles.body}>
        <Show
          when={shownWords()}
          fallback={
            <Show when={!given}>
              <MediaHeader>
                <MediaHeader.Sticker name="WalletWordList" size={100} restartOnClick={false} />
                <MediaHeader.Title>{i18n('Wallet.Phrase.Warning')}</MediaHeader.Title>
                <MediaHeader.Subtitle>{i18n('Wallet.Phrase.Info')}</MediaHeader.Subtitle>
              </MediaHeader>
              <div class={phraseStyles.warnings}>
                <For each={WARNINGS}>{(warning) => (
                  <Row class={phraseStyles.warning}>
                    <Row.Icon icon={warning.icon} class="primary" noBackground />
                    <Row.Title class={phraseStyles.warningText}>{i18n(warning.text)}</Row.Title>
                  </Row>
                )}</For>
              </div>
            </Show>
          }
        >
          <MediaHeader>
            <MediaHeader.Sticker name="WalletWordList" size={100} restartOnClick={false} />
            <MediaHeader.Title>{i18n(title)}</MediaHeader.Title>
            <MediaHeader.Subtitle>{i18n(text)}</MediaHeader.Subtitle>
          </MediaHeader>
          <ol ref={grid} class={phraseStyles.grid} tabIndex={Modes.a11y ? -1 : undefined}>
            <For each={shownWords()}>{(word) => <li class={phraseStyles.word}>{word}</li>}</For>
          </ol>
        </Show>
      </div>
      <PopupElement.Footer>
        <Show
          when={words()}
          fallback={<PopupElement.FooterButton langKey="Wallet.Phrase.Show" disabled={busy()} callback={() => {
            reveal();
            return false;
          }} />}
        >
          <PopupElement.FooterButton
            langKey={writeDown ? 'Wallet.Continue' : 'Wallet.Phrase.Done'}
            disabled={covered()}
            callback={() => {
              if(!writeDown) {
                wallet.router.pop();
              } else if(isBackupWriteDownTooQuick(shownAt, Date.now())) {
                showWalletWriteDownTooQuick();
              } else {
                handedOver = true;
                wallet.router.replace('quiz', {words: words().slice(), mode, flow});
              }

              return false;
            }}
          />
        </Show>
      </PopupElement.Footer>
    </>
  );
}
