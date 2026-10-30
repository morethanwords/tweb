/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createSignal, For, JSX} from 'solid-js';
import PopupElement, {createPopup} from '@components/popups/indexTsx';
import {InputFieldTsx} from '@components/inputFieldTsx';
import PasswordInputField from '@components/passwordInputField';
import {InputState} from '@components/inputField';
import confirmationPopup from '@components/confirmationPopup';
import {toastNew} from '@components/toast';
import deferredPromise from '@helpers/cancellablePromise';
import shake from '@helpers/dom/shake';
import {i18n, LangPackKey} from '@lib/langPack';
import type WalletVault from '@lib/wallet/vault';
import {WalletVaultExistsError} from '@lib/wallet/vault';
import type {WalletSessionUi} from '@lib/wallet/walletSession';
import {showWalletAlert} from '@components/wallet/alerts';
import rootScope from '@lib/rootScope';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import formatDuration from '@helpers/formatDuration';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import styles from '@components/wallet/vaultPrompts.module.scss';

/**
 * The questions the wallet asks about its key on this device: how to protect it the first time it is stored, the
 * passcode whenever it is needed again after the 15-minute grace, and — from the wallet's menu — another passcode
 * or none.
 */

const MIN_PASSCODE_LENGTH = 4;

/**
 * A popup of passcode fields over one action. `submit` reads the fields and resolves with whether it is done: the
 * popup closes then, and stays otherwise (a field says why). Resolves when done, rejects when left.
 */
function showPasscodePopup(options: {
  title: LangPackKey,
  text: LangPackKey,
  fields: LangPackKey[],
  button: LangPackKey,
  danger?: boolean,
  submit: (fields: PasswordInputField[]) => Promise<boolean>,
  /** under the fields: a way out of the question */
  footer?: (close: () => void) => JSX.Element
}): Promise<void> {
  const deferred = deferredPromise<void>();
  const [show, setShow] = createSignal(false);
  const fields: PasswordInputField[] = [];
  let done = false;

  const close = () => setShow(false);
  // * one submission at a time: Enter and the button, or Enter twice, would make a vault twice
  let submitting = false;
  const submit = async() => {
    if(submitting || done) {
      return false;
    }

    submitting = true;
    try {
      if(!(await options.submit(fields))) {
        return false;
      }
    } finally {
      submitting = false;
    }

    done = true;
    deferred.resolve();
    close();
  };

  createPopup(() => (
    <PopupElement
      class={styles.popup}
      show={show()}
      closable
      // * left the moment it starts closing: a submission that ends while it fades out no longer counts
      onClose={() => {
        if(!done) deferred.reject('canceled');
      }}
    >
      <PopupElement.Header>
        <PopupElement.CloseButton />
        <PopupElement.Title title={options.title} />
      </PopupElement.Header>
      <PopupElement.Body>
        <div class={styles.body}>
          <div class={styles.text}>{i18n(options.text)}</div>
          <form
            class={styles.fields}
            onSubmit={(e) => e.preventDefault()}
            // * Enter in any of the fields acts, as in a form with one field
            onKeyDown={(e) => {
              if(e.key !== 'Enter' || e.isComposing) return;
              e.preventDefault();
              submit();
            }}
          >
            <For each={options.fields}>{(label, index) => (
              <InputFieldTsx
                InputFieldClass={PasswordInputField}
                instanceRef={(value) => fields[index()] = value}
                label={label}
                onRawInput={() => fields[index()].setState(InputState.Neutral)}
              />
            )}</For>
          </form>
          {options.footer?.(close)}
        </div>
      </PopupElement.Body>
      <PopupElement.Footer>
        <PopupElement.FooterButton langKey={options.button} color={options.danger ? 'danger' : undefined} callback={submit} />
      </PopupElement.Footer>
    </PopupElement>
  ));

  queueMicrotask(() => setShow(true));
  return deferred;
}

/** a field that is wrong: its error, and a shake (iOS) */
function refuse(field: PasswordInputField, label: LangPackKey, args?: any[]) {
  field.setState(InputState.Error, label, args);
  shake(field.container);
  return false;
}

/** a new passcode and its repeat: long enough, and the same */
function checkNewPasscode(passcode: PasswordInputField, repeat: PasswordInputField) {
  if(passcode.value.length < MIN_PASSCODE_LENGTH) {
    return refuse(passcode, 'Wallet.Vault.PasscodeShort');
  }

  if(passcode.value !== repeat.value) {
    return refuse(repeat, 'Wallet.Vault.PasscodeMismatch');
  }

  return true;
}

