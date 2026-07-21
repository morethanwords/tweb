import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import {NewAuthorization} from '@components/sidebarLeft/newAuthorization';

const mocks = vi.hoisted(() => ({
  collapsed: false,
  confirm: vi.fn(),
  reset: vi.fn(),
  toast: vi.fn(),
  toastNew: vi.fn(),
  createPopupTsx: vi.fn()
}));

vi.mock('@stores/foldersSidebar', () => ({
  useIsSidebarCollapsed: () => [() => mocks.collapsed]
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    managers: {
      appAccountManager: {
        confirmUnconfirmedAuthorization: mocks.confirm,
        resetAuthorization: mocks.reset
      }
    }
  }
}));

vi.mock('@components/toast', () => ({
  hideToast: vi.fn(),
  toast: mocks.toast,
  toastNew: mocks.toastNew
}));

vi.mock('@components/popups/indexTsx', () => ({
  default: (): null => null,
  createPopup: mocks.createPopupTsx
}));

vi.mock('@components/lottieAnimation', () => ({
  default: (): null => null
}));

vi.mock('@components/mediaHeader', () => ({
  default: (): null => null
}));

vi.mock('@lib/rlottie/lottieLoader', () => ({
  default: {}
}));

vi.mock('@components/sidebarLeft', () => ({
  default: {createTab: vi.fn()}
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppActiveSessionsTab: class AppActiveSessionsTab {}
}));

vi.mock('@lib/richTextProcessor/wrapEmojiText', () => ({
  default: (text: string) => {
    const fragment = document.createDocumentFragment();
    fragment.append(text);
    return fragment;
  }
}));

vi.mock('@lib/langPack', () => {
  const strings: Record<string, string> = {
    UnconfirmedAuthTitle: 'Someone just got access to your messages!',
    UnconfirmedAuthSingle: 'We detected a new login to your account from %s. Is it you?',
    UnconfirmedAuthConfirm: 'Yes, it’s me',
    UnconfirmedAuthDeny: 'No, it’s not me!',
    UnconfirmedAuthConfirmed: 'New Login Allowed',
    UnconfirmedAuthConfirmedMessage: 'You can check the list of your active logins in %s.',
    Settings: 'Settings',
    Devices: 'Devices'
  };
  const format = (key: string, args: any[] = []) => {
    let index = 0;
    return (strings[key] ?? key).replace(/%s/g, () => '' + (args[index++] ?? ''));
  };

  return {
    I18n: {format: (key: string, _plain: boolean, args?: any[]) => format(key, args)},
    i18n: (key: string, args?: any[]) => document.createTextNode(format(key, args))
  };
});

const authorization = {
  hash: 42,
  date: 1_000,
  device: 'Safari on iPhone',
  location: 'Dubai, UAE'
};

let dispose: () => void;

afterEach(() => {
  vi.useRealTimers();
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  mocks.collapsed = false;
  vi.clearAllMocks();
});

describe('new authorization notice', () => {
  it('announces the expanded notice and confirms through the account manager', async() => {
    mocks.confirm.mockResolvedValue(true);
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <NewAuthorization authorization={authorization} total={2} />, container);

    const notice = container.querySelector<HTMLElement>('[role="alert"]');
    expect(notice).toBeTruthy();
    expect(notice.getAttribute('aria-live')).toBe('assertive');
    expect(notice.textContent).toContain('1/2 Someone just got access');

    const confirm = Array.from(container.querySelectorAll('button')).find((button) => {
      return button.textContent === 'Yes, it’s me';
    });
    expect(confirm.classList.contains('hover-primary-effect')).toBe(true);
    expect(confirm.classList.contains('rp-overflow')).toBe(true);
    const deny = Array.from(container.querySelectorAll('button')).find((button) => {
      return button.textContent === 'No, it’s not me!';
    });
    expect(deny.classList.contains('rp-overflow')).toBe(true);
    confirm.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.confirm).toHaveBeenCalledWith(42);
    expect(mocks.reset).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.any(DocumentFragment), undefined, 5000);
  });

  it('uses a keyboard-focusable labelled button when the sidebar is collapsed', () => {
    mocks.collapsed = true;
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <NewAuthorization authorization={authorization} total={1} />, container);

    const button = container.querySelector<HTMLButtonElement>('button[aria-label]');
    expect(button).toBeTruthy();
    expect(button.type).toBe('button');
    expect(button.getAttribute('aria-label')).toContain('Safari on iPhone, Dubai, UAE');
    button.click();
    expect(mocks.createPopupTsx).toHaveBeenCalledOnce();
  });

  it('opens the prevented-login flow with PopupElementTsx', async() => {
    vi.useFakeTimers();
    mocks.reset.mockResolvedValue(true);
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <NewAuthorization authorization={authorization} total={1} />, container);

    const deny = Array.from(container.querySelectorAll('button')).find((button) => {
      return button.textContent === 'No, it’s not me!';
    });
    deny.click();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(mocks.reset).toHaveBeenCalledWith(42);
    expect(mocks.createPopupTsx).toHaveBeenCalledOnce();
  });

  it('explains why a fresh session cannot deny another authorization', async() => {
    mocks.reset.mockRejectedValue({type: 'FRESH_RESET_AUTHORISATION_FORBIDDEN'});
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => <NewAuthorization authorization={authorization} total={1} />, container);

    const deny = Array.from(container.querySelectorAll('button')).find((button) => {
      return button.textContent === 'No, it’s not me!';
    });
    deny.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.toastNew).toHaveBeenCalledWith({
      langPackKey: 'RecentSessions.Error.FreshReset'
    });
    expect(mocks.createPopupTsx).not.toHaveBeenCalled();
  });
});
