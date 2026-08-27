import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  setInnerPeer: vi.fn()
}));

vi.mock('@lib/solidjs/hotReloadGuard', () => ({
  useHotReloadGuard: () => ({
    appImManager: {setInnerPeer: mocks.setInnerPeer},
    PeerTitleTsx: (props: {ref?: (element: HTMLElement) => void}) => (
      <span ref={props.ref}>Topic</span>
    )
  })
}));

vi.mock('@components/iconTsx', () => ({
  IconTsx: () => <span />
}));

import ChatThreadSeparator from '@components/chat/bubbleParts/chatThreadSeparator';

class IntersectionObserverMock {
  public static instances: IntersectionObserverMock[] = [];
  public readonly options: IntersectionObserverInit;

  constructor(_callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
    this.options = options;
    IntersectionObserverMock.instances.push(this);
  }

  public observe() {}
  public unobserve() {}
  public disconnect() {}
  public takeRecords(): IntersectionObserverEntry[] { return []; }
  public root: Element | Document | null = null;
  public rootMargin = '';
  public thresholds: ReadonlyArray<number> = [];
}

function mountSeparator() {
  const scrollContainer = document.createElement('div');
  const floatingSeparatorsContainer = document.createElement('div');
  const bubble = document.createElement('div');
  const separator = new ChatThreadSeparator;
  const bubbles = {
    scrollable: {container: scrollContainer},
    floatingSeparatorsContainer,
    chat: {chatPaddingTop: [() => 94]},
    separatorIntersectorRoot: undefined
  } as any;

  separator.feedProps({
    bubbles,
    peerId: 100 as PeerId,
    threadId: 50,
    targetPeerId: 100 as PeerId,
    targetThreadId: 50,
    index: 0
  });
  bubble.append(separator);
  scrollContainer.append(bubble);
  document.body.append(scrollContainer, floatingSeparatorsContainer);

  return {bubbles, floatingSeparatorsContainer, separator};
}

beforeEach(() => {
  IntersectionObserverMock.instances = [];
  vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);
});

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('ChatThreadSeparator', () => {
  it('opens the topic as an inner chat', () => {
    const {separator} = mountSeparator();

    (separator.firstElementChild as HTMLElement).click();

    expect(mocks.setInnerPeer).toHaveBeenCalledWith({
      peerId: 100,
      monoforumThreadId: undefined,
      threadId: 50
    });
  });

  it('uses the dynamic chat padding for both sticky thresholds and position', () => {
    const {bubbles, floatingSeparatorsContainer} = mountSeparator();
    const portal = floatingSeparatorsContainer.firstElementChild as HTMLElement;
    const floating = portal.firstElementChild as HTMLElement;

    expect(floating.style.getPropertyValue('--top')).toBe('128px');
    expect(IntersectionObserverMock.instances[0].options.rootMargin).toBe('-158px 0px 0px 0px');

    bubbles.separatorIntersectorRoot.setTopOffset(96);
    expect(IntersectionObserverMock.instances[1].options.rootMargin).toBe('-160px 0px 0px 0px');
  });
});
