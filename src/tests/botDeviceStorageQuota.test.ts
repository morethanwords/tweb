import pause from '@helpers/schedulers/pause';
import AppBotsManager from '@appManagers/appBotsManager';

const BOT_ID = 7 as BotId;

// * the account's storage: each read and write takes a while, as IndexedDB does
function makeManager() {
  const stored = new Map<string, string>();
  const manager = new AppBotsManager() as any;
  manager.webAppStorage = {
    get: async(key: string): Promise<string> => (await pause(1), stored.get(key)),
    set: async(values: Record<string, string>) => {
      await pause(1);
      for(const key in values) stored.set(key, values[key]);
    },
    delete: async(key: string): Promise<void> => (await pause(1), void stored.delete(key)),
    getAllKeys: async(): Promise<string[]> => [...stored.keys()]
  };

  const deviceKeys = () => [...stored.keys()].filter((key) => key.startsWith(`${BOT_ID}:device:`));
  const used = (what: 'deviceStorageUsed' | 'deviceStorageUsedKeys') => +stored.get(`${BOT_ID}:internal:${what}`);
  return {manager: manager as AppBotsManager, deviceKeys, used};
}

describe('AppBotsManager: a Mini App\'s device storage', () => {
  it('keeps to its 10 keys when the app stores many at once, and counts what it holds', async() => {
    const {manager, deviceKeys, used} = makeManager();

    const errors = await Promise.all(Array.from({length: 12}, (_, i) => {
      return manager.writeBotDeviceStorage(BOT_ID, 'key' + i, 'value');
    }));

    expect(errors.filter((error) => error === 'QUOTA_EXCEEDED')).toHaveLength(2);
    expect(deviceKeys()).toHaveLength(10);
    expect(used('deviceStorageUsedKeys')).toBe(10);
    expect(used('deviceStorageUsed')).toBe(deviceKeys().reduce((sum, key) => sum + key.split(':').pop().length + 'value'.length, 0));
  });

  it('counts nothing once it is cleared, though a write was on its way', async() => {
    const {manager, deviceKeys, used} = makeManager();
    await manager.writeBotDeviceStorage(BOT_ID, 'a', '1');

    await Promise.all([
      manager.writeBotDeviceStorage(BOT_ID, 'b', '2'),
      manager.clearBotDeviceStorage(BOT_ID)
    ]);

    expect(deviceKeys()).toHaveLength(0);
    expect(used('deviceStorageUsedKeys')).toBe(0);
    expect(used('deviceStorageUsed')).toBe(0);
  });
});
