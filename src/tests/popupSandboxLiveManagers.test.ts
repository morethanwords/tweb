import {describe, expect, it, vi} from 'vitest';
import {createLiveManagers, isReadMethod} from '@components/popupSandbox/liveManagers';

/*
 * The live sandbox hands popups the session's REAL managers, so the guard that keeps a confirm
 * button from deleting real messages is the only thing between a story and an irreversible action.
 */

describe('popup sandbox live managers', () => {
  const makeReal = () => {
    const getChat = vi.fn().mockResolvedValue({id: 1});
    const deleteMessages = vi.fn().mockResolvedValue(true);
    const leave = vi.fn().mockResolvedValue(true);
    const readHistory = vi.fn().mockResolvedValue(true);
    return {
      appChatsManager: {getChat, leave},
      appMessagesManager: {deleteMessages, readHistory},
      spies: {getChat, deleteMessages, leave, readHistory}
    } as any;
  };

  it('classifies methods by name prefix', () => {
    for(const method of ['getChat', 'isForum', 'hasRights', 'canSendMessage', 'searchPeers', 'checkGiftCode']) {
      expect(isReadMethod('appChatsManager', method), method).toBe(true);
    }

    for(const method of ['deleteMessages', 'leave', 'sendText', 'readHistory', 'applyBoost', 'togglePinnedGift']) {
      expect(isReadMethod('appChatsManager', method), method).toBe(false);
    }
  });

  it('lets the named reads through — media loading is the whole point of running live', () => {
    expect(isReadMethod('apiFileManager', 'downloadMediaURL')).toBe(true);
    expect(isReadMethod('apiFileManager', 'downloadMedia')).toBe(true);
    expect(isReadMethod('appStickersManager', 'preloadAnimatedEmojiSticker')).toBe(true);
    // …and only for the manager they were named with.
    expect(isReadMethod('appMessagesManager', 'downloadMedia')).toBe(false);
  });

  it('forwards reads to the real managers', async() => {
    const real = makeReal();
    const {managers} = createLiveManagers(real);

    await expect(managers.appChatsManager.getChat(1 as any)).resolves.toEqual({id: 1});
    expect(real.spies.getChat).toHaveBeenCalledWith(1);
  });

  it('holds back writes and records them instead of calling through', async() => {
    const real = makeReal();
    const controller = createLiveManagers(real);
    const blocked: string[] = [];
    controller.onBlocked = ({manager, method}) => blocked.push(`${manager}.${method}`);

    await expect(controller.managers.appMessagesManager.deleteMessages(1 as any, [1], true)).resolves.toBeUndefined();
    await expect(controller.managers.appChatsManager.leave(1 as any)).resolves.toBeUndefined();

    expect(real.spies.deleteMessages).not.toHaveBeenCalled();
    expect(real.spies.leave).not.toHaveBeenCalled();
    expect(blocked).toEqual(['appMessagesManager.deleteMessages', 'appChatsManager.leave']);
    expect(controller.blocked).toHaveLength(2);
  });

  it('fails closed: a method nobody recognises counts as a write', async() => {
    const real = {someManager: {frobnicate: vi.fn().mockResolvedValue('done')}} as any;
    const controller = createLiveManagers(real);

    await expect((controller.managers as any).someManager.frobnicate()).resolves.toBeUndefined();
    expect(real.someManager.frobnicate).not.toHaveBeenCalled();
  });

  it('lets writes through once the panel unblocks them', async() => {
    const real = makeReal();
    const controller = createLiveManagers(real);
    controller.allowWrites = true;

    await expect(controller.managers.appMessagesManager.deleteMessages(1 as any, [1], true)).resolves.toBe(true);
    expect(real.spies.deleteMessages).toHaveBeenCalledWith(1, [1], true);
    expect(controller.blocked).toHaveLength(0);
  });

  it('guards the acknowledged/all sibling proxies the same way', async() => {
    const real = makeReal();
    real.acknowledged = {appMessagesManager: {deleteMessages: vi.fn().mockResolvedValue(true)}};
    const controller = createLiveManagers(real);

    await expect(controller.managers.acknowledged.appMessagesManager.deleteMessages(1 as any, [1], true))
    .resolves.toBeUndefined();
    expect(real.acknowledged.appMessagesManager.deleteMessages).not.toHaveBeenCalled();
  });
});
