import {describe, expect, it} from 'vitest';
import type {CommunityPeer} from '@layer';
import type {Dialog} from '@appManagers/appMessagesManager';
import {
  CommunityLinkedChat,
  getCommunityChatSections,
  getCommunityLinkedChatKind,
  getCommunityLinkedChatOpenAction,
  shouldCloseCommunityForum
} from '@components/forumTab/communityChatsModel';
import canRemoveCommunityPeer
from '@appManagers/utils/communities/canRemovePeer';
import {
  shouldCloseCommunityTab
} from '@components/communities/useCommunityTabGuard';

const linkedPeer = (options: {
  canViewHistory?: boolean,
  visible?: boolean
} = {}) => ({
  _: 'communityPeer',
  pFlags: options.canViewHistory ? {can_view_history: true} : {},
  peer: {_: 'peerChannel', channel_id: 1},
  visible: options.visible
}) as CommunityPeer;

const dialog = (
  peerId: PeerId,
  index: number,
  topMessage = 1
) => ({
  _: 'dialog',
  peerId,
  pFlags: {},
  top_message: topMessage,
  index_0: index
}) as Dialog;

const item = (
  peerId: PeerId,
  kind: CommunityLinkedChat['kind'],
  order: number,
  index = 0,
  visible = true
): CommunityLinkedChat => ({
  linked: linkedPeer({visible}),
  peerId,
  dialog: index ? dialog(peerId, index) : undefined,
  kind,
  order,
  activityDate: index
});

