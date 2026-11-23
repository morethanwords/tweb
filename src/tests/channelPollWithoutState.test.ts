import createUpdatesManager from '@/tests/helpers/updatesManager';

// An open chat that may miss updates (a channel the user is not in, a forum, a chat shown from a saved scroll
// position) polls its channel's difference, which starts from the channel's pts. A chat whose pts is not known yet
// (its dialog or history is still on its way), or a basic group, which has no channel difference at all, threw from
// every poll — every 3 s for as long as the chat stayed open — and failed the subscription's own call.

const chatId = 50 as ChatId;

function setup() {
  const {manager} = createUpdatesManager();
  const getChannelDifference = manager.getChannelDifference = vi.fn();

  return {manager, getChannelDifference};
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('polling a chat whose pts the client does not know', () => {
  test('asks for nothing and throws nothing', () => {
    const {manager, getChannelDifference} = setup();

    expect(() => manager.subscribeToChannelUpdates(chatId)).not.toThrow();
    expect(() => vi.advanceTimersByTime(9000)).not.toThrow();

    expect(getChannelDifference).not.toHaveBeenCalled();
    manager.unsubscribeFromChannelUpdates(chatId);
  });

  test('starts once the pts is known', () => {
    const {manager, getChannelDifference} = setup();

    manager.subscribeToChannelUpdates(chatId);
    manager.addChannelState(chatId, 100);
    vi.advanceTimersByTime(3000);

    expect(getChannelDifference).toHaveBeenCalledWith(chatId);
    manager.unsubscribeFromChannelUpdates(chatId);
  });
});
