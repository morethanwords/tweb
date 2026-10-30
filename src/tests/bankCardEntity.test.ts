import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import type {MessageEntity, PaymentsBankCardData} from '@layer';

// wrapRichText reaches the worker proxy through langPack; none of that is needed to build a link
vi.mock('@lib/apiManagerProxy', () => ({default: {addEventListener: () => {}, getState: () => Promise.resolve({})}}));

const mocks = vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
    public takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock
  });

  // jsdom has no canvas backend; the environment probes wrapRichText pulls in need a string back
  HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';

  Object.defineProperty(globalThis, 'Worker', {configurable: true, writable: true, value: class Worker {}});
  Object.defineProperty(globalThis, 'CSS', {configurable: true, value: {supports: () => true}});

  return {
    getBankCardData: vi.fn(),
    copyTextToClipboard: vi.fn(),
    toastNew: vi.fn(),
    openUrl: vi.fn(),
    menuOptions: undefined as {link: HTMLElement, buttons: any[], onClose?: () => void},
    menu: undefined as HTMLElement
  };
});

vi.mock('@helpers/clipboard', () => ({copyTextToClipboard: mocks.copyTextToClipboard}));
vi.mock('@components/toast', () => ({toastNew: mocks.toastNew}));

// the menu itself, without the controller that places and opens it
vi.mock('@helpers/dom/openTextLinkMenu', async() => {
  const {ButtonMenuSync} = await import('@components/buttonMenu');
  return {
    default: (options: typeof mocks.menuOptions) => {
      mocks.menuOptions = options;
      const menu = mocks.menu = ButtonMenuSync({buttons: options.buttons});
      menu.classList.add('active');
      document.body.append(menu);
      return {menu, reposition: () => {}};
    }
  };
});

import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {MESSAGE_LINK_ENTITY_SELECTOR} from '@lib/richTextProcessor/filterDisabledEntities';
import openBankCardMenu from '@components/bankCardMenu';
import {appendButtonMenuItems, ButtonMenuSync} from '@components/buttonMenu';
import {registerHotReloadGuard} from '@lib/solidjs/hotReloadGuardProvider';
import rootScope from '@lib/rootScope';
import {simulateClickEvent} from '@helpers/dom/clickEvent';

registerHotReloadGuard({appImManager: {openUrl: mocks.openUrl} as any});
rootScope.managers = {
  appPaymentsManager: {getBankCardData: mocks.getBankCardData}
} as unknown as typeof rootScope.managers;

const NUMBER = '4111 1111 1111 1111';
const TEXT = 'pay to ' + NUMBER;
const ENTITY: MessageEntity = {_: 'messageEntityBankCard', offset: 7, length: NUMBER.length};

function wrapCard(options: Parameters<typeof wrapRichText>[1] = {}) {
  const container = document.createElement('div');
  container.append(wrapRichText(TEXT, {entities: [ENTITY], ...options}));
  return container.querySelector<HTMLAnchorElement>('a.bank-card');
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve));
}

function menuTexts() {
  return Array.from(mocks.menu.querySelectorAll('.btn-menu-item-text')).map((item) => item.textContent);
}

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('bank card entity', () => {
  test('is a left-to-right link to its menu, held back with the other links', () => {
    const link = wrapCard();
    expect(link).not.toBeNull();
    expect(link.textContent).toBe(NUMBER);
    expect(link.dataset.bankCard).toBe(NUMBER);
    expect(link.dir).toBe('ltr');
    expect(link.getAttribute('href')).toBe('#');
    expect(link.getAttribute('aria-haspopup')).toBe('menu');
    expect(link.getAttribute('onclick')).toBe('onBankCardClick(this, event)');
    expect(link.matches(MESSAGE_LINK_ENTITY_SELECTOR)).toBe(true);
  });

  test('stays plain text where links are off, and in a draft', () => {
    expect(wrapCard({noLinks: true})).toBeNull();
    expect(wrapCard({wrappingDraft: true})).toBeNull();
    expect(wrapCard({noLinks: true, passEntities: {messageEntityBankCard: true}})).not.toBeNull();
  });
});

