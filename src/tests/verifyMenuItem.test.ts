import {describe, expect, it, vi} from 'vitest';
import verifyMenuItem from '@helpers/verifyMenuItem';

// the module pulls the whole menu machinery in, none of which the filter touches
vi.mock('@helpers/contextMenuController', () => ({default: {}}));
vi.mock('@components/buttonIcon', () => ({default: () => document.createElement('div')}));
vi.mock('@components/buttonMenu', () => ({default: () => document.createElement('div')}));

import {filterButtonMenuItems} from '@components/buttonMenuToggle';

const item = (text: string, verify?: () => MaybePromise<boolean>) => ({
  icon: 'edit' as const,
  text: text as any,
  onClick: () => {},
  verify
});

describe('verifyMenuItem', () => {
  it('keeps an item with no check, and one whose check passes', async() => {
    expect(await verifyMenuItem(item('a'))).toBe(true);
    expect(await verifyMenuItem(item('b', () => true))).toBe(true);
    expect(await verifyMenuItem(item('c', () => Promise.resolve(true)))).toBe(true);
  });

  it('leaves out an item whose check fails, throws or is refused', async() => {
    expect(await verifyMenuItem(item('a', () => false))).toBe(false);
    expect(await verifyMenuItem(item('b', () => {
      throw new Error('sync');
    }))).toBe(false);
    expect(await verifyMenuItem(item('c', () => Promise.reject({type: 'FLOOD_WAIT_100'})))).toBe(false);
  });

  it('a flow the tab has left still stops the menu', async() => {
    const dropped = {type: 'MIDDLEWARE'};
    await expect(verifyMenuItem(item('a', () => Promise.reject(dropped)))).rejects.toBe(dropped);
    await expect(filterButtonMenuItems([item('a'), item('b', () => Promise.reject(dropped))])).rejects.toBe(dropped);
  });

  it('a refused check takes out its own item, not the menu', async() => {
    const items = [
      item('first', () => true),
      item('refused', () => Promise.reject({type: 'FLOOD_WAIT_100'})),
      item('last')
    ];

    expect((await filterButtonMenuItems(items)).map((item) => item.text)).toEqual(['first', 'last']);
  });
});
