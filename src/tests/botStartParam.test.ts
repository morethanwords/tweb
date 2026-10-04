import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import '@helpers/peerIdPolyfill';
import {BOT_START_PARAM} from '@appManagers/constants';
import createHistoryStorage from '@appManagers/utils/messages/createHistoryStorage';

let ChatBubbles: typeof import('@components/chat/bubbles').default;
let Chat: typeof import('@components/chat/chat').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
  Chat = (await import('@components/chat/chat')).default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

const botId = 100 as PeerId;

function isStartButtonNeeded(options: {count: number | null, mids?: number[], hasDialog?: boolean, isBlocked?: boolean}) {
  const historyStorage = createHistoryStorage(`history_${botId}`);
  historyStorage.count = options.count;
  options.mids?.forEach((mid) => historyStorage.history.push(mid));

  const harness = Object.assign(Object.create(Chat.prototype), {
    peerId: botId,
    managers: {
      appPeersManager: {
        isBot: () => Promise.resolve(true),
        isBotforum: () => Promise.resolve(false)
      },
      appMessagesManager: {
        getDialogOnly: () => Promise.resolve(options.hasDialog ? {} : undefined)
      },
      appProfileManager: {
        isCachedUserBlocked: () => Promise.resolve(!!options.isBlocked)
      }
    },
    getHistoryStorage: () => historyStorage
  });

  return (Chat.prototype.isStartButtonNeeded as () => Promise<boolean>).call(harness);
}

/**
 * Runs `settleBotStart` the way `setPeer` does once the history has
 * loaded: the input holds `startParam`, and the START button re-check answers
 * `isStartButtonNeeded`. `startAtOnce` is a link to the bot chat that is
 * already open.
 */
async function forceStartParam(
  startParam: string,
  isStartButtonNeeded: boolean,
  options: {startAtOnce?: boolean, isUserBlocked?: boolean, isBot?: boolean} = {}
) {
  const input = {
    startParam,
    startBot: vi.fn(),
    center: vi.fn(),
    setStartParam: vi.fn((value?: string) => {
      input.startParam = value;
    })
  };
  const harness = Object.assign(Object.create(ChatBubbles.prototype), {
    chat: {
      peerId: botId,
      isBot: options.isBot ?? true,
      input,
      isUserBlocked: !!options.isUserBlocked,
      isStartButtonNeeded: () => Promise.resolve(isStartButtonNeeded)
    }
  });

  (ChatBubbles.prototype as any).settleBotStart.call(harness, () => true, options.startAtOnce);
  await new Promise((resolve) => setTimeout(resolve));
  return input;
}

describe('whether a bot chat needs the START button', () => {
  test('not while the history is still loading', async() => {
    expect(await isStartButtonNeeded({count: null})).toBe(false);
  });

  test('once the server has answered the history as empty', async() => {
    expect(await isStartButtonNeeded({count: 0})).toBe(true);
  });

  test('not when the chat has messages', async() => {
    expect(await isStartButtonNeeded({count: 1, mids: [1]})).toBe(false);
    expect(await isStartButtonNeeded({count: null, hasDialog: true})).toBe(false);
  });

  test('always for a blocked bot', async() => {
    expect(await isStartButtonNeeded({count: 1, mids: [1], hasDialog: true, isBlocked: true})).toBe(true);
  });
});

describe('settling the START button once the history has loaded', () => {
  test('shows it for a chat that turned out empty', async() => {
    const input = await forceStartParam(undefined, true);

    expect(input.startParam).toBe(BOT_START_PARAM);
    expect(input.startBot).not.toHaveBeenCalled();
  });

  test('leaves the input alone for a chat with messages', async() => {
    const input = await forceStartParam(undefined, false);

    expect(input.startParam).toBeUndefined();
    expect(input.startBot).not.toHaveBeenCalled();
  });

  test('drops START instead of sending /start once the chat has messages', async() => {
    const input = await forceStartParam(BOT_START_PARAM, false);

    expect(input.startParam).toBeUndefined();
    expect(input.startBot).not.toHaveBeenCalled();
  });

  test('keeps START for a chat that is still empty', async() => {
    const input = await forceStartParam(BOT_START_PARAM, true);

    expect(input.startParam).toBe(BOT_START_PARAM);
    expect(input.startBot).not.toHaveBeenCalled();
  });

  test('starts the bot at once with a start parameter from a link when the chat has messages', async() => {
    const input = await forceStartParam('xyz', false);

    expect(input.startBot).toHaveBeenCalledOnce();
    expect(input.startParam).toBe('xyz');
  });

  test('shows START with a start parameter from a link when the chat is empty, and waits for a tap', async() => {
    const input = await forceStartParam('xyz', true);

    expect(input.startBot).not.toHaveBeenCalled();
    expect(input.startParam).toBe('xyz');
    expect(input.center).toHaveBeenCalled();
  });

  test('starts the bot at once from a link to the empty chat that is already open', async() => {
    const input = await forceStartParam('xyz', true, {startAtOnce: true});

    expect(input.startBot).toHaveBeenCalledOnce();
  });

  test('leaves a blocked bot to the START tap even for a link to the open chat', async() => {
    const input = await forceStartParam('xyz', true, {startAtOnce: true, isUserBlocked: true});

    expect(input.startBot).not.toHaveBeenCalled();
    expect(input.startParam).toBe('xyz');
  });

  test('leaves a chat that is not a bot alone', async() => {
    const input = await forceStartParam('xyz', false, {startAtOnce: true, isBot: false});

    expect(input.startBot).not.toHaveBeenCalled();
    expect(input.setStartParam).not.toHaveBeenCalled();
  });

  test('never sends /start for the START marker, even in the open chat', async() => {
    const input = await forceStartParam(BOT_START_PARAM, true, {startAtOnce: true});

    expect(input.startBot).not.toHaveBeenCalled();
    expect(input.startParam).toBe(BOT_START_PARAM);
  });
});
