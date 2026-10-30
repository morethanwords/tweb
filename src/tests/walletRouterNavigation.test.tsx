/*
 * The wallet window's screens and the app's back steps: a screen's step goes above the window's own one, even when
 * the window opens straight on that screen; nothing the router was still loading or waiting for registers a step
 * once the window closed; and a screen's late work can ask whether it is still the one on top. With the keyboard
 * layer, a screen that comes in takes the focus — unless it took it itself meanwhile.
 */

import {createSignal, JSX} from 'solid-js';
import {render} from 'solid-js/web';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {NavigationItem} from '@components/appNavigationController';
import Modes from '@config/modes';

const navigation = vi.hoisted(() => ({items: [] as NavigationItem[]}));
const lite = vi.hoisted(() => ({animations: false}));

vi.mock('@components/appNavigationController', () => ({
  default: {
    pushItem: (item: NavigationItem) => navigation.items.push(item),
    removeItem: (item: NavigationItem) => {
      const index = navigation.items.indexOf(item);
      if(index !== -1) navigation.items.splice(index, 1);
    }
  }
}));
// * no slides unless a test asks for them: a screen goes at once
vi.mock('@helpers/liteMode', () => ({default: {isAvailable: (key: string) => key === 'animations' && lite.animations}}));

import {createWalletRouter, WalletRouter} from '@components/wallet/router';

type Name = 'main' | 'keys' | 'amount';

let dispose: () => void;