describe('community chat sections', () => {
  it('allows removing peers for Community managers or peer creators', () => {
    const regularCommunity = {
      _: 'community',
      pFlags: {}
    } as any;
    const managedCommunity = {
      _: 'community',
      pFlags: {},
      admin_rights: {
        _: 'chatAdminRights',
        pFlags: {manage_linked_peers: true}
      }
    } as any;
    const regularChannel = {
      _: 'channel',
      pFlags: {}
    } as any;
    const createdChannel = {
      _: 'channel',
      pFlags: {creator: true}
    } as any;

    expect(canRemoveCommunityPeer(
      managedCommunity,
      regularChannel
    )).toBe(true);
    expect(canRemoveCommunityPeer(
      regularCommunity,
      createdChannel
    )).toBe(true);
    expect(canRemoveCommunityPeer(
      regularCommunity,
      regularChannel
    )).toBe(false);
    expect(canRemoveCommunityPeer(
      regularCommunity,
      {_: 'user', pFlags: {bot: true, bot_can_edit: true}} as any
    )).toBe(false);
    expect(canRemoveCommunityPeer(
      regularCommunity,
      {_: 'user', pFlags: {bot: true}} as any
    )).toBe(false);
  });

  it('uses dialog rows only for joined and viewable peers', () => {
    expect(getCommunityLinkedChatKind(
      {_:'channel', pFlags: {}} as any,
      linkedPeer()
    )).toBe('joined');
    expect(getCommunityLinkedChatKind(
      {_:'channel', pFlags: {}} as any,
      linkedPeer({visible: false})
    )).toBe('joined');
    expect(getCommunityLinkedChatKind(
      {_:'channel', pFlags: {left: true}} as any,
      linkedPeer({canViewHistory: true})
    )).toBe('viewable');
    expect(getCommunityLinkedChatKind(
      {_:'channel', pFlags: {left: true}} as any,
      linkedPeer({canViewHistory: true, visible: false})
    )).toBe('viewable');
    expect(getCommunityLinkedChatKind(
      {_:'user', pFlags: {bot: true}} as any,
      linkedPeer(),
      dialog(1 as PeerId, 10, 0)
    )).toBe('joined');
    expect(getCommunityLinkedChatKind(
      {_:'user', pFlags: {bot: true}} as any,
      linkedPeer(),
      dialog(1 as PeerId, 10)
    )).toBe('joined');
    expect(getCommunityLinkedChatKind(
      {_:'user', pFlags: {bot: true}} as any,
      linkedPeer()
    )).toBe('viewable');
    expect(getCommunityLinkedChatKind(
      {_:'user', pFlags: {bot: true}} as any,
      linkedPeer({visible: false})
    )).toBe('viewable');
    expect(getCommunityLinkedChatKind(
      {_:'chat', pFlags: {}} as any,
      linkedPeer(),
      dialog(-1 as PeerId, 10)
    )).toBe('requestable');
    expect(getCommunityLinkedChatKind(
      {_:'channelForbidden'} as any,
      linkedPeer({canViewHistory: true}),
      dialog(-1 as PeerId, 10)
    )).toBe('viewable');
    expect(getCommunityLinkedChatKind(
      {_:'channel', pFlags: {left: true}, username: 'public'} as any,
      linkedPeer({visible: false})
    )).toBe('excluded');
    expect(getCommunityLinkedChatKind(
      {_:'channel', pFlags: {left: true}, username: 'public'} as any,
      linkedPeer({visible: true})
    )).toBe('requestable');
  });

  it('keeps private hidden peers in their own fourth section and omits excluded peers', () => {
    const hidden = item(
      3 as PeerId,
      'hidden',
      0,
      0,
      false
    );
    const excluded = item(
      4 as PeerId,
      'excluded',
      1,
      0,
      false
    );
    const sections = getCommunityChatSections([hidden, excluded]);

    expect(Object.keys(sections)).toEqual([
      'joined',
      'viewable',
      'requestable',
      'hidden'
    ]);
    expect(sections.hidden).toEqual([hidden]);
    expect(Object.values(sections).flat()).not.toContain(excluded);
  });

  it('never opens hidden peers and confirms joining requestable chats', () => {
    expect(getCommunityLinkedChatOpenAction({
      kind: 'hidden',
      peerType: 'channel',
      visible: false
    })).toBe('hidden');
    expect(getCommunityLinkedChatOpenAction({
      kind: 'excluded',
      peerType: 'channel',
      visible: false
    })).toBe('hidden');
    expect(getCommunityLinkedChatOpenAction({
      kind: 'requestable',
      peerType: 'user',
      visible: true
    })).toBe('open');
    expect(getCommunityLinkedChatOpenAction({
      kind: 'requestable',
      peerType: 'channel',
      visible: true
    })).toBe('join');
    expect(getCommunityLinkedChatOpenAction({
      kind: 'requestable',
      peerType: 'channelForbidden',
      visible: true
    })).toBe('join');
  });

  it('sorts every section by activity with stable server-order ties', () => {
    const joinedOlder = item(1 as PeerId, 'joined', 0, 100);
    const joinedNewer = item(2 as PeerId, 'joined', 1, 300);
    const viewableFirst = item(3 as PeerId, 'viewable', 2, 100);
    const viewableSecond = item(4 as PeerId, 'viewable', 3, 900);
    const requestableFirst = item(5 as PeerId, 'requestable', 4);
    const requestableSecond = item(6 as PeerId, 'requestable', 5);
    const hiddenOlder = item(7 as PeerId, 'hidden', 6, 100);
    const hiddenNewer = item(8 as PeerId, 'hidden', 7, 400);

    const sections = getCommunityChatSections([
      joinedOlder,
      joinedNewer,
      viewableFirst,
      viewableSecond,
      requestableFirst,
      requestableSecond,
      hiddenOlder,
      hiddenNewer
    ]);

    expect(sections.joined).toEqual([joinedNewer, joinedOlder]);
    expect(sections.viewable).toEqual([
      viewableSecond,
      viewableFirst
    ]);
    expect(sections.requestable).toEqual([
      requestableFirst,
      requestableSecond
    ]);
    expect(sections.hidden).toEqual([hiddenNewer, hiddenOlder]);
  });

  it('closes an open Community after authoritative membership teardown', () => {
    const community = {
      _: 'community',
      id: 123 as ChatId,
      pFlags: {},
      title: 'Community'
    } as any;
    const communityDialog = {
      _: 'communityDialog',
      communityId: 123 as ChatId
    } as any;

    expect(shouldCloseCommunityForum({
      communityId: 123 as ChatId,
      community,
      communityDialog,
      joinedCommunities: null,
      hadCommunityDialog: true
    })).toBe(false);
    expect(shouldCloseCommunityForum({
      communityId: 123 as ChatId,
      community,
      communityDialog: undefined,
      joinedCommunities: [],
      hadCommunityDialog: true
    })).toBe(true);
    expect(shouldCloseCommunityTab({
      communityId: 123 as ChatId,
      community,
      joinedCommunities: null
    })).toBe(false);
    expect(shouldCloseCommunityTab({
      communityId: 123 as ChatId,
      community,
      joinedCommunities: []
    })).toBe(true);
  });
});
