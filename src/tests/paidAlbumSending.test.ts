import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {Message} from '@layer';
import noop from '@helpers/noop';
import pause from '@helpers/schedulers/pause';

// A paid album is one message carrying all its media: the first file makes it, and every other file
// goes into it. None of them may become a message of its own, which nothing would ever send.

const peerId = (-77 as ChatId).toPeerId(true);

function setup() {
  const manager = new AppMessagesManager();
  let nextId = 1;
  const made: Message.message[] = [];
  const sendFile = vi.spyOn(manager, 'sendFile').mockImplementation(async(options: any) => {
    await pause(0); // * sendFile checks the send options before it makes the message
    const message = options.groupedMessage || {
      _: 'message',
      id: nextId,
      mid: nextId++,
      peerId,
      pFlags: {is_outgoing: true},
      date: 0,
      message: '',
      random_id: '' + nextId
    } as Message.message;
    if(!options.groupedMessage) made.push(message);
    return {message, send: () => new Promise(noop), uploadingFileName: 'file' + made.length} as any;
  });

  Object.assign(manager as any, {
    log: Object.assign(vi.fn(), {bindPrefix: () => Object.assign(vi.fn(), {error: vi.fn()})}),
    appPeersManager: {
      getPeerMigratedTo: (): PeerId => undefined,
      getInputPeerById: () => ({_: 'inputPeerChannel', channel_id: 77, access_hash: '0'})
    },
    mediaTempMap: {}
  });
  vi.spyOn(manager as any, 'getEphemeralSendContext').mockReturnValue(undefined);
  vi.spyOn(manager as any, 'checkSendOptions').mockResolvedValue(undefined);
  vi.spyOn(manager as any, 'generateOutgoingPaidMedia').mockReturnValue({_: 'messageMediaPaidMedia'});

  return {manager, sendFile, made};
}

const files = (count: number) => Array.from({length: count}, () => ({file: new Blob(['x'])} as any));

describe('sending an album', () => {
  test('a paid album makes one message, and its other files go into it', async() => {
    const {manager, sendFile, made} = setup();

    void manager.sendGrouped({peerId, stars: 10, sendFileDetails: files(3)});
    await pause(10);

    expect(sendFile).toHaveBeenCalledTimes(3);
    expect(made).toHaveLength(1);
    expect(sendFile.mock.calls.map(([options]) => options.groupedMessage)).toEqual([undefined, made[0], made[0]]);
  });

  test('a free album still makes a message for each file', async() => {
    const {manager, sendFile, made} = setup();

    void manager.sendGrouped({peerId, sendFileDetails: files(3)});
    await pause(10);

    expect(sendFile).toHaveBeenCalledTimes(3);
    expect(made.map((message) => message.mid)).toEqual([1, 2, 3]);
  });

  test('two paid albums sent at once keep their files\' ids each in one run', async() => {
    const {manager, sendFile} = setup();
    const first = (manager as any).mediaTempId as number;

    void manager.sendGrouped({peerId, stars: 10, sendFileDetails: files(3)});
    void manager.sendGrouped({peerId, stars: 20, sendFileDetails: files(2)});
    await pause(10);

    const idsOf = (stars: number) => sendFile.mock.calls
    .filter(([options]) => options.stars === stars)
    .map(([options]) => options.mediaTempId);
    expect(idsOf(10)).toEqual([first, first + 1, first + 2]);
    expect(idsOf(20)).toEqual([first + 3, first + 4]);
  });
});