describe('bank card menu', () => {
  let link: HTMLAnchorElement;
  beforeEach(() => {
    link = wrapCard();
  });

  test('copies at once, then lists where to look the card up and who issued it', async() => {
    const data: PaymentsBankCardData = {
      _: 'payments.bankCardData',
      title: 'Test Bank',
      open_urls: [
        {_: 'bankCardOpenUrl', url: 'https://bank.example/a', name: 'Open A'},
        {_: 'bankCardOpenUrl', url: 'https://bank.example/b', name: 'Open B'}
      ]
    };
    mocks.getBankCardData.mockResolvedValue(data);

    openBankCardMenu(link, new MouseEvent('click'));
    expect(mocks.getBankCardData).toHaveBeenCalledWith(NUMBER);
    expect(mocks.menuOptions.link).toBe(link);
    // no language pack is loaded here: a line reads as its key
    expect(menuTexts()).toEqual(['CopyCardNumber', 'Loading']);

    await flush();
    expect(mocks.menu.querySelector('.is-static')).toBeNull();
    expect(menuTexts().slice(1)).toEqual(['Open A', 'Open B', 'Test Bank']);
    // the copy, the line under it, and the one before the issuer
    expect(mocks.menu.querySelectorAll('hr')).toHaveLength(2);

    const items = mocks.menu.querySelectorAll<HTMLElement>('.btn-menu-item');
    simulateClickEvent(items[2]);
    expect(mocks.openUrl).toHaveBeenCalledWith('https://bank.example/b', true);

    simulateClickEvent(items[0]);
    expect(mocks.copyTextToClipboard).toHaveBeenCalledWith(NUMBER);
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'CardNumberCopied'});
  });

  test('says so when the lookup fails', async() => {
    mocks.getBankCardData.mockRejectedValue({type: 'BANK_CARD_NUMBER_INVALID'});
    openBankCardMenu(link, new MouseEvent('click'));
    await flush();

    const statics = mocks.menu.querySelectorAll('.btn-menu-item.is-static');
    expect(statics).toHaveLength(1);
    expect(statics[0].textContent).toBe('Error.AnError');
    expect(mocks.menu.querySelectorAll('hr')).toHaveLength(1);
  });

  test('drops the line under the copy when the server knows nothing', async() => {
    mocks.getBankCardData.mockResolvedValue({_: 'payments.bankCardData', title: '', open_urls: []});
    openBankCardMenu(link, new MouseEvent('click'));
    await flush();

    expect(mocks.menu.querySelectorAll('.btn-menu-item')).toHaveLength(1);
    expect(mocks.menu.querySelector('hr')).toBeNull();
  });

  test('leaves a closed menu alone', async() => {
    mocks.getBankCardData.mockResolvedValue({
      _: 'payments.bankCardData',
      title: 'Test Bank',
      open_urls: []
    });
    openBankCardMenu(link, new MouseEvent('click'));
    mocks.menuOptions.onClose();
    await flush();

    expect(mocks.menu.querySelectorAll('.btn-menu-item.is-static')).toHaveLength(1);
  });
});

describe('appendButtonMenuItems', () => {
  test('makes what it adds act from the keyboard as the first items do', () => {
    const first = vi.fn();
    const added = vi.fn();
    const menu = ButtonMenuSync({buttons: [{text: 'Copy', onClick: first}]});
    menu.classList.add('active');
    document.body.append(menu);

    const button = {regularText: 'Added', onClick: added};
    appendButtonMenuItems(menu, [button]);

    const element = menu.lastElementChild as HTMLElement;
    expect(element.textContent).toBe('Added');
    expect(element.tabIndex).toBe(0);

    element.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
    expect(added).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
