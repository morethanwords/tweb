import {Component} from 'solid-js';
import {makeDateFromTimestamp} from '../../../../helpers/date/makeDateFromTimestamp';
import formatDuration from '../../../../helpers/formatDuration';
import createMiddleware from '../../../../helpers/solid/createMiddleware';
import {I18nTsx} from '../../../../helpers/solid/i18n';
import {ChannelAdminLogEvent, ChannelAdminLogEventAction} from '../../../../layer';
import {AdminLog} from '../../../../lib/appManagers/appChatsManager';
import {MyMessage} from '../../../../lib/appManagers/appMessagesManager';
import {isBannedParticipant} from '../../../../lib/appManagers/utils/chats/isBannedParticipant';
import {i18n} from '../../../../lib/langPack';
import wrapRichText from '../../../../lib/richTextProcessor/wrapRichText';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import Space from '../../../space';
import {wrapFormattedDuration} from '../../../wrappers/wrapDuration';
import {isMessage} from '../../utils';
import {MinimalBubbleMessageContent} from '../minimalBubbleMessageContent';


type ServiceResult = {
  type: 'service';
  Content: Component;
};

type RegularResult = {
  type: 'regular';
  bubbleClass: string;
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
  event: AdminLog;
  action: Extract<ChannelAdminLogEventAction, {_: Key}>;
  isBroadcast: boolean;
  isForum: boolean;
  peerId: PeerId;
  makePeerTitle: (peerId: PeerId) => Node;
  makeMessagePeerTitle: (peerId: PeerId) => Node;
};

type MapCallback<Key extends ChannelAdminLogEventAction['_']> = (args: MapCallbackArgs<Key>) => MapCallbackResult;

const defaultBubbleClass = 'can-have-tail has-fake-service is-forced-rounded';

