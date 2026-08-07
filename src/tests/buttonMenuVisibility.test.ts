import {describe, expect, it, vi} from 'vitest';

// the module pulls the whole menu machinery in, none of which the helper touches
vi.mock('@helpers/contextMenuController', () => ({default: {}}));
vi.mock('@components/buttonIcon', () => ({default: () => document.createElement('div')}));
vi.mock('@components/buttonMenu', () => ({default: () => document.createElement('div')}));

import {createButtonMenuVisibility} from '@components/buttonMenuToggle';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const button = (verify: () => MaybePromise<boolean>) => ({
  icon: 'edit' as const,
  text: 'Community.Edit' as const,
  onClick: () => {},
  verify
});

describe('createButtonMenuVisibility', () => {
  it('hides the trigger while every item fails its verify', async() => {
    const element = document.createElement('div');
    let canEdit = false;
    const update = createButtonMenuVisibility(element, [button(() => canEdit)]);

    update();
    await flush();
    expect(element.classList.contains('hide')).toBe(true);

    canEdit = true;
    update();
    await flush();
    expect(element.classList.contains('hide')).toBe(false);
  });

  it('keeps the trigger hidden while the caller asks for it', async() => {
    const element = document.createElement('div');
    let hidden = true;
    const update = createButtonMenuVisibility(
      element,
      [button(() => true)],
      () => hidden
    );

    update();
    await flush();
    expect(element.classList.contains('hide')).toBe(true);

    hidden = false;
    update();
    await flush();
    expect(element.classList.contains('hide')).toBe(false);
  });

  it('ignores a check that a newer one has already replaced', async() => {
    const element = document.createElement('div');
    let resolveFirst: (value: boolean) => void;
    let isFirst = true;
    const update = createButtonMenuVisibility(element, [button(() => {
      if(!isFirst) {
        return false;
      }

      isFirst = false;
      return new Promise<boolean>((resolve) => resolveFirst = resolve);
    })]);

    update();
    update();
    await flush();
    expect(element.classList.contains('hide')).toBe(true);

    resolveFirst(true);
    await flush();
    expect(element.classList.contains('hide')).toBe(true);
  });
});
