import {describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppProfileManager} from '@appManagers/appProfileManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import processPeerFullForCommands from '@components/chat/processPeerFullForCommands';
import {BotCommand, BotInfo, ChatFull, Update, UserFull} from '@layer';
import type {State} from '@config/state';

function makeBotInfo(userId: UserId, commands: Array<[string, string]>): BotInfo.botInfo {
  return {
    _: 'botInfo',
    pFlags: {},
    user_id: userId,
    commands: commands.map(([command, description]): BotCommand.botCommand => ({
      _: 'botCommand',
      command,
      description
    }))
  };
}

function makeUserFull(userId: UserId, botInfo: BotInfo.botInfo): UserFull.userFull {
  return {
    _: 'userFull',
    pFlags: {},
    id: userId,
    bot_info: botInfo
  } as UserFull.userFull;
}

async function makeProfileManager(peerId: PeerId, botCommands: State['botCommands'] = {}) {
  const manager = new AppProfileManager();
  const dispatchEvent = vi.fn();
  const pushToState = vi.fn();
  let updateListeners: Partial<Record<Update['_'], (update: Update) => void>>;

  Object.assign(manager as any, {
    apiUpdatesManager: {
      addMultipleEventsListeners: (listeners: typeof updateListeners) => updateListeners = listeners
    },
    appPeersManager: {
      getPeerId: () => peerId
    },
    appStateManager: {
      getState: () => Promise.resolve({botCommands}),
      pushToState
    },
    rootScope: {
      addEventListener: vi.fn(),
      dispatchEvent
    }
  });

  await (manager as any).after();
  return {dispatchEvent, manager, pushToState, updateListeners};
}

describe('bot commands', () => {
  it('keeps the complete command list and its server order', () => {
    const botId = 100 as UserId;
    const peerId = botId.toPeerId(false);
    const full = makeUserFull(botId, makeBotInfo(botId, [
      ['start', 'First'],
      ['settings', 'Settings'],
      ['start', 'Second']
    ]));

    expect(processPeerFullForCommands(peerId, full).map(({name, description}) => [name, description])).toEqual([
      ['/start', 'First'],
      ['/settings', 'Settings'],
      ['/start', 'Second']
    ]);
  });

  it('filters commands without reordering commands from multiple bots', () => {
    const firstBotId = 100 as UserId;
    const secondBotId = 200 as UserId;
    const peerId = (300 as ChatId).toPeerId(true);
    const full = {
      _: 'chatFull',
      bot_info: [
        makeBotInfo(firstBotId, [['start', 'First'], ['status', 'Status']]),
        makeBotInfo(secondBotId, [['settings', 'Settings'], ['stop', 'Stop']])
      ]
    } as ChatFull.chatFull;

    expect(processPeerFullForCommands(peerId, full, '/s').map(({peerId, name}) => [peerId, name])).toEqual([
      [firstBotId.toPeerId(false), '/start'],
      [firstBotId.toPeerId(false), '/status'],
      [secondBotId.toPeerId(false), '/settings'],
      [secondBotId.toPeerId(false), '/stop']
    ]);
  });

  it('applies updateBotCommands received before the full peer is loaded', async() => {
    const botId = 100 as UserId;
    const peerId = botId.toPeerId(false);
    const {manager, pushToState, updateListeners} = await makeProfileManager(peerId);
    const commands = [{_: 'botCommand', command: 'new', description: 'New'}] as BotCommand.botCommand[];

    updateListeners.updateBotCommands({
      _: 'updateBotCommands',
      peer: {_: 'peerUser', user_id: botId},
      bot_id: botId,
      commands
    });

    const full = makeUserFull(botId, makeBotInfo(botId, [['start', 'Start']]));
    expect((manager as any).applyCachedBotCommands(peerId, full)).toBe(true);
    expect(full.bot_info.commands).toBe(commands);
    expect(pushToState).toHaveBeenCalledWith('botCommands', {
      [peerId]: {[botId]: commands}
    });
  });

  it('clears cached commands and notifies the open peer', async() => {
    const botId = 100 as UserId;
    const peerId = botId.toPeerId(false);
    const {dispatchEvent, manager, updateListeners} = await makeProfileManager(peerId);
    const full = makeUserFull(botId, makeBotInfo(botId, [['start', 'Start']]));
    const commands: BotCommand.botCommand[] = [];
    (manager as any).usersFull[botId] = full;

    updateListeners.updateBotCommands({
      _: 'updateBotCommands',
      peer: {_: 'peerUser', user_id: botId},
      bot_id: botId,
      commands
    });

    expect(full.bot_info.commands).toBe(commands);
    expect(dispatchEvent).toHaveBeenCalledWith('user_full_update', botId);
  });

  it('restores cached commands after the manager is restarted', async() => {
    const botId = 100 as UserId;
    const peerId = botId.toPeerId(false);
    const commands = [{_: 'botCommand', command: 'new', description: 'New'}] as BotCommand.botCommand[];
    const botCommands: State['botCommands'] = {};
    const {updateListeners} = await makeProfileManager(peerId, botCommands);

    updateListeners.updateBotCommands({
      _: 'updateBotCommands',
      peer: {_: 'peerUser', user_id: botId},
      bot_id: botId,
      commands
    });

    const {manager: restartedManager} = await makeProfileManager(peerId, botCommands);
    const full = makeUserFull(botId, makeBotInfo(botId, [['start', 'Start']]));
    expect((restartedManager as any).applyCachedBotCommands(peerId, full)).toBe(true);
    expect(full.bot_info.commands).toBe(commands);
  });

  it('clears persisted commands together with dialogs but not on initialization', async() => {
    const botId = 100 as UserId;
    const peerId = botId.toPeerId(false);
    const commands = [{_: 'botCommand', command: 'new', description: 'New'}] as BotCommand.botCommand[];
    const {manager: profileManager, pushToState} = await makeProfileManager(peerId, {
      [peerId]: {[botId]: commands}
    });
    const messagesManager = new AppMessagesManager();
    const clearDialogs = vi.fn();
    Object.assign(messagesManager as any, {
      appProfileManager: profileManager,
      dialogsStorage: {clear: clearDialogs},
      filtersStorage: {clear: vi.fn()}
    });

    messagesManager.clear(true);
    expect(pushToState).not.toHaveBeenCalled();

    messagesManager.clear();

    expect(clearDialogs).toHaveBeenLastCalledWith(undefined);
    expect(pushToState).toHaveBeenCalledWith('botCommands', {});
    const full = makeUserFull(botId, makeBotInfo(botId, [['start', 'Start']]));
    expect((profileManager as any).applyCachedBotCommands(peerId, full)).toBe(false);
  });
});
