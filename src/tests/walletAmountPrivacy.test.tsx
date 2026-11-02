/*
 * The amount screen's comment on its way to a Telegram user, who is paid at once: a check that hangs counts as one
 * that could not be made — private, the engine looks the key up itself. When that check answers «public» after all,
 * while the send is still on its way (the amount rolling back from fiat into Grams, the key being asked for), the
 * comment is not sent public: the screen says so, and the next press sends it. Nothing here talks to a server.
 */

import {render} from 'solid-js/web';
import {afterEach, beforeEach, describe, expect, it, Mock, vi} from 'vitest';

const fake = vi.hoisted(() => ({
  check: undefined as Promise<boolean>,
  submit: undefined as Mock<(...args: any[]) => Promise<unknown>>,
  prepareKey: undefined as Mock<() => Promise<boolean>>,
  deviceMode: 'full',
  frame: undefined as (now: number) => void
}));

vi.mock('@helpers/liteMode', () => ({default: {isAvailable: () => true}}));
vi.mock('@environment/webpSupport', () => ({default: false}));
vi.mock('@lib/rootScope', () => ({default: {
  managers: {appPeersManager: {getPeerUsername: async() => 'friend'}},
  addEventListener: () => {},
  removeEventListener: () => {}
}}));
vi.mock('@components/wrappers/getPeerTitle', () => ({default: async() => 'Friend'}));
vi.mock('@components/avatarNew', () => ({AvatarNewTsx: (): any => null}));
vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => <div>{props.children}</div>;
  Row.Title = Row.CheckboxField = (props: any) => <div>{props.children}</div>;
  return {default: Row};
});
vi.mock('@components/checkboxFieldTsx', () => ({default: (): any => null}));
vi.mock('@components/popups/indexTsx', () => {
  const PopupElement = (props: any) => <div>{props.children}</div>;
  PopupElement.Footer = (props: any) => <div>{props.children}</div>;
  PopupElement.FooterButton = (props: any) => <button data-testid="send" onClick={() => props.callback()} />;
  return {default: PopupElement};
});
vi.mock('@components/wallet/parts', () => ({
  copyWalletAddress: () => {},
  WalletHeader: (): any => null,
  WalletHeaderBalance: (): any => null
}));
vi.mock('@components/wallet/addressGroups', () => ({default: (): any => null}));
vi.mock('@components/wallet/commentField', () => ({
  default: (props: any) => (
    <textarea data-testid="comment" value={props.value} onInput={(e) => props.onInput(e.currentTarget.value)} />
  )
}));
vi.mock('@components/wallet/frameLoop', () => ({
  addWalletFrameClient: (client: {frame: (now: number) => void}) => {
    fake.frame = client.frame;
    return () => {};
  }
}));
vi.mock('@components/wallet/sendAnimation', () => ({runWalletSendFlight: () => {}}));
// * the gem, the digits, the drums and the chip's decoding draw: here they draw nothing
vi.mock('@components/wallet/visual/amount/scene', () => ({
  AmountScene: class {
    constructor() {
      throw new Error('no WebGL2 here');
    }
  }
}));
vi.mock('@components/wallet/visual/amount/digits', () => ({
  Digits: class {
    public set() {}
    public tick() {}
    public remeasure() {}
    public destroy() {}
  }
}));
vi.mock('@components/wallet/visual/amount/roll', () => ({
  RollText: class {
    public spinning = false;
    public set() {}
    public spin() {}
    public frame() {}
    public destroy() {}
  }
}));
vi.mock('@components/wallet/visual/amount/matrix', () => ({
  MatrixChip: class {
    public play() {}
    public frame() {
      return false;
    }

    public destroy() {}
  }
}));
vi.mock('@components/wallet/visual/amount/intro', () => ({
  AmountIntroClock: class {
    public frame(): null {
      return null;
    }

    public fastForward() {}
  },
  introAlpha: () => 1,
  introRise: () => 0
}));
vi.mock('@components/wallet/send', async(importOriginal) => ({
  ...await importOriginal<typeof import('@components/wallet/send')>(),
  canEncryptCommentTo: () => fake.check,
  loadGaslessRule: async() => () => false,
  quoteFee: async() => '5000000',
  prepareWalletSendKey: () => fake.prepareKey(),
  submitWalletTransfer: (...args: any[]) => fake.submit(...args),
  showWalletSendError: () => {},
  openWalletRecipientChat: () => {}
}));

