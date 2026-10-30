/*
 * One wallet window at a time: a way in while one is open closes it first — and a screen that guards its leaving
 * (the phrase being written down, its quiz) asks, as closing does. A no keeps the open window and nothing else
 * opens; a yes closes it without a second question, then the new one opens. Nothing here talks to a server.
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import type {NavigationItem} from '@components/appNavigationController';

type FakePopup = {props: any, destroyed: boolean, hide: () => void};

const fake = vi.hoisted(() => ({
  popups: [] as FakePopup[],
  /** what the main screen's guard asks, if anything */
  ask: undefined as () => Promise<unknown> | void,
  disposers: [] as Array<() => void>
}));

vi.mock('@components/appNavigationController', () => ({default: {pushItem: (_: NavigationItem) => {}, removeItem: () => {}}}));
vi.mock('@helpers/liteMode', () => ({default: {isAvailable: () => false}}));
vi.mock('@lib/apiManagerProxy', () => ({default: {getAppConfig: async() => ({})}}));
vi.mock('@lib/rootScope', () => ({default: {managers: {}}}));
vi.mock('@components/toast', () => ({toastNew: () => {}}));
vi.mock('@components/wallet/store', () => ({createWalletStore: () => ({session: {}})}));
vi.mock('@components/wallet/vaultPrompts', () => ({default: () => ({})}));
vi.mock('@components/wallet/recipient', () => ({resolveSendRequest: () => {}}));
vi.mock('@components/wallet/send', () => ({prepareWalletSendKey: () => {}, toastWalletError: () => {}}));
vi.mock('@components/wallet/parts', () => ({openWalletTransaction: () => {}}));
vi.mock('@components/wallet/screens/receive', () => ({default: (): null => null}));
vi.mock('@components/wallet/screens/recipient', () => ({default: (): null => null}));
vi.mock('@components/wallet/screens/amount', () => ({default: (): null => null}));
vi.mock('@components/wallet/screens/main', async() => {
  const {useWallet} = await import('@components/wallet/context');
  return {default: () => {
    useWallet().router.guardLeave(() => fake.ask?.());
    return <span>main</span>;
  }};
});
// * like the real one: closing asks `isConfirmationNeededOnClose` first and goes once its promise resolves
vi.mock('@components/popups/indexTsx', async() => {
  const {createContext, createSignal, useContext} = await import('solid-js');
  const {render} = await import('solid-js/web');
  const PopupContext = createContext<any>();
  const PopupElement = (props: any) => {
    const [destroyed, setDestroyed] = createSignal(false);
    const destroy = () => {
      if(destroyed()) return;
      setDestroyed(true);
      popup.destroyed = true;
      props.onClose?.();
    };
    const popup: FakePopup = {
      props,
      destroyed: false,
      hide: () => {
        const result = props.isConfirmationNeededOnClose?.();
        if(result) Promise.resolve(result).then(destroy);
        else destroy();
      }
    };
    fake.popups.push(popup);
    const context = {shown: () => !!props.show && !destroyed(), hide: popup.hide};
    return <PopupContext.Provider value={context}>{props.children}</PopupContext.Provider>;
  };

  return {
    default: PopupElement,
    usePopupContext: () => useContext(PopupContext),
    createPopup: (factory: () => any) => {
      const container = document.createElement('div');
      document.body.append(container);
      fake.disposers.push(render(factory, container));
    }
  };
});

import showWalletPopup from '@components/wallet';
import deferredPromise from '@helpers/cancellablePromise';

const settle = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => {
  fake.disposers.forEach((dispose) => dispose());
  fake.disposers.length = 0;
  fake.popups.length = 0;
  fake.ask = undefined;
  document.body.replaceChildren();
});

describe('a wallet window opened while one is open', () => {
  it('waits for the open one\'s guard, and opens on a yes only', async() => {
    await showWalletPopup();
    expect(fake.popups).toHaveLength(1);

    // * a no: the open window stays, no second one
    const first = deferredPromise<void>();
    fake.ask = () => first;
    const declined = showWalletPopup();
    await settle();
    expect(fake.popups).toHaveLength(1);
    first.reject();
    await declined;
    await settle();
    expect(fake.popups).toHaveLength(1);
    expect(fake.popups[0].destroyed).toBe(false);

    // * a yes: the open window goes, asked once, and the new one opens
    const second = deferredPromise<void>();
    const ask = vi.fn(() => second);
    fake.ask = ask;
    const accepted = showWalletPopup();
    await settle();
    expect(fake.popups).toHaveLength(1);
    second.resolve();
    await accepted;
    expect(ask).toHaveBeenCalledTimes(1);
    expect(fake.popups.map((popup) => popup.destroyed)).toEqual([true, false]);
  });

  it('replaces a window that guards nothing at once', async() => {
    await showWalletPopup();
    await showWalletPopup();
    expect(fake.popups.map((popup) => popup.destroyed)).toEqual([true, false]);
  });
});
