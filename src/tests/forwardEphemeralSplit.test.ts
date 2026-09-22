import {AppMessagesManager} from '@appManagers/appMessagesManager';
import {AppMessagesIdsManager} from '@appManagers/appMessagesIdsManager';
import {EPHEMERAL_MESSAGE_ID_OFFSET} from '@appManagers/constants';
import {Message} from '@layer';
import '@helpers/peerIdPolyfill';

const CHAT_ID = 777 as ChatId;
const FROM_PEER_ID = CHAT_ID.toPeerId(true);
const TO_PEER_ID = (55 as UserId).toPeerId(false);
const BOT_ID = 100 as UserId;

type InnerCall = {mids: number[], fromEphemeral: boolean};

function makeManager() {
  const manager = new AppMessagesManager() as any;
  const messages = new Map<number, Message.message>();
  const innerCalls: InnerCall[] = [];

  Object.assign(manager, {
    appPeersManager: {
      isChannel: (peerId: PeerId) => peerId === FROM_PEER_ID,
      getPeerMigratedTo: (): PeerId => undefined
    },
    appMessagesIdsManager: new AppMessagesIdsManager(),
    getMessageByPeer: (_peerId: PeerId, mid: number) => messages.get(mid),
    checkSendOptions: () => Promise.resolve(),
    forwardMessagesInner: (options: any) => {
      innerCalls.push({mids: options.mids, fromEphemeral: !!options.fromEphemeral});
      return Promise.resolve();
    }
  });

  const addRegular = (mid: number) => {
    messages.set(mid, {
      _: 'message', pFlags: {}, id: mid, mid, peerId: FROM_PEER_ID,
      peer_id: {_: 'peerChannel', channel_id: CHAT_ID}, date: 1, message: 'r' + mid
    } as Message.message);
    return mid;
  };

  const addEphemeral = (ephemeralId: number) => {
    const mid = EPHEMERAL_MESSAGE_ID_OFFSET + ephemeralId;
    messages.set(mid, {
      _: 'message', pFlags: {ephemeral: true}, id: mid, mid, peerId: FROM_PEER_ID,
      peer_id: {_: 'peerChannel', channel_id: CHAT_ID}, date: 1, message: 'e' + ephemeralId,
      ephemeral_id: ephemeralId, ephemeral_receiver_id: 1 as UserId
    } as Message.message);
    return mid;
  };

  const addAnchored = (mid: number, ephemeralId: number) => {
    messages.set(mid, {
      _: 'message', pFlags: {ephemeral_anchored: true}, id: mid, mid, peerId: FROM_PEER_ID,
      peer_id: {_: 'peerChannel', channel_id: CHAT_ID}, date: 1, message: 'a' + mid,
      ephemeral_id: ephemeralId, ephemeral_receiver_id: 1 as UserId
    } as Message.message);
    return mid;
  };

  return {manager, innerCalls, addRegular, addEphemeral, addAnchored};
}

const base = {peerId: TO_PEER_ID, fromPeerId: FROM_PEER_ID};

describe('layer 229 forwarding of ephemeral messages', () => {
  it('sends ephemeral and regular messages as separate requests', async() => {
    const {manager, innerCalls, addRegular, addEphemeral} = makeManager();
    const regular = [addRegular(1_000_010), addRegular(1_000_011)];
    const ephemeral = [addEphemeral(5), addEphemeral(6)];

    await manager.forwardMessages({...base, mids: [ephemeral[0], regular[0], ephemeral[1], regular[1]]});

    // the two id spaces cannot share one request
    expect(innerCalls).toHaveLength(2);
    const ephemeralCall = innerCalls.find((c) => c.fromEphemeral);
    const regularCall = innerCalls.find((c) => !c.fromEphemeral);
    expect(ephemeralCall.mids).toEqual(ephemeral);
    expect(regularCall.mids).toEqual(regular);
  });

  it('forwards an ephemeral-only selection', async() => {
    const {manager, innerCalls, addEphemeral} = makeManager();
    const mid = addEphemeral(7);

    await manager.forwardMessages({...base, mids: [mid]});

    expect(innerCalls).toEqual([{mids: [mid], fromEphemeral: true}]);
  });

  it('never forwards a message an ephemeral one is only standing in for', async() => {
    const {manager, innerCalls, addRegular, addAnchored} = makeManager();
    const regular = addRegular(1_000_020);
    const anchored = addAnchored(1_000_021, 9);

    await manager.forwardMessages({...base, mids: [regular, anchored]});

    expect(innerCalls).toEqual([{mids: [regular], fromEphemeral: false}]);
  });

  it('does nothing when the only message picked is an anchored stand-in', async() => {
    const {manager, innerCalls, addAnchored} = makeManager();

    await manager.forwardMessages({...base, mids: [addAnchored(1_000_030, 11)]});

    expect(innerCalls).toEqual([]);
  });

  it('refuses to forward into a reply to an ephemeral message', async() => {
    const {manager, innerCalls, addRegular, addEphemeral} = makeManager();

    await manager.forwardMessages({
      ...base,
      mids: [addRegular(1_000_040)],
      replyToMsgId: addEphemeral(12)
    });

    expect(innerCalls).toEqual([]);
  });
});
