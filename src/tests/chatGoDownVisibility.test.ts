import {loadChatBubbles, LOAD_CHAT_BUBBLES_TIMEOUT} from '@/tests/helpers/chatBubbles';

let ChatBubbles: typeof import('@components/chat/bubbles').default;

beforeAll(async() => {
  ChatBubbles = (await loadChatBubbles()).bubbles.default;
}, LOAD_CHAT_BUBBLES_TIMEOUT);

function createHarness(scrolledDown: boolean, bottomLoaded: boolean, searching = false) {
  const container = document.createElement('div');
  container.classList.toggle('search-results-active', searching);
  return Object.assign(Object.create(ChatBubbles.prototype), {
    container,
    chat: {container: document.createElement('div')},
    scrolledDown,
    scrollable: {
      loadedAll: {top: false, bottom: bottomLoaded},
      // During a heavy animation, the scroll handler can return without updating visibility.
      onScroll: vi.fn()
    },
    log: {bindPrefix: () => vi.fn()},
    loadEphemeralHistory: vi.fn()
  });
}

function isVisible(harness: ReturnType<typeof createHarness>) {
  return harness.chat.container.classList.contains('is-go-down-visible');
}

describe('the chat go-down button', () => {
  it('stays visible at the bottom of a loaded history slice that has newer messages', () => {
    const harness = createHarness(true, false);

    harness.updateGoDownVisibility();

    expect(isVisible(harness)).toBe(true);
  });

  it('hides at the actual end of the chat', () => {
    const harness = createHarness(true, true);

    harness.updateGoDownVisibility();

    expect(isVisible(harness)).toBe(false);
  });

  it('stays visible above the end even when the newest messages are loaded', () => {
    const harness = createHarness(false, true);

    harness.updateGoDownVisibility();

    expect(isVisible(harness)).toBe(true);
  });

  it('stays hidden while displaying search results', () => {
    const harness = createHarness(true, false, true);

    harness.updateGoDownVisibility();

    expect(isVisible(harness)).toBe(false);
  });

  it('updates when the history bottom is sliced out or loaded during an animation', async() => {
    const harness = createHarness(true, true);
    harness.updateGoDownVisibility();
    expect(isVisible(harness)).toBe(false);

    await harness.setLoaded('bottom', false, false);
    expect(isVisible(harness)).toBe(true);

    await harness.setLoaded('bottom', true, false);
    expect(isVisible(harness)).toBe(false);
  });
});
