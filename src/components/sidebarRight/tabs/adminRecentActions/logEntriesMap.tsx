import {JSX} from 'solid-js';
import {ChannelAdminLogEvent, ChannelAdminLogEventAction} from '../../../../layer';
import {i18n} from '../../../../lib/langPack';
import {LogDiff} from './logDiff';

type MapCallbackResult = {
  // Making them as components to avoid rendering when not expanded, and being able to duplicate when needed
  Message: () => JSX.Element;
  ExpandableContent?: () => JSX.Element;
};

type MapCallback<Key extends ChannelAdminLogEventAction['_']> = (action: Extract<ChannelAdminLogEventAction, {_: Key}>) => MapCallbackResult;


export const logEntriesMap: {[Key in ChannelAdminLogEventAction['_']]: MapCallback<Key>} = {
  'channelAdminLogEventActionChangeTitle': (action) => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeTitle'),
    ExpandableContent: () => <LogDiff added={action.new_value} removed={action.prev_value} />
  }),
  'channelAdminLogEventActionChangeAbout': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeAbout')
  }),
  'channelAdminLogEventActionChangeUsername': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeUsername')
  }),
  'channelAdminLogEventActionChangePhoto': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangePhoto')
  }),
  'channelAdminLogEventActionToggleInvites': () => ({
    Message: () => i18n('AdminRecentActionMessage.ToggleInvites')
  }),
  'channelAdminLogEventActionToggleSignatures': () => ({
    Message: () => i18n('AdminRecentActionMessage.ToggleSignatures')
  }),
  'channelAdminLogEventActionUpdatePinned': () => ({
    Message: () => i18n('AdminRecentActionMessage.UpdatePinnedMessage')
  }),
  'channelAdminLogEventActionEditMessage': () => ({
    Message: () => i18n('AdminRecentActionMessage.EditedMessage')
  }),
  'channelAdminLogEventActionDeleteMessage': () => ({
    Message: () => i18n('AdminRecentActionMessage.DeletedMessage')
  }),
  'channelAdminLogEventActionParticipantJoin': () => ({
    Message: () => i18n('AdminRecentActionMessage.ParticipantJoined')
  }),
  'channelAdminLogEventActionParticipantLeave': () => ({
    Message: () => i18n('AdminRecentActionMessage.ParticipantLeft')
  }),
  'channelAdminLogEventActionParticipantInvite': () => ({
    Message: () => i18n('AdminRecentActionMessage.ParticipantInvited')
  }),
  'channelAdminLogEventActionParticipantToggleBan': () => ({
    Message: () => i18n('AdminRecentActionMessage.BanToggled')
  }),
  'channelAdminLogEventActionParticipantToggleAdmin': () => ({
    Message: () => i18n('AdminRecentActionMessage.AdminToggled')
  }),
  'channelAdminLogEventActionChangeStickerSet': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeStickerSet')
  }),
  'channelAdminLogEventActionTogglePreHistoryHidden': () => ({
    Message: () => i18n('AdminRecentActionMessage.TogglePreHistoryHidden')
  }),
  'channelAdminLogEventActionDefaultBannedRights': () => ({
    Message: () => i18n('AdminRecentActionMessage.DefaultBannedRightsChanged')
  }),
  'channelAdminLogEventActionStopPoll': () => ({
    Message: () => i18n('AdminRecentActionMessage.PollStopped')
  }),
  'channelAdminLogEventActionChangeLinkedChat': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeLinkedChat')
  }),
  'channelAdminLogEventActionChangeLocation': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeLocation')
  }),
  'channelAdminLogEventActionToggleSlowMode': () => ({
    Message: () => i18n('AdminRecentActionMessage.ToggleSlowMode')
  }),
  'channelAdminLogEventActionStartGroupCall': () => ({
    Message: () => i18n('AdminRecentActionMessage.StartGroupCall')
  }),
  'channelAdminLogEventActionDiscardGroupCall': () => ({
    Message: () => i18n('AdminRecentActionMessage.DiscardGroupCall')
  }),
  'channelAdminLogEventActionParticipantMute': () => ({
    Message: () => i18n('AdminRecentActionMessage.ParticipantMuted')
  }),
  'channelAdminLogEventActionParticipantUnmute': () => ({
    Message: () => i18n('AdminRecentActionMessage.ParticipantUnmuted')
  }),
  'channelAdminLogEventActionToggleGroupCallSetting': () => ({
    Message: () => i18n('AdminRecentActionMessage.ToggleGroupCallSetting')
  }),
  'channelAdminLogEventActionParticipantJoinByInvite': () => ({
    Message: () => i18n('AdminRecentActionMessage.ParticipantJoinedByInvite')
  }),
  'channelAdminLogEventActionExportedInviteDelete': () => ({
    Message: () => i18n('AdminRecentActionMessage.ExportedInviteDeleted')
  }),
  'channelAdminLogEventActionExportedInviteRevoke': () => ({
    Message: () => i18n('AdminRecentActionMessage.ExportedInviteRevoked')
  }),
  'channelAdminLogEventActionExportedInviteEdit': () => ({
    Message: () => i18n('AdminRecentActionMessage.ExportedInviteEdited')
  }),
  'channelAdminLogEventActionParticipantVolume': () => ({
    Message: () => i18n('AdminRecentActionMessage.ParticipantVolumeChanged')
  }),
  'channelAdminLogEventActionChangeHistoryTTL': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeHistoryTTL')
  }),
  'channelAdminLogEventActionParticipantJoinByRequest': () => ({
    Message: () => i18n('AdminRecentActionMessage.ParticipantJoinedByRequest')
  }),
  'channelAdminLogEventActionToggleNoForwards': () => ({
    Message: () => i18n('AdminRecentActionMessage.ToggleNoForwards')
  }),
  'channelAdminLogEventActionSendMessage': () => ({
    Message: () => i18n('AdminRecentActionMessage.MessageSent')
  }),
  'channelAdminLogEventActionChangeAvailableReactions': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeAvailableReactions')
  }),
  'channelAdminLogEventActionChangeUsernames': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeUsernames')
  }),
  'channelAdminLogEventActionToggleForum': () => ({
    Message: () => i18n('AdminRecentActionMessage.ToggleForum')
  }),
  'channelAdminLogEventActionCreateTopic': () => ({
    Message: () => i18n('AdminRecentActionMessage.TopicCreated')
  }),
  'channelAdminLogEventActionEditTopic': () => ({
    Message: () => i18n('AdminRecentActionMessage.TopicEdited')
  }),
  'channelAdminLogEventActionDeleteTopic': () => ({
    Message: () => i18n('AdminRecentActionMessage.TopicDeleted')
  }),
  'channelAdminLogEventActionPinTopic': () => ({
    Message: () => i18n('AdminRecentActionMessage.TopicPinned')
  }),
  'channelAdminLogEventActionToggleAntiSpam': () => ({
    Message: () => i18n('AdminRecentActionMessage.ToggleAntiSpam')
  }),
  'channelAdminLogEventActionChangePeerColor': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangePeerColor')
  }),
  'channelAdminLogEventActionChangeProfilePeerColor': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeProfilePeerColor')
  }),
  'channelAdminLogEventActionChangeWallpaper': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeWallpaper')
  }),
  'channelAdminLogEventActionChangeEmojiStatus': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeEmojiStatus')
  }),
  'channelAdminLogEventActionChangeEmojiStickerSet': () => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeEmojiStickerSet')
  }),
  'channelAdminLogEventActionToggleSignatureProfiles': () => ({
    Message: () => i18n('AdminRecentActionMessage.ToggleSignatureProfiles')
  }),
  'channelAdminLogEventActionParticipantSubExtend': () => ({
    Message: () => i18n('AdminRecentActionMessage.ParticipantSubscriptionExtended')
  }),
  'channelAdminLogEventActionToggleAutotranslation': () => ({
    Message: () => i18n('AdminRecentActionMessage.ToggleAutoTranslation')
  })
};

export const getLogEntry = (event: ChannelAdminLogEvent) => {
  const entry = logEntriesMap[event.action._];
  if(!entry) {
    return null;
  }
  return entry(event.action as never);
};
