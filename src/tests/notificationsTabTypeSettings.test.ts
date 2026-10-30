import {createRoot} from 'solid-js';
import {PeerNotifySettings} from '@layer';

const mocks = vi.hoisted(() => ({
  listeners: new Map<string, Set<(...args: any[]) => void>>(),
  getNotifySettings: vi.fn()
}));

vi.mock('@lib/rootScope', () => ({
  default: {
    addEventListener: (name: string, callback: (...args: any[]) => void) => {
      let listeners = mocks.listeners.get(name);
      if(!listeners) mocks.listeners.set(name, listeners = new Set());
      listeners.add(callback);
    },
    removeEventListener: (name: string, callback: (...args: any[]) => void) => {
      mocks.listeners.get(name)?.delete(callback);
    },
    managers: {
      appNotificationsManager: {
        getNotifySettings: (...args: any[]) => mocks.getNotifySettings(...args)
      }
    }
  }
}));

import createTypeNotifySettings from '@components/sidebarLeft/tabs/notificationsTypeSettings';

const emit = (name: string, ...args: any[]) => mocks.listeners.get(name)?.forEach((callback) => callback(...args));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a chat type\'s settings in the notifications tab', () => {
  test('are none once Reset All is through, until asked for again: nothing is composed from the cleared ones', async() => {
    const old: PeerNotifySettings = {_: 'peerNotifySettings', mute_until: 2147483647, show_previews: false};
    const fresh: PeerNotifySettings = {_: 'peerNotifySettings', show_previews: true};
    mocks.getNotifySettings.mockResolvedValueOnce(old);

    await createRoot(async(dispose) => {
      const settings = createTypeNotifySettings('inputNotifyUsers');
      await tick();
      expect(settings()).toBe(old);

      // * the reset's own read of them failed, and so does the one asked for here
      mocks.getNotifySettings.mockRejectedValueOnce({type: 'INTERNAL'});
      emit('notify_settings_reset');
      expect(settings()).toBeUndefined();
      expect(mocks.getNotifySettings).toHaveBeenLastCalledWith({_: 'inputNotifyUsers'});
      await tick();
      expect(settings()).toBeUndefined();

      // * the next time it succeeds; a change of another type leaves them be
      mocks.getNotifySettings.mockResolvedValueOnce(fresh);
      emit('notify_settings_reset');
      emit('notify_settings', {_: 'updateNotifySettings', peer: {_: 'notifyChats'}, notify_settings: old});
      await tick();
      expect(settings()).toBe(fresh);

      dispose();
    });

    // * gone with the tab
    expect([...mocks.listeners.values()].every((listeners) => !listeners.size)).toBe(true);
  });
});
