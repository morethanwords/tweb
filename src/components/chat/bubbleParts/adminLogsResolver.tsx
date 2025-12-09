import {Component} from 'solid-js';
import formatDuration from '../../../helpers/formatDuration';
import {ChannelAdminLogEvent, ChannelAdminLogEventAction} from '../../../layer';
import {MyMessage} from '../../../lib/appManagers/appMessagesManager';
import {isBannedParticipant} from '../../../lib/appManagers/utils/chats/isBannedParticipant';
import {i18n} from '../../../lib/langPack';
import {wrapFormattedDuration} from '../../wrappers/wrapDuration';
import {isMessage} from '../utils';

type ServiceResult = {
  type: 'service';
  Content: Component;
};

type RegularResult = {
  type: 'regular';
  Content: Component;
};

type DefaultResult = {
  type: 'default';
  message: MyMessage;
  originalMessage?: MyMessage;
  ServiceContent: Component;
};

type MapCallbackResult = ServiceResult | RegularResult | DefaultResult | null;

type MapCallbackArgs<Key extends ChannelAdminLogEventAction['_']> = {
  channelId: ChatId;
  action: Extract<ChannelAdminLogEventAction, {_: Key}>;
  isBroadcast: boolean;
  isForum: boolean;
  peerId: PeerId;
  makePeerName: (peerId: PeerId) => Node;
};

type MapCallback<Key extends ChannelAdminLogEventAction['_']> = (args: MapCallbackArgs<Key>) => MapCallbackResult;

