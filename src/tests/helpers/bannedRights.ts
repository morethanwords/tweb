import type {ChatBannedRights} from '@layer';

export const bannedRights = (flags: ChatBannedRights['pFlags']): ChatBannedRights => ({_: 'chatBannedRights', pFlags: flags, until_date: 0});
