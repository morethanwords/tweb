import {afterEach, describe, expect, it, vi} from 'vitest';
import {render} from 'solid-js/web';
import {createStore} from 'solid-js/store';
import {createSignal} from 'solid-js';
import {simulateClickEvent} from '@helpers/dom/clickEvent';
import '@helpers/peerIdPolyfill';
import CommunityAvatar, {
  getCloneableCommunityAvatarPeer,
  getCommunityAvatarStyle
} from '@components/communities/communityAvatar';
import {
  CommunityChangedBubble,
  CommunityChangedServiceBubble
} from '@components/chat/bubbles/communityChanged';
import CommunityChildBadge
from '@components/communities/communityChildBadge';
import {
  canSaveCommunityEdit,
  hasCommunityCreateChanges,
  hasCommunityEditChanges,
  saveCreatedCommunityFields,
  saveCurrentCommunityAvatar
} from '@components/communities/communityEditState';

vi.hoisted(() => {
  class IntersectionObserverMock {
    public observe() {}
    public unobserve() {}
    public disconnect() {}
    public takeRecords(): IntersectionObserverEntry[] { return []; }
  }

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    value: IntersectionObserverMock
  });
});

const mocks = vi.hoisted(() => ({
  peer: undefined as any,
  community: undefined as any,
  communityDialog: undefined as any,
  communityAccessor: undefined as (() => any) | undefined,
  forumTab: undefined as any,
  closeForum: vi.fn(),
  openCommunity: vi.fn(),
  wrapActionText: vi.fn(async() => {
    const span = document.createElement('span');
    span.textContent = 'Added to Community';
    return span;
  })
}));

vi.mock('@stores/peers', () => ({
  usePeer: () => () => mocks.peer
}));

vi.mock('@stores/communities', () => ({
  useCommunity: () => () => {
    return mocks.communityAccessor?.() ?? mocks.community;
  },
  useCommunityDialog: () => () => mocks.communityDialog
}));

vi.mock('@components/wrappers/messageActionTextNew', () => ({
  default: mocks.wrapActionText
}));

vi.mock('@lib/appDialogsManager', () => ({
  default: {
    get forumTab() {
      return mocks.forumTab;
    },
    toggleForumTab: mocks.closeForum,
    toggleForumTabByPeerId: mocks.openCommunity
  }
}));

vi.mock('@lib/langPack', () => ({
  i18n: (key: string) => document.createTextNode(key)
}));

vi.mock('@components/iconTsx', () => ({
  IconTsx: () => document.createElement('span')
}));

vi.mock('@components/avatarNew', () => ({
  AvatarNewTsx: (props: any) => {
    const element = document.createElement('span');
    element.dataset.peerKind = props.peer?._ || '';
    element.dataset.photoId = props.peer?.photo?.photo_id || '';
    return element;
  }
}));

let dispose: () => void;

