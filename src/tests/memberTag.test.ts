import {describe, expect, it} from 'vitest';
import '@helpers/peerIdPolyfill';
import type {Chat, ChatParticipants} from '@layer';
import hasRights from '@appManagers/utils/chats/hasRights';
import {
  applyChatParticipantRank,
  canEditMemberTag,
  canHaveMemberTags,
  cleanMemberTag,
  getMemberTagRole,
  MEMBER_TAG_MAX_LENGTH,
  removeMemberTagEmoji
} from '@appManagers/utils/chats/memberTag';

const MY_ID = 100 as PeerId;
const OTHER_ID = 200 as PeerId;

function makeSupergroup(options: Partial<{
  creator: boolean,
  admin: Partial<Record<'manage_ranks' | 'ban_users', true>>,
  banned: Partial<Record<'edit_rank' | 'send_media', true>>,
  defaultBanned: Partial<Record<'edit_rank', true>>
}> = {}): Chat.channel {
  return {
    _: 'channel',
    id: 1,
    title: 'Group',
    photo: {_: 'chatPhotoEmpty'},
    date: 0,
    pFlags: {megagroup: true, creator: options.creator || undefined},
    admin_rights: options.admin && {_: 'chatAdminRights', pFlags: options.admin},
    banned_rights: options.banned && {_: 'chatBannedRights', pFlags: options.banned, until_date: 0},
    default_banned_rights: {_: 'chatBannedRights', pFlags: options.defaultBanned || {}, until_date: 0}
  } as Chat.channel;
}

