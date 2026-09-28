import {batch, createRoot, onCleanup} from 'solid-js';
import useDynamicCachedValue from '@helpers/solid/useDynamicCachedValue';

// A read from a root of its own, outside any running update — how a store is first used from
// module scope or a static field (`useStars()` in `PaidMessagesInterceptor` did exactly that).
function readDetached<T>(key: string, factory: () => T) {
  return createRoot((dispose) => ({value: useDynamicCachedValue(() => key, factory)(), dispose}));
}

/** A factory that sets something up, then throws until `ready` — a store read before the managers. */
function createFlakyFactory() {
  const state = {ready: false, cleanup: vi.fn()};
  const factory = vi.fn(() => {
    onCleanup(state.cleanup);
    if(!state.ready) throw new Error('managers are not there yet');
    return 'balance';
  });

  return {state, factory};
}

describe('useDynamicCachedValue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('callers of one key share the value the factory built once', () => {
    const factory = vi.fn(() => ({}));
    const first = readDetached('shared', factory);
    const second = readDetached('shared', factory);

    expect(second.value).toBe(first.value);
    expect(factory).toHaveBeenCalledTimes(1);

    first.dispose();
    second.dispose();
  });

  test('a factory that threw is not kept for the next caller', () => {
    // Solid reports the throw itself ("solid error") rather than letting it propagate
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {});
    const {state, factory} = createFlakyFactory();

    const early = readDetached('fails-first', factory);
    expect(early.value).toBeUndefined();
    expect(reported).toHaveBeenCalled();
    expect(state.cleanup).toHaveBeenCalledTimes(1);

    // with the failure cached, every later caller got `undefined` for the rest of the session —
    // the stars popups then threw "stars is not a function"
    state.ready = true;
    const late = readDetached('fails-first', factory);
    expect(late.value).toBe('balance');
    expect(factory).toHaveBeenCalledTimes(2);

    early.dispose();
    late.dispose();
  });

  test('a factory that threw inside a running update leaves nothing behind', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const {state, factory} = createFlakyFactory();

    // inside an update `createRoot` rethrows instead of reporting, so the half-built root has to be
    // disposed on the way out rather than after it returns
    const early = batch(() => readDetached('fails-in-update', factory));
    expect(early.value).toBeUndefined();
    expect(state.cleanup).toHaveBeenCalledTimes(1);

    state.ready = true;
    const late = readDetached('fails-in-update', factory);
    expect(late.value).toBe('balance');

    early.dispose();
    late.dispose();
  });
});