const adminLogsMap: { [Key in ChannelAdminLogEventAction['_']]: MapCallback<Key> } = {
  'channelAdminLogEventActionChangeTitle': ({isBroadcast, action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangeTitleChannel' : 'AdminLog.ChangeTitleGroup', [makePeerTitle(peerId), action.new_value])
  }),
  'channelAdminLogEventActionChangeAbout': ({isBroadcast, action, event, peerId, makePeerTitle, makeMessagePeerTitle}) => ({
    type: 'regular',
    bubbleClass: defaultBubbleClass,
    Content: () => {
      const {wrapReply} = useHotReloadGuard();
      const middleware = createMiddleware().get();

      const peerId = event.user_id.toPeerId();

      const previousDescriptionContainer = wrapReply({
        setColorPeerId: peerId,
        title: i18n('AdminRecentActions.PreviousDescription'),
        quote: {
          text: action.prev_value
        },
        middleware
      }).container;

      previousDescriptionContainer.classList.add('margin-0');

      return (
        <>
          <div class='service-msg'>
            <I18nTsx key={isBroadcast ? 'AdminLog.ChangeAboutChannel' : 'AdminLog.ChangeAboutGroup'} args={[makePeerTitle(peerId)]} />
          </div>
          <MinimalBubbleMessageContent
            date={makeDateFromTimestamp(event.date)}
            name={makeMessagePeerTitle(peerId)}
          >
            {wrapRichText(action.new_value)}

            <Space amount='0.5rem' />
            {previousDescriptionContainer}
          </MinimalBubbleMessageContent>
        </>
      );
    }
  }),
  'channelAdminLogEventActionChangeUsername': ({isBroadcast, peerId, makePeerTitle}) => ({
    type: 'regular',
    bubbleClass: defaultBubbleClass,
    Content: () => {
      const {wrapReply} = useHotReloadGuard();
      const middleware = createMiddleware().get();

      return (
        <>
          <div class='service-msg'>
            <I18nTsx key={isBroadcast ? 'AdminLog.ChangeUsernameChannel' : 'AdminLog.ChangeUsernameGroup'} args={[makePeerTitle(peerId)]} />
          </div>
          <MinimalBubbleMessageContent
            date={makeDateFromTimestamp(event.date)}
            name={makeMessagePeerTitle(peerId)}
          >
            {wrapRichText(action.new_value)}

            <Space amount='0.5rem' />
            {previousUsernameContainer}
          </MinimalBubbleMessageContent>
        </>
      );
    }
  }),
  'channelAdminLogEventActionChangePhoto': ({isBroadcast, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangePhotoChannel' : 'AdminLog.ChangePhotoGroup', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionToggleInvites': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleInvitesEnabled' : 'AdminLog.ToggleInvitesDisabled', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionToggleSignatures': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleSignaturesEnabled' : 'AdminLog.ToggleSignaturesDisabled', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionUpdatePinned': ({action, peerId, makePeerTitle}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => {
      const pinned = action.message._ === 'message' && action.message.pFlags?.pinned;
      return i18n(pinned ? 'AdminLog.PinnedMessage' : 'AdminLog.UnpinnedMessage', [makePeerTitle(peerId)]);
    }
  }) : null,
  'channelAdminLogEventActionEditMessage': ({action, peerId, makePeerTitle}) => isMessage(action.new_message) ? ({
    type: 'default',
    message: action.new_message,
    originalMessage: isMessage(action.prev_message) ? action.prev_message : null,
    ServiceContent: () => i18n('AdminLog.EditedMessage', [makePeerTitle(peerId)])
  }) : null,
  'channelAdminLogEventActionDeleteMessage': ({action, peerId, makePeerTitle}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => i18n('AdminLog.DeletedMessage', [makePeerTitle(peerId)])
  }) : null,
  'channelAdminLogEventActionParticipantJoin': ({isBroadcast, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ParticipantJoinedChannel' : 'AdminLog.ParticipantJoinedGroup', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionParticipantLeave': ({isBroadcast, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ParticipantLeftChannel' : 'AdminLog.ParticipantLeftGroup', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionParticipantInvite': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantInvited', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionParticipantToggleBan': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => {
      const isBanned = isBannedParticipant(action.new_participant);
      return i18n(isBanned ? 'AdminLog.ParticipantBanned' : 'AdminLog.ParticipantPermissionsToggled', [makePeerTitle(peerId)]);
    }
  }),
  'channelAdminLogEventActionParticipantToggleAdmin': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => {
      const prevRights = 'admin_rights' in action.prev_participant ? action.prev_participant.admin_rights : null;
      const newRights = 'admin_rights' in action.new_participant ? action.new_participant.admin_rights : null;
      const isPromotion = !prevRights && newRights;
      return i18n(isPromotion ? 'AdminLog.AdminPromoted' : 'AdminLog.AdminDemoted', [makePeerTitle(peerId)]);
    }
  }),
  'channelAdminLogEventActionChangeStickerSet': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeStickerSet', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionTogglePreHistoryHidden': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.TogglePreHistoryHiddenEnabled' : 'AdminLog.TogglePreHistoryHiddenDisabled', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionDefaultBannedRights': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.DefaultBannedRightsChanged', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionStopPoll': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.PollStopped', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionChangeLinkedChat': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeLinkedChat', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionChangeLocation': ({isBroadcast, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangeLocationChannel' : 'AdminLog.ChangeLocationGroup', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionToggleSlowMode': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => {
      if(action.new_value) {
        const duration = wrapFormattedDuration(formatDuration(action.new_value));
        return i18n('AdminLog.ToggleSlowModeSet', [makePeerTitle(peerId), duration]);
      } else {
        return i18n('AdminLog.ToggleSlowModeDisabled', [makePeerTitle(peerId)]);
      }
    }
  }),
  'channelAdminLogEventActionStartGroupCall': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.StartGroupCall', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionDiscardGroupCall': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.DiscardGroupCall', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionParticipantMute': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantMuted', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionParticipantUnmute': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantUnmuted', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionToggleGroupCallSetting': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(action.join_muted ? 'AdminLog.ToggleGroupCallSettingEnabled' : 'AdminLog.ToggleGroupCallSettingDisabled', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionParticipantJoinByInvite': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantJoinedByInvite', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionExportedInviteDelete': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ExportedInviteDeleted', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionExportedInviteRevoke': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ExportedInviteRevoked', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionExportedInviteEdit': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ExportedInviteEdit', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionParticipantVolume': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantVolumeChanged', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionChangeHistoryTTL': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => {
      if(action.new_value) {
        const duration = wrapFormattedDuration(formatDuration(action.new_value));
        return i18n('AdminLog.ChangeHistoryTTLEnabled', [makePeerTitle(peerId), duration]);
      } else {
        return i18n('AdminLog.ChangeHistoryTTLDisabled', [makePeerTitle(peerId)]);
      }
    }
  }),
  'channelAdminLogEventActionParticipantJoinByRequest': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantJoinedByRequest', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionToggleNoForwards': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleNoForwardsEnabled' : 'AdminLog.ToggleNoForwardsDisabled', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionSendMessage': ({action, peerId, makePeerTitle}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => i18n('AdminLog.MessageSent', [makePeerTitle(peerId)])
  }) : null,
  'channelAdminLogEventActionChangeAvailableReactions': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeAvailableReactions', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionChangeUsernames': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () =>
      i18n('AdminLog.ChangeUsernames', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionToggleForum': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleForumEnabled' : 'AdminLog.ToggleForumDisabled', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionCreateTopic': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.TopicCreated', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionEditTopic': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.TopicEdited', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionDeleteTopic': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.TopicDeleted', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionPinTopic': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => {
      // For now, assume it's always pinning since we don't have clear access to prev/new state
      return i18n('AdminLog.TopicPinned', [makePeerTitle(peerId)]);
    }
  }),
  'channelAdminLogEventActionToggleAntiSpam': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleAntiSpamEnabled' : 'AdminLog.ToggleAntiSpamDisabled', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionChangePeerColor': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangePeerColor', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionChangeProfilePeerColor': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeProfilePeerColor', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionChangeWallpaper': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeWallpaper', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionChangeEmojiStatus': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeEmojiStatus', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionChangeEmojiStickerSet': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeEmojiStickerSet', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionToggleSignatureProfiles': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleSignatureProfilesEnabled' : 'AdminLog.ToggleSignatureProfilesDisabled', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionParticipantSubExtend': ({peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantSubscriptionExtended', [makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionToggleAutotranslation': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleAutoTranslationEnabled' : 'AdminLog.ToggleAutoTranslationDisabled', [makePeerTitle(peerId)])
  })
};

type ResolveAdminLogArgs = {
  channelId: ChatId;
  event: ChannelAdminLogEvent;
  isBroadcast: boolean;
  isForum: boolean;
  peerId: PeerId;
  makePeerTitle: (peerId: PeerId) => Node;
  makeMessagePeerTitle: (peerId: PeerId) => Node;
};

export const resolveAdminLog = ({channelId, event, isBroadcast, isForum, peerId, makePeerTitle, makeMessagePeerTitle}: ResolveAdminLogArgs) => {
  const resolver = adminLogsMap[event.action._];

  if(!resolver) {
    return null;
  }

  return resolver({channelId, event, action: event.action as never, isBroadcast, isForum, peerId, makePeerTitle, makeMessagePeerTitle});
};
