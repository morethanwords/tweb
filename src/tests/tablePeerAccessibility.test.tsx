/*
 * A table's peer that opens something (a transfer's counterparty, a gift's owner) is a button to assistive
 * technology, and with the keyboard layer a tab stop that Enter and Space press; a peer that opens nothing stays
 * plain text. The avatar beside the name does not say the name again.
 */

import '@/tests/helpers/a11yLayer';
import {render} from 'solid-js/web';
import {afterEach, describe, expect, test, vi} from 'vitest';

const avatars = vi.hoisted(() => [] as any[]);
vi.mock('@components/avatarNew', () => ({
  AvatarNew: (props: any) => {
    avatars.push(props);
    const element = document.createElement('div');
    element.className = 'avatar';
    return {element};
  }
}));
vi.mock('@components/peerTitleTsx', () => ({
  PeerTitleTsx: () => {
    const element = document.createElement('span');
    element.className = 'peer-title';
    element.textContent = 'Alice Anderson';
    return element;
  }
}));

import {TablePeer} from '@components/table';

let dispose: () => void;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  avatars.length = 0;
  document.body.replaceChildren();
});

const mount = (onClick?: () => void) => {
  const container = document.createElement('div');
  document.body.append(container);
  dispose = render(() => <TablePeer peerId={1 as PeerId} onClick={onClick} />, container);
  return container.firstElementChild as HTMLElement;
};

describe('TablePeer', () => {
  test('one that opens something is a button with a tab stop, pressed by Enter and Space', () => {
    const onClick = vi.fn();
    const peer = mount(onClick);
    expect(peer.getAttribute('role')).toBe('button');
    expect(peer.tabIndex).toBe(0);

    peer.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    peer.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test('one that opens nothing is no button and no tab stop', () => {
    const peer = mount();
    expect(peer.hasAttribute('role')).toBe(false);
    expect(peer.hasAttribute('tabindex')).toBe(false);
  });

  test('the avatar is hidden from assistive technology: the name beside it says who it is', () => {
    mount(() => {});
    expect(avatars[0].props).toMatchObject({'aria-hidden': 'true'});
  });
});
