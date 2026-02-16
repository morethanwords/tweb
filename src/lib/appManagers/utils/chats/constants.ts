import {ChatAdminRights} from '@layer';

export const CHAT_LEGACY_ADMIN_RIGHTS: ChatAdminRights = {
  '_': 'chatAdminRights',
  'pFlags': {
    'change_info': true,
    'delete_messages': true,
    'ban_users': true,
    'invite_users': true,
    'pin_messages': true,
    'manage_call': true,
    'other': true,
    'manage_topics': true
  }
};
