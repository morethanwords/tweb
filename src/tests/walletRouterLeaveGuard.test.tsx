/*
 * The wallet window's screens may guard their leaving (turning the backup off asks before its write-down or quiz
 * goes): back, Escape and closing the window ask the screen first, a yes leaves, a no stays — and while one
 * question is up, no second one opens.
 */

import {render} from 'solid-js/web';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {NavigationItem} from '@components/appNavigationController';

const navigation = vi.hoisted(() => ({items: [] as NavigationItem[]}));

vi.mock('@components/appNavigationController', () => ({
  default: {
    pushItem: (item: NavigationItem) => navigation.items.push(item),
    removeItem: (item: NavigationItem) => {
      const index = navigation.items.indexOf(item);
      if(index !== -1) navigation.items.splice(index, 1);
    }
  }
}));
// * no slides: a screen goes at once
vi.mock('@helpers/liteMode', () => ({default: {isAvailable: () => false}}));

import {createWalletRouter, WalletLeaveGuard, WalletRouter} from '@components/wallet/router';

type Name = 'main' | 'keys' | 'phrase';

let dispose: () => void;

function mount(guards: Partial<Record<Name, WalletLeaveGuard>>) {
  const container = document.createElement('div');
  document.body.append(container);
  let router: WalletRouter<Name>;
  dispose = render(() => {
    router = createWalletRouter<Name>('main');
    return (
      <router.Screens>
        {(entry) => {
          const guard = guards[entry.name as Name];
          if(guard) router.guardLeave(guard);
          return <span>{entry.name}</span>;
        }}
      </router.Screens>
    );
  }, container);
  return router;
}

/** the question a guard asks: answered from the test */
function question() {
  let answer: (yes: boolean) => void;
  const promise = new Promise<void>((resolve, reject) => answer = (yes) => yes ? resolve() : reject());
  return {promise, answer: (yes: boolean) => answer(yes)};
}

async function open(router: WalletRouter<Name>, ...names: Name[]) {
  for(const name of names) {
    router.push(name, {});
    await Promise.resolve();
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

afterEach(() => {
  dispose?.();
  dispose = undefined;
  navigation.items.length = 0;
  document.body.replaceChildren();
});

describe('wallet screens that guard their leaving', () => {
  it('leave on a yes and stay on a no to the back button', async() => {
    const asked = question();
    const guard = vi.fn(() => asked.promise);
    const router = mount({phrase: guard});
    await open(router, 'keys', 'phrase');

    expect(router.pop()).toBe(false);
    expect(guard).toHaveBeenCalledOnce();
    expect(router.current().name).toBe('phrase');

    asked.answer(false);
    await settle();
    expect(router.current().name).toBe('phrase');

    const again = question();
    guard.mockImplementation(() => again.promise);
    router.pop();
    again.answer(true);
    await settle();
    expect(router.current().name).toBe('keys');
    expect(navigation.items).toHaveLength(1);
  });

  it('keep the navigation item while Escape waits for the answer', async() => {
    const asked = question();
    const router = mount({phrase: () => asked.promise});
    await open(router, 'keys', 'phrase');

    const item = navigation.items.pop();
    expect(item.onPop(true)).toBe(false);
    // * the controller puts back an item whose pop said no
    navigation.items.push(item);
    expect(router.current().name).toBe('phrase');

    asked.answer(true);
    await settle();
    expect(router.current().name).toBe('keys');
    expect(navigation.items).not.toContain(item);
  });

  it('go at once when the guard has nothing to ask', async() => {
    const guard = vi.fn((): void => undefined);
    const router = mount({phrase: guard});
    await open(router, 'keys', 'phrase');

    expect(router.pop()).toBeUndefined();
    expect(guard).toHaveBeenCalledOnce();
    expect(router.current().name).toBe('keys');
  });

  it('ask once while the question is up', async() => {
    const asked = question();
    const guard = vi.fn(() => asked.promise);
    const router = mount({phrase: guard});
    await open(router, 'keys', 'phrase');

    router.pop();
    expect(router.pop()).toBe(false);
    expect(await router.askClose()).toBe(false);
    expect(guard).toHaveBeenCalledOnce();

    asked.answer(true);
    await settle();
    // * one yes, one step back
    expect(router.current().name).toBe('keys');
  });

  it('ask the guarded screen before the window closes', async() => {
    const asked = question();
    const router = mount({phrase: () => asked.promise});
    await open(router, 'keys');
    expect(router.askClose()).toBeUndefined();

    await open(router, 'phrase');
    const closing = router.askClose();
    asked.answer(false);
    expect(await closing).toBe(false);
  });

  it('ask again from a screen that took the guarded one\'s place only if it guards itself', async() => {
    const asked = question();
    const guard = vi.fn(() => asked.promise);
    const router = mount({phrase: guard});
    await open(router, 'keys', 'phrase');

    router.replace('keys', {});
    await settle();
    expect(router.pop()).toBeUndefined();
    expect(guard).not.toHaveBeenCalled();
  });
});
