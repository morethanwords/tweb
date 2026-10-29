// * the flags Settings → Experimental keeps on for the site: what is stored, what Modes makes of it as the page
// * starts, and what reaches the workers (which have no localStorage of their own)

const STORAGE_KEY = 'experimental_flags';

async function loadFresh() {
  vi.resetModules();
  const flags = await import('@config/modes');
  return {
    flags,
    modes: flags.default,
    workerProxy: await import('@helpers/setWorkerProxy')
  };
}

describe('experimental flags', () => {
  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  test('keeps only the flags it knows, in its own order, and forgets the key when none is left', async() => {
    const {flags} = await loadFresh();
    expect(flags.getKeptFlags().size).toBe(0);

    flags.setKeptFlags(new Set(['noPfs', 'debug']));
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toEqual(['debug', 'noPfs']);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(['a11y', 'whatever', 1]));
    expect([...flags.getKeptFlags()]).toEqual(['a11y']);

    flags.setKeptFlag('a11y', false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('a stored value that is not a list counts as nothing', async() => {
    localStorage.setItem(STORAGE_KEY, '{"debug": true}');
    const {flags, modes} = await loadFresh();
    expect(flags.getKeptFlags().size).toBe(0);
    expect(modes.debug).toBe(false);
  });

  test('Modes starts with the kept flags, as it does with the URL\'s', async() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['debug', 'logs', 'noPfs', 'a11y', 'noMultipleTransports']));
    const {modes} = await loadFresh();
    expect(modes.debug).toBe(true);
    expect(modes.logs).toBe(true);
    expect(modes.pfs).toBe(false);
    expect(modes.a11y).toBe(true);
    expect(modes.multipleTransports).toBe(false);
    // * the test servers are the URL's alone
    expect(modes.test).toBe(false);
  });

  test('a change made after the start waits for the next one', async() => {
    const {flags, modes} = await loadFresh();
    flags.setKeptFlag('debug', true);
    expect(modes.debug).toBe(false);
    expect(flags.LOADED_KEPT_FLAGS.has('debug')).toBe(false);
  });

  test('a flag switched off leaves the URL, and the rest of it stays', async() => {
    const {flags} = await loadFresh();
    const initial = location.href;
    history.replaceState(null, '', '/k/?noPfs=1&debug=1&account=2#@durov');
    try {
      expect(flags.getURLWithoutFlags(['rtl'])).toBeUndefined();
      const url = flags.getURLWithoutFlags(['noPfs', 'rtl']);
      expect(url.searchParams.has('noPfs')).toBe(false);
      expect(url.searchParams.get('debug')).toBe('1');
      expect(url.searchParams.get('account')).toBe('2');
      expect(url.hash).toBe('#@durov');
    } finally {
      history.replaceState(null, '', initial);
    }
  });

  test('a worker gets the kept flags in its URL, but not the ones only the page reads', async() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(['debug', 'logs', 'rtl', 'noObjectUrlRevoke']));
    const {workerProxy} = await loadFresh();
    const url = workerProxy.makeWorkerURL('https://web.telegram.org/k/worker.js');
    expect(url.searchParams.get('debug')).toBe('1');
    expect(url.searchParams.get('noObjectUrlRevoke')).toBe('1');
    expect(url.searchParams.has('logs')).toBe(false);
    expect(url.searchParams.has('rtl')).toBe(false);
  });

  test('nor the page\'s own URL flags that only the page reads, while its own ?logs=1 goes on', async() => {
    const initial = location.href;
    history.replaceState(null, '', '/k/?rtl=1&memoryWatch=1&logs=1&noPfs=1');
    try {
      const {workerProxy} = await loadFresh();
      const url = workerProxy.makeWorkerURL('https://web.telegram.org/k/worker.js');
      expect(url.searchParams.get('noPfs')).toBe('1');
      // * a worker of its own, collecting from its start: a tab without the flag never turns it off
      expect(url.searchParams.get('logs')).toBe('1');
      expect(['rtl', 'memoryWatch'].filter((flag) => url.searchParams.has(flag))).toEqual([]);
    } finally {
      history.replaceState(null, '', initial);
    }
  });
});
