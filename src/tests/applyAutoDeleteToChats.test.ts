import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import applyAutoDeleteToChats from '@components/applyAutoDeleteToChats';
import {REPLIES_PEER_ID, SERVICE_PEER_ID} from '@appManagers/constants';

const mocks = vi.hoisted(() => ({
  showPickUserPopup: vi.fn(),
  toast: vi.fn()
}));

vi.mock('@components/popups/pickUser', () => ({default: mocks.showPickUserPopup}));
vi.mock('@components/toast', () => ({toast: mocks.toast}));
// * a string as its key, with what it is given inside
vi.mock('@lib/langPack', async(importOriginal) => ({
  ...await importOriginal<typeof import('@lib/langPack')>(),
  i18n: (key: string, args: any[] = []) => {
    const span = document.createElement('span');
    span.dataset.key = key;
    span.append(...args.map((arg) => arg instanceof Node ? arg : '' + arg));
    return span;
  }
}));

const ONE_WEEK = 7 * 86400;

function open(period: number, setAutoDeletePeriodFor = vi.fn().mockResolvedValue(undefined)) {
  applyAutoDeleteToChats({appPrivacyManager: {setAutoDeletePeriodFor}} as any, period);
  const options = mocks.showPickUserPopup.mock.calls[0][0];
  return {options, setAutoDeletePeriodFor};
}

/** The toast once the answers are in: its strings, and the count of chats in the one saying they were set */
async function toasted() {
  await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledOnce());
  const content: DocumentFragment = mocks.toast.mock.calls[0][0];
  const keys = [...content.childNodes].filter((node): node is HTMLElement => node instanceof HTMLElement).map((node) => node.dataset.key);
  const chats = content.querySelector<HTMLElement>('[data-key="Chats"]')?.textContent;
  return {keys, chats};
}

const peers = [(10 as UserId).toPeerId(false), (20 as ChatId).toPeerId(true)];

afterEach(() => {
  vi.clearAllMocks();
});

describe('apply the default auto-delete period to existing chats', () => {
  it('offers only the chats a timer can be set in', () => {
    const {options} = open(ONE_WEEK);

    expect(options).toMatchObject({
      peerType: ['dialogs'],
      multiSelect: true,
      exceptSelf: true,
      excludeMonoforums: true,
      chatRightsActions: ['change_info'],
      footerButtonProps: {langKey: 'Apply'}
    });
    expect(options.excludePeerIds.has(REPLIES_PEER_ID)).toBe(true);
    expect(options.excludePeerIds.has(SERVICE_PEER_ID)).toBe(true);
  });

  it('sets the period in every chat picked and says how many, once the server has taken them', async() => {
    let answer: () => void;
    const {options, setAutoDeletePeriodFor} = open(ONE_WEEK, vi.fn()
    .mockReturnValueOnce(new Promise<void>((resolve) => answer = resolve))
    .mockResolvedValueOnce(undefined));
    // * the picker is not held open by the answers
    expect(options.onSelect(peers.map((peerId) => ({peerId, key: '' + peerId})))).toBeUndefined();

    // * all at once, each on its own
    expect(setAutoDeletePeriodFor.mock.calls).toEqual(peers.map((peerId) => [peerId, ONE_WEEK]));
    await Promise.resolve();
    expect(mocks.toast).not.toHaveBeenCalled();
    answer();

    await expect(toasted()).resolves.toEqual({keys: ['AutodeleteTimerEnabledForChats'], chats: '2'});
  });

  it('turns the timer off in them when the default is off', async() => {
    const {options, setAutoDeletePeriodFor} = open(0);
    options.onSelect([{peerId: peers[0], key: '' + peers[0]}]);

    expect(setAutoDeletePeriodFor).toHaveBeenCalledExactlyOnceWith(peers[0], 0);
    await expect(toasted()).resolves.toEqual({keys: ['AutodeleteTimerDisabledForChats'], chats: '1'});
  });

  it('counts only the chats the server took, and says the rest failed', async() => {
    const {options} = open(ONE_WEEK, vi.fn()
    .mockRejectedValueOnce({type: 'CHAT_ADMIN_REQUIRED'})
    .mockResolvedValueOnce(undefined));
    options.onSelect(peers.map((peerId) => ({peerId, key: '' + peerId})));

    await expect(toasted()).resolves.toEqual({keys: ['AutodeleteTimerEnabledForChats', 'Error.AnError'], chats: '1'});
  });

  it('claims nothing was set when every chat refused', async() => {
    const {options} = open(ONE_WEEK, vi.fn().mockRejectedValue({type: 'CHAT_ADMIN_REQUIRED'}));
    options.onSelect(peers.map((peerId) => ({peerId, key: '' + peerId})));

    await expect(toasted()).resolves.toEqual({keys: ['Error.AnError'], chats: undefined});
  });

  it('does nothing when nothing is picked', async() => {
    const {options, setAutoDeletePeriodFor} = open(ONE_WEEK);
    options.onSelect([]);
    await Promise.resolve();

    expect(setAutoDeletePeriodFor).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
