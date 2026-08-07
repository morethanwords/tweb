import {render} from 'solid-js/web';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  confirmationPopup: vi.fn(() => Promise.resolve()),
  openAdd: vi.fn(),
  openCommunity: vi.fn(),
  sectionProps: undefined as any,
  setUser: undefined as (user: any) => void,
  toastNew: vi.fn()
}));

vi.mock('@components/communities/communityLinkSection', () => ({
  default: (props: any) => {
    mocks.sectionProps = props;
    return (
      <div data-linked-community-id={props.linkedCommunityId || ''}>
        <button type="button" data-testid="add" onClick={props.onAdd} />
        <button
          type="button"
          data-testid="open"
          onClick={() => props.onOpenCommunity(props.linkedCommunityId)}
        />
        <button
          type="button"
          data-testid="remove"
          onClick={() => props.onRemove(props.linkedCommunityId)}
        />
      </div>
    );
  }
}));

vi.mock('@components/confirmationPopup', () => ({
  default: mocks.confirmationPopup
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  AppAddGroupToCommunityTab: class {}
}));

vi.mock('@components/toast', () => ({
  toastNew: mocks.toastNew
}));

vi.mock('@lib/appDialogsManager', () => ({
  default: {
    toggleForumTabByPeerId: mocks.openCommunity
  }
}));

vi.mock('@stores/peers', async() => {
  const {createSignal} = await import('solid-js');
  const [user, setUser] = createSignal<any>();
  mocks.setUser = setUser;
  return {
    useUser: () => user
  };
});

import EditBotCommunitySection
from '@components/communities/editBotCommunitySection';

describe('EditBotCommunitySection', () => {
  let container: HTMLDivElement;
  let dispose: VoidFunction;
  let getJoinedCommunities: ReturnType<typeof vi.fn>;
  let getChatFull: ReturnType<typeof vi.fn>;
  let tab: any;
  let togglePeerLink: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    getJoinedCommunities = vi.fn();
    getChatFull = vi.fn().mockResolvedValue(undefined);
    togglePeerLink = vi.fn().mockResolvedValue(undefined);
    tab = {
      managers: {
        appProfileManager: {getChatFull},
        appCommunitiesManager: {
          getJoinedCommunities,
          togglePeerLink
        }
      },
      middlewareHelper: {
        get: () => (() => true)
      },
      slider: {
        createTab: vi.fn(() => ({open: mocks.openAdd}))
      }
    };
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  it('reacts to the bot link and delegates add, open and remove actions', async() => {
    const botId = 10 as UserId;
    const peerId = botId.toPeerId(false);
    const communityId = 20 as ChatId;
    const initialUser = {
      _: 'user',
      id: botId,
      pFlags: {bot: true, bot_can_edit: true},
      first_name: 'Test Bot'
    } as any;
    const linkedUser = {
      ...initialUser,
      linked_community_id: communityId.toPeerId(true)
    };
    const community = {
      _: 'community',
      id: communityId.toPeerId(true),
      pFlags: {},
      title: 'Test Community'
    } as any;
    getJoinedCommunities.mockResolvedValue([community]);
    mocks.setUser(initialUser);

    dispose = render(() => (
      <EditBotCommunitySection
        tab={tab}
        peerId={peerId}
        initialUser={initialUser}
        initialCommunities={[]}
      />
    ), container);

    container.querySelector<HTMLButtonElement>('[data-testid="add"]').click();
    expect(mocks.openAdd).toHaveBeenCalledWith({peerId});

    mocks.setUser(linkedUser);
    await vi.waitFor(() => {
      expect(getJoinedCommunities).toHaveBeenCalledWith(true);
      expect(container.firstElementChild?.getAttribute(
        'data-linked-community-id'
      )).toBe(String(communityId));
    });
    expect(getChatFull).toHaveBeenCalledWith(communityId);

    container.querySelector<HTMLButtonElement>('[data-testid="open"]').click();
    expect(mocks.openCommunity).toHaveBeenCalledWith(
      communityId.toPeerId(true),
      true,
      false
    );

    container.querySelector<HTMLButtonElement>('[data-testid="remove"]').click();
    await vi.waitFor(() => {
      expect(togglePeerLink).toHaveBeenCalledWith({
        communityId,
        peerId,
        action: 'deleted'
      });
    });
    expect(mocks.confirmationPopup).toHaveBeenCalledWith(
      expect.objectContaining({
        descriptionLangArgs: ['Test Bot']
      })
    );
    expect(mocks.toastNew).toHaveBeenCalledWith({
      langPackKey: 'Community.BotRemoved'
    });
  });
});