afterEach(() => {
  dispose?.();
  dispose = undefined;
  mocks.communityAccessor = undefined;
  mocks.community = undefined;
  mocks.communityDialog = undefined;
  mocks.peer = undefined;
  mocks.forumTab = undefined;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('community child badge', () => {
  it('opens Community Chats without activating the parent dialog row', async() => {
    const communityId = 123 as ChatId;
    mocks.peer = {
      _: 'channel',
      linked_community_id: communityId.toPeerId(true)
    };
    mocks.community = {
      _: 'community',
      pFlags: {}
    };

    const list = document.createElement('ul');
    const row = document.createElement('a');
    const badgeMount = document.createElement('div');
    row.append(badgeMount);
    const onRowMouseDown = vi.fn();
    list.addEventListener('mousedown', (event) => {
      if((event.target as HTMLElement).closest('a')) {
        onRowMouseDown();
      }
    });
    list.addEventListener('click', (event) => {
      if((event.target as HTMLElement).closest('[data-dialog-list-action]')) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    }, {capture: true});
    list.append(row);
    document.body.append(list);
    dispose = render(() => (
      <CommunityChildBadge peerId={(456 as ChatId).toPeerId(true)} />
    ), badgeMount);

    const button = row.querySelector<HTMLButtonElement>('button');
    expect(button).toBeTruthy();
    expect(button.type).toBe('button');
    expect(button.tabIndex).toBe(0);
    expect(button.getAttribute('aria-label')).toBe('Community.Chats');
    expect(button.dataset.dialogListAction).toBe('true');
    expect(row.parentElement).toBe(list);
    expect(button.closest('a')).toBe(row);
    const avatarHitArea = button.firstElementChild as HTMLElement;
    expect(avatarHitArea.getAttribute('aria-hidden')).toBe('true');

    avatarHitArea.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true
    }));
    expect(onRowMouseDown).not.toHaveBeenCalled();

    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true
    });
    expect(avatarHitArea.dispatchEvent(event)).toBe(false);
    await vi.waitFor(() => {
      expect(mocks.openCommunity).toHaveBeenCalledWith(
        communityId.toPeerId(true),
        true,
        false
      );
    });
  });

  it('closes the current child forum instead of opening Community Chats', async() => {
    const communityId = 123 as ChatId;
    const peerId = (456 as ChatId).toPeerId(true);
    mocks.peer = {
      _: 'channel',
      linked_community_id: communityId.toPeerId(true)
    };
    mocks.forumTab = {peerId};

    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityChildBadge peerId={peerId} />
    ), container);

    container.querySelector('button').dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true
    }));

    await vi.waitFor(() => {
      expect(mocks.closeForum).toHaveBeenCalledOnce();
    });
    expect(mocks.openCommunity).not.toHaveBeenCalled();
  });

  it('stays visible when a collapsed child is restored explicitly', () => {
    const communityId = 123 as ChatId;
    mocks.peer = {
      _: 'channel',
      linked_community_id: communityId.toPeerId(true)
    };
    mocks.community = {
      _: 'community',
      pFlags: {collapsed_in_dialogs: true}
    };
    mocks.communityDialog = {
      _: 'communityDialog',
      communityId
    };

    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityChildBadge peerId={(456 as ChatId).toPeerId(true)} />
    ), container);

    expect(container.querySelector('button')).toBeTruthy();
  });

  it('stays available while the linked Community is still hydrating', () => {
    const communityId = 123 as ChatId;
    mocks.peer = {
      _: 'channel',
      linked_community_id: communityId.toPeerId(true)
    };
    mocks.community = undefined;

    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityChildBadge peerId={(456 as ChatId).toPeerId(true)} />
    ), container);

    expect(container.querySelector('button')).toBeTruthy();
  });

  it('returns after a collapsed Community projection is torn down', () => {
    const communityId = 123 as ChatId;
    mocks.peer = {
      _: 'channel',
      linked_community_id: communityId.toPeerId(true)
    };
    mocks.community = {
      _: 'community',
      pFlags: {collapsed_in_dialogs: true}
    };
    mocks.communityDialog = undefined;

    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityChildBadge peerId={(456 as ChatId).toPeerId(true)} />
    ), container);

    expect(container.querySelector('button')).toBeTruthy();
  });

  it('keeps the linked badge until a stale left Community link is cleared', () => {
    const communityId = 123 as ChatId;
    mocks.peer = {
      _: 'channel',
      linked_community_id: communityId.toPeerId(true)
    };
    mocks.community = {
      _: 'community',
      pFlags: {left: true}
    };

    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityChildBadge peerId={(456 as ChatId).toPeerId(true)} />
    ), container);

    expect(container.querySelector('button')).toBeTruthy();
  });
});

describe('community avatar transport', () => {
  it('scales the Community avatar and its SVG from one size variable', () => {
    expect(getCommunityAvatarStyle(100)).toEqual({
      '--community-avatar-size': '100px'
    });
    expect(getCommunityAvatarStyle(40)).toEqual({
      '--community-avatar-size': '40px'
    });
  });

  it('renders the supplied two-path SVG decoration behind the avatar', () => {
    const container = document.createElement('div');
    document.body.append(container);
    dispose = render(() => (
      <CommunityAvatar title="Community" size={100} />
    ), container);

    const svg = container.querySelector('svg');
    const paths = svg.querySelectorAll('path');
    expect(svg.getAttribute('width')).toBe('125');
    expect(svg.getAttribute('height')).toBe('100');
    expect(svg.getAttribute('viewBox')).toBe('0 0 125 100');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(paths).toHaveLength(2);
    expect([...paths].map((path) => path.getAttribute('opacity')))
    .toEqual(['0.15', '0.1']);
    expect([...paths].map((path) => path.getAttribute('fill')))
    .toEqual(['currentColor', 'currentColor']);
  });

  it('unwraps the Solid community before its photo crosses the worker port', () => {
    const [community] = createStore({
      _: 'community',
      id: 123,
      title: 'Community',
      pFlags: {},
      photo: {
        _: 'chatPhoto',
        pFlags: {},
        photo_id: '1',
        dc_id: 2
      }
    } as any);

    const peer = getCloneableCommunityAvatarPeer(community);

    expect(peer).not.toBe(community);
    expect(() => structuredClone(peer)).not.toThrow();
  });

  it('remounts the inner avatar when a mirrored Community photo changes', async() => {
    const [community, setCommunity] = createSignal<any>({
      _: 'community',
      id: 123,
      title: 'Community',
      pFlags: {},
      photo: {
        _: 'chatPhoto',
        pFlags: {},
        photo_id: '1',
        dc_id: 2
      }
    });
    const container = document.createElement('div');
    document.body.append(container);

    dispose = render(() => (
      <CommunityAvatar community={community()} size={80} />
    ), container);

    expect(container.querySelector<HTMLElement>('span')?.dataset.photoId)
    .toBe('1');

    setCommunity({
      ...community(),
      photo: {
        _: 'chatPhoto',
        pFlags: {},
        photo_id: '2',
        dc_id: 4
      }
    });

    await vi.waitFor(() => {
      expect(container.querySelector<HTMLElement>('span')?.dataset.photoId)
      .toBe('2');
    });
  });
});

