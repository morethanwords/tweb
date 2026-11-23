import type {Chat, ChatAdminRights, ChatBannedRights} from '@layer';
import {bannedRights} from '@/tests/helpers/bannedRights';

/**
 * A supergroup as I see it: my admin rights or my own restriction, and what the group forbids everyone
 */
export function makeSupergroup(options: Partial<{
  creator: boolean,
  admin: ChatAdminRights['pFlags'],
  banned: ChatBannedRights['pFlags'],
  defaultBanned: ChatBannedRights['pFlags']
}> = {}): Chat.channel {
  return {
    _: 'channel',
    id: 1,
    title: 'Group',
    photo: {_: 'chatPhotoEmpty'},
    date: 0,
    pFlags: {megagroup: true, creator: options.creator || undefined},
    admin_rights: options.admin && {_: 'chatAdminRights', pFlags: options.admin},
    banned_rights: options.banned && bannedRights(options.banned),
    default_banned_rights: bannedRights(options.defaultBanned || {})
  } as Chat.channel;
}
