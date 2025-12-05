import {Component, Show} from 'solid-js';
import formatDuration from '../../../../helpers/formatDuration';
import deepEqual from '../../../../helpers/object/deepEqual';
import pause from '../../../../helpers/schedulers/pause';
import createMiddleware from '../../../../helpers/solid/createMiddleware';
import {wrapAsyncClickHandler} from '../../../../helpers/wrapAsyncClickHandler';
import {ChannelAdminLogEvent, ChannelAdminLogEventAction} from '../../../../layer';
import getParticipantPeerId from '../../../../lib/appManagers/utils/chats/getParticipantPeerId';
import {isBannedParticipant} from '../../../../lib/appManagers/utils/chats/isBannedParticipant';
import {i18n} from '../../../../lib/langPack';
import wrapRichText from '../../../../lib/richTextProcessor/wrapRichText';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {useSuperTab} from '../../../solidJsTabs/superTabProvider';
import {type AppAdminRecentActionsTab} from '../../../solidJsTabs/tabs';
import Space from '../../../space';
import {wrapFormattedDuration} from '../../../wrappers/wrapDuration';
import {resolveAdminRightFlagI18n} from './adminRightsI18nResolver';
import {BooleanKeyValue} from './booleanKeyValue';
import {ChatPhoto} from './chatPhoto';
import {limitPeerTitleSymbols} from './constants';
import {KeyValuePair} from './keyValuePair';
import {LogDiff} from './logDiff';
import {participantRightsMap} from './participantRightsMap';
import {PreviewMessageButtons} from './previewMessageButtons';
import {diffFlags, getPhoto} from './utils';


