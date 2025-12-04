import {Component, Show} from 'solid-js';
import deepEqual from '../../../../helpers/object/deepEqual';
import pause from '../../../../helpers/schedulers/pause';
import {wrapAsyncClickHandler} from '../../../../helpers/wrapAsyncClickHandler';
import {ChannelAdminLogEvent, ChannelAdminLogEventAction} from '../../../../layer';
import getParticipantPeerId from '../../../../lib/appManagers/utils/chats/getParticipantPeerId';
import {i18n} from '../../../../lib/langPack';
import wrapRichText from '../../../../lib/richTextProcessor/wrapRichText';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {useSuperTab} from '../../../solidJsTabs/superTabProvider';
import {type AppAdminRecentActionsTab} from '../../../solidJsTabs/tabs';
import Space from '../../../space';
import {resolveAdminRightFlagI18n} from './adminRightsI18nResolver';
import {ChatPhoto} from './chatPhoto';
import {diffAdminRights} from './diffAdminRights';
import {KeyValuePair} from './keyValuePair';
import {LogDiff} from './logDiff';
import {PreviewMessageButtons} from './previewMessageButtons';
import {getPhoto} from './utils';


export type GroupType =
  | 'info'
  | 'identity'
  | 'media'
  | 'permissions'
  | 'messages'
  | 'participants'
  | 'invites'
  | 'links'
  | 'location'
  | 'calls'
  | 'topics'
  | 'appearance'
  | 'reactions'
  | 'forum'
  | 'translations'
  | 'other';

type MapCallbackResult = {
  // Making them as components to avoid rendering when not expanded, and being able to duplicate when needed
  Message: Component;
  ExpandableContent?: Component;

  group: GroupType;
};

type MapCallbackArgs<Key extends ChannelAdminLogEventAction['_']> = {
  channelId: ChatId;
  action: Extract<ChannelAdminLogEventAction, {_: Key}>;
  isBroadcast: boolean;
  isForum: boolean;
};

type MapCallback<Key extends ChannelAdminLogEventAction['_']> = (args: MapCallbackArgs<Key>) => MapCallbackResult;

