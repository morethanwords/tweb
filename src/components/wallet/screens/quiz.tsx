/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import PopupElement from '@components/popups/indexTsx';
import {createMemo, createSignal, onCleanup} from 'solid-js';
import MediaHeader from '@components/mediaHeader';
import {i18n} from '@lib/langPack';
import {useWallet} from '@components/wallet/context';
import {WalletHeader} from '@components/wallet/parts';
import {confirmWalletBackupDisableDone, createWalletBackupFlow, guardWalletBackupDisable, WalletBackupFlow} from '@components/wallet/rotation';
import {backupQuizIndexes} from '@lib/wallet/rotation';
import WalletWordFields, {normalizeWalletWord, WalletWordFieldsHandle} from '@components/wallet/screens/wordFields';
import styles from '@components/wallet/wallet.module.scss';

/**
 * "Test Time" (iOS: the import screen's verify mode): before the backup goes away, three words of the phrase just
 * written down are asked back — of an update's new phrase one of each half's keys. Wrong ones turn red, the first of
 * them shakes and takes the focus; right ones lead to the last question, "Disable Backup?".
 */
export default function WalletQuizScreen(props: {params: {
  words: string[],
  mode?: 'disableBackup' | 'rotation',
  flow?: WalletBackupFlow
}}) {
  const wallet = useWallet();
  const words = props.params.words;
  const rotation = props.params.mode === 'rotation';
  const flow = props.params.flow ?? createWalletBackupFlow(wallet);
  const indexes = backupQuizIndexes(words.length, rotation);
  const numbers = indexes.map((index) => index + 1);
  const [answers, setAnswers] = createSignal<string[]>(indexes.map(() => ''));
  const [mismatched, setMismatched] = createSignal<ReadonlySet<number>>(new Set());
  const [wordlist, setWordlist] = createSignal<ReadonlySet<string>>(new Set());
  const [asking, setAsking] = createSignal(false);
  let fields: WalletWordFieldsHandle;

  wallet.store.session.getEngine().then((engine) => engine.mnemonicWordlist()).then((list) => setWordlist(new Set(list)));

  // * leaving drops the disable — but not once the update went out: that one goes on
  guardWalletBackupDisable(wallet, flow, () => !flow.rotationSent);

  const autofocus = window.setTimeout(() => fields?.focus(0), 450);
  onCleanup(() => {
    clearTimeout(autofocus);
    words.fill('');
    // * left before the update went out: it goes (one already sent is not touched)
    if(rotation) wallet.store.session.abandonRotation();
    flow.end();
  });

  const filled = createMemo(() => answers().every((word) => !!word));

  const setWord = (index: number, word: string) => {
    setAnswers((list) => list.map((item, i) => i === index ? word : item));
    if(mismatched().has(index)) {
      const next = new Set(mismatched());
      next.delete(index);
      setMismatched(next);
    }
  };

  // * several words at once go into this field and the ones after it
  const onWords = (index: number, list: string[]) => {
    list.slice(0, indexes.length - index).forEach((word, offset) => setWord(index + offset, word));
  };

  const submit = async() => {
    if(asking() || !filled()) return;
    const wrong: number[] = [];
    indexes.forEach((wordIndex, i) => {
      if(normalizeWalletWord(answers()[i]) !== words[wordIndex]) wrong.push(i);
    });

    setMismatched(new Set(wrong));
    if(wrong.length) {
      fields?.focus(wrong[0]);
      fields?.shake(wrong[0]);
      return;
    }

    setAsking(true);
    fields?.blur();
    try {
      await confirmWalletBackupDisableDone(wallet, flow, rotation);
    } finally {
      setAsking(false);
    }
  };

  return (
    <>
      <WalletHeader title="Wallet.Quiz.Title" back />
      <div class={styles.body}>
        <MediaHeader>
          <MediaHeader.Sticker name="WalletWordCheck" size={100} restartOnClick={false} />
          <MediaHeader.Subtitle>{i18n('Wallet.Quiz.Text', numbers.map(String))}</MediaHeader.Subtitle>
        </MediaHeader>
        <WalletWordFields
          numbers={numbers}
          words={answers}
          setWord={setWord}
          wordlist={wordlist}
          mismatched={mismatched}
          disabled={asking()}
          onWords={onWords}
          onSubmit={submit}
          canSubmit={filled}
          ref={(handle) => fields = handle}
        />
      </div>
      <PopupElement.Footer>
        <PopupElement.FooterButton langKey="Wallet.Continue" disabled={!filled() || asking()} callback={() => {
          submit();
          return false;
        }} />
      </PopupElement.Footer>
    </>
  );
}
