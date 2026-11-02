/*
 * The confirmation screen's comment: one written there is private where the recipient can read it (tdesktop), and
 * while that is still being found out a send waits for the answer, as the amount screen's does — it never goes out
 * public on a guess. A check that hangs counts as one that could not be made: private, the engine looks the key up
 * itself. Nothing here talks to a server.
 */

import {render} from 'solid-js/web';
import {afterEach, beforeEach, describe, expect, it, Mock, vi} from 'vitest';

const fake = vi.hoisted(() => ({
  check: undefined as Promise<boolean>,
  submit: undefined as Mock<(...args: any[]) => Promise<unknown>>
}));

vi.mock('@components/popups/indexTsx', () => {
  const PopupElement = (props: any) => <div>{props.children}</div>;
  PopupElement.Footer = (props: any) => <div>{props.children}</div>;
  PopupElement.FooterButton = (props: any) => (
    <button data-testid="send" disabled={props.disabled} onClick={() => props.callback()} />
  );
  return {default: PopupElement};
});
vi.mock('@components/section', () => ({default: (props: any) => <div>{props.children}</div>}));
vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => <div>{props.children}</div>;
  Row.Title = (props: any) => <div>{props.children}</div>;
  Row.Subtitle = (props: any) => <div>{props.children}</div>;
  return {default: Row};
});
vi.mock('@components/wallet/parts', () => ({
  showWalletFeesInfo: () => {},
  WalletHeader: (): any => null,
  WalletTonAmount: (props: any) => <span>{props.nanos}</span>
}));
vi.mock('@components/wallet/gem', () => ({default: (): any => null}));
vi.mock('@components/wallet/commentField', () => ({
  default: (props: any) => {
    props.handleRef?.({refuse: () => {}});
    return (
      <textarea
        data-testid="comment"
        data-locked={props.lock ? String(props.lock.encrypted) : undefined}
        disabled={props.disabled}
        value={props.value}
        onInput={(e) => props.onInput(e.currentTarget.value)}
      />
    );
  }
}));
vi.mock('@components/wallet/sendAnimation', () => ({runWalletSendFlight: () => {}}));
vi.mock('@components/wallet/send', async(importOriginal) => ({
  ...await importOriginal<typeof import('@components/wallet/send')>(),
  canEncryptCommentTo: () => fake.check,
  isGaslessEligible: async() => false,
  quoteFee: async() => '5000000',
  submitWalletTransfer: (...args: any[]) => fake.submit(...args),
  showWalletSendError: () => {}
}));

import {WalletContext, WalletContextValue} from '@components/wallet/context';
import WalletConfirmScreen from '@components/wallet/screens/confirm';
import {COMMENT_PRIVACY_TIMEOUT} from '@components/wallet/send';

let dispose: () => void;
let answer: (value: boolean) => void;

beforeEach(() => {
  fake.check = new Promise<boolean>((resolve) => answer = resolve);
  fake.submit = vi.fn(async() => ({id: 'sent'}));
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.useRealTimers();
});

/** the confirmation of a transfer to a bare address, opened with no comment while the check is still out */
function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  const store = {
    status: () => ({presence: 'ready', date: 0}),
    fiatPerGram: () => 0,
    currency: () => 'USD'
  };
  const context = {store, router: {push: () => {}}, shown: () => true, close: () => {}} as any as WalletContextValue;
  dispose = render(() => (
    <WalletContext.Provider value={context}>
      <WalletConfirmScreen params={{recipient: {address: 'EQ-recipient', bounce: true}, nanograms: '1000000000'}} />
    </WalletContext.Provider>
  ), container);

  const comment = container.querySelector<HTMLTextAreaElement>('[data-testid="comment"]');
  const button = container.querySelector<HTMLButtonElement>('[data-testid="send"]');
  return {
    comment,
    type: (text: string) => {
      comment.value = text;
      comment.dispatchEvent(new Event('input', {bubbles: true}));
    },
    send: () => button.click()
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('a comment written on the confirmation screen', () => {
  it('waits for whether it can be private, and goes private when it can', async() => {
    const screen = mount();
    screen.type('For the tickets');
    screen.send();
    await settle();
    expect(fake.submit).not.toHaveBeenCalled();

    answer(true);
    await settle();
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(fake.submit.mock.calls[0][1]).toMatchObject({comment: 'For the tickets', encryptComment: true});
  });

  it('is not sent public before the screen said so', async() => {
    const screen = mount();
    screen.type('For the tickets');
    screen.send();
    answer(false);
    await settle();
    expect(fake.submit).not.toHaveBeenCalled();

    // * the screen says it is public now: the next press sends it so
    screen.send();
    await settle();
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(fake.submit.mock.calls[0][1]).toMatchObject({comment: 'For the tickets', encryptComment: false});
  });

  it('goes private when the check hangs', async() => {
    vi.useFakeTimers();
    const screen = mount();
    screen.type('For the tickets');
    screen.send();
    await vi.advanceTimersByTimeAsync(COMMENT_PRIVACY_TIMEOUT - 1);
    expect(fake.submit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(fake.submit.mock.calls[0][1]).toMatchObject({encryptComment: true});
  });

  it('waits for nothing when there is none', async() => {
    const screen = mount();
    screen.send();
    await settle();
    expect(fake.submit).toHaveBeenCalledTimes(1);
    expect(fake.submit.mock.calls[0][1]).toMatchObject({comment: undefined});
  });
});
