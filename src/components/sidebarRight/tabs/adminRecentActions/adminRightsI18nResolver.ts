import {ChatAdminRights} from '@layer';
import {LangPackKey} from '@lib/langPack';


type Args = { isBroadcast: boolean };

const adminRightToI18n: Record<keyof ChatAdminRights.chatAdminRights['pFlags'], (a: Args) => LangPackKey> = {
  other: () => 'AdminRights.Other',
  manage_call: () => 'Channel.EditAdmin.ManageCalls',
  manage_direct_messages: () => 'Channel.EditAdmin.ManageDirectMessages',

  change_info: ({isBroadcast}) =>
    isBroadcast ? 'EditAdminChangeChannelInfo' : 'EditAdminChangeGroupInfo',

  post_messages: () => 'EditAdminPostMessages',
  edit_messages: () => 'EditAdminEditMessages',
  delete_messages: ({isBroadcast}) =>
    isBroadcast ? 'EditAdminDeleteMessages' : 'EditAdminGroupDeleteMessages',

  ban_users: () => 'EditAdminBanUsers',
  pin_messages: () => 'EditAdminPinMessages',
  add_admins: () => 'EditAdminAddAdmins',
  anonymous: () => 'EditAdminSendAnonymously',
  manage_topics: () => 'ManageTopicsPermission',

  invite_users: ({isBroadcast}) =>
    isBroadcast ?
      'Channel.EditAdmin.PermissionInviteSubscribers' :
      'EditAdminAddUsersViaLink',

  post_stories: () => 'AdminRights.PostStories',
  edit_stories: () => 'AdminRights.EditStories',
  delete_stories: () => 'AdminRights.DeleteStories'
};

export function resolveAdminRightFlagI18n(flag: keyof ChatAdminRights.chatAdminRights['pFlags'], args: Args) {
  const resolver = adminRightToI18n[flag];
  return resolver(args);
}
