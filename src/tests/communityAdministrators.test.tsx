import {render} from 'solid-js/web';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {ChannelParticipant} from '@layer';
import '@helpers/peerIdPolyfill';

const mocks = vi.hoisted(() => ({
  collected: undefined as Promise<void> | undefined,
  createSelectorForParticipants: vi.fn(),
  createSelectorForTab: vi.fn(),
  guard: vi.fn(),
  openRights: vi.fn(),
  selectorOptions: undefined as any,
  showPickUserPopup: vi.fn(),
  tab: undefined as any
}));

vi.mock('@components/buttonTsx', () => {
  const makeButton = (props: {
    class?: string,
    icon?: string,
    onClick?: () => void
  }): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = props.class || '';
    if(props.icon) {
      button.dataset.icon = props.icon;
    }
    if(props.onClick) {
      button.addEventListener('click', props.onClick);
    }
    return button;
  };
  return {default: Object.assign(makeButton, {Corner: makeButton})};
});

vi.mock('@components/checkboxFieldTsx', () => ({
  default: (): null => null
}));

vi.mock('@components/communities/useCommunityTabGuard', () => ({
  default: mocks.guard
}));

vi.mock('@components/popups/channelsTooMuch', () => ({
  handleChannelsTooMuch: vi.fn()
}));

vi.mock('@components/popups/pickUser', () => ({
  default: mocks.showPickUserPopup
}));

vi.mock('@components/rowTsx', () => {
  const Empty = (): null => null;
  return {
    default: Object.assign(Empty, {
      CheckboxFieldToggle: Empty,
      Title: Empty
    })
  };
});

vi.mock('@components/section', () => ({
  default: (): null => null
}));

vi.mock('@components/sidebarRight/tabs/participantsSelector', () => ({
  createSelectorForParticipants: mocks.createSelectorForParticipants,
  createSelectorForTab: mocks.createSelectorForTab
}));

vi.mock('@components/solidJsTabs/promiseCollector', () => ({
  usePromiseCollector: () => ({
    collect: (promise: Promise<void>) => {
      mocks.collected = promise;
    }
  })
}));

vi.mock('@components/solidJsTabs/superTabProvider', () => ({
  useSuperTab: () => [mocks.tab]
}));

vi.mock('@components/solidJsTabs/tabs', () => ({
  openCommunityUserPermissionsTab: mocks.openRights,
  openUserPermissionsTab: vi.fn()
}));

vi.mock('@components/wrappers/peerTitle', () => ({
  default: vi.fn(async() => document.createTextNode('Promoter'))
}));

