import {describe, expect, it} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {ChatBannedRights} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';
import {makeSupergroup} from '@/tests/helpers/supergroup';

// A member restricted in one thing (no media for a week) is still held by what the group forbids everyone (no
// stickers, no links, no pinning): the two restrictions add up, as Telegram Desktop (PeerData::amRestricted) and
// Android (ChatObject.canUserDoAction) read them. The member's own restriction only counted, so the composer
// offered what the server then refused.

type BannedFlags = ChatBannedRights['pFlags'];

describe('a restricted member in a group with restrictions of its own', () => {
  const restrictedInMedia = (defaultBanned: BannedFlags) => makeSupergroup({banned: {send_media: true}, defaultBanned});

  it('may not send what the group forbids everyone', () => {
    const chat = restrictedInMedia({send_stickers: true, send_gifs: true, embed_links: true, send_polls: true});
    expect(hasRights(chat, 'send_stickers')).toBe(false);
    expect(hasRights(chat, 'send_gifs')).toBe(false);
    expect(hasRights(chat, 'embed_links')).toBe(false);
    expect(hasRights(chat, 'send_polls')).toBe(false);
  });

  it('may not pin, invite, change the group\'s info or start topics when the group forbids it', () => {
    const chat = restrictedInMedia({pin_messages: true, invite_users: true, change_info: true, manage_topics: true});
    expect(hasRights(chat, 'pin_messages')).toBe(false);
    expect(hasRights(chat, 'invite_users')).toBe(false);
    expect(hasRights(chat, 'change_info')).toBe(false);
    expect(hasRights(chat, 'manage_topics')).toBe(false);
  });

  it('is still held by their own restriction, and free in what neither forbids', () => {
    const chat = restrictedInMedia({send_stickers: true});
    expect(hasRights(chat, 'send_media')).toBe(false);
    expect(hasRights(chat, 'send_messages')).toBe(true);
    expect(hasRights(chat, 'send_inline')).toBe(true);
  });

  it('is let past the group\'s part by boosts, never past their own', () => {
    const chat = restrictedInMedia({send_stickers: true});
    expect(hasRights(chat, 'send_stickers', undefined, undefined, true)).toBe(true);
    expect(hasRights(chat, 'send_media', undefined, undefined, true)).toBe(false);
  });
});

describe('the group\'s restrictions alone', () => {
  it('hold a member with no restriction of their own', () => {
    const chat = makeSupergroup({defaultBanned: {send_stickers: true}});
    expect(hasRights(chat, 'send_stickers')).toBe(false);
    expect(hasRights(chat, 'send_messages')).toBe(true);
  });

  it('do not hold an admin', () => {
    const chat = makeSupergroup({admin: {ban_users: true}, defaultBanned: {send_stickers: true, pin_messages: true}});
    expect(hasRights(chat, 'send_stickers')).toBe(true);
  });
});