const logEntriesMap: {[Key in ChannelAdminLogEventAction['_']]: MapCallback<Key>} = {
  'channelAdminLogEventActionChangeTitle': ({action}) => ({
    group: 'info',
    Message: () => i18n('AdminRecentActionMessage.ChangeTitle'),
    ExpandableContent: () => <LogDiff added={action.new_value} removed={action.prev_value} />
  }),
  'channelAdminLogEventActionChangeAbout': ({action, isBroadcast}) => ({
    group: 'info',
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ChangeAboutChannel' : 'AdminRecentActionMessage.ChangeAboutGroup'),
    ExpandableContent: () => <LogDiff added={action.new_value} removed={action.prev_value} />
  }),
  'channelAdminLogEventActionChangeUsername': ({action, isBroadcast}) => ({
    group: 'identity',
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ChangeUsernameChannel' : 'AdminRecentActionMessage.ChangeUsernameGroup'),
    ExpandableContent: () => <LogDiff added={action.new_value} removed={action.prev_value} />
  }),
  'channelAdminLogEventActionChangePhoto': ({action, isBroadcast, isForum}) => ({
    group: 'media',
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
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ToggleInvites')
  }),
  'channelAdminLogEventActionToggleSignatures': () => ({
    group: 'identity',
    Message: () => i18n('AdminRecentActionMessage.ToggleSignatures')
  }),
  'channelAdminLogEventActionUpdatePinned': () => ({
    group: 'messages',
    Message: () => i18n('AdminRecentActionMessage.UpdatePinnedMessage')
  }),
  'channelAdminLogEventActionEditMessage': ({channelId, action}) => ({
    group: 'messages',
    Message: () => i18n('AdminRecentActionMessage.EditedMessage'),
    ExpandableContent: () => {
      const prevPhoto = getPhoto(action.prev_message);
      const newPhoto = getPhoto(action.new_message);

      const prevMessage = action.prev_message?._ === 'message' ? action.prev_message : undefined;
      const newMessage = action.new_message?._ === 'message' ? action.new_message : undefined;

      const hasPhotoDiff = prevPhoto?.id !== newPhoto?.id;
      const hasMessageDiff = prevMessage?.message !== newMessage?.message || !deepEqual(prevMessage?.entities, newMessage?.entities);

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

        <Space amount='8px' />

        <PreviewMessageButtons channelId={channelId} added={action.new_message} removed={action.prev_message} />
      </>;
    }
  }),
  'channelAdminLogEventActionDeleteMessage': ({channelId, action}) => ({
    group: 'messages',
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

        <Space amount='8px' />

        <PreviewMessageButtons channelId={channelId} removed={action.message} removedIsDeleted />
      </>;
    }
  }),
  'channelAdminLogEventActionParticipantJoin': () => ({
    group: 'participants',
    Message: () => i18n('AdminRecentActionMessage.ParticipantJoined')
  }),
  'channelAdminLogEventActionParticipantLeave': () => ({
    group: 'participants',
    Message: () => i18n('AdminRecentActionMessage.ParticipantLeft')
  }),
  'channelAdminLogEventActionParticipantInvite': () => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ParticipantInvited')
  }),
  'channelAdminLogEventActionParticipantToggleBan': () => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.BanToggled')
  }),
  'channelAdminLogEventActionParticipantToggleAdmin': ({action, isBroadcast}) => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.AdminToggled'),
    ExpandableContent: () => {
      const {PeerTitleTsx, rootScope} = useHotReloadGuard();
      const [tab, allTabs] = useSuperTab<typeof AppAdminRecentActionsTab>();

      const prevParticipantRights = 'admin_rights' in action.prev_participant ? action.prev_participant.admin_rights : null;
      const newParticipantRights = 'admin_rights' in action.new_participant ? action.new_participant.admin_rights : null;

      const diff = diffAdminRights(prevParticipantRights?.pFlags, newParticipantRights?.pFlags);
      const peerId = getParticipantPeerId(action.prev_participant || action.new_participant);

      return <>
        <Show when={peerId}>
          <KeyValuePair
            label={i18n('AdminRecentActionMessage.ChangedPermissionsToUser')}
            value={<PeerTitleTsx peerId={peerId} />}
            onClick={wrapAsyncClickHandler(async() => {
              const participant = await rootScope.managers.appProfileManager.getParticipant(tab.payload.channelId, peerId);
              allTabs.AppUserPermissionsTab.openTab(tab.slider, tab.payload.channelId, participant, true);
              await pause(200); // wait the open animation too
            })}
          />
          <Space amount='4px' />
        </Show>
        <LogDiff
          added={diff.granted.map(key => i18n(resolveAdminRightFlagI18n(key, {isBroadcast})))}
          removed={diff.revoked.map(key => i18n(resolveAdminRightFlagI18n(key, {isBroadcast})))}
        />
      </>;
    }
  }),
  'channelAdminLogEventActionChangeStickerSet': () => ({
    group: 'appearance',
    Message: () => i18n('AdminRecentActionMessage.ChangeStickerSet')
  }),
  'channelAdminLogEventActionTogglePreHistoryHidden': () => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.TogglePreHistoryHidden')
  }),
  'channelAdminLogEventActionDefaultBannedRights': () => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.DefaultBannedRightsChanged')
  }),
  'channelAdminLogEventActionStopPoll': () => ({
    group: 'messages',
    Message: () => i18n('AdminRecentActionMessage.PollStopped')
  }),
  'channelAdminLogEventActionChangeLinkedChat': () => ({
    group: 'links',
    Message: () => i18n('AdminRecentActionMessage.ChangeLinkedChat')
  }),
  'channelAdminLogEventActionChangeLocation': () => ({
    group: 'location',
    Message: () => i18n('AdminRecentActionMessage.ChangeLocation')
  }),
  'channelAdminLogEventActionToggleSlowMode': () => ({
    group: 'messages',
    Message: () => i18n('AdminRecentActionMessage.ToggleSlowMode')
  }),
  'channelAdminLogEventActionStartGroupCall': () => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.StartGroupCall')
  }),
  'channelAdminLogEventActionDiscardGroupCall': () => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.DiscardGroupCall')
  }),
  'channelAdminLogEventActionParticipantMute': () => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.ParticipantMuted')
  }),
  'channelAdminLogEventActionParticipantUnmute': () => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.ParticipantUnmuted')
  }),
  'channelAdminLogEventActionToggleGroupCallSetting': () => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.ToggleGroupCallSetting')
  }),
  'channelAdminLogEventActionParticipantJoinByInvite': () => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ParticipantJoinedByInvite')
  }),
  'channelAdminLogEventActionExportedInviteDelete': () => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ExportedInviteDeleted')
  }),
  'channelAdminLogEventActionExportedInviteRevoke': () => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ExportedInviteRevoked')
  }),
  'channelAdminLogEventActionExportedInviteEdit': () => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ExportedInviteEdited')
  }),
  'channelAdminLogEventActionParticipantVolume': () => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.ParticipantVolumeChanged')
  }),
  'channelAdminLogEventActionChangeHistoryTTL': () => ({
    group: 'messages',
    Message: () => i18n('AdminRecentActionMessage.ChangeHistoryTTL')
  }),
  'channelAdminLogEventActionParticipantJoinByRequest': () => ({
    group: 'participants',
    Message: () => i18n('AdminRecentActionMessage.ParticipantJoinedByRequest')
  }),
  'channelAdminLogEventActionToggleNoForwards': () => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.ToggleNoForwards')
  }),
  'channelAdminLogEventActionSendMessage': () => ({
    group: 'messages',
    Message: () => i18n('AdminRecentActionMessage.MessageSent')
  }),
  'channelAdminLogEventActionChangeAvailableReactions': () => ({
    group: 'reactions',
    Message: () => i18n('AdminRecentActionMessage.ChangeAvailableReactions')
  }),
  'channelAdminLogEventActionChangeUsernames': () => ({
    group: 'identity',
    Message: () => i18n('AdminRecentActionMessage.ChangeUsernames')
  }),
  'channelAdminLogEventActionToggleForum': () => ({
    group: 'forum',
    Message: () => i18n('AdminRecentActionMessage.ToggleForum')
  }),
  'channelAdminLogEventActionCreateTopic': () => ({
    group: 'topics',
    Message: () => i18n('AdminRecentActionMessage.TopicCreated')
  }),
  'channelAdminLogEventActionEditTopic': () => ({
    group: 'topics',
    Message: () => i18n('AdminRecentActionMessage.TopicEdited')
  }),
  'channelAdminLogEventActionDeleteTopic': () => ({
    group: 'topics',
    Message: () => i18n('AdminRecentActionMessage.TopicDeleted')
  }),
  'channelAdminLogEventActionPinTopic': () => ({
    group: 'topics',
    Message: () => i18n('AdminRecentActionMessage.TopicPinned')
  }),
  'channelAdminLogEventActionToggleAntiSpam': () => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.ToggleAntiSpam')
  }),
  'channelAdminLogEventActionChangePeerColor': () => ({
    group: 'appearance',
    Message: () => i18n('AdminRecentActionMessage.ChangePeerColor')
  }),
  'channelAdminLogEventActionChangeProfilePeerColor': () => ({
    group: 'appearance',
    Message: () => i18n('AdminRecentActionMessage.ChangeProfilePeerColor')
  }),
  'channelAdminLogEventActionChangeWallpaper': () => ({
    group: 'appearance',
    Message: () => i18n('AdminRecentActionMessage.ChangeWallpaper')
  }),
  'channelAdminLogEventActionChangeEmojiStatus': () => ({
    group: 'appearance',
    Message: () => i18n('AdminRecentActionMessage.ChangeEmojiStatus')
  }),
  'channelAdminLogEventActionChangeEmojiStickerSet': () => ({
    group: 'appearance',
    Message: () => i18n('AdminRecentActionMessage.ChangeEmojiStickerSet')
  }),
  'channelAdminLogEventActionToggleSignatureProfiles': () => ({
    group: 'identity',
    Message: () => i18n('AdminRecentActionMessage.ToggleSignatureProfiles')
  }),
  'channelAdminLogEventActionParticipantSubExtend': () => ({
    group: 'participants',
    Message: () => i18n('AdminRecentActionMessage.ParticipantSubscriptionExtended')
  }),
  'channelAdminLogEventActionToggleAutotranslation': () => ({
    group: 'translations',
    Message: () => i18n('AdminRecentActionMessage.ToggleAutoTranslation')
  })
};

type ResolveLogEntryArgs = {
  channelId: ChatId;
  event: ChannelAdminLogEvent;
  isBroadcast: boolean;
  isForum: boolean;
};

export const resolveLogEntry = ({channelId, event, isBroadcast, isForum}: ResolveLogEntryArgs) => {
  const resolver = logEntriesMap[event.action._];
  if(!resolver) {
    return null;
  }
  return resolver({channelId, action: event.action as never, isBroadcast, isForum});
};

export const groupToIconMap: Record<GroupType, Icon> = {
  info: 'info',
  identity: 'username',
  media: 'image',
  permissions: 'permissions',
  messages: 'message',
  participants: 'group',
  invites: 'adduser',
  links: 'link',
  location: 'location',
  calls: 'phone',
  topics: 'topics',
  appearance: 'brush',
  reactions: 'reactions',
  forum: 'comments',
  translations: 'language',
  other: 'more'
};
