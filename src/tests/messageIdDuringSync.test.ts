import noop from '@helpers/noop';
import createUpdatesManager from '@/tests/helpers/updatesManager';
import {Updates} from '@layer';

// The answer to a message sent while the app is catching up (a getDifference at start or after a
// reconnect) names the sent message's id by its random id. That update has no pts of its own and no
// difference brings it again, while the message itself may come through its channel's state, which is not
// catching up: the id is kept whatever the account's state is doing, as tdesktop does (feedMessageIds),
// or the message is shown twice and its temporary copy waits for good.

const channelId = 50 as ChatId;

function setup() {
  const {manager, saved} = createUpdatesManager();
  manager.updatesState.syncLoading = new Promise(noop);
  manager.addChannelState(channelId, 10);

  return {manager, saved};
}

const sentToChannel: Updates.updates = {
  _: 'updates',
  users: [],
  chats: [],
  date: 2,
  seq: 0,
  updates: [{
    _: 'updateMessageID',
    id: 11,
    random_id: '77'
  }, {
    _: 'updateNewChannelMessage',
    message: {
      _: 'message',
      id: 11,
      peer_id: {_: 'peerChannel', channel_id: channelId},
      pFlags: {out: true},
      date: 2,
      message: 'sent'
    },
    pts: 11,
    pts_count: 1
  }]
};

describe('a message sent while the account catches up', () => {
  test('keeps the id of the message it sent', () => {
    const {manager, saved} = setup();

    manager.processUpdateMessage(sentToChannel);

    expect(saved.map((update) => update._)).toEqual(['updateMessageID', 'updateNewChannelMessage']);
  });

  test('other updates of the account still wait for the difference', () => {
    const {manager, saved} = setup();

    manager.processUpdateMessage({
      _: 'updateShort',
      date: 2,
      update: {_: 'updateDialogUnreadMark', pFlags: {}, peer: {_: 'dialogPeer', peer: {_: 'peerUser', user_id: 5}}}
    } as Updates.updateShort);

    expect(saved).toEqual([]);
  });
});