export function showWalletVaultCreatePopup(vault: WalletVault): Promise<void> {
  const skip = async(close: () => void) => {
    try {
      await confirmationPopup({
        titleLangKey: 'Wallet.Vault.SkipPasscode',
        descriptionLangKey: 'Wallet.Vault.SkipWarning',
        button: {langKey: 'Wallet.Continue', isDanger: true}
      });
    } catch(err) {
      return;
    }

    await vault.create({kind: 'device'}).catch((err) => {
      // * another tab made the vault meanwhile: it is unlocked the usual way
      if(!(err instanceof WalletVaultExistsError)) throw err;
    });
    created.resolve();
    close();
  };

  // * skipping the passcode is a way to done as well
  const created = deferredPromise<void>();
  const popup = showPasscodePopup({
    title: 'Wallet.Vault.CreateTitle',
    text: 'Wallet.Vault.CreateText',
    fields: ['Wallet.Vault.Passcode', 'Wallet.Vault.PasscodeRepeat'],
    button: 'Wallet.Continue',
    submit: async([passcode, repeat]) => {
      if(!checkNewPasscode(passcode, repeat)) return false;
      await vault.create({kind: 'passcode', passcode: passcode.value}).catch((err) => {
        if(!(err instanceof WalletVaultExistsError)) throw err;
      });
      return true;
    },
    footer: (close) => (
      <button type="button" class={styles.link} onClick={() => skip(close)}>{i18n('Wallet.Vault.SkipPasscode')}</button>
    )
  });

  popup.then(() => created.resolve(), (err) => {
    // * closed by the skip: that one settled it already
    if(!created.isFulfilled) created.reject(err);
  });
  return created;
}

/** wrong passcodes in a row before each next try waits, and that wait: it doubles with every miss after */
const UNLOCK_FREE_TRIES = 5;
const UNLOCK_FIRST_WAIT = 30;
const UNLOCK_MAX_WAIT = 3600;

type UnlockThrottle = {fails: number, until: number};

// * kept across reloads, per account: a reload is no new try
const unlockThrottleKey = (vault: WalletVault) => 'tweb-wallet-unlock:' + vault.ownerId;

function readUnlockThrottle(vault: WalletVault): UnlockThrottle {
  try {
    const value = JSON.parse(localStorage.getItem(unlockThrottleKey(vault)));
    if(Number.isFinite(value?.fails) && Number.isFinite(value?.until)) return value;
  } catch(err) {}
  return {fails: 0, until: 0};
}

function writeUnlockThrottle(vault: WalletVault, value: UnlockThrottle) {
  try {
    if(value.fails) localStorage.setItem(unlockThrottleKey(vault), JSON.stringify(value));
    else localStorage.removeItem(unlockThrottleKey(vault));
  } catch(err) {}
}

/**
 * A try of the passcode in `field`: `attempt` answers whether it was right. Misses in a row are counted for the
 * account, and after a few each next try waits, longer every time.
 */
async function tryPasscode(vault: WalletVault, field: PasswordInputField, attempt: () => Promise<boolean>) {
  const throttle = readUnlockThrottle(vault);
  const wait = Math.ceil((throttle.until - Date.now()) / 1000);
  if(wait > 0) {
    return refuse(field, 'Wallet.Vault.TryLater', [wrapFormattedDuration(formatDuration(wait, 1), true)]);
  }

  if(await attempt()) {
    writeUnlockThrottle(vault, {fails: 0, until: 0});
    return true;
  }

  const fails = throttle.fails + 1;
  const extra = fails - UNLOCK_FREE_TRIES;
  writeUnlockThrottle(vault, {
    fails,
    until: extra >= 0 ? Date.now() + Math.min(UNLOCK_MAX_WAIT, UNLOCK_FIRST_WAIT * 2 ** extra) * 1000 : 0
  });
  return refuse(field, 'Wallet.Vault.Wrong');
}

