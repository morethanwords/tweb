import '@helpers/peerIdPolyfill';
import makeUploadFileManager from '@/tests/helpers/uploadFileManager';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import type {Progress} from '@lib/appDownloadManager';

describe('ApiFileManager.upload progress', () => {
  it('tells the upload\'s listeners how far it has gone, as well as the tabs', async() => {
    const {manager, dispatchEvent} = makeUploadFileManager();
    // two parts of 64 KB: the part size of a file this small
    const file = new Blob([new Uint8Array(64 * 1024 + 1)]);
    const upload = manager.upload({file, fileName: 'two-parts'});
    const heard: Progress[] = [];
    // * how the message being sent hears it, to tell the chat that a file is being sent
    upload.addNotifyListener((progress: Progress) => heard.push(progress));

    await upload;

    expect(heard.map(({done, total}) => [done, total]).sort(([a], [b]) => a - b)).toEqual([
      [64 * 1024, file.size],
      [file.size, file.size]
    ]);
    expect(dispatchEvent.mock.calls.filter(([name]) => name === 'download_progress')).toHaveLength(2);
  });
});

describe('AppMessagesManager: telling a chat that files are being sent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeMessagesManager(forumPeerIds: PeerId[] = []) {
    const manager = new AppMessagesManager() as any;
    const invokeApi = vi.fn().mockResolvedValue(true);
    Object.assign(manager, {
      apiManager: {invokeApi},
      appPeersManager: {
        getInputPeerById: (peerId: PeerId) => ({_: 'inputPeerChat', chat_id: peerId}),
        isForum: (peerId: PeerId) => forumPeerIds.includes(peerId),
        isBotforum: () => false,
        isMonoforum: () => false,
        peerId: (99 as UserId).toPeerId(false)
      }
    });
    vi.spyOn(manager, 'canSendToPeer').mockResolvedValue(true);

    // what reaches the server: [chat, topic, action]
    const sent = () => invokeApi.mock.calls
    .filter(([method]) => method === 'messages.setTyping')
    .map(([, params]) => [params.peer.chat_id, params.top_msg_id, params.action._]);
    const report = async(peerId: PeerId, actionName: string, threadId?: number) => {
      manager.sendUploadAction(peerId, threadId, {_: actionName, progress: 50});
      await vi.advanceTimersByTimeAsync(0);
    };

    return {sent, report};
  }

  const PHOTO = 'sendMessageUploadPhotoAction';
  const VIDEO = 'sendMessageUploadVideoAction';

  it('tells it at most once in 5 s for each kind of file, however the uploads\' parts interleave', async() => {
    vi.useFakeTimers();
    const chat = (42 as ChatId).toPeerId(true);
    const otherChat = (43 as ChatId).toPeerId(true);
    const {sent, report} = makeMessagesManager();

    // an album of photos and videos: their parts answer in turns
    for(let i = 0; i < 8; ++i) {
      await report(chat, i % 2 ? VIDEO : PHOTO);
    }
    await report(otherChat, PHOTO);

    expect(sent()).toEqual([[chat, undefined, PHOTO], [chat, undefined, VIDEO], [otherChat, undefined, PHOTO]]);
  });

  it('tells it again every 5 s while a file uploads, though its last word is still showing', async() => {
    vi.useFakeTimers();
    const chat = (42 as ChatId).toPeerId(true);
    const {sent, report} = makeMessagesManager();

    await report(chat, PHOTO);
    await vi.advanceTimersByTimeAsync(4999);
    await report(chat, PHOTO);
    expect(sent()).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(1);
    await report(chat, PHOTO);
    expect(sent()).toEqual([[chat, undefined, PHOTO], [chat, undefined, PHOTO]]);
  });

  it('counts a group\'s comment threads as the group, and a forum\'s topics each on its own', async() => {
    vi.useFakeTimers();
    const group = (42 as ChatId).toPeerId(true);
    const forum = (44 as ChatId).toPeerId(true);
    const {sent, report} = makeMessagesManager([forum]);

    await report(group, PHOTO, 5);
    await report(group, PHOTO, 6);
    await report(forum, PHOTO, 5);
    await report(forum, PHOTO, 6);

    expect(sent()).toEqual([[group, undefined, PHOTO], [forum, 5, PHOTO], [forum, 6, PHOTO]]);
  });
});