vi.mock('@helpers/dom/createParticipantContextMenu', () => ({
  default: vi.fn()
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

import ChatAdministrators
from '@components/sidebarRight/tabs/chatAdministrators';

const communityId = 10 as ChatId;
const participantId = (20 as UserId).toPeerId(false);

function makeAdmin(): ChannelParticipant.channelParticipantAdmin {
  return {
    _: 'channelParticipantAdmin',
    pFlags: {can_edit: true},
    user_id: participantId.toUserId(),
    promoted_by: 1 as UserId,
    date: 1,
    admin_rights: {
      _: 'chatAdminRights',
      pFlags: {change_info: true}
    }
  };
}

describe('community administrators shared tab', () => {
  let container: HTMLDivElement;
  let dispose: VoidFunction;
  let getParticipantCandidates: ReturnType<typeof vi.fn>;
  let getParticipants: ReturnType<typeof vi.fn>;
  let hasRights: ReturnType<typeof vi.fn>;
  let selector: any;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.append(container);
    getParticipantCandidates = vi.fn().mockResolvedValue({
      participantIds: [participantId],
      nextOffset: {contacts: 1, recent: 0},
      isEnd: true
    });
    getParticipants = vi.fn().mockResolvedValue({
      _: 'channels.channelParticipants',
      count: 1,
      participants: [makeAdmin()],
      chats: [],
      users: []
    });
    hasRights = vi.fn().mockResolvedValue(true);
    selector = {
      deletePeerId: vi.fn(),
      list: document.createElement('ul'),
      participants: new Map(),
      renderResultsFunc: vi.fn(async() => undefined),
      scrollable: {
        append: vi.fn(),
        container: document.createElement('div')
      }
    };
    mocks.createSelectorForTab.mockImplementation((options) => {
      mocks.selectorOptions = options;
      return {
        selector,
        loadPromise: Promise.resolve()
      };
    });
    mocks.showPickUserPopup.mockReturnValue({});
    mocks.collected = undefined;
    mocks.openRights.mockReset();
    const tabContent = document.createElement('div');
    const tabContainer = document.createElement('div');
    mocks.tab = {
      close: vi.fn(),
      container: tabContainer,
      content: tabContent,
      listenerSetter: {},
      managers: {
        appCommunitiesManager: {
          getParticipantCandidates,
          hasRights
        },
        appProfileManager: {
          getChannelParticipants: getParticipants
        }
      },
      middlewareHelper: {
        get: () => () => true
      },
      payload: {communityId},
      slider: {
        createTab: vi.fn(() => ({open: mocks.openRights}))
      }
    };
  });

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    document.body.replaceChildren();
  });

  it('reuses the chat selector, search, add popup and rights navigation', async() => {
    dispose = render(() => <ChatAdministrators />, container);
    await mocks.collected;

    expect(mocks.guard).toHaveBeenCalledWith(mocks.tab, communityId);
    expect(hasRights).toHaveBeenCalledWith(communityId, 'add_admins');
    expect(mocks.createSelectorForParticipants).not.toHaveBeenCalled();
    expect(mocks.createSelectorForTab).toHaveBeenCalledOnce();
    expect(mocks.selectorOptions.peerType).toEqual(['custom']);
    expect(mocks.tab.container.classList).toContain('edit-peer-container');
    expect(mocks.tab.container.classList)
    .toContain('chat-administrators-container');

    const result = await mocks.selectorOptions.getMoreCustom(
      'alice',
      () => true
    );
    expect(getParticipants).toHaveBeenCalledWith({
      id: communityId,
      filter: {
        _: 'channelParticipantsAdmins',
        q: 'alice'
      },
      offset: 0,
      limit: 50
    });
    expect(result).toEqual({result: [participantId], isEnd: true});
    expect(selector.participants.get(participantId)).toEqual(makeAdmin());

    mocks.selectorOptions.onSelect(participantId);
    expect(mocks.openRights).toHaveBeenCalledWith(
      mocks.tab.slider,
      communityId,
      participantId,
      makeAdmin(),
      expect.any(Function)
    );

    const addButton = mocks.tab.content.querySelector(
      '[data-icon="addmember_filled"]'
    ) as HTMLButtonElement;
    addButton.click();
    expect(mocks.showPickUserPopup).toHaveBeenCalledWith(
      expect.objectContaining({
        titleLangKey: 'Administrators',
        peerType: ['custom'],
        placeholder: 'SearchPlaceholder'
      })
    );
    const pickerOptions = mocks.showPickUserPopup.mock.calls[0][0];
    await expect(pickerOptions.getMoreCustom('', () => true))
    .resolves.toEqual({result: [participantId], isEnd: true});
    expect(getParticipantCandidates).toHaveBeenCalledWith({
      communityId,
      query: '',
      offset: {contacts: 0, recent: 0},
      limit: 50
    });
  });

  it('does not finish initialization after the Solid root is disposed', async() => {
    let resolveRights: (value: boolean) => void;
    hasRights.mockReturnValue(new Promise<boolean>((resolve) => {
      resolveRights = resolve;
    }));
    dispose = render(() => <ChatAdministrators />, container);
    const collected = mocks.collected;

    dispose();
    dispose = undefined;
    resolveRights(true);
    await collected;

    expect(mocks.createSelectorForTab).not.toHaveBeenCalled();
    expect(mocks.tab.content.childElementCount).toBe(0);
    expect(mocks.tab.container.classList)
    .not.toContain('chat-administrators-container');
  });
});