export function showWalletVaultUnlockPopup(vault: WalletVault): Promise<void> {
  const [forgot, setForgot] = createSignal(false);
  const onForgot = async(close: () => void) => {
    const wallet = bindManagersToSession(rootScope.managers).appWalletManager;
    // * every key on this device goes: what that destroys is said, as the logout confirmation says it
    let description: DocumentFragment;
    try {
      const {readWalletLoss, describeWalletLoss} = await import('@lib/wallet/logoutLoss');
      description = describeWalletLoss('Wallet.Vault.ForgotText', await readWalletLoss(vault.ownerId, () => wallet.getCachedStatus()));
    } catch(err) {}

    try {
      await confirmationPopup({
        titleLangKey: 'Wallet.Vault.Forgot',
        descriptionLangKey: description ? undefined : 'Wallet.Vault.ForgotText',
        description,
        button: {langKey: 'Wallet.Keys.Forget', isDanger: true}
      });
    } catch(err) {
      return;
    }

    await vault.wipe();
    writeUnlockThrottle(vault, {fails: 0, until: 0});
    close();
  };

  return showPasscodePopup({
    title: 'Wallet.Vault.UnlockTitle',
    text: 'Wallet.Vault.UnlockText',
    fields: ['Wallet.Vault.Passcode'],
    button: 'Wallet.Vault.Unlock',
    submit: async([passcode]) => {
      if(await tryPasscode(vault, passcode, () => vault.unlock(passcode.value))) return true;
      setForgot(true);
      return false;
    },
    footer: (close) => forgot() && (
      <button type="button" class={styles.link} onClick={() => onForgot(close)}>{i18n('Wallet.Vault.Forgot')}</button>
    )
  });
}

/**
 * The passcode the key on this device is protected with, from the wallet's menu (iOS: "Passcode & Face ID"):
 * another one, or none — after the current one, every time
 */
export function showWalletPasscodeSettings(vault: WalletVault) {
  const change = () => showPasscodePopup({
    title: 'Wallet.Vault.Change',
    text: 'Wallet.Vault.ChangeText',
    fields: ['Wallet.Vault.Current', 'Wallet.Vault.New', 'Wallet.Vault.PasscodeRepeat'],
    button: 'Wallet.Continue',
    submit: async([current, passcode, repeat]) => {
      if(!checkNewPasscode(passcode, repeat)) return false;
      return tryPasscode(vault, current, () => vault.changePasscode(current.value, passcode.value));
    }
  }).then(() => toastNew({langPackKey: 'PasscodeLock.PasscodeHasBeenChanged'}), () => {});

  const turnOff = () => showPasscodePopup({
    title: 'PasscodeLock.TurnOff.Title',
    text: 'Wallet.Vault.TurnOffText',
    fields: ['Wallet.Vault.Current'],
    button: 'PasscodeLock.TurnOff',
    danger: true,
    submit: ([current]) => tryPasscode(vault, current, () => vault.changePasscode(current.value))
  }).then(() => toastNew({langPackKey: 'PasscodeLock.PasscodeHasBeenDisabled'}), () => {});

  // * a key kept without one gets a passcode later, as iOS and Android allow
  const set = () => showPasscodePopup({
    title: 'Wallet.Vault.Set',
    text: 'Wallet.Vault.SetText',
    fields: ['Wallet.Vault.New', 'Wallet.Vault.PasscodeRepeat'],
    button: 'Wallet.Continue',
    submit: async([passcode, repeat]) => {
      if(!checkNewPasscode(passcode, repeat)) return false;
      return vault.addPasscode(passcode.value);
    }
  }).then(() => toastNew({langPackKey: 'PasscodeLock.PasscodeHasBeenSet'}), () => {});

  return vault.getKind().then((kind) => kind === 'device' ? showWalletAlert({title: 'Wallet.Menu.Passcode', text: 'Wallet.Vault.NoPasscodeText'}, {
    actions: [{langKey: 'Wallet.Vault.Set', callback: () => void set()}]
  }) : showWalletAlert({title: 'Wallet.Menu.Passcode', text: 'Wallet.Vault.SettingsText'}, {
    actions: [
      {langKey: 'Wallet.Vault.Change', callback: () => void change()},
      {langKey: 'PasscodeLock.TurnOff.Title', isDanger: true, callback: () => void turnOff()}
    ]
  }));
}

export default function createWalletSessionUi(): WalletSessionUi {
  return {
    createVault: showWalletVaultCreatePopup,
    unlockVault: (vault) => showWalletVaultUnlockPopup(vault)
  };
}
