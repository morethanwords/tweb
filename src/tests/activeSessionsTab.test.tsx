import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import {For, JSX} from 'solid-js';
import '@helpers/peerIdPolyfill';
import ActiveSessions from '@components/sidebarLeft/tabs/activeSessions';
import {Authorization, ConnectedBot} from '@layer';

type ContextMenu = {buttons: Array<{text: string, onClick: () => void}>};

const mocks = vi.hoisted(() => ({
  tab: undefined as any,
  rows: [] as Array<{element: HTMLElement, contextMenu?: any, icon?: string}>,
  confirmationPopup: vi.fn(),
  toastNew: vi.fn(),
  createTab: vi.fn(),
  openTab: vi.fn(),
  appSettings: {customDeviceModel: ''} as {customDeviceModel: string},
  setAppSettings: vi.fn(),
  getAuthorizations: vi.fn(),
  setAuthorizationTTL: vi.fn(),
  resetAuthorization: vi.fn(),
  resetAuthorizations: vi.fn(),
  updateConnectedBot: vi.fn(),
  listeners: {} as Record<string, (...args: any[]) => void>
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppSessionTab: class AppSessionTab {},
  AppConnectedBotSessionTab: class AppConnectedBotSessionTab {}
}));

vi.mock('@components/sidebarLeft/tabs/passcodeLock/inlineSelect', () => ({
  default: (props: {value: number, options: {value: number, label: () => JSX.Element}[], onChange: (value: number) => void}) => (
    <div class="inline-select" data-value={'' + props.value}>
      <For each={props.options}>
        {(option) => (
          <button class="inline-select-option" onClick={() => props.onChange(option.value)}>
            {option.value}
          </button>
        )}
      </For>
    </div>
  )
}));

vi.mock('@components/section', () => ({
  default: (props: {name?: string, caption?: string, nameRight?: JSX.Element, children: JSX.Element}) => (
    <div class="section" data-name={props.name} data-caption={props.caption}>
      <div class="section-name-right">{props.nameRight}</div>
      {props.children}
    </div>
  )
}));

vi.mock('@components/buttonTsx', () => ({
  default: (props: {text: string, onClick: () => void}) => (
    <button class="btn" data-text={props.text} onClick={props.onClick}>{props.text}</button>
  )
}));

vi.mock('@components/inputField', () => ({
  default: class InputField {
    public value = '';
    public container = document.createElement('div');
    public input = document.createElement('input');
    public isValid() {
      return true;
    }
  }
}));

vi.mock('@components/peerTitle', () => ({
  default: class PeerTitle {
    public element = document.createElement('span');
  }
}));

vi.mock('@helpers/date', () => ({
  formatDateAccordingToTodayNew: (date: Date) => 'at ' + date.getTime()
}));

vi.mock('@lib/solidjs/hotReloadGuard', async() => {
  const Row = (props: {children: JSX.Element, clickable?: () => void, contextMenu?: ContextMenu}) => {
    const element = (
      <div class="row" onClick={props.clickable}>{props.children}</div>
    ) as HTMLElement;
    mocks.rows.push({element, contextMenu: props.contextMenu});
    return element;
  };

  Row.Icon = (props: {icon: string}) => <span class="row-icon" data-icon={props.icon} />;
  Row.Title = (props: {children: JSX.Element, titleRight?: JSX.Element}) => (
    <div class="row-title">{props.children}<i class="row-title-right">{props.titleRight}</i></div>
  );
  Row.Midtitle = (props: {children: JSX.Element}) => <div class="row-midtitle">{props.children}</div>;
  Row.Subtitle = (props: {children: JSX.Element}) => <div class="row-subtitle">{props.children}</div>;
  Row.Media = (props: {children: JSX.Element}) => <div class="row-media">{props.children}</div>;
  Row.RightContent = (props: {children: JSX.Element}) => <div class="row-right">{props.children}</div>;

  return {
    useHotReloadGuard: () => ({
      rootScope: {},
      useAppSettings: () => [mocks.appSettings, mocks.setAppSettings],
      Row,
      i18n: (key: string) => document.createTextNode(key),
      confirmationPopup: mocks.confirmationPopup,
      toastNew: mocks.toastNew,
      AvatarNewTsx: (props: {peerId: PeerId}) => <span class="avatar" data-peer-id={'' + props.peerId} />,
      PeerTitleTsx: (props: {peerId: PeerId}) => <span class="peer-title">{'' + props.peerId}</span>
    })
  };
});

