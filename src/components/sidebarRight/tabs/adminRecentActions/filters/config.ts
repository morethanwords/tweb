import {ChannelAdminLogEventsFilter} from '@layer';
import {LangPackKey} from '@lib/langPack';


export type FilterGroupConfigItem = {
  i18nKey: LangPackKey;
  items: {
    pFlag: keyof ChannelAdminLogEventsFilter['pFlags'];
    i18nKey: LangPackKey;
  }[];
};

export type GetFilterGroupsConfigArgs = {
  isBroadcast?: boolean;
};

export function getFilterGroupsConfig({isBroadcast}: GetFilterGroupsConfigArgs): FilterGroupConfigItem[] {
  return [
    {
      i18nKey: 'AdminRecentActionsFilters.MembersAndAdmins',
      items: [
        {
          pFlag: 'join',
          i18nKey: 'AdminRecentActionsFilters.NewMembers'
        },
        {
          pFlag: 'leave',
          i18nKey: isBroadcast ? 'AdminRecentActionsFilters.MembersLeftChannel' : 'AdminRecentActionsFilters.MembersLeftGroup'
        },
        {
          pFlag: 'invite',
          i18nKey: 'AdminRecentActionsFilters.InvitedMembers'
        },
        {
          pFlag: 'ban',
          i18nKey: 'AdminRecentActionsFilters.BannedMembers'
        },
        {
          pFlag: 'unban',
          i18nKey: 'AdminRecentActionsFilters.UnbannedMembers'
        },
        {
          pFlag: 'kick',
          i18nKey: 'AdminRecentActionsFilters.RemovedMembers'
        },
        {
          pFlag: 'unkick',
          i18nKey: 'AdminRecentActionsFilters.UnkickedMembers'
        },
        {
          pFlag: 'promote',
          i18nKey: 'AdminRecentActionsFilters.NewAdminRights'
        },
        {
          pFlag: 'demote',
          i18nKey: 'AdminRecentActionsFilters.RemovedAdminRights'
        }
      ]
    },

    {
      i18nKey: isBroadcast ? 'AdminRecentActionsFilters.ChannelSettings' : 'AdminRecentActionsFilters.GroupSettings',
      items: [
        {
          pFlag: 'info',
          i18nKey: isBroadcast ? 'AdminRecentActionsFilters.ChannelInfo' : 'AdminRecentActionsFilters.GroupInfo'
        },
        {
          pFlag: 'settings',
          i18nKey: isBroadcast ? 'AdminRecentActionsFilters.ChannelSettings' : 'AdminRecentActionsFilters.GroupSettings'
        },
        {
          pFlag: 'invites',
          i18nKey: 'AdminRecentActionsFilters.InviteLinks'
        },
        {
          pFlag: 'group_call',
          i18nKey: 'AdminRecentActionsFilters.GroupCall'
        },
        {
          pFlag: 'forums',
          i18nKey: 'AdminRecentActionsFilters.Forums'
        },
        {
          pFlag: 'sub_extend',
          i18nKey: 'AdminRecentActionsFilters.SubscriptionExtensions'
        }
      ]
    },

    {
      i18nKey: 'AdminRecentActionsFilters.Messages',
      items: [
        {
          pFlag: 'send',
          i18nKey: 'AdminRecentActionsFilters.SentMessages'
        },
        {
          pFlag: 'delete',
          i18nKey: 'AdminRecentActionsFilters.DeletedMessages'
        },
        {
          pFlag: 'edit',
          i18nKey: 'AdminRecentActionsFilters.EditedMessages'
        },
        {
          pFlag: 'pinned',
          i18nKey: 'AdminRecentActionsFilters.PinnedMessages'
        }
      ]
    }
  ];
}
