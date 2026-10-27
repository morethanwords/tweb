import {describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
  }

  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
  // `webpSupport` probes a canvas at import time and jsdom returns null for toDataURL
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,');
});

vi.mock('@components/wrappers/getPeerTitle', () => ({default: vi.fn(async() => 'Name')}));
vi.mock('@components/generateTitleIcons', () => ({default: vi.fn(async() => undefined)}));
vi.mock('@components/wrappers/messageActionTextNewUnsafe', () => ({wrapTopicIcon: vi.fn()}));
vi.mock('@lib/lottie/lottieLoader', () => ({default: {getAnimation: vi.fn()}}));
// the real one starts the crypto worker on import
vi.mock('@lib/apiManagerProxy', () => ({default: {}}));

import PeerTitle from '@components/peerTitle';
import wrapPeerTitle from '@components/wrappers/peerTitle';
import {HIDDEN_PEER_ID, NULL_PEER_ID} from '@appManagers/constants';

// A name that opens its peer (a sender's in a message) is a link to it, as a mention is: the
// press plate, a screen reader and a new tab all take it for one, while the click stays the
// app's (onBubblesClick opens the peer — on mousedown on a touch device, before the click).
describe('PeerTitle link', () => {
  it('is an <a> to the peer that a plain click does not follow', async() => {
    const peerTitle = new PeerTitle({peerId: 123 as PeerId, link: true});
    await peerTitle.ready;
    const element = peerTitle.element as HTMLAnchorElement;

    expect(element.tagName).toBe('A');
    expect(element.classList.contains('peer-title')).toBe(true);
    expect(element.getAttribute('href')).toBe('#123');
    expect(element.textContent).toBe('Name');
    // a stop of its own only for the keyboard layer (off here), and never dragged off as a link
    expect(element.tabIndex).toBe(-1);
    expect(element.draggable).toBe(false);

    // a listener after the name's own sees what it did to the click, and keeps jsdom from navigating
    const seen: boolean[] = [];
    element.addEventListener('click', (e) => {
      seen.push(e.defaultPrevented);
      e.preventDefault();
    });
    element.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    // what the href is there for: a new tab
    element.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, ctrlKey: true}));
    element.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, metaKey: true}));
    // and nothing else: Shift would open a window, Alt download the page
    element.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, shiftKey: true}));
    element.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, altKey: true}));
    expect(seen).toEqual([true, false, false, true, true]);
  });

  it('follows its peer, and is no link to nobody or to a hidden account', async() => {
    const peerTitle = new PeerTitle({peerId: 123 as PeerId, link: true});
    await peerTitle.ready;
    await peerTitle.update({peerId: 456 as PeerId});
    expect(peerTitle.element.getAttribute('href')).toBe('#456');
    await peerTitle.update({peerId: NULL_PEER_ID});
    expect(peerTitle.element.hasAttribute('href')).toBe(false);
    await peerTitle.update({peerId: 456 as PeerId});
    await peerTitle.update({peerId: HIDDEN_PEER_ID});
    expect(peerTitle.element.hasAttribute('href')).toBe(false);
  });

  it('stays a span without it, and wrapPeerTitle waits for the text either way', async() => {
    const span = await wrapPeerTitle({peerId: 123 as PeerId});
    expect(span.tagName).toBe('SPAN');
    expect(span.hasAttribute('href')).toBe(false);
    expect(span.textContent).toBe('Name');

    const link = await wrapPeerTitle({peerId: 123 as PeerId, link: true});
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('#123');
    expect(link.textContent).toBe('Name');
  });
});
