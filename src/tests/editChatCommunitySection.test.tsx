import {createSignal} from 'solid-js';
import {render} from 'solid-js/web';
import {afterEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  onAdd: vi.fn(),
  onOpenCommunity: vi.fn(),
  onRemove: vi.fn(() => Promise.resolve())
}));

vi.mock('@components/buttonTsx', () => ({
  default: (props: any) => (
    <button type="button" data-testid={props.text} onClick={props.onClick}>
      {props.text}
    </button>
  )
}));

vi.mock('@components/communities/communityPeerDialogList', () => ({
  CommunityDialogList: (props: any) => (
    <button
      type="button"
      data-testid="community-dialog"
      onClick={() => props.onClick(props.communities[0])}
    />
  )
}));

vi.mock('@components/rowTsx', () => {
  const Row = (props: any) => (
    <button type="button" onClick={props.clickable}>
      {props.children}
    </button>
  );
  Row.Icon = () => <span />;
  Row.Title = (props: any) => <span>{props.children}</span>;
  return {default: Row};
});

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

import CommunityLinkSection
from '@components/communities/communityLinkSection';

describe('CommunityLinkSection', () => {
  let dispose: VoidFunction;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it('uses Section and reacts to the linked Community id', async() => {
    const communityId = 30 as ChatId;
    const community = {
      _: 'community',
      id: communityId.toPeerId(true),
      pFlags: {},
      title: 'Test Community'
    } as any;
    const [linkedCommunityId, setLinkedCommunityId] = createSignal<ChatId>();
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityLinkSection
        linkedCommunityId={linkedCommunityId()}
        communities={[community]}
        middleware={{} as any}
        caption="Community.Description"
        addIcon="newgroup"
        addText="Community.AddGroup"
        removeText="Community.RemoveGroup"
        onAdd={mocks.onAdd}
        onOpenCommunity={mocks.onOpenCommunity}
        onRemove={mocks.onRemove}
      />
    ), container);

    expect(
      container.querySelector('.sidebar-left-section-container')
    ).not.toBeNull();
    expect(container.textContent).toContain('Community.AddGroup');

    setLinkedCommunityId(communityId);

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="community-dialog"]'))
      .not.toBeNull();
      expect(container.textContent).toContain('Community.RemoveGroup');
    });
    container.querySelector<HTMLButtonElement>(
      '[data-testid="community-dialog"]'
    ).click();
    expect(mocks.onOpenCommunity).toHaveBeenCalledWith(communityId);
  });
});
