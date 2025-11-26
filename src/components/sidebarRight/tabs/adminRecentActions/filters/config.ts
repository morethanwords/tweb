import {ChannelAdminLogEventsFilter} from '../../../../../layer';
import {LangPackKey} from '../../../../../lib/langPack';


export type FilterGroupConfigItem = {
  i18nKey: LangPackKey;
  items: {
    pFlag: keyof ChannelAdminLogEventsFilter['pFlags'];
    i18nKey: LangPackKey;
  }[];
};

export const filterGroupsConfig: FilterGroupConfigItem[] = [
  {
    i18nKey: 'AdminRecentActionsFilters.MembersAndAdmins',
    items: [
      {
        pFlag: 'join',
        i18nKey: 'AdminRecentActionsFilters.NewMembers'
      },
      {
        pFlag: 'leave',
        i18nKey: 'AdminRecentActionsFilters.MembersLeftGroup'
      },
      {
        pFlag: 'promote',
        i18nKey: 'AdminRecentActionsFilters.NewAdminRights'
      }
    ]
  },

  {
    i18nKey: 'AdminRecentActionsFilters.GroupSettings',
    items: [
      {
        pFlag: 'info',
        i18nKey: 'AdminRecentActionsFilters.GroupInfo'
      },
      {
        pFlag: 'invites',
        i18nKey: 'AdminRecentActionsFilters.InviteLinks'
      },
      {
        pFlag: 'group_call',
        i18nKey: 'AdminRecentActionsFilters.VideoChats'
      }
    ]
  },

  {
    i18nKey: 'AdminRecentActionsFilters.Messages',
    items: [
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