const adminLogsMap: { [Key in ChannelAdminLogEventAction['_']]: MapCallback<Key> } = {
  'channelAdminLogEventActionChangeTitle': ({isBroadcast, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangeTitleChannel' : 'AdminLog.ChangeTitleGroup', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeAbout': ({isBroadcast, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangeAboutChannel' : 'AdminLog.ChangeAboutGroup', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeUsername': ({isBroadcast, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangeUsernameChannel' : 'AdminLog.ChangeUsernameGroup', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangePhoto': ({isBroadcast, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangePhotoChannel' : 'AdminLog.ChangePhotoGroup', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionToggleInvites': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleInvitesEnabled' : 'AdminLog.ToggleInvitesDisabled', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionToggleSignatures': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleSignaturesEnabled' : 'AdminLog.ToggleSignaturesDisabled', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionUpdatePinned': ({action, peerId, makePeerName}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => {
      const pinned = action.message._ === 'message' && action.message.pFlags?.pinned;
      return i18n(pinned ? 'AdminLog.PinnedMessage' : 'AdminLog.UnpinnedMessage', [makePeerName(peerId)]);
    }
  }) : null,
  'channelAdminLogEventActionEditMessage': ({action, peerId, makePeerName}) => isMessage(action.new_message) ? ({
    type: 'default',
    message: action.new_message,
    originalMessage: isMessage(action.prev_message) ? action.prev_message : null,
    ServiceContent: () => i18n('AdminLog.EditedMessage', [makePeerName(peerId)])
  }) : null,
  'channelAdminLogEventActionDeleteMessage': ({action, peerId, makePeerName}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => i18n('AdminLog.DeletedMessage', [makePeerName(peerId)])
  }) : null,
  'channelAdminLogEventActionParticipantJoin': ({isBroadcast, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ParticipantJoinedChannel' : 'AdminLog.ParticipantJoinedGroup', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionParticipantLeave': ({isBroadcast, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ParticipantLeftChannel' : 'AdminLog.ParticipantLeftGroup', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionParticipantInvite': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantInvited', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionParticipantToggleBan': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => {
      const isBanned = isBannedParticipant(action.new_participant);
      return i18n(isBanned ? 'AdminLog.ParticipantBanned' : 'AdminLog.ParticipantPermissionsToggled', [makePeerName(peerId)]);
    }
  }),
  'channelAdminLogEventActionParticipantToggleAdmin': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => {
      const prevRights = 'admin_rights' in action.prev_participant ? action.prev_participant.admin_rights : null;
      const newRights = 'admin_rights' in action.new_participant ? action.new_participant.admin_rights : null;
      const isPromotion = !prevRights && newRights;
      return i18n(isPromotion ? 'AdminLog.AdminPromoted' : 'AdminLog.AdminDemoted', [makePeerName(peerId)]);
    }
  }),
  'channelAdminLogEventActionChangeStickerSet': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeStickerSet', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionTogglePreHistoryHidden': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.TogglePreHistoryHiddenEnabled' : 'AdminLog.TogglePreHistoryHiddenDisabled', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionDefaultBannedRights': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.DefaultBannedRightsChanged', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionStopPoll': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.PollStopped', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeLinkedChat': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeLinkedChat', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeLocation': ({isBroadcast, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangeLocationChannel' : 'AdminLog.ChangeLocationGroup', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionToggleSlowMode': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => {
      if(action.new_value) {
        const duration = wrapFormattedDuration(formatDuration(action.new_value));
        return i18n('AdminLog.ToggleSlowModeSet', [makePeerName(peerId), duration]);
      } else {
        return i18n('AdminLog.ToggleSlowModeDisabled', [makePeerName(peerId)]);
      }
    }
  }),
  'channelAdminLogEventActionStartGroupCall': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.StartGroupCall', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionDiscardGroupCall': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.DiscardGroupCall', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionParticipantMute': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantMuted', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionParticipantUnmute': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantUnmuted', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionToggleGroupCallSetting': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(action.join_muted ? 'AdminLog.ToggleGroupCallSettingEnabled' : 'AdminLog.ToggleGroupCallSettingDisabled', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionParticipantJoinByInvite': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantJoinedByInvite', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionExportedInviteDelete': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ExportedInviteDeleted', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionExportedInviteRevoke': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ExportedInviteRevoked', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionExportedInviteEdit': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ExportedInviteEdit', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionParticipantVolume': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantVolumeChanged', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeHistoryTTL': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => {
      if(action.new_value) {
        const duration = wrapFormattedDuration(formatDuration(action.new_value));
        return i18n('AdminLog.ChangeHistoryTTLEnabled', [makePeerName(peerId), duration]);
      } else {
        return i18n('AdminLog.ChangeHistoryTTLDisabled', [makePeerName(peerId)]);
      }
    }
  }),
  'channelAdminLogEventActionParticipantJoinByRequest': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantJoinedByRequest', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionToggleNoForwards': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleNoForwardsEnabled' : 'AdminLog.ToggleNoForwardsDisabled', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionSendMessage': ({action, peerId, makePeerName}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => i18n('AdminLog.MessageSent', [makePeerName(peerId)])
  }) : null,
  'channelAdminLogEventActionChangeAvailableReactions': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeAvailableReactions', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeUsernames': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () =>
      i18n('AdminLog.ChangeUsernames', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionToggleForum': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleForumEnabled' : 'AdminLog.ToggleForumDisabled', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionCreateTopic': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.TopicCreated', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionEditTopic': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.TopicEdited', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionDeleteTopic': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.TopicDeleted', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionPinTopic': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => {
      // For now, assume it's always pinning since we don't have clear access to prev/new state
      return i18n('AdminLog.TopicPinned', [makePeerName(peerId)]);
    }
  }),
  'channelAdminLogEventActionToggleAntiSpam': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleAntiSpamEnabled' : 'AdminLog.ToggleAntiSpamDisabled', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangePeerColor': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangePeerColor', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeProfilePeerColor': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeProfilePeerColor', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeWallpaper': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeWallpaper', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeEmojiStatus': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeEmojiStatus', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionChangeEmojiStickerSet': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeEmojiStickerSet', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionToggleSignatureProfiles': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleSignatureProfilesEnabled' : 'AdminLog.ToggleSignatureProfilesDisabled', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionParticipantSubExtend': ({peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantSubscriptionExtended', [makePeerName(peerId)])
  }),
  'channelAdminLogEventActionToggleAutotranslation': ({action, peerId, makePeerName}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleAutoTranslationEnabled' : 'AdminLog.ToggleAutoTranslationDisabled', [makePeerName(peerId)])
  })
};

type ResolveAdminLogArgs = {
  channelId: ChatId;
  event: ChannelAdminLogEvent;
  isBroadcast: boolean;
  isForum: boolean;
  peerId: PeerId;
  makePeerName: (peerId: PeerId) => Node;
};

export const resolveAdminLog = ({channelId, event, isBroadcast, isForum, peerId, makePeerName}: ResolveAdminLogArgs) => {
  const resolver = adminLogsMap[event.action._];

  if(!resolver) {
    return null;
  }

  return resolver({channelId, action: event.action as never, isBroadcast, isForum, peerId, makePeerName});
};

export type {
  DefaultResult,
  MapCallbackResult,
  RegularResult,
  ServiceResult
};