describe('community changed bubble', () => {
  it('opens the Community only from the accessible View button', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const onViewClick = vi.fn();
    dispose = render(() => (
      <CommunityChangedBubble
        community={{
          _: 'community',
          id: 123,
          title: 'Community',
          pFlags: {}
        } as any}
        text={<span>Added to Community</span>}
        onViewClick={onViewClick}
      />
    ), container);

    const content = container.firstElementChild as HTMLElement;
    const buttons = container.querySelectorAll('button');
    expect(content.tagName).toBe('DIV');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].classList.contains('bubble-service-button')).toBe(true);
    expect(buttons[0].classList.contains('rp')).toBe(false);
    expect(content.querySelector<HTMLElement>('span[data-peer-kind]')?.dataset.peerKind)
    .toBe('community');
    expect([...content.querySelectorAll('svg path')].map((path) => path.getAttribute('fill')))
    .toEqual(['white', 'white']);
    expect(content.lastElementChild?.textContent)
    .toBe('Community.CommunityAdded.View');

    content.click();
    expect(onViewClick).not.toHaveBeenCalled();
    simulateClickEvent(buttons[0]);
    expect(onViewClick).toHaveBeenCalledOnce();
  });

  it('upgrades a historical service message when its Community is mirrored later', async() => {
    const communityId = 123 as ChatId;
    const [community, setCommunity] = createSignal<any>();
    mocks.communityAccessor = community;
    const container = document.createElement('div');
    const serviceContainer = document.createElement('div');
    const initialText = document.createElement('span');
    initialText.textContent = 'Added to Community';
    document.body.append(container);

    dispose = render(() => (
      <CommunityChangedServiceBubble
        communityId={communityId}
        initialText={initialText}
        message={{
          _: 'messageService',
          pFlags: {},
          id: 1,
          mid: 1,
          peerId: (456 as ChatId).toPeerId(true),
          peer_id: {
            _: 'peerChannel',
            channel_id: 456
          },
          date: 1,
          action: {
            _: 'messageActionChangeCommunity',
            community_id: communityId
          }
        } as any}
        onViewClick={vi.fn()}
        serviceContainer={serviceContainer}
      />
    ), container);

    expect(serviceContainer.classList.contains(
      'bubble-community-changed'
    )).toBe(false);
    expect(container.querySelector('button')).toBeNull();

    setCommunity({
      _: 'community',
      id: communityId,
      title: 'Community',
      pFlags: {}
    });
    await vi.waitFor(() => {
      expect(serviceContainer.classList.contains(
        'bubble-community-changed'
      )).toBe(true);
      expect(container.querySelector('button')).toBeTruthy();
    });
    expect(mocks.wrapActionText).toHaveBeenCalledTimes(2);
  });
});

