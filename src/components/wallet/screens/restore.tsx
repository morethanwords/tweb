/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '@components/popups/indexTsx';
import {createMemo, createSignal, onCleanup, Show} from 'solid-js';
import {ChipTab, ChipTabs} from '@components/chipTabs';
import MediaHeader from '@components/mediaHeader';
import {toastNew} from '@components/toast';
import {I18nTsx} from '@helpers/solid/i18n';
import {i18n, LangPackKey} from '@lib/langPack';
import anchorCallback from '@helpers/dom/anchorCallback';
import bytesToHex from '@helpers/bytes/bytesToHex';
import {useWallet} from '@components/wallet/context';
import type {WalletStore} from '@components/wallet/store';
import {WalletHeader} from '@components/wallet/parts';
import {ensureWalletKey, isUserCancel, withWalletPassword} from '@components/wallet/send';
import {enableWalletBackup} from '@components/wallet/rotation';
import {showWalletAlert, toastWalletAfterBack, walletAuthorizationMessage, WalletAddressPlate, WalletMessage} from '@components/wallet/alerts';
import WalletWordFields, {parseWalletPastedWords, WalletWordFieldsHandle} from '@components/wallet/screens/wordFields';
import {bindActiveWindowListener} from '@helpers/appWindow';
import styles from '@components/wallet/wallet.module.scss';
import restoreStyles from '@components/wallet/screens/restore.module.scss';

type WalletRestoreMode = 'import' | 'enableBackup';

/**
 * The phrase this wallet expects: 24 words once its key was updated — a key update in the history, or this
 * device's old key of it with another signing key than the served one — 12 otherwise, as iOS starts (it offers both).
 */
async function expectedPhraseLength(store: WalletStore): Promise<12 | 24> {
  const state = store.status().state;
  if(!state) {
    return 12;
  }

  if(store.history.transactions().some((transaction) => transaction.pFlags.key_change)) {
    return 24;
  }

  const record = await store.session.vault.getCustody().catch((): undefined => undefined);
  if(record && record.anchorKey !== bytesToHex(state.public_key) && await store.session.isSameAddress(record.address, state.address)) {
    return 24;
  }

  return 12;
}

/**
 * "Wrong Secret Phrase": the words are another wallet's — with the address of the one they should open (iOS)
 */
export function showWalletWrongPhrase(address: string) {
  return showWalletAlert({title: 'Wallet.Import.WrongPhraseTitle', text: 'Wallet.Import.WrongPhraseText'}, {
    content: address && <WalletAddressPlate address={address} />
  });
}

/**
 * Typing a phrase (iOS: WalletImportScreen): this wallet's, to put its key on this device; another wallet's, to make
 * it the account's (`import`); or this wallet's current one, to turn the backup on with it (`enableBackup`). 12 or
 * 24 numbered words with suggestions from the word list; a pasted phrase fills them all. What the words turn out to
 * be is said in an alert: another wallet's, an old phrase of this one, no phrase at all.
 */
