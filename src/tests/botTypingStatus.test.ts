import '@/tests/mocks/chatInputIntegrationUi';
import '@helpers/peerIdPolyfill';
import {AppImManager} from '@lib/appImManager';
import getUserStatusString from '@components/wrappers/getUserStatusString';

vi.mock('@components/wrappers/getUserStatusString', () => ({default: vi.fn()}));

test.each([true, false])('shows typing and restores the idle status (bot: %s)', async(bot) => {
  const idle = document.createElement('span');
  idle.textContent = bot ? 'bot' : 'last seen recently';
  vi.mocked(getUserStatusString).mockReturnValue(idle);
  const getPeerTypings = vi.fn().mockResolvedValueOnce([
    {userId: 20, action: {_: 'sendMessageTypingAction'}}
  ]).mockResolvedValue([]);
  const host = {
    managers: {
      appUsersManager: {
        getUser: vi.fn().mockResolvedValue({
          pFlags: {bot},
          status: {_: bot ? 'userStatusOnline' : 'userStatusOffline'}
        }),
        isBot: vi.fn().mockResolvedValue(bot)
      },
      appProfileManager: {getPeerTypings}
    },
    getPeerTyping: AppImManager.prototype.getPeerTyping,
    getTypingElement: (AppImManager.prototype as any).getTypingElement
  };
  const getStatus = () => (AppImManager.prototype as any).getUserStatus.call(host, 20 as UserId);

  const typing = await (await getStatus()).result as HTMLElement;
  expect(typing.classList.contains('peer-typing-container')).toBe(true);
  expect(typing.querySelector('[data-action="sendMessageTypingAction"]')).not.toBeNull();
  expect(typing.querySelector('.peer-typing-description')).not.toBeNull();
  expect(getPeerTypings).toHaveBeenCalledWith((20 as UserId).toPeerId(), undefined);
  expect(await (await getStatus()).result).toBe(idle);
  expect(idle.classList.contains('online')).toBe(false);
});
