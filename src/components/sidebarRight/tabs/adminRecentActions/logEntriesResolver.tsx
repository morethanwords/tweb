import {Component, Show} from 'solid-js';
import {ChannelAdminLogEvent, ChannelAdminLogEventAction} from '../../../../layer';
import getParticipantPeerId from '../../../../lib/appManagers/utils/chats/getParticipantPeerId';
import {i18n} from '../../../../lib/langPack';
import wrapRichText from '../../../../lib/richTextProcessor/wrapRichText';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import Space from '../../../space';
import {resolveAdminRightFlagI18n} from './adminRightsI18nResolver';
import {ChatPhoto} from './chatPhoto';
import {diffAdminRights} from './diffAdminRights';
import {KeyValuePair} from './keyValuePair';
import {LogDiff} from './logDiff';
import {getPhoto} from './utils';


type MapCallbackResult = {
  // Making them as components to avoid rendering when not expanded, and being able to duplicate when needed
  Message: Component;
  ExpandableContent?: Component;
};

type MapCallbackArgs<Key extends ChannelAdminLogEventAction['_']> = {
  action: Extract<ChannelAdminLogEventAction, {_: Key}>;
  isBroadcast: boolean;
  isForum: boolean;
};

type MapCallback<Key extends ChannelAdminLogEventAction['_']> = (args: MapCallbackArgs<Key>) => MapCallbackResult;


const logEntriesMap: {[Key in ChannelAdminLogEventAction['_']]: MapCallback<Key>} = {
  'channelAdminLogEventActionChangeTitle': ({action}) => ({
    Message: () => i18n('AdminRecentActionMessage.ChangeTitle'),
    ExpandableContent: () => <LogDiff added={action.new_value} removed={action.prev_value} />
  }),
  'channelAdminLogEventActionChangeAbout': ({action, isBroadcast}) => ({
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ChangeAboutChannel' : 'AdminRecentActionMessage.ChangeAboutGroup'),
    ExpandableContent: () => <LogDiff added={action.new_value} removed={action.prev_value} />
  }),
  'channelAdminLogEventActionChangeUsername': ({action, isBroadcast}) => ({
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ChangeUsernameChannel' : 'AdminRecentActionMessage.ChangeUsernameGroup'),
    ExpandableContent: () => <LogDiff added={action.new_value} removed={action.prev_value} />
  }),
  'channelAdminLogEventActionChangePhoto': ({action, isBroadcast, isForum}) => ({
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ChangePhotoChannel' : 'AdminRecentActionMessage.ChangePhotoGroup'),
    ExpandableContent: () => (
      <LogDiff
        vertical
        added={action.new_photo?._ === 'photo' && <ChatPhoto photo={action.new_photo} rounded isForum={isForum} />}
        removed={action.prev_photo?._ === 'photo' && <ChatPhoto photo={action.prev_photo} rounded isForum={isForum} />}
      />
    )
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
  'channelAdminLogEventActionEditMessage': ({action}) => ({
    Message: () => i18n('AdminRecentActionMessage.EditedMessage'),
    ExpandableContent: () => {
      const prevPhoto = getPhoto(action.prev_message);
      const newPhoto = getPhoto(action.new_message);

      const prevMessage = action.prev_message?._ === 'message' ? action.prev_message : undefined;
      const newMessage = action.new_message?._ === 'message' ? action.new_message : undefined;

      const hasPhotoDiff = prevPhoto || newPhoto;
      const hasMessageDiff = prevMessage?.message || newMessage?.message;

      return <>
        <Show when={hasPhotoDiff}>
          <LogDiff
            vertical
            added={newPhoto && <ChatPhoto photo={newPhoto} />}
            removed={prevPhoto && <ChatPhoto photo={prevPhoto} />}
          />
        </Show>

        {(hasPhotoDiff && hasMessageDiff) && <Space amount='4px' />}

        <Show when={hasMessageDiff}>
          <LogDiff
            added={newMessage && wrapRichText(newMessage.message, {entities: newMessage.entities})}
            removed={prevMessage && wrapRichText(prevMessage.message, {entities: prevMessage.entities})}
          />
        </Show>
      </>;
    }
  }),
  'channelAdminLogEventActionDeleteMessage': ({action}) => ({
    Message: () => i18n('AdminRecentActionMessage.DeletedMessage'),
    ExpandableContent: () => {
      const prevPhoto = getPhoto(action.message);
      const prevMessage = action.message?._ === 'message' ? action.message : undefined;

      const hasPhotoDiff = prevPhoto;
      const hasMessageDiff = prevMessage?.message;

      return <>
        <Show when={hasPhotoDiff}>
          <LogDiff
            vertical
            removed={prevPhoto && <ChatPhoto photo={prevPhoto} />}
          />
        </Show>

        {(hasPhotoDiff && hasMessageDiff) && <Space amount='4px' />}

        <Show when={hasMessageDiff}>
          <LogDiff
            removed={prevMessage && wrapRichText(prevMessage.message, {entities: prevMessage.entities})}
          />
        </Show>
      </>;
    }
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
  'channelAdminLogEventActionParticipantToggleAdmin': ({action, isBroadcast}) => ({
    Message: () => i18n('AdminRecentActionMessage.AdminToggled'),
    ExpandableContent: () => {
      const {PeerTitleTsx} = useHotReloadGuard();

      const prevParticipantRights = 'admin_rights' in action.prev_participant ? action.prev_participant.admin_rights : null;
      const newParticipantRights = 'admin_rights' in action.new_participant ? action.new_participant.admin_rights : null;

      const diff = diffAdminRights(prevParticipantRights?.pFlags, newParticipantRights?.pFlags);
      const peerId = getParticipantPeerId(action.prev_participant || action.new_participant);

      return <>
        <Show when={peerId}>
          <KeyValuePair
            label={i18n('ToUser')}
            value={<PeerTitleTsx peerId={peerId} />}
          />
        </Show>
        <LogDiff
          added={diff.granted.map(key => i18n(resolveAdminRightFlagI18n(key, {isBroadcast})))}
          removed={diff.revoked.map(key => i18n(resolveAdminRightFlagI18n(key, {isBroadcast})))}
        />
      </>;
    }
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

type ResolveLogEntryArgs = {
  event: ChannelAdminLogEvent;
  isBroadcast: boolean;
  isForum: boolean;
};

export const resolveLogEntry = ({event, isBroadcast, isForum}: ResolveLogEntryArgs) => {
  const resolver = logEntriesMap[event.action._];
  if(!resolver) {
    return null;
  }
  return resolver({action: event.action as never, isBroadcast, isForum});
};
