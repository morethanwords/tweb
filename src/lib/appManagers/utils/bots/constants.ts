import {ChatAdminRights} from '@layer';

export type BotAdminRight = keyof ChatAdminRights['pFlags'];

export const BOT_ADMIN_RIGHTS: BotAdminRight[] = [
  'change_info',
  'post_messages',
  'edit_messages',
  'delete_messages',
  'ban_users',
  'invite_users',
  'pin_messages',
  'add_admins',
  'anonymous',
  'manage_call',
  'other',
  'manage_topics',
  'post_stories',
  'edit_stories',
  'delete_stories',
  'manage_direct_messages',
  'manage_ranks'
];

export const BOT_ADMIN_RIGHTS_BY_LINK_NAME: Record<string, BotAdminRight> = {
  change_info: 'change_info',
  post_messages: 'post_messages',
  edit_messages: 'edit_messages',
  delete_messages: 'delete_messages',
  restrict_members: 'ban_users',
  invite_users: 'invite_users',
  manage_topics: 'manage_topics',
  pin_messages: 'pin_messages',
  promote_members: 'add_admins',
  post_stories: 'post_stories',
  edit_stories: 'edit_stories',
  delete_stories: 'delete_stories',
  manage_video_chats: 'manage_call',
  manage_direct_messages: 'manage_direct_messages',
  anonymous: 'anonymous',
  manage_chat: 'other'
};
