import {afterEach, describe, expect, test, vi} from 'vitest';

const originalUrl = location.href;

async function loadModes() {
  vi.resetModules();
  return (await import('@config/modes')).default;
}

afterEach(() => {
  history.replaceState({}, '', originalUrl);
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('non-contact link test mode', () => {
  test('accepts the query override in an authorized preview', async() => {
    vi.stubEnv('VITE_PREVIEW', 'true');
    history.replaceState({}, '', '/?forceHideNonContactLinks=1');

    expect((await loadModes()).forceHideNonContactLinks).toBe(true);
  });

  test('ignores the query override outside preview builds', async() => {
    vi.stubEnv('VITE_PREVIEW', '');
    history.replaceState({}, '', '/?forceHideNonContactLinks=1');

    expect((await loadModes()).forceHideNonContactLinks).toBe(false);
  });
});