describe('edit community dirty state', () => {
  const unchanged = {
    title: 'Community',
    savedTitle: 'Community',
    mode: 'all' as const,
    savedMode: 'all' as const,
    hasAvatarPreview: false,
    canEditInfo: true,
    canManageChats: true
  };

  it('tracks name, permissions and avatar independently', () => {
    expect(hasCommunityEditChanges(unchanged)).toBe(false);
    expect(hasCommunityEditChanges({
      ...unchanged,
      title: 'Renamed'
    })).toBe(true);
    expect(hasCommunityEditChanges({
      ...unchanged,
      mode: 'admins'
    })).toBe(true);
    expect(hasCommunityEditChanges({
      ...unchanged,
      hasAvatarPreview: true
    })).toBe(true);
  });

  it('only enables saving for valid dirty state outside an active save', () => {
    expect(canSaveCommunityEdit({
      ...unchanged,
      title: ' Renamed ',
      saving: false
    })).toBe(true);
    expect(canSaveCommunityEdit({
      ...unchanged,
      title: ' ',
      saving: false
    })).toBe(false);
    expect(canSaveCommunityEdit({
      ...unchanged,
      title: 'Renamed',
      saving: true
    })).toBe(false);
    expect(canSaveCommunityEdit({
      ...unchanged,
      title: ' Community ',
      saving: false
    })).toBe(false);
  });

  it('tracks and validates only changes allowed by each permission', () => {
    expect(hasCommunityEditChanges({
      ...unchanged,
      title: 'Renamed',
      canEditInfo: false
    })).toBe(false);
    expect(hasCommunityEditChanges({
      ...unchanged,
      mode: 'admins',
      canManageChats: false
    })).toBe(false);
    expect(canSaveCommunityEdit({
      ...unchanged,
      title: '',
      mode: 'admins',
      canEditInfo: false,
      saving: false
    })).toBe(true);
    expect(canSaveCommunityEdit({
      ...unchanged,
      title: '',
      canManageChats: false,
      saving: false
    })).toBe(false);
  });

  it('keeps a newer avatar payload selected while the previous one saves', async() => {
    type AvatarPayload = {
      file: () => Promise<string>
    };
    let resolveFile!: (file: string) => void;
    const previousPayload = {
      file: () => new Promise<string>((resolve) => {
        resolveFile = resolve;
      })
    } satisfies AvatarPayload;
    const nextPayload = {
      file: () => Promise.resolve('next')
    } satisfies AvatarPayload;
    let currentPayload: AvatarPayload | undefined = previousPayload;
    const save = vi.fn(async() => {});
    const clear = vi.fn(() => {
      currentPayload = undefined;
    });

    const saving = saveCurrentCommunityAvatar({
      getPayload: () => currentPayload,
      save,
      clear
    });
    currentPayload = nextPayload;
    resolveFile('previous');
    await saving;

    expect(save).toHaveBeenCalledWith({
      file: 'previous',
      video: undefined,
      videoStartTs: undefined
    });
    expect(clear).not.toHaveBeenCalled();
    expect(currentPayload).toBe(nextPayload);
  });

  it('clears the avatar payload that was successfully saved', async() => {
    const payload = {
      file: () => Promise.resolve('avatar')
    };
    let currentPayload: typeof payload | undefined = payload;
    const clear = vi.fn(() => {
      currentPayload = undefined;
    });

    await saveCurrentCommunityAvatar({
      getPayload: () => currentPayload,
      save: async() => {},
      clear
    });

    expect(clear).toHaveBeenCalledOnce();
    expect(currentPayload).toBeUndefined();
  });

  it('saves the complete photo and video avatar payload', async() => {
    const payload = {
      file: () => Promise.resolve('photo'),
      video: () => Promise.resolve('video'),
      videoStartTs: 1.25
    };
    const save = vi.fn(async() => {});

    await saveCurrentCommunityAvatar({
      getPayload: () => payload,
      save,
      clear: vi.fn()
    });

    expect(save).toHaveBeenCalledWith({
      file: 'photo',
      video: 'video',
      videoStartTs: 1.25
    });
  });
});

describe('create community partial saves', () => {
  it('keeps successful field baselines and resumes at the failed mutation', async() => {
    const current = {
      title: 'Renamed',
      visibility: 'hidden' as const,
      mode: 'admins' as const
    };
    const saved: {
      title: string,
      visibility: 'visible' | 'hidden',
      mode?: 'all' | 'admins'
    } = {
      title: 'Created',
      visibility: 'visible'
    };
    const saveTitle = vi.fn(async() => {});
    const saveVisibility = vi.fn()
    .mockRejectedValueOnce(new Error('visibility failed'))
    .mockResolvedValueOnce(undefined);
    const saveMode = vi.fn(async() => {});
    const save = () => saveCreatedCommunityFields({
      current,
      saved,
      saveTitle,
      saveVisibility,
      saveMode
    });

    await expect(save()).rejects.toThrow('visibility failed');
    expect(saved).toEqual({
      title: 'Renamed',
      visibility: 'visible'
    });
    expect(saveTitle).toHaveBeenCalledOnce();
    expect(saveVisibility).toHaveBeenCalledOnce();
    expect(saveMode).not.toHaveBeenCalled();

    await save();
    expect(saved).toEqual(current);
    expect(saveTitle).toHaveBeenCalledOnce();
    expect(saveVisibility).toHaveBeenCalledTimes(2);
    expect(saveMode).toHaveBeenCalledOnce();
    expect(hasCommunityCreateChanges(current, saved)).toBe(false);
  });

  it('leaves edits made during a successful mutation dirty for the next save', async() => {
    const current: {
      title: string,
      visibility: 'visible' | 'hidden',
      mode: 'all' | 'admins'
    } = {
      title: 'First rename',
      visibility: 'visible',
      mode: 'all'
    };
    const saved = {
      title: 'Created',
      visibility: 'visible' as const,
      mode: 'all' as const
    };

    await saveCreatedCommunityFields({
      current: {...current},
      saved,
      saveTitle: async() => {
        current.title = 'Second rename';
      },
      saveVisibility: async() => {},
      saveMode: async() => {}
    });

    expect(saved.title).toBe('First rename');
    expect(hasCommunityCreateChanges(current, saved)).toBe(true);
  });
});
