import {afterEach, describe, expect, test} from 'vitest';
import focusSearchInput from '@components/chat/focusSearchInput';

describe('focusSearchInput', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  test('focuses an already mounted search input', () => {
    const container = document.createElement('div');
    const input = document.createElement('input');
    input.className = 'topbar-search-input';
    container.append(input);
    document.body.append(container);

    focusSearchInput(container);

    expect(document.activeElement).toBe(input);
  });

  test('focuses the input after the search is mounted', async() => {
    const container = document.createElement('div');
    document.body.append(container);

    focusSearchInput(container);

    const input = document.createElement('input');
    input.className = 'topbar-search-input';
    container.append(input);
    await Promise.resolve();

    expect(document.activeElement).toBe(input);
  });
});