import '@helpers/peerIdPolyfill';
import I18n from '@lib/langPack';
import {WalletContext, WalletContextValue} from '@components/wallet/context';
import WalletAmountScreen from '@components/wallet/screens/amount';
import {COMMENT_PRIVACY_TIMEOUT} from '@components/wallet/send';

/** the drum the fiat amount rolls back into Grams on before it is sent */
const SWAP_SETTLE = 540;

let dispose: () => void;
let answer: (value: boolean) => void;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class {
    public observe() {}
    public disconnect() {}
  });
  // * laid out: the screen opens on its first frame with a width
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(320);
  fake.check = new Promise<boolean>((resolve) => answer = resolve);
  fake.submit = vi.fn(async() => ({id: 'sent'}));
  fake.prepareKey = vi.fn(async() => true);
  fake.deviceMode = 'full';
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** the amount screen of a transfer to a Telegram user, with 10 Grams at 2 dollars a Gram */
async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const store = {
    status: () => ({presence: 'ready', date: 0, state: {balance: '10000000000'}}),
    fiatPerGram: () => 2,
    currency: () => 'USD',
    config: () => ({minNanos: '1000000'}),
    deviceMode: () => fake.deviceMode
  };
  const context = {store, router: {push: () => {}}, shown: () => true, close: () => {}} as any as WalletContextValue;
  dispose = render(() => (
    <WalletContext.Provider value={context}>
      <WalletAmountScreen
        params={{recipient: {address: 'EQ-recipient', bounce: true, userId: 42 as UserId}} as any}
        active={() => true}
      />
    </WalletContext.Provider>
  ), container);

  fake.frame(0);
  await vi.advanceTimersByTimeAsync(0);

  const query = <T extends HTMLElement>(selector: string) => container.querySelector<T>(selector);
  const amount = query<HTMLInputElement>(`input[aria-label="${I18n.format('Wallet.SendAmountLabel', true)}"]`);
  const comment = query<HTMLTextAreaElement>('[data-testid="comment"]');
  return {
    toFiat: () => query<HTMLButtonElement>(`button[aria-label="${I18n.format('Wallet.SendSwitchCurrency', true)}"]`).click(),
    type: (digits: string) => {
      amount.value = digits;
      amount.dispatchEvent(new Event('input', {bubbles: true}));
    },
    comment: (text: string) => {
      comment.value = text;
      comment.dispatchEvent(new Event('input', {bubbles: true}));
    },
    send: () => query<HTMLButtonElement>('[data-testid="send"]').click()
  };
}

describe('a comment sent from the amount screen', () => {
  it('goes private when its check hangs', async() => {
    const screen = await mount();
    screen.toFiat();
    screen.type('5');
    screen.comment('For the tickets');
    screen.send();
    await vi.advanceTimersByTimeAsync(COMMENT_PRIVACY_TIMEOUT);
    expect(fake.submit).not.toHaveBeenCalled();

    // * the amount rolls back into Grams first
    await vi.advanceTimersByTimeAsync(SWAP_SETTLE);
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(fake.submit.mock.calls[0][1]).toMatchObject({comment: 'For the tickets', encryptComment: true, nanograms: '2500000000'});
  });

  it('is not sent public when the check answers so while the amount rolls into Grams', async() => {
    const screen = await mount();
    screen.toFiat();
    screen.type('5');
    screen.comment('For the tickets');
    screen.send();
    await vi.advanceTimersByTimeAsync(COMMENT_PRIVACY_TIMEOUT);

    answer(false);
    await vi.advanceTimersByTimeAsync(SWAP_SETTLE);
    expect(fake.submit).not.toHaveBeenCalled();

    // * the screen says it is public now: the next press sends it so
    screen.send();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(fake.submit.mock.calls[0][1]).toMatchObject({comment: 'For the tickets', encryptComment: false});
  });

  it('is not sent public when the check answers so while the key is asked for', async() => {
    fake.deviceMode = 'viewer';
    let keyReady: (value: boolean) => void;
    fake.prepareKey.mockImplementationOnce(() => new Promise<boolean>((resolve) => keyReady = resolve));
    const screen = await mount();
    screen.type('5');
    screen.comment('For the tickets');
    screen.send();
    await vi.advanceTimersByTimeAsync(COMMENT_PRIVACY_TIMEOUT);
    expect(fake.prepareKey).toHaveBeenCalledTimes(1);

    answer(false);
    keyReady(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.submit).not.toHaveBeenCalled();

    screen.send();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(fake.submit.mock.calls[0][1]).toMatchObject({comment: 'For the tickets', encryptComment: false});
  });
});