/** a wallet window: `show` does what the popup does — says it shows, then pushes its own step */
function mount(options: {
  above?: {name: Name, params?: any},
  prepare?: (name: Name) => Promise<unknown> | void,
  watch?: (name: Name, isCurrent: () => boolean) => void,
  bindLeave?: (name: Name, leave: () => void) => void,
  content?: (name: Name) => JSX.Element
} = {}) {
  const [shown, setShown] = createSignal(false);
  const windowItem: NavigationItem = {type: 'popup', onPop: () => {}};
  const container = document.createElement('div');
  document.body.append(container);
  let router: WalletRouter<Name>;
  dispose = render(() => {
    router = createWalletRouter<Name>('main', options.above, options.prepare, shown);
    return (
      <router.Screens>
        {(entry) => {
          options.watch?.(entry.name as Name, router.watchCurrent());
          options.bindLeave?.(entry.name as Name, router.bindLeave());
          return options.content ? options.content(entry.name as Name) : <span>{entry.name}</span>;
        }}
      </router.Screens>
    );
  }, container);

  return {
    router,
    windowItem,
    show: () => {
      setShown(true);
      navigation.items.push(windowItem);
    },
    hide: () => setShown(false)
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

function deferred() {
  let resolve: () => void;
  const promise = new Promise<void>((_resolve) => resolve = _resolve);
  return {promise, resolve: () => resolve()};
}

afterEach(() => {
  dispose?.();
  dispose = undefined;
  navigation.items.length = 0;
  document.body.replaceChildren();
  Modes.a11y = false;
  lite.animations = false;
});

describe('wallet screens and the back steps', () => {
  it('step back from the screen the window opened on before closing the window', async() => {
    const {router, windowItem, show} = mount({above: {name: 'keys'}});
    expect(navigation.items).toHaveLength(0);

    show();
    await settle();
    expect(navigation.items[0]).toBe(windowItem);
    expect(navigation.items).toHaveLength(2);

    // * Escape takes the top step: back to the first screen, the window stays
    const item = navigation.items.pop();
    item.onPop(true);
    expect(router.current().name).toBe('main');
    expect(navigation.items).toEqual([windowItem]);
  });

  it('step back from a send link\'s screen pushed before the window showed', async() => {
    const {router, windowItem, show} = mount();
    await router.push('amount', {}, {instant: true});
    expect(router.current().name).toBe('amount');
    expect(navigation.items).toHaveLength(0);

    show();
    await settle();
    expect(navigation.items[0]).toBe(windowItem);
    expect(navigation.items).toHaveLength(2);
  });

  it('leave no step for a screen that loaded after the window closed', async() => {
    const loading = deferred();
    const {router, show, hide} = mount({prepare: (name) => name === 'keys' ? loading.promise : undefined});
    show();
    await settle();

    const pushing = router.push('keys');
    hide();
    loading.resolve();
    await pushing;
    await settle();
    expect(router.current().name).toBe('main');
    expect(navigation.items.filter((item) => item.type === 'popup')).toHaveLength(1);
  });

  it('leave no step for a screen that loaded after the router was gone', async() => {
    const loading = deferred();
    const {router, show} = mount({prepare: () => loading.promise});
    show();
    await settle();

    const pushing = router.push('keys');
    dispose();
    dispose = undefined;
    loading.resolve();
    await pushing;
    await settle();
    expect(navigation.items).toHaveLength(1);
  });

  it('take the window\'s steps away as it closes', async() => {
    const {router, windowItem, show, hide} = mount();
    show();
    await settle();
    await router.push('keys');
    expect(navigation.items).toHaveLength(2);

    hide();
    expect(navigation.items).toEqual([windowItem]);
  });

  it('keep the focus where Escape puts it under the keyboard layer', async() => {
    Modes.a11y = true;
    const {router, show} = mount();
    show();
    await settle();
    await router.push('keys');
    expect(navigation.items[1].noBlurOnPop).toBe(true);
  });

  it('focus a screen that comes in, unless it took the focus itself while it slid in', async() => {
    Modes.a11y = true;
    lite.animations = true;
    // * the cross-fade of reduced animations, without a renderer: it ends by the router's clock
    const animate = vi.fn(() => ({cancel: () => {}}));
    (HTMLElement.prototype as any).animate = animate;
    const {router, show} = mount({
      content: (name) => (
        <>
          <button>{name}: back</button>
          {/* * the amount screen focuses its field on its first frame, once it is laid out */}
          {name === 'amount' && <input ref={(input) => setTimeout(() => input.focus(), 50)} />}
        </>
      )
    });
    show();
    await settle();

    try {
      await router.push('keys');
      expect(animate).toHaveBeenCalled();
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(document.activeElement.textContent).toBe('keys: back');

      await router.push('amount');
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(document.activeElement).toBe(document.querySelector('input'));
    } finally {
      delete (HTMLElement.prototype as any).animate;
    }
  });

  it('tell a screen\'s late work whether the screen is still on top', async() => {
    const watched: Partial<Record<Name, () => boolean>> = {};
    const {router, show} = mount({watch: (name, isCurrent) => watched[name] = isCurrent});
    show();
    await settle();
    await router.push('keys');
    const keys = watched.keys;
    expect(keys()).toBe(true);
    expect(watched.main()).toBe(false);

    router.pop();
    expect(keys()).toBe(false);
    expect(watched.main()).toBe(true);

    // * the same screen opened again is another one
    await router.push('keys');
    expect(keys()).toBe(false);
    expect(watched.keys()).toBe(true);

    dispose();
    dispose = undefined;
    expect(watched.keys()).toBe(false);
  });

  it('take a screen that ends itself away with the screens it opened above it', async() => {
    const leaves: Partial<Record<Name, () => void>> = {};
    const {router, windowItem, show} = mount({bindLeave: (name, leave) => leaves[name] = leave});
    show();
    await settle();
    await router.push('keys');
    await router.push('amount');
    expect(navigation.items).toHaveLength(3);

    // * its own back step goes with it, and the one of the screen it opened
    leaves.keys();
    expect(router.stack().map((entry) => entry.name)).toEqual(['main']);
    expect(navigation.items).toEqual([windowItem]);

    // * on top, it goes as a step back does
    await router.push('keys');
    leaves.keys();
    expect(router.current().name).toBe('main');

    // * one that has gone already moves nothing, nor does the first screen
    const gone = leaves.keys;
    await router.push('amount');
    gone();
    leaves.main();
    expect(router.current().name).toBe('amount');
  });
});