export default function WalletRestoreScreen(props: {params?: {mode?: WalletRestoreMode}}) {
  const mode = props.params?.mode;
  const importing = mode === 'import';
  const wallet = useWallet();
  const store = wallet.store;
  const [count, setCount] = createSignal<number>(12);
  const [words, setWords] = createSignal<string[]>(new Array(12).fill(''));
  const [busy, setBusy] = createSignal(false);
  const [wordlist, setWordlist] = createSignal<ReadonlySet<string>>(new Set());
  const [canPaste, setCanPaste] = createSignal(false);
  let fields: WalletWordFieldsHandle;

  store.session.getEngine().then((engine) => engine.mnemonicWordlist()).then((list) => setWordlist(new Set(list)));
  onCleanup(() => setWords([]));

  if(!importing) {
    const length = expectedPhraseLength(store).then((length) => {
      if(length !== count()) resize(length);
    }, () => {});
    wallet.router.holdEntrance(length);
  }

  // * the first field takes the keyboard once the screen is in (iOS)
  const autofocus = window.setTimeout(() => fields?.focus(0), 450);
  onCleanup(() => clearTimeout(autofocus));

  // * Paste in the first field only where the clipboard can be read with no prompt: the permission was granted
  // * before. Its content is read only on the press.
  const checkClipboard = () => {
    navigator.permissions?.query({name: 'clipboard-read' as PermissionName}).then((status) => {
      setCanPaste(status.state === 'granted' && !!navigator.clipboard?.readText);
    }, () => setCanPaste(false));
  };
  checkClipboard();
  onCleanup(bindActiveWindowListener((win) => win, 'focus', checkClipboard));

  const isWord = (word: string) => !!word && (!wordlist().size || wordlist().has(word));
  const complete = createMemo(() => words().length === count() && words().every(isWord));
  const numbers = createMemo(() => Array.from({length: count()}, (_, index) => index + 1));

  const setWord = (index: number, word: string) => {
    setWords((list) => {
      const copy = list.slice();
      copy[index] = word;
      return copy;
    });
  };

  // * the other length keeps the words typed so far (iOS: setWordCount)
  const resize = (length: number, keep = words()) => {
    setCount(length);
    setWords(Array.from({length}, (_, index) => keep[index] || ''));
  };

  const clear = (length = count()) => {
    resize(length, []);
    queueMicrotask(() => fields?.focus(0));
  };

  const alertPhraseLength = (length: number, index?: number) => {
    if(index !== undefined) fields?.shake(index);
    showWalletAlert({
      title: 'Wallet.Import.InvalidPhraseTitle',
      text: mode === 'enableBackup' ? 'Wallet.Import.InvalidCurrentPhraseLength' : 'Wallet.Import.InvalidPhraseLength',
      textArgs: [i18n('Wallet.Restore.Words', [length])]
    });
  };

  // * a phrase fills the fields from the first, at its own length; one word goes where it was put
  const onWords = (index: number, list: string[]) => {
    if(list.length > 1 && list.length !== 12 && list.length !== 24) {
      alertPhraseLength(list.length, index);
      return;
    }

    if(list.length === 1) {
      setWord(index, list[0]);
      return;
    }

    resize(list.length, list);
    queueMicrotask(() => {
      const invalid = list.findIndex((word) => !isWord(word));
      if(invalid !== -1) fields?.focus(invalid);
      else fields?.blur();
    });
  };

  const paste = async() => {
    let text: string;
    try {
      text = await navigator.clipboard.readText();
    } catch(err) {
      setCanPaste(false);
      return;
    }

    const list = parseWalletPastedWords(text || '');
    if(!list.length) {
      setCanPaste(false);
      return;
    }

    if(list.length !== 12 && list.length !== 24) {
      alertPhraseLength(list.length);
      return;
    }

    const engine = await store.session.getEngine();
    if(!(await engine.detectMnemonicSchemes(list)).includes('rotation')) {
      showWalletAlert({title: 'Wallet.Import.InvalidPhraseTitle', text: 'Wallet.Import.InvalidPhraseText'});
      return;
    }

    resize(list.length, list);
    fields?.blur();
  };

  const fromBackup = async() => {
    if(busy()) return;
    setBusy(true);
    try {
      await ensureWalletKey(store);
      toastNew({langPackKey: 'Wallet.Restore.Done'});
      wallet.router.pop();
    } catch(err) {
      if(!isUserCancel(err)) showWalletAlert(await walletAuthorizationMessage(err) ?? {title: 'Wallet.Restore.ErrorTitle', text: 'Wallet.NetworkError'});
    } finally {
      setBusy(false);
    }
  };

  // * whose the words are, and why they do not do (iOS: finishImportWithError, presentWrongSecretPhrase)
  const showFailure = async(error: any) => {
    const type = String(error?.type || '');
    if(type === 'WALLET_PHRASE_OTHER_WALLET') {
      await showWalletWrongPhrase(store.friendlyAddress() || store.status().state?.address);
      clear();
      return;
    }

    if(type === 'WALLET_PHRASE_OUTDATED') {
      await showWalletAlert({title: 'Wallet.Import.PhraseChangedTitle', text: 'Wallet.Import.PhraseChangedText'}, {
        actions: [{langKey: 'Wallet.Import.Proceed'}]
      });
      clear(24);
      return;
    }

    if(type === 'WALLET_PHRASE_INVALID' || type === 'WALLET_PHRASE_FOREIGN') {
      showWalletAlert({title: 'Wallet.Import.InvalidPhraseTitle', text: 'Wallet.Import.InvalidPhraseText'});
      return;
    }

    const fallback: WalletMessage = importing ?
      {title: 'Wallet.Import.ErrorTitle', text: 'Wallet.Import.ErrorText'} :
      {title: 'Wallet.Restore.ErrorTitle', text: 'Wallet.NetworkError'};
    showWalletAlert(await walletAuthorizationMessage(error) ?? fallback);
  };

  const enableBackup = async() => {
    if(await enableWalletBackup(wallet, {retry: () => void runEnable(), enterPhrase: () => clear()})) {
      wallet.router.pop('keys');
    }
  };

  const runEnable = async() => {
    if(busy()) return;
    setBusy(true);
    try {
      await enableBackup();
    } finally {
      setBusy(false);
    }
  };

  const submit = async() => {
    if(busy()) return;
    const list = words().slice(0, count());
    const empty = list.findIndex((word) => !isWord(word));
    if(empty !== -1) {
      fields?.focus(empty);
      fields?.shake(empty);
      return;
    }

    setBusy(true);
    fields?.blur();
    try {
      if(importing) {
        // * the phrase of another wallet becomes the account's: the server is told, with the proof of the key
        await store.session.replaceWithImported(list, (replace) => withWalletPassword('Wallet.Replace.PasswordText', replace));
        await store.refreshStatus(true);
        await store.refreshDeviceMode();
        wallet.router.pop('main');
        toastWalletAfterBack('Wallet.Replace.ImportedTitle', 'Wallet.Replace.ImportedText');
        return;
      }

      await store.session.restoreFromWords(list, store.status());
      await store.refreshDeviceMode();
      if(mode === 'enableBackup') {
        await enableBackup();
        return;
      }

      wallet.router.pop();
      toastWalletAfterBack('Wallet.Replace.ImportedTitle', 'Wallet.Replace.ImportedText');
    } catch(err) {
      if(!isUserCancel(err)) showFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const title: LangPackKey = importing ? 'Wallet.Import.Title' : mode === 'enableBackup' ? 'Wallet.Keys.BackupEnable' : 'Wallet.Restore.Title';
  const action: LangPackKey = importing ? 'Wallet.Import.Action' : mode === 'enableBackup' ? 'Wallet.Keys.BackupEnable' : 'Wallet.Phrase.Done';
  // * why the phrase is asked for (iOS's "Why?")
  const why = anchorCallback(() => showWalletAlert({title: 'Wallet.Restore.Title', text: 'Wallet.Import.RecoveryExplanation'}));

  return (
    <>
      <WalletHeader title={title} back />
      <div class={styles.body}>
        <MediaHeader>
          <MediaHeader.Sticker name={importing ? 'WalletWordList' : 'WalletWordCheck'} size={100} restartOnClick={false} />
          <MediaHeader.Subtitle>
            {importing ?
              i18n('Wallet.Import.Text') :
              mode === 'enableBackup' ? i18n('Wallet.Import.EnableBackupText') :
              // * "Why?" only when there is no backup to restore from: then every new session needs the phrase
              store.status().state?.pFlags.can_export_phrase ? i18n('Wallet.Restore.TextBackup') : i18n('Wallet.Restore.Text', [why])}
          </MediaHeader.Subtitle>
        </MediaHeader>
        <ChipTabs
          center
          class={restoreStyles.tabs}
          value={'' + count()}
          view="primary"
          onChange={(value) => resize(+value)}
        >
          <ChipTab value="12"><I18nTsx key="Wallet.Restore.Words" args={['12']} /></ChipTab>
          <ChipTab value="24"><I18nTsx key="Wallet.Restore.Words" args={['24']} /></ChipTab>
        </ChipTabs>
        <WalletWordFields
          numbers={numbers()}
          words={words}
          setWord={setWord}
          wordlist={wordlist}
          columns
          disabled={busy()}
          onWords={onWords}
          onSubmit={submit}
          canSubmit={complete}
          paste={{shown: () => canPaste() && words().every((word) => !word), onClick: paste}}
          ref={(handle) => fields = handle}
        />
        <Show when={!mode && store.status().state?.pFlags.can_export_phrase && store.deviceMode() !== 'full'}>
          <button type="button" class={restoreStyles.link} onClick={fromBackup}>{i18n('Wallet.Keys.RestoreBackup')}</button>
        </Show>
      </div>
      <PopupElement.Footer>
        <PopupElement.FooterButton
          langKey={action}
          disabled={!complete()}
          preloader
          callback={() => submit().then(() => false)}
        />
      </PopupElement.Footer>
    </>
  );
}