describe('member tags', () => {
  describe('rights', () => {
    it('lets a member set their own tag unless the group or a restriction forbids it', () => {
      expect(hasRights(makeSupergroup(), 'edit_rank')).toBe(true);
      expect(hasRights(makeSupergroup({defaultBanned: {edit_rank: true}}), 'edit_rank')).toBe(false);
      expect(hasRights(makeSupergroup({banned: {edit_rank: true}}), 'edit_rank')).toBe(false);
    });

    it('keeps the group\'s ban for a member restricted in something else', () => {
      expect(hasRights(makeSupergroup({banned: {send_media: true}}), 'edit_rank')).toBe(true);
      expect(hasRights(makeSupergroup({banned: {send_media: true}, defaultBanned: {edit_rank: true}}), 'edit_rank')).toBe(false);
    });

    it('lets any admin set their own tag, whatever members may do', () => {
      expect(hasRights(makeSupergroup({admin: {ban_users: true}, defaultBanned: {edit_rank: true}}), 'edit_rank')).toBe(true);
    });

    it('gives others\' tags to the creator and to admins with the right only', () => {
      expect(hasRights(makeSupergroup(), 'manage_ranks')).toBe(false);
      expect(hasRights(makeSupergroup({admin: {ban_users: true}}), 'manage_ranks')).toBe(false);
      expect(hasRights(makeSupergroup({admin: {manage_ranks: true}}), 'manage_ranks')).toBe(true);
      expect(hasRights(makeSupergroup({creator: true}), 'manage_ranks')).toBe(true);
    });

    it('has no tags in a channel', () => {
      const channel = {...makeSupergroup({admin: {manage_ranks: true}}), pFlags: {broadcast: true}} as Chat.channel;
      expect(hasRights(channel, 'manage_ranks')).toBe(false);
      expect(hasRights(channel, 'edit_rank')).toBe(false);
      expect(canHaveMemberTags(channel)).toBe(false);
    });

    it('reads a member\'s own restriction for the permissions screen', () => {
      const chat = makeSupergroup({creator: true});
      expect(hasRights(chat, 'edit_rank', {_: 'chatBannedRights', pFlags: {}, until_date: 0})).toBe(true);
      expect(hasRights(chat, 'edit_rank', {_: 'chatBannedRights', pFlags: {edit_rank: true}, until_date: 0})).toBe(false);
    });
  });

  describe('who may set whose tag', () => {
    const member = {_: 'channelParticipant', user_id: OTHER_ID, date: 0} as const;
    const admin = {_: 'channelParticipantAdmin', user_id: OTHER_ID, promoted_by: 300, date: 0, admin_rights: {_: 'chatAdminRights', pFlags: {}}, pFlags: {}} as const;

    it('mine: with the group\'s leave', () => {
      expect(canEditMemberTag(makeSupergroup(), MY_ID, MY_ID)).toBe(true);
      expect(canEditMemberTag(makeSupergroup({defaultBanned: {edit_rank: true}}), MY_ID, MY_ID)).toBe(false);
    });

    it('another member\'s: with the right', () => {
      expect(canEditMemberTag(makeSupergroup(), OTHER_ID, MY_ID, member)).toBe(false);
      expect(canEditMemberTag(makeSupergroup({admin: {manage_ranks: true}}), OTHER_ID, MY_ID, member)).toBe(true);
    });

    it('an admin\'s: only when that admin is mine to edit', () => {
      expect(canEditMemberTag(makeSupergroup({admin: {manage_ranks: true}}), OTHER_ID, MY_ID, admin)).toBe(false);
      expect(canEditMemberTag(makeSupergroup({creator: true}), OTHER_ID, MY_ID, admin)).toBe(true);
    });
  });

  describe('the text', () => {
    it('drops emoji, line breaks and padding, and keeps to the limit', () => {
      expect(removeMemberTagEmoji('dev 🚀 lead')).toBe('dev  lead');
      expect(cleanMemberTag('  dev 🚀\nlead  ')).toBe('dev lead');
      expect(cleanMemberTag('x'.repeat(MEMBER_TAG_MAX_LENGTH + 5))).toHaveLength(MEMBER_TAG_MAX_LENGTH);
    });

    it('colours a tag by its role', () => {
      expect(getMemberTagRole({_: 'chatParticipantCreator', user_id: 1})).toBe('owner');
      expect(getMemberTagRole({_: 'chatParticipantAdmin', user_id: 1, inviter_id: 2, date: 0})).toBe('admin');
      expect(getMemberTagRole({_: 'chatParticipant', user_id: 1, inviter_id: 2, date: 0})).toBe('member');
      expect(getMemberTagRole(undefined)).toBe('member');
    });
  });

  describe('a basic group\'s tags by version', () => {
    const makeParticipants = (): ChatParticipants.chatParticipants => ({
      _: 'chatParticipants',
      chat_id: 1,
      version: 5,
      participants: [
        {_: 'chatParticipant', user_id: 7, inviter_id: 1, date: 0, rank: 'old'},
        {_: 'chatParticipant', user_id: 8, inviter_id: 1, date: 0}
      ]
    });

    it('applies the next version, and removes a tag with an empty one', () => {
      const participants = makeParticipants();
      expect(applyChatParticipantRank(participants, 8, 'new', 6)).toBe('applied');
      expect(participants.participants[1].rank).toBe('new');
      expect(participants.version).toBe(6);
      expect(applyChatParticipantRank(participants, 7, '', 7)).toBe('applied');
      expect(participants.participants[0].rank).toBeUndefined();
    });

    it('drops an older state, and asks for the list past a skipped change', () => {
      const participants = makeParticipants();
      expect(applyChatParticipantRank(participants, 7, 'stale', 4)).toBe('old');
      expect(applyChatParticipantRank(participants, 7, 'ahead', 7)).toBe('gap');
      expect(participants.participants[0].rank).toBe('old');
      expect(participants.version).toBe(5);
    });

    it('applies my own change, which has no version', () => {
      const participants = makeParticipants();
      expect(applyChatParticipantRank(participants, 7, 'mine')).toBe('applied');
      expect(participants.participants[0].rank).toBe('mine');
      expect(participants.version).toBe(5);
    });
  });
});
