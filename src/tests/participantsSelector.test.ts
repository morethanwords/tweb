import {describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  callFirstRender: true,
  hasOwner: false
}));

vi.mock('@components/appSelectPeers', async() => {
  const {getOwner} = await import('solid-js');

  return {
    default: class {
      constructor(options: {onFirstRender: () => void}) {
        mocks.hasOwner = !!getOwner();
        if(mocks.callFirstRender) {
          options.onFirstRender();
        }
      }
    }
  };
});

import {createSelectorForTab} from '@components/sidebarRight/tabs/participantsSelector';

describe('participants selector', () => {
  it('owns computations created by the selector', async() => {
    mocks.callFirstRender = true;
    let cleanup: VoidFunction;
    const result = createSelectorForTab({
      appendTo: document.body,
      managers: {},
      middleware: {
        onClean: (callback: VoidFunction) => cleanup = callback
      }
    } as any);

    await result.loadPromise;

    expect(mocks.hasOwner).toBe(true);
    expect(cleanup).toBeTypeOf('function');
    cleanup();
  });

  it('settles loading when its middleware is cleaned before first render', async() => {
    mocks.callFirstRender = false;
    let cleanup: VoidFunction;
    const result = createSelectorForTab({
      appendTo: document.body,
      managers: {},
      middleware: {
        onClean: (callback: VoidFunction) => cleanup = callback
      }
    } as any);

    cleanup();

    await expect(result.loadPromise).resolves.toBeUndefined();
  });
});
