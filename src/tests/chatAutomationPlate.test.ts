import {afterEach, describe, expect, it, vi} from 'vitest';
import {JSX} from 'solid-js';
import {render} from 'solid-js/web';
import '@helpers/peerIdPolyfill';
import createChatAutomationPlate from '@components/chat/chatAutomation';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {PeerSettings, Update} from '@layer';

const mocks = vi.hoisted(() => ({
  setHidden: vi.fn(),
  renderPlate: undefined as (() => JSX.Element) | undefined,
  menuButtons: [] as any[]
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: vi.fn()
}));

vi.mock('@components/buttonMenuToggleTsx', () => ({
  ButtonMenuToggleTsx: (props: {buttons: any[]}): JSX.Element => {
    mocks.menuButtons = props.buttons;
    return null;
  }
}));

vi.mock('@components/chat/chat', () => ({
  default: class Chat {}
}));

vi.mock('@components/chat/topbar', () => ({
  default: class ChatTopbar {}
}));

vi.mock('@components/chat/topbarPlate', () => ({
  default: {
    Body: (props: {children: unknown}) => props.children,
    ActionButton: (props: {children: unknown}) => props.children
  },
  createTopbarPlate: (options: {render: () => JSX.Element}) => {
    mocks.renderPlate = options.render;
    return {
      container: document.createElement('div'),
      destroy: vi.fn(),
      isHidden: vi.fn(),
      setHidden: mocks.setHidden
    };
  }
}));

vi.mock('@components/peerTitleTsx', () => ({
  PeerTitleTsx: vi.fn()
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

afterEach(() => {
  vi.clearAllMocks();
  mocks.renderPlate = undefined;
  mocks.menuButtons = [];
});

describe('chat automation peer settings refresh', () => {
  it('forces a refresh for an open user without plate state and reveals refreshed settings', async() => {
    const peerId = (30 as UserId).toPeerId(false);
    const refreshPeerSettings = vi.fn().mockResolvedValue(undefined);
    const plate = createChatAutomationPlate(
      {setFloating: vi.fn()} as any,
      {peerId} as any,
      {
        appProfileManager: {
          refreshPeerSettings,
          refreshPeerSettingsIfNeeded: vi.fn()
        },
        appBusinessManager: {}
      } as any
    );

    plate.handleConnectedBotUpdate(10);
    expect(refreshPeerSettings).toHaveBeenCalledWith(peerId);

    plate.set(peerId, {
      _: 'peerSettings',
      pFlags: {business_bot_can_reply: true},
      business_bot_id: 10
    })();
    expect(mocks.setHidden).toHaveBeenLastCalledWith(false);
  });

  it('does not refresh stale peer settings while removing the bot from the chat', async() => {
    const peerId = (30 as UserId).toPeerId(false);
    const refreshPeerSettings = vi.fn().mockResolvedValue(undefined);
    let resolveDisable: (value: boolean) => void;
    const disablePromise = new Promise<boolean>((resolve) => resolveDisable = resolve);
    const plate = createChatAutomationPlate(
      {setFloating: vi.fn()} as any,
      {peerId} as any,
      {
        appProfileManager: {
          refreshPeerSettings,
          refreshPeerSettingsIfNeeded: vi.fn()
        },
        appBusinessManager: {
          disablePeerConnectedBot: vi.fn(() => disablePromise)
        }
      } as any
    );
    const container = document.createElement('div');
    const dispose = render(() => mocks.renderPlate!(), container);

    try {
      plate.set(peerId, {
        _: 'peerSettings',
        pFlags: {business_bot_can_reply: true},
        business_bot_id: 10
      })();
      const removeButton = mocks.menuButtons.find(
        (button) => button.text === 'ChatAutomation.RemoveFromChat'
      );

      const removing = removeButton.onClick();
      plate.handleConnectedBotUpdate(10);

      expect(refreshPeerSettings).not.toHaveBeenCalled();
      expect(mocks.setHidden).toHaveBeenLastCalledWith(true);

      resolveDisable(true);
      await removing;
    } finally {
      dispose();
    }
  });

  it('does not request user peer settings for an open group', () => {
    const refreshPeerSettings = vi.fn().mockResolvedValue(undefined);
    const plate = createChatAutomationPlate(
      {setFloating: vi.fn()} as any,
      {peerId: (30 as ChatId).toPeerId(true)} as any,
      {
        appProfileManager: {
          refreshPeerSettings,
          refreshPeerSettingsIfNeeded: vi.fn()
        },
        appBusinessManager: {}
      } as any
    );

    plate.handleConnectedBotUpdate(10);
    expect(refreshPeerSettings).not.toHaveBeenCalled();
  });

  it('publishes and caches peer settings returned by a forced manager refresh', async() => {
    const peerId = (30 as UserId).toPeerId(false);
    const settings: PeerSettings = {
      _: 'peerSettings',
      pFlags: {business_bot_can_reply: true},
      business_bot_id: 10
    };
    const dispatchEvent = vi.fn();
    let updateListeners: Partial<Record<Update['_'], (update: Update) => void>>;
    const processLocalUpdate = vi.fn((update: Update.updatePeerSettings) => {
      updateListeners.updatePeerSettings(update);
    });
    const invokeApiSingleProcess = vi.fn(async(request: any) => {
      return request.processResult({
        _: 'messages.peerSettings',
        settings,
        chats: [],
        users: []
      });
    });
    const manager = new AppProfileManager();

    Object.assign(manager as any, {
      apiManager: {invokeApiSingleProcess},
      apiUpdatesManager: {
        addMultipleEventsListeners: (listeners: typeof updateListeners) => updateListeners = listeners,
        processLocalUpdate
      },
      appChatsManager: {saveApiChats: vi.fn()},
      appPeersManager: {
        getInputPeerById: vi.fn(() => ({_: 'inputPeerUser'})),
        getOutputPeer: vi.fn(() => ({_: 'peerUser', user_id: 30})),
        getPeerId: vi.fn(() => peerId),
        isMonoforum: vi.fn(() => false)
      },
      appStateManager: {
        getState: vi.fn().mockResolvedValue({botCommands: {}})
      },
      appUsersManager: {saveApiUsers: vi.fn()},
      rootScope: {
        addEventListener: vi.fn(),
        dispatchEvent
      }
    });
    await (manager as any).after();

    await manager.refreshPeerSettings(peerId);

    expect(invokeApiSingleProcess).toHaveBeenCalledWith(expect.objectContaining({
      method: 'messages.getPeerSettings',
      options: {overwrite: true}
    }));
    expect(processLocalUpdate).toHaveBeenCalledWith({
      _: 'updatePeerSettings',
      peer: {_: 'peerUser', user_id: 30},
      settings
    });
    expect((manager as any).peerSettings[peerId]).toBe(settings);
    expect(dispatchEvent).toHaveBeenCalledWith('peer_settings', {peerId, settings});
  });
});