export type GroupType =
  | 'info'
  | 'identity'
  | 'media'
  | 'permissions'
  | 'messages'
  | 'participants'
  | 'invites'
  | 'join'
  | 'leave'
  | 'links'
  | 'location'
  | 'calls'
  | 'topics'
  | 'appearance'
  | 'reactions'
  | 'forum'
  | 'translations'
  | 'pinned'
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
  'channelAdminLogEventActionChangeTitle': ({action, isBroadcast}) => ({
    group: 'info',
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ChangeTitleChannel' : 'AdminRecentActionMessage.ChangeTitleGroup'),
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
  'channelAdminLogEventActionToggleInvites': ({action}) => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ToggleInvites'),
    ExpandableContent: () => (
      <BooleanKeyValue value={action.new_value} />
    )
  }),
  'channelAdminLogEventActionToggleSignatures': ({action}) => ({
    group: 'identity',
    Message: () => i18n('AdminRecentActionMessage.ToggleSignatures'),
    ExpandableContent: () => (
      <BooleanKeyValue value={action.new_value} />
    )
  }),
  'channelAdminLogEventActionUpdatePinned': ({channelId, action}) => ({
    group: 'pinned',
    Message: () => i18n('AdminRecentActionMessage.UpdatePinnedMessage'),
    ExpandableContent: () => {
      const photo = getPhoto(action.message);
      const justMessage = action.message?._ === 'message' ? action.message : undefined;

      const hasPhotoDiff = photo;
      const hasMessageDiff = justMessage?.message;

      const middleware = createMiddleware().get();

      const pinned = action.message?._ === 'message' && action.message.pFlags?.pinned;

      return <>
        <Show when={hasPhotoDiff}>
          <LogDiff
            vertical
            added={pinned && photo && <ChatPhoto photo={photo} />}
            removed={!pinned && photo && <ChatPhoto photo={photo} />}
          />
        </Show>

        {(hasPhotoDiff && hasMessageDiff) && <Space amount='4px' />}

        <Show when={hasMessageDiff}>
          <LogDiff
            added={pinned && justMessage && wrapRichText(justMessage.message, {entities: justMessage.entities, middleware})}
            removed={!pinned && justMessage && wrapRichText(justMessage.message, {entities: justMessage.entities, middleware})}
          />
        </Show>

        <Space amount='8px' />

        <PreviewMessageButtons
          channelId={channelId}
          added={pinned ? action.message : undefined}
          removed={pinned ? undefined : action.message}
          addedKey='AdminRecentActions.ViewPinned'
          removedKey='AdminRecentActions.ViewUnpinned'
        />
      </>;
    }
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

      const middleware = createMiddleware().get();

      return <>
        <Show when={hasPhotoDiff}>
          <LogDiff
            vertical
            added={newPhoto && <ChatPhoto photo={newPhoto} />}
            removed={prevPhoto && <ChatPhoto photo={prevPhoto} />}
          />
        </Show>

        <Show when={hasPhotoDiff && hasMessageDiff}>
          <Space amount='4px' />
        </Show>

        <Show when={hasMessageDiff}>
          <LogDiff
            added={newMessage && wrapRichText(newMessage.message, {entities: newMessage.entities, middleware})}
            removed={prevMessage && wrapRichText(prevMessage.message, {entities: prevMessage.entities, middleware})}
          />
        </Show>

        <Space amount='8px' />

        <PreviewMessageButtons
          channelId={channelId}
          added={action.new_message}
          removed={action.prev_message}
          addedKey='AdminRecentActions.ViewUpdatedMessage'
          removedKey='AdminRecentActions.ViewPreviousMessage'
        />
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

      const middleware = createMiddleware().get();

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
            removed={prevMessage && wrapRichText(prevMessage.message, {entities: prevMessage.entities, middleware})}
          />
        </Show>

        <Space amount='8px' />

        <PreviewMessageButtons
          channelId={channelId}
          removed={action.message}
          removedKey='AdminRecentActions.ViewDeletedMessage'
        />
      </>;
    }
  }),
  'channelAdminLogEventActionParticipantJoin': ({isBroadcast}) => ({
    group: 'join',
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ParticipantJoinedChannel' : 'AdminRecentActionMessage.ParticipantJoinedGroup')
  }),
  'channelAdminLogEventActionParticipantLeave': ({isBroadcast}) => ({
    group: 'leave',
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ParticipantLeftChannel' : 'AdminRecentActionMessage.ParticipantLeftGroup')
  }),
  'channelAdminLogEventActionParticipantInvite': () => ({
    group: 'join',
    Message: () => i18n('AdminRecentActionMessage.ParticipantInvited')
  }),
  'channelAdminLogEventActionParticipantToggleBan': ({action}) => ({
    group: 'permissions',
    Message: () => i18n(isBannedParticipant(action.new_participant) ?
      'AdminRecentActionMessage.ParticipantBanned' :
      'AdminRecentActionMessage.ParticipantPermissionsToggled'
    ),
    ExpandableContent: () => {
      const {PeerTitleTsx} = useHotReloadGuard();

      const prevBannedParticipant = action.prev_participant?._ === 'channelParticipantBanned' ? action.prev_participant : undefined;
      const newBannedParticipant = action.new_participant?._ === 'channelParticipantBanned' ? action.new_participant : undefined;

      const diff = diffFlags(prevBannedParticipant?.banned_rights?.pFlags, newBannedParticipant?.banned_rights?.pFlags);

      return (
        <>
          <KeyValuePair
            label={i18n('AdminRecentActions.Participant')}
            value={
              <PeerTitleTsx
                peerId={getParticipantPeerId(action.prev_participant || action.new_participant)}
                limitSymbols={limitPeerTitleSymbols}
              />
            }
          />
          <Show when={!isBannedParticipant(action.new_participant)}>
            <Space amount='4px' />

            <LogDiff
              // yes, they need to be inversed here
              removed={
                diff.new.map(key => participantRightsMap[key])
                .filter(Boolean).map(key => i18n(key))
              }
              added={
                diff.old.map(key => participantRightsMap[key])
                .filter(Boolean).map(key => i18n(key))
              }
            />
          </Show>
        </>
      )
    }
  }),
  'channelAdminLogEventActionParticipantToggleAdmin': ({action, isBroadcast}) => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.AdminToggled'),
    ExpandableContent: () => {
      const {PeerTitleTsx, rootScope} = useHotReloadGuard();
      const [tab, allTabs] = useSuperTab<typeof AppAdminRecentActionsTab>();

      const prevParticipantRights = 'admin_rights' in action.prev_participant ? action.prev_participant.admin_rights : null;
      const newParticipantRights = 'admin_rights' in action.new_participant ? action.new_participant.admin_rights : null;

      const diff = diffFlags(prevParticipantRights?.pFlags, newParticipantRights?.pFlags);
      const peerId = getParticipantPeerId(action.prev_participant || action.new_participant);

      return <>
        <Show when={peerId}>
          <KeyValuePair
            label={i18n('AdminRecentActions.ChangedPermissionsToUser')}
            value={<PeerTitleTsx peerId={peerId} limitSymbols={limitPeerTitleSymbols} />}
            onClick={wrapAsyncClickHandler(async() => {
              const participant = await rootScope.managers.appProfileManager.getParticipant(tab.payload.channelId, peerId);
              allTabs.AppUserPermissionsTab.openTab(tab.slider, tab.payload.channelId, participant, true);
              await pause(200); // wait the open animation too
            })}
          />
          <Space amount='4px' />
        </Show>
        <LogDiff
          added={diff.new.map(key => i18n(resolveAdminRightFlagI18n(key, {isBroadcast})))}
          removed={diff.old.map(key => i18n(resolveAdminRightFlagI18n(key, {isBroadcast})))}
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
  'channelAdminLogEventActionChangeLocation': ({isBroadcast}) => ({
    group: 'location',
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ChangeLocationChannel' : 'AdminRecentActionMessage.ChangeLocationGroup')
  }),
  'channelAdminLogEventActionToggleSlowMode': ({action}) => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.ToggleSlowMode'),
    ExpandableContent: () => (
      <KeyValuePair
        label={i18n('AdminRecentActions.SlowModeDuration')}
        value={
            action.new_value ?
              wrapFormattedDuration(formatDuration(action.new_value)) :
              i18n('AdminRecentActions.Disabled')
        }
      />
    )
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
    group: 'join',
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
  join: 'adduser',
  invites: 'link',
  leave: 'deleteuser',
  links: 'link',
  location: 'location',
  calls: 'phone',
  topics: 'topics',
  appearance: 'brush',
  reactions: 'reactions',
  forum: 'comments',
  translations: 'language',
  pinned: 'pin',
  other: 'more'
};
