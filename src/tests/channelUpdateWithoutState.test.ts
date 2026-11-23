import createUpdatesManager, {newChannelMessageUpdate, push} from '@/tests/helpers/updatesManager';

// A channel's updates are checked against the pts the client keeps for it. A channel it keeps none for
// yet — a group whose dialog is not loaded in the chat list, or any channel after a difference too long
// dropped the states — starts on its first update, and that update is applied (tdesktop's PtsWaiter::check
// inits on it and applies it). Taken for a duplicate of itself, a group's message was lost: the chat did
// not come up in the list and nothing was notified.

const channelId = 50 as ChatId;

function setup() {
  const {manager, saved} = createUpdatesManager();
  const getChannelDifference = manager.getChannelDifference = vi.fn();

  return {manager, saved, getChannelDifference};
}

function newChannelMessage(id: number, pts: number) {
  return newChannelMessageUpdate(channelId, id, pts);
}

describe('a channel the client keeps no pts for yet', () => {
  test('applies its first update and goes on from it', () => {
    const {manager, saved} = setup();

    push(manager, newChannelMessage(11, 101));

    expect(saved.map((update) => update._)).toEqual(['updateNewChannelMessage']);
    expect(manager.getChannelState(channelId).pts).toBe(101);

    push(manager, newChannelMessage(12, 102));
    expect(saved).toHaveLength(2);
    expect(manager.getChannelState(channelId).pts).toBe(102);
  });

  test('a gap after its first update is still a gap', () => {
    const {manager, saved} = setup();

    push(manager, newChannelMessage(11, 101));
    push(manager, newChannelMessage(13, 103));

    expect(saved).toHaveLength(1);
    expect(manager.getChannelState(channelId).pts).toBe(101);
    expect(manager.getChannelState(channelId).pendingPtsUpdates).toHaveLength(1);
  });

  test('the same update again is a duplicate', () => {
    const {manager, saved} = setup();

    push(manager, newChannelMessage(11, 101));
    push(manager, newChannelMessage(11, 101));

    expect(saved).toHaveLength(1);
  });

  test('a channel with a state keeps it', () => {
    const {manager, saved} = setup();
    manager.addChannelState(channelId, 101);

    push(manager, newChannelMessage(11, 101));

    expect(saved).toEqual([]);
  });

  test('an update it cannot show yet is asked for again with the channel\'s difference', () => {
    const {manager, saved, getChannelDifference} = setup();
    manager.appUsersManager.hasUser = () => false;

    push(manager, newChannelMessage(11, 101));

    expect(saved).toEqual([]);
    expect(getChannelDifference).toHaveBeenCalledWith(channelId);
    // * the difference starts from before the update, so it brings it
    expect(manager.getChannelState(channelId).pts).toBe(100);
  });
});
