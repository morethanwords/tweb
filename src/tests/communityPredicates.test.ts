import type {Chat, User} from '@layer';
import '@helpers/peerIdPolyfill';
import isCollapsedCommunity from '@appManagers/utils/communities/isCollapsedCommunity';
import getLinkedCommunityId from '@appManagers/utils/communities/getLinkedCommunityId';

const COMMUNITY_ID = 101 as ChatId;

function makeCommunity(pFlags: Chat.community['pFlags'] = {}): Chat.community {
  return {_: 'community', id: COMMUNITY_ID, title: 'C', pFlags} as Chat.community;
}

describe('isCollapsedCommunity', () => {
  it('accepts a joined Community folded into the chat list', () => {
    expect(isCollapsedCommunity(makeCommunity({collapsed_in_dialogs: true}))).toBe(true);
  });

  it('rejects a Community that is not folded', () => {
    expect(isCollapsedCommunity(makeCommunity({}))).toBe(false);
  });

  // The three conditions used to be spelled out at every call site, half of them
  // inverted; `left` is the one that went missing in a copy.
  it('rejects a folded Community the user has left', () => {
    expect(isCollapsedCommunity(makeCommunity({
      collapsed_in_dialogs: true,
      left: true
    }))).toBe(false);
  });

  it('rejects communityForbidden, channels, chats, users and nothing at all', () => {
    expect(isCollapsedCommunity({_: 'communityForbidden', id: COMMUNITY_ID} as Chat)).toBe(false);
    expect(isCollapsedCommunity({_: 'channel', id: 1, pFlags: {}} as Chat)).toBe(false);
    expect(isCollapsedCommunity({_: 'chat', id: 1, pFlags: {}} as Chat)).toBe(false);
    expect(isCollapsedCommunity({_: 'user', id: 1, pFlags: {}} as User)).toBe(false);
    expect(isCollapsedCommunity(undefined)).toBe(false);
  });

  it('always answers with a boolean, never the raw flag', () => {
    expect(isCollapsedCommunity(makeCommunity({collapsed_in_dialogs: true}))).toBe(true);
    expect(isCollapsedCommunity(makeCommunity({}))).toBe(false);
  });
});

describe('getLinkedCommunityId', () => {
  it('reads the link off a channel', () => {
    expect(getLinkedCommunityId({
      _: 'channel',
      id: 1,
      pFlags: {},
      linked_community_id: COMMUNITY_ID
    } as any)).toBe(COMMUNITY_ID);
  });

  it('reads the link off a user', () => {
    expect(getLinkedCommunityId({
      _: 'user',
      id: 1,
      pFlags: {},
      linked_community_id: COMMUNITY_ID
    } as any)).toBe(COMMUNITY_ID);
  });

  it('returns undefined when a channel or user carries no link', () => {
    expect(getLinkedCommunityId({_: 'channel', id: 1, pFlags: {}} as Chat)).toBeUndefined();
    expect(getLinkedCommunityId({_: 'user', id: 1, pFlags: {}} as User)).toBeUndefined();
  });

  // Only channels and users carry the field, so other kinds must not be read at all.
  it('returns undefined for kinds that cannot carry the link', () => {
    expect(getLinkedCommunityId({_: 'chat', id: 1, pFlags: {}} as Chat)).toBeUndefined();
    expect(getLinkedCommunityId({_: 'community', id: 1, pFlags: {}} as Chat)).toBeUndefined();
    expect(getLinkedCommunityId(undefined)).toBeUndefined();
  });
});
