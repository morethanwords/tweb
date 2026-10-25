import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';
import type {Message} from '@layer';
import {ChatType} from '@components/chat/chatType';

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

describe.each([false, true])('a message appended at the bottom (short history: %s)', (shortHistory) => {
  it.each([false, true])('follows a new post, but leaves an ad below the viewport (sponsored: %s)', async(sponsored) => {
    const message = {
      _: 'message',
      pFlags: {sponsored},
      peerId: 10,
      mid: 100,
      date: 1,
      message: ''
    } as unknown as Message.message;
    const render = vi.fn(async() => {});
    const scrollToEnd = vi.fn(async() => {});
    const cancelPreservePaddingScroll = vi.fn();
    const chatInner = document.createElement('div');
    const setScrollPositionSilently = vi.fn();
    const harness = Object.assign(Object.create(ChatBubbles.prototype), {
      chat: {type: ChatType.Chat, cancelPreservePaddingScroll},
      chatInner,
      scrollable: {
        loadedAll: {bottom: true},
        container: {clientHeight: 500, scrollHeight: shortHistory ? 500 : 1000},
        setScrollPositionSilently
      },
      scrolledDown: true,
      getBubble: (): HTMLElement => undefined,
      renderGroupedItem: (): Promise<void> => undefined,
      getMiddleware: () => () => true,
      performHistoryResult: render,
      scrollToEnd
    });

    await (harness as any)._renderNewMessage(message);

    expect(render).toHaveBeenCalledWith({history: [message]}, false);
    expect(scrollToEnd).toHaveBeenCalledTimes(sponsored ? 0 : 1);
    expect(cancelPreservePaddingScroll).toHaveBeenCalledTimes(sponsored ? 0 : 2);
    expect(setScrollPositionSilently).toHaveBeenCalledTimes(shortHistory && !sponsored ? 1 : 0);
    expect(chatInner.style.paddingTop).toBe('');
  });
});
