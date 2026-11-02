import '@helpers/peerIdPolyfill';
import AppAttachMenuBotsManager from '@appManagers/appAttachMenuBotsManager';
import type {AttachMenuBot} from '@layer';

const BOT_ID = 7 as BotId;

function makeManager(cached?: AttachMenuBot) {
  const fresh = {_: 'attachMenuBot', bot_id: BOT_ID, short_name: 'fresh', pFlags: {}, icons: []} as AttachMenuBot;
  const invokeApiSingleProcess = vi.fn(() => Promise.resolve(fresh));
  const manager = Object.create(AppAttachMenuBotsManager.prototype) as AppAttachMenuBotsManager;
  Object.assign(manager as any, {
    attachMenuBots: new Map(cached ? [[BOT_ID, cached]] : []),
    appUsersManager: {
      isAttachMenuBot: () => true,
      getUserInput: () => ({_: 'inputUser', user_id: BOT_ID, access_hash: '1'})
    },
    apiManager: {invokeApiSingleProcess}
  });

  return {manager, invokeApiSingleProcess, fresh};
}

describe('AppAttachMenuBotsManager.getAttachMenuBot', () => {
  const cached = {_: 'attachMenuBot', bot_id: BOT_ID, short_name: 'cached', pFlags: {}, icons: []} as AttachMenuBot;

  it('answers from what it has', async() => {
    const {manager, invokeApiSingleProcess} = makeManager(cached);

    expect(await manager.getAttachMenuBot(BOT_ID)).toBe(cached);
    expect(invokeApiSingleProcess).not.toHaveBeenCalled();
  });

  it('asks the server for one it has not got', async() => {
    const {manager, fresh} = makeManager();

    expect(await manager.getAttachMenuBot(BOT_ID)).toBe(fresh);
  });

  it('asks the server again when told to, as refreshing its icon\'s file reference does', async() => {
    const {manager, invokeApiSingleProcess, fresh} = makeManager(cached);

    expect(await manager.getAttachMenuBot(BOT_ID, true)).toBe(fresh);
    expect(invokeApiSingleProcess).toHaveBeenCalledWith(expect.objectContaining({method: 'messages.getAttachMenuBot'}));
  });
});