function makeAuthorization(overrides: Partial<Authorization.authorization> = {}): Authorization.authorization {
  return {
    _: 'authorization',
    pFlags: {},
    hash: 1,
    device_model: 'MacBook Pro',
    platform: 'macOS',
    system_version: '15.0',
    api_id: 2040,
    app_name: 'Telegram Desktop',
    app_version: '5.0',
    date_created: 1_000,
    date_active: 2_000,
    ip: '127.0.0.1',
    country: 'United Arab Emirates',
    region: 'Dubai',
    ...overrides
  };
}

const connectedBot: ConnectedBot.connectedBot = {
  _: 'connectedBot',
  pFlags: {},
  flags: 0,
  bot_id: '777',
  recipients: {_: 'businessBotRecipients', pFlags: {}, flags: 0},
  rights: {_: 'businessBotRights', pFlags: {}, flags: 0}
} as any;

let dispose: () => void;

function mount(payload: {
  authorizations: Authorization.authorization[],
  connectedBot?: ConnectedBot.connectedBot,
  ttlDays?: number
}) {
  payload.ttlDays ??= 0;
  const container = document.createElement('div');
  document.body.append(container);

  mocks.tab = {
    container: document.createElement('div'),
    payload,
    managers: {
      appAccountManager: {
        getAuthorizations: mocks.getAuthorizations,
        setAuthorizationTTL: mocks.setAuthorizationTTL,
        resetAuthorization: mocks.resetAuthorization,
        resetAuthorizations: mocks.resetAuthorizations
      },
      appBusinessManager: {
        updateConnectedBot: mocks.updateConnectedBot
      }
    },
    slider: {
      createTab: (...args: any[]) => {
        mocks.createTab(...args);
        return {open: mocks.openTab};
      }
    },
    listenerSetter: {
      add: () => (event: string, callback: any) => {
        mocks.listeners[event] = callback;
      }
    }
  };

  dispose = render(() => <ActiveSessions />, container);
  return container;
}

const rowByTitle = (container: HTMLElement, title: string) => {
  return Array.from(container.querySelectorAll<HTMLElement>('.row'))
  .find((row) => row.querySelector('.row-title').textContent.includes(title));
};

beforeEach(() => {
  mocks.rows.length = 0;
  mocks.listeners = {};
  mocks.resetAuthorization.mockResolvedValue(true);
  mocks.resetAuthorizations.mockResolvedValue(true);
  mocks.updateConnectedBot.mockResolvedValue(undefined);
  mocks.confirmationPopup.mockResolvedValue(undefined);
  mocks.appSettings.customDeviceModel = '';
  mocks.getAuthorizations.mockResolvedValue({authorizations: [], authorization_ttl_days: 180});
  mocks.setAuthorizationTTL.mockResolvedValue(true);
});

afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('active sessions tab', () => {
  it('splits the current session from the rest and gives every row its platform icon', () => {
    const container = mount({
      authorizations: [
        makeAuthorization({hash: 0, pFlags: {current: true}, api_id: 1025907, app_name: 'Telegram WebK', app_version: '2.2'}),
        makeAuthorization({hash: 2, platform: 'Windows'}),
        makeAuthorization({hash: 3, api_id: 6, app_name: 'Telegram Android', device_model: 'Pixel 8', platform: 'Android'})
      ]
    });

    const sections = container.querySelectorAll('.section');
    expect(sections.length).toBe(2);
    expect(sections[0].getAttribute('data-name')).toBe('CurrentSession');
    expect(sections[1].getAttribute('data-name')).toBe('OtherSessions');

    expect(sections[0].querySelectorAll('.row').length).toBe(1);
    expect(sections[1].querySelectorAll('.row').length).toBe(2);

    const icons = Array.from(container.querySelectorAll('.row-icon')).map((el) => el.getAttribute('data-icon'));
    expect(icons).toEqual(['web_k_filled', 'win_key_filled', 'android_filled']);

    // the current session cannot be terminated, so it gets no context menu
    expect(mocks.rows[0].contextMenu).toBeUndefined();
    expect(mocks.rows[1].contextMenu.buttons[0].text).toBe('Terminate');
  });

  it('opens the session tab on click and terminates through the payload callback', async() => {
    const other = makeAuthorization({hash: 2, app_name: 'Telegram iOS', api_id: 1, device_model: 'iPhone 15'});
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}}), other]
    });

    rowByTitle(container, 'Telegram iOS').click();
    expect(mocks.createTab).toHaveBeenCalledOnce();
    const payload = mocks.openTab.mock.calls[0][0];
    expect(payload.authorization).toBe(other);

    // the tab hands terminating back to the list, which drops the row
    expect(await payload.onTerminate()).toBe(true);
    expect(mocks.confirmationPopup).toHaveBeenCalledOnce();
    expect(mocks.resetAuthorization).toHaveBeenCalledWith(2);
    expect(container.querySelectorAll('.row').length).toBe(1);
  });

  it('never hands the current session a way to terminate itself', () => {
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}}), makeAuthorization({hash: 2})]
    });

    rowByTitle(container, 'Telegram Desktop').click();
    const payload = mocks.openTab.mock.calls[0][0];
    expect(payload.authorization.pFlags.current).toBe(true);
    expect(payload.onTerminate).toBeUndefined();
  });

  it('drops the row terminated from the context menu', async() => {
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}}), makeAuthorization({hash: 2})]
    });

    expect(container.querySelectorAll('.row').length).toBe(2);
    await mocks.rows[1].contextMenu.buttons[0].onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.resetAuthorization).toHaveBeenCalledWith(2);
    expect(container.querySelectorAll('.row').length).toBe(1);
    // nothing left to terminate — the button, the section and the caption
    // promising to log other devices out all go away
    expect(container.querySelector('.btn')).toBeNull();
    expect(container.querySelectorAll('.section').length).toBe(1);
    expect(container.querySelector('.section').getAttribute('data-caption')).toBeNull();
  });

  it('keeps the row when the confirmation is dismissed', async() => {
    mocks.confirmationPopup.mockRejectedValue(undefined);
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}}), makeAuthorization({hash: 2})]
    });

    await mocks.rows[1].contextMenu.buttons[0].onClick();
    await Promise.resolve();

    expect(mocks.resetAuthorization).not.toHaveBeenCalled();
    expect(container.querySelectorAll('.row').length).toBe(2);
  });

  it('terminates all other sessions and leaves only the current one', async() => {
    const container = mount({
      authorizations: [
        makeAuthorization({hash: 0, pFlags: {current: true}}),
        makeAuthorization({hash: 2}),
        makeAuthorization({hash: 3})
      ]
    });

    container.querySelector<HTMLButtonElement>('.btn').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.resetAuthorizations).toHaveBeenCalledOnce();
    expect(container.querySelectorAll('.row').length).toBe(1);
    expect(container.querySelectorAll('.section').length).toBe(1);
  });

  it('offers to terminate the connected bot along with the sessions', async() => {
    mocks.confirmationPopup.mockResolvedValue(true);
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}}), makeAuthorization({hash: 2})],
      connectedBot
    });

    container.querySelector<HTMLButtonElement>('.btn').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.confirmationPopup.mock.calls[0][0].checkbox.text).toBe('ChatAutomation.TerminateConnectedBot');
    expect(mocks.updateConnectedBot).toHaveBeenCalledWith({previousBotId: '777'});
  });

  it('keeps the section alive for a lone connected bot and opens its own tab', () => {
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}})],
      connectedBot
    });

    expect(container.querySelectorAll('.section').length).toBe(2);
    expect(container.querySelector('.btn')).not.toBeNull();

    rowByTitle(container, '777').click();
    expect(mocks.openTab).toHaveBeenCalledWith({connectedBot});
  });

  it('follows chat_automation_update when the bot is disconnected elsewhere', () => {
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}})],
      connectedBot
    });

    expect(container.querySelectorAll('.section').length).toBe(2);
    mocks.listeners.chat_automation_update(undefined);
    expect(container.querySelectorAll('.section').length).toBe(1);
    expect(container.querySelector('.btn')).toBeNull();
  });

  it('keeps sessions stuck on the password in their own section', () => {
    const container = mount({
      authorizations: [
        makeAuthorization({hash: 0, pFlags: {current: true}}),
        makeAuthorization({hash: 2, pFlags: {password_pending: true}, app_name: 'Telegram iOS'}),
        makeAuthorization({hash: 3, app_name: 'Telegram Android'})
      ]
    });

    const sections = Array.from(container.querySelectorAll('.section'));
    expect(sections.map((s) => s.getAttribute('data-name'))).toEqual([
      'CurrentSession',
      'AuthSessions.IncompleteAttempts',
      'OtherSessions'
    ]);
    expect(sections[1].querySelectorAll('.row').length).toBe(1);
    expect(sections[1].querySelector('.row-title').textContent).toContain('Telegram iOS');
    expect(sections[2].querySelector('.row-title').textContent).toContain('Telegram Android');
    // an incomplete attempt is still worth terminating
    expect(container.querySelector('.btn')).not.toBeNull();
  });

  it('offers the auto-terminate period inline and saves a new one', async() => {
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}})],
      // a period the option list doesn't offer snaps to the closest one
      ttlDays: 183
    });

    const ttlSection = Array.from(container.querySelectorAll('.section'))
    .find((section) => section.getAttribute('data-name') === 'AuthSessions.TerminateIfAwayTitle');
    expect(ttlSection).toBeTruthy();
    expect(ttlSection.querySelector('.row').textContent).toContain('AuthSessions.TerminateIfAwayFor');
    expect(ttlSection.querySelector('.inline-select').getAttribute('data-value')).toBe('180');

    const options = Array.from(ttlSection.querySelectorAll<HTMLElement>('.inline-select-option'));
    expect(options.map((option) => option.textContent)).toEqual(['7', '30', '90', '180', '365']);

    // picking what is already shown must not fire a pointless request
    options[3].click();
    expect(mocks.setAuthorizationTTL).not.toHaveBeenCalled();

    options[1].click();
    await Promise.resolve();
    expect(mocks.setAuthorizationTTL).toHaveBeenCalledWith(30);
    expect(ttlSection.querySelector('.inline-select').getAttribute('data-value')).toBe('30');
  });

  it('rolls the period back when saving it fails', async() => {
    mocks.setAuthorizationTTL.mockRejectedValue({});
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}})],
      ttlDays: 180
    });

    container.querySelector<HTMLElement>('.inline-select-option').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelector('.inline-select').getAttribute('data-value')).toBe('180');
    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'Error.AnError'});
  });

  it('hides the auto-terminate section until the period is known', () => {
    const container = mount({authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}})]});
    expect(Array.from(container.querySelectorAll('.section'))
    .some((section) => section.getAttribute('data-name') === 'AuthSessions.TerminateIfAwayTitle')).toBe(false);
  });

  it('shows a renamed device right away, before the server hears about it', () => {
    mocks.appSettings.customDeviceModel = 'Work laptop';
    const container = mount({authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}})]});

    const midtitle = container.querySelector('.row-midtitle').textContent;
    expect(midtitle).toContain('Work laptop');
    expect(midtitle).not.toContain('MacBook Pro');
  });

  it('stores a trimmed new device name', async() => {
    mocks.appSettings.customDeviceModel = 'Old name';
    mocks.confirmationPopup.mockImplementation((options: any) => {
      // the popup opens on the current name, the user types over it
      expect(options.inputField.value).toBe('Old name');
      options.inputField.value = '  Work laptop  ';
      return Promise.resolve(undefined);
    });

    const container = mount({authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}})]});

    const rename = container.querySelector<HTMLElement>('.section-name-right a');
    expect(rename.textContent).toBe('AuthSessions.RenameDevice');
    rename.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.confirmationPopup.mock.calls[0][0].titleLangKey).toBe('AuthSessions.RenameDevice');
    expect(mocks.setAppSettings).toHaveBeenCalledWith('customDeviceModel', 'Work laptop');
  });

  it('picks up sessions that appeared elsewhere', async() => {
    mocks.getAuthorizations.mockResolvedValue({
      authorizations: [
        makeAuthorization({hash: 0, pFlags: {current: true}}),
        makeAuthorization({hash: 9, app_name: 'Telegram Android'})
      ],
      authorization_ttl_days: 90
    });

    const container = mount({authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}})]});
    expect(container.querySelectorAll('.row-icon').length).toBe(1);

    mocks.listeners.unconfirmed_authorizations_update([]);
    await Promise.resolve();
    await Promise.resolve();

    expect(container.querySelectorAll('.row-icon').length).toBe(2);
    expect(Array.from(container.querySelectorAll('.section'))
    .some((section) => section.getAttribute('data-name') === 'AuthSessions.TerminateIfAwayTitle')).toBe(true);
  });

  it('explains why a fresh session cannot terminate another one', async() => {
    mocks.resetAuthorization.mockRejectedValue({type: 'FRESH_RESET_AUTHORISATION_FORBIDDEN'});
    const container = mount({
      authorizations: [makeAuthorization({hash: 0, pFlags: {current: true}}), makeAuthorization({hash: 2})]
    });

    await mocks.rows[1].contextMenu.buttons[0].onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.toastNew).toHaveBeenCalledWith({langPackKey: 'RecentSessions.Error.FreshReset'});
    expect(container.querySelectorAll('.row').length).toBe(2);
  });
});
