/*
 * The wallet's passcode prompts stand over an action that waits for them: making the vault, unlocking it. A prompt
 * left while its passcode is still being checked counts as left the moment it starts closing — a check that ends
 * while the popup fades out does not let the waiting action go on. Nothing here talks to a server.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

type FakePopup = {dismiss: () => void};

const fake = vi.hoisted(() => ({
  popups: [] as FakePopup[],
  disposers: [] as Array<() => void>
}));

vi.mock('@lib/rootScope', () => ({default: {managers: {}, addEventListener: () => {}, removeEventListener: () => {}}}));
vi.mock('@components/confirmationPopup', () => ({default: async() => {}}));
vi.mock('@components/toast', () => ({toastNew: () => {}}));
vi.mock('@components/wallet/alerts', () => ({showWalletAlert: () => {}}));
vi.mock('@helpers/dom/shake', () => ({default: () => {}}));
vi.mock('@lib/wallet/vault', () => ({WalletVaultExistsError: class extends Error {}}));
vi.mock('@components/passwordInputField', () => ({default: class {}}));
vi.mock('@components/inputField', () => ({InputState: {Neutral: 0, Error: 2}}));
// * every field holds the same passcode, long enough
vi.mock('@components/inputFieldTsx', () => ({
  InputFieldTsx: (props: any) => {
    props.instanceRef({value: '1234', setState: () => {}, container: document.createElement('div')});
    return <input />;
  }
}));
// * like the real one: closing calls `onClose` at once and `onCloseAfterTimeout` once the popup has faded out
vi.mock('@components/popups/indexTsx', async() => {
  const {createEffect, on} = await import('solid-js');
  const {render} = await import('solid-js/web');
  const PopupElement = (props: any) => {
    let destroyed = false;
    const destroy = () => {
      if(destroyed) return;
      destroyed = true;
      props.onClose?.();
      setTimeout(() => props.onCloseAfterTimeout?.(), 250);
    };

    createEffect(on(() => props.show, (show, wasShown) => {
      if(!show && wasShown) destroy();
    }));
    fake.popups.push({dismiss: destroy});
    return <div>{props.children}</div>;
  };

  const Part = (props: any) => <div>{props.children}</div>;
  PopupElement.Header = PopupElement.Body = PopupElement.Footer = Part;
  PopupElement.CloseButton = PopupElement.Title = (): any => null;
  PopupElement.FooterButton = (props: any) => <button data-testid="submit" onClick={() => props.callback()} />;
  return {
    default: PopupElement,
    createPopup: (factory: () => any) => {
      const container = document.createElement('div');
      document.body.append(container);
      fake.disposers.push(render(factory, container));
    }
  };
});

import {showWalletVaultCreatePopup, showWalletVaultUnlockPopup} from '@components/wallet/vaultPrompts';
import type WalletVault from '@lib/wallet/vault';

/** a vault whose passcode check takes as long as the test says */
function slowVault() {
  let finish: (value?: boolean) => void;
  const check = () => new Promise<boolean>((resolve) => finish = (value = true) => resolve(value));
  const vault = {ownerId: 1, unlock: vi.fn(check), create: vi.fn(check)} as any as WalletVault;
  return {vault, finish: (value?: boolean) => finish(value)};
}

/** what the prompt's promise came to, once it did */
function outcome(promise: Promise<void>) {
  const result: {value?: 'done' | 'left'} = {};
  promise.then(() => result.value = 'done', () => result.value = 'left');
  return result;
}

const submit = () => document.querySelector<HTMLButtonElement>('[data-testid="submit"]').click();

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  fake.disposers.forEach((dispose) => dispose());
  fake.disposers.length = 0;
  fake.popups.length = 0;
  document.body.replaceChildren();
  localStorage.clear();
  vi.useRealTimers();
});

describe('a passcode prompt left while its passcode is checked', () => {
  it('does not unlock for the action waiting on it', async() => {
    const {vault, finish} = slowVault();
    const result = outcome(showWalletVaultUnlockPopup(vault));
    await vi.advanceTimersByTimeAsync(0);
    submit();
    expect(vault.unlock).toHaveBeenCalledTimes(1);

    fake.popups[0].dismiss();
    finish();
    await vi.advanceTimersByTimeAsync(300);
    expect(result.value).toBe('left');
  });

  it('does not make the vault for the action waiting on it', async() => {
    const {vault, finish} = slowVault();
    const result = outcome(showWalletVaultCreatePopup(vault));
    await vi.advanceTimersByTimeAsync(0);
    submit();
    expect(vault.create).toHaveBeenCalledTimes(1);

    fake.popups[0].dismiss();
    finish();
    await vi.advanceTimersByTimeAsync(300);
    expect(result.value).toBe('left');
  });

  it('lets the action go on when the passcode was right before it was left', async() => {
    const {vault, finish} = slowVault();
    const result = outcome(showWalletVaultUnlockPopup(vault));
    await vi.advanceTimersByTimeAsync(0);
    submit();
    finish();
    await vi.advanceTimersByTimeAsync(300);
    expect(result.value).toBe('done');
  });
});
