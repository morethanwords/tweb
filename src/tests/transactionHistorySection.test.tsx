import {render} from 'solid-js/web';
import {createSignal} from 'solid-js';
import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({createPopup: vi.fn()}));
vi.mock('@components/popups', () => ({default: {createPopup: mocks.createPopup}}));
vi.mock('@components/popups/stars', () => ({default: class PopupStars {}}));
vi.mock('@helpers/dom/createContextMenu', () => ({default: vi.fn()}));
vi.mock('@lib/langPack', () => ({i18n: (key: string) => document.createTextNode(key)}));

import TransactionHistorySection, {showPeerTransactionHistory} from '@components/stars/transactionHistory';

let dispose: () => void;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('owner transaction history access', () => {
  it('only displays the currencies allowed by the current owner permissions', () => {
    const [stars, setStars] = createSignal(false);
    const [ton, setTon] = createSignal(false);
    const mount = document.createElement('div');
    document.body.append(mount);
    dispose = render(() => <TransactionHistorySection peerId={(20 as ChatId).toPeerId(true)} stars={stars()} ton={ton()} />, mount);
    expect(mount.textContent).toBe('');
    setStars(true);
    expect(mount.textContent).toContain('TelegramStars');
    expect(mount.textContent).not.toContain('GramBalance');
    setTon(true);
    expect(mount.textContent).toContain('GramBalance');
    setStars(false);
    expect(mount.textContent).not.toContain('TelegramStars');
    setTon(false);
    expect(mount.textContent).toBe('');
  });

  it('passes the selected owner and currency to the history popup', async() => {
    const owner = (20 as ChatId).toPeerId(true);
    await showPeerTransactionHistory(owner, true);
    expect(mocks.createPopup).toHaveBeenLastCalledWith(expect.any(Function), {historyPeerId: owner, ton: true});
    await showPeerTransactionHistory(owner);
    expect(mocks.createPopup).toHaveBeenLastCalledWith(expect.any(Function), {historyPeerId: owner, ton: false});
  });
});
