import {Component, Show} from 'solid-js';
import formatDuration from '@helpers/formatDuration';
import deepEqual from '@helpers/object/deepEqual';
import createMiddleware from '@helpers/solid/createMiddleware';
import {I18nTsx} from '@helpers/solid/i18n';
import {ChannelAdminLogEvent, ChannelAdminLogEventAction, ChatBannedRights} from '@layer';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import {isBannedParticipant} from '@appManagers/utils/chats/isBannedParticipant';
import removeChatBannedRightsFromParticipant from '@appManagers/utils/chats/removeChatBannedRightsFromParticipant';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {i18n} from '@lib/langPack';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import Space from '@components/space';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {resolveAdminRightFlagI18n} from '@components/sidebarRight/tabs/adminRecentActions/adminRightsI18nResolver';
import {ChatPhoto} from '@components/sidebarRight/tabs/adminRecentActions/chatPhoto';
import {limitPeerTitleSymbols} from '@components/sidebarRight/tabs/adminRecentActions/constants';
import {BooleanKeyValue, InviteKeyValue, KeyValuePair, ParticipantKeyValue} from '@components/sidebarRight/tabs/adminRecentActions/keyValuePair';
import {LogDiff} from '@components/sidebarRight/tabs/adminRecentActions/logDiff';
import {participantRightsMap} from '@components/sidebarRight/tabs/adminRecentActions/participantRightsMap';
import {PreviewMessageButtons} from '@components/sidebarRight/tabs/adminRecentActions/previewMessageButtons';
import {TopicName} from '@components/sidebarRight/tabs/adminRecentActions/topicName';
import {diffFlags, getPhoto, useParticipantClickHandler} from '@components/sidebarRight/tabs/adminRecentActions/utils';


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


const logEntriesMap: { [Key in ChannelAdminLogEventAction['_']]: MapCallback<Key> } = {
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
      const prevMessage = action.message?._ === 'message' ? structuredClone(action.message) : undefined;

      const hasPhotoDiff = prevPhoto;
      const hasMessageDiff = prevMessage?.message;

      const middleware = createMiddleware().get();

      if(prevMessage && prevMessage.media?._ === 'messageMediaPoll') {
        if(!prevMessage.media.poll.pFlags) prevMessage.media.poll.pFlags = {};
        prevMessage.media.poll.pFlags.closed = true;
      }

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
          removed={prevMessage || action.message}
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
  'channelAdminLogEventActionParticipantInvite': ({action}) => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ParticipantInvited'),
    ExpandableContent: () => (
      <ParticipantKeyValue peerId={getParticipantPeerId(action.participant)} />
    )
  }),
  'channelAdminLogEventActionParticipantToggleBan': ({channelId, action}) => ({
    group: 'permissions',
    Message: () => i18n(isBannedParticipant(action.new_participant) ?
      'AdminRecentActionMessage.ParticipantBanned' :
      'AdminRecentActionMessage.ParticipantPermissionsToggled'
    ),
    ExpandableContent: () => {
      const {apiManagerProxy} = useHotReloadGuard();

      const prevBannedParticipant = action.prev_participant?._ === 'channelParticipantBanned' ? action.prev_participant : undefined;
      const newBannedParticipant = action.new_participant?._ === 'channelParticipantBanned' ? action.new_participant : undefined;

      const channel = apiManagerProxy.getChat(channelId);

      const removeDefaultRights = (rights: ChatBannedRights.chatBannedRights) =>
        channel?._ === 'channel' && rights ?
          removeChatBannedRightsFromParticipant(channel, rights) :
          rights;

      const peerId = getParticipantPeerId(action.prev_participant || action.new_participant);

      const diff = diffFlags(
        removeDefaultRights(prevBannedParticipant?.banned_rights)?.pFlags,
        removeDefaultRights(newBannedParticipant?.banned_rights)?.pFlags
      );

      return (
        <>
          <ParticipantKeyValue peerId={peerId} />

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
      const {PeerTitleTsx} = useHotReloadGuard();

      const prevParticipantRights = 'admin_rights' in action.prev_participant ? action.prev_participant.admin_rights : null;
      const newParticipantRights = 'admin_rights' in action.new_participant ? action.new_participant.admin_rights : null;

      const diff = diffFlags(prevParticipantRights?.pFlags, newParticipantRights?.pFlags);
      const peerId = getParticipantPeerId(action.prev_participant || action.new_participant);

      return <>
        <Show when={peerId}>
          <KeyValuePair
            label={i18n('AdminRecentActions.ChangedPermissionsToUser')}
            value={<PeerTitleTsx peerId={peerId} limitSymbols={limitPeerTitleSymbols} />}
            onClick={useParticipantClickHandler(peerId)}
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
  'channelAdminLogEventActionDefaultBannedRights': ({action}) => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.DefaultBannedRightsChanged'),
    ExpandableContent: () => {
      const diff = diffFlags(action.prev_banned_rights?.pFlags, action.new_banned_rights?.pFlags);

      return (
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
      )
    }
  }),
  'channelAdminLogEventActionStopPoll': ({channelId, action}) => ({
    group: 'messages',
    Message: () => i18n('AdminRecentActionMessage.PollStopped'),
    ExpandableContent: () => (
      <PreviewMessageButtons
        channelId={channelId}
        removed={action.message}
        removedKey='AdminRecentActions.ViewStopped'
      />
    )
  }),
  'channelAdminLogEventActionChangeLinkedChat': ({action}) => ({
    group: 'links',
    Message: () => i18n('AdminRecentActionMessage.ChangeLinkedChat'),
    ExpandableContent: () => {
      const {PeerTitleTsx} = useHotReloadGuard();

      return (
        <KeyValuePair
          label={<I18nTsx key='DiscussionController.Channel.Title' />}
          value={action.new_value ?
            <PeerTitleTsx peerId={action.new_value.toPeerId(true)} limitSymbols={limitPeerTitleSymbols} /> :
            i18n('AdminRecentActions.Disabled')
          }
        />
      )
    }
  }),
  'channelAdminLogEventActionChangeLocation': ({isBroadcast, action}) => ({
    group: 'location',
    Message: () => i18n(isBroadcast ? 'AdminRecentActionMessage.ChangeLocationChannel' : 'AdminRecentActionMessage.ChangeLocationGroup'),
    ExpandableContent: () => {
      const prevLocation = action.prev_value?._ === 'channelLocation' ? action.prev_value : undefined;
      const newLocation = action.new_value?._ === 'channelLocation' ? action.new_value : undefined;

      return (
        <LogDiff
          added={newLocation?.address}
          removed={prevLocation?.address}
        />
      )
    }
  }),
  'channelAdminLogEventActionToggleSlowMode': ({action}) => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.ToggleSlowMode'),
    ExpandableContent: () => (
      <KeyValuePair
        label={<I18nTsx key={'AdminRecentActions.SlowModeDuration'} />}
        value={action.new_value ?
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
  'channelAdminLogEventActionParticipantMute': ({action}) => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.ParticipantMuted'),
    ExpandableContent: () => <ParticipantKeyValue peerId={getPeerId(action.participant?.peer)} />
  }),
  'channelAdminLogEventActionParticipantUnmute': ({action}) => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.ParticipantUnmuted'),
    ExpandableContent: () => <ParticipantKeyValue peerId={getPeerId(action.participant?.peer)} />
  }),
  'channelAdminLogEventActionToggleGroupCallSetting': ({action}) => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.ToggleGroupCallSetting'),
    ExpandableContent: () => (
      <BooleanKeyValue
        label={<I18nTsx key={'AdminRecentActions.JoinMuted'} />}
        value={action.join_muted}
      />
    )
  }),
  'channelAdminLogEventActionParticipantJoinByInvite': ({action}) => ({
    group: 'join',
    Message: () => i18n('AdminRecentActionMessage.ParticipantJoinedByInvite'),
    ExpandableContent: () => <InviteKeyValue invite={action.invite} />
  }),
  'channelAdminLogEventActionExportedInviteDelete': ({action}) => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ExportedInviteDeleted'),
    ExpandableContent: () => <InviteKeyValue invite={action.invite} />
  }),
  'channelAdminLogEventActionExportedInviteRevoke': ({action}) => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ExportedInviteRevoked'),
    ExpandableContent: () => <InviteKeyValue invite={action.invite} />
  }),
  'channelAdminLogEventActionExportedInviteEdit': ({action}) => ({
    group: 'invites',
    Message: () => i18n('AdminRecentActionMessage.ExportedInviteEdited'),
    ExpandableContent: () => <InviteKeyValue invite={action.new_invite} />
  }),
  'channelAdminLogEventActionParticipantVolume': ({action}) => ({
    group: 'calls',
    Message: () => i18n('AdminRecentActionMessage.ParticipantVolumeChanged'),
    ExpandableContent: () => <ParticipantKeyValue peerId={getPeerId(action.participant?.peer)} />
  }),
  'channelAdminLogEventActionChangeHistoryTTL': ({action}) => ({
    group: 'messages',
    Message: () => i18n('AdminRecentActionMessage.ChangeHistoryTTL'),
    ExpandableContent: () => (
      <KeyValuePair
        label={<I18nTsx key={'AdminRecentActions.AutoDeleteTimer'} />}
        value={action.new_value ?
          wrapFormattedDuration(formatDuration(action.new_value)) :
          i18n('AdminRecentActions.Disabled')
        }
      />
    )
  }),
  'channelAdminLogEventActionParticipantJoinByRequest': ({action}) => ({
    group: 'participants',
    Message: () => i18n('AdminRecentActionMessage.ParticipantJoinedByRequest'),
    ExpandableContent: () => (
      <ParticipantKeyValue
        label={i18n('AdminRecentActions.ApprovedBy')}
        peerId={action.approved_by.toPeerId()}
      />
    )
  }),
  'channelAdminLogEventActionToggleNoForwards': ({action}) => ({
    group: 'permissions',
    Message: () => action.new_value ?
      i18n('AdminRecentActionMessage.ToggleNoForwardsEnabled') :
      i18n('AdminRecentActionMessage.ToggleNoForwardsDisabled')
  }),
  'channelAdminLogEventActionSendMessage': ({action, channelId}) => ({
    group: 'messages',
    Message: () => i18n('AdminRecentActionMessage.MessageSent'),
    ExpandableContent: () => (
      <PreviewMessageButtons
        channelId={channelId}
        added={action.message}
        addedKey='AdminRecentActions.ViewSentMessage'
      />
    )
  }),
  'channelAdminLogEventActionChangeAvailableReactions': () => ({
    group: 'reactions',
    Message: () => i18n('AdminRecentActionMessage.ChangeAvailableReactions')
  }),
  'channelAdminLogEventActionChangeUsernames': () => ({
    group: 'identity',
    Message: () => i18n('AdminRecentActionMessage.ChangeUsernames')
  }),
  'channelAdminLogEventActionToggleForum': ({action}) => ({
    group: 'forum',
    Message: () => i18n('AdminRecentActionMessage.ToggleForum'),
    ExpandableContent: () => (
      <BooleanKeyValue value={action.new_value} />
    )
  }),
  'channelAdminLogEventActionCreateTopic': ({action}) => ({
    group: 'topics',
    Message: () => i18n('AdminRecentActionMessage.TopicCreated'),
    ExpandableContent: () => (
      <LogDiff added={<TopicName topic={action.topic} />} />
    )
  }),
  'channelAdminLogEventActionEditTopic': ({action}) => ({
    group: 'topics',
    Message: () => i18n('AdminRecentActionMessage.TopicEdited'),
    ExpandableContent: () => (
      <LogDiff
        added={<TopicName topic={action.new_topic} />}
        removed={<TopicName topic={action.prev_topic} />}
      />
    )
  }),
  'channelAdminLogEventActionDeleteTopic': ({action}) => ({
    group: 'topics',
    Message: () => i18n('AdminRecentActionMessage.TopicDeleted'),
    ExpandableContent: () => (
      <LogDiff
        removed={<TopicName topic={action.topic} />}
      />
    )
  }),
  'channelAdminLogEventActionPinTopic': ({action}) => ({
    group: 'topics',
    Message: () => i18n(action.new_topic ? 'AdminRecentActionMessage.TopicPinned' : 'AdminRecentActionMessage.TopicUnpinned'),
    ExpandableContent: () => (
      <LogDiff
        added={action.new_topic ? <TopicName topic={action.new_topic} /> : undefined}
        removed={action.prev_topic ? <TopicName topic={action.prev_topic} /> : undefined}
      />
    )
  }),
  'channelAdminLogEventActionToggleAntiSpam': ({action}) => ({
    group: 'permissions',
    Message: () => i18n('AdminRecentActionMessage.ToggleAntiSpam'),
    ExpandableContent: () => (
      <BooleanKeyValue value={action.new_value} />
    )
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
  'channelAdminLogEventActionToggleSignatureProfiles': ({action}) => ({
    group: 'identity',
    Message: () => i18n('AdminRecentActionMessage.ToggleSignatureProfiles'),
    ExpandableContent: () => (
      <BooleanKeyValue value={action.new_value} />
    )
  }),
  'channelAdminLogEventActionParticipantSubExtend': ({action}) => ({
    group: 'participants',
    Message: () => i18n('AdminRecentActionMessage.ParticipantSubscriptionExtended'),
    ExpandableContent: () => (
      <ParticipantKeyValue peerId={getParticipantPeerId(action.new_participant)}/>
    )
  }),
  'channelAdminLogEventActionToggleAutotranslation': ({action}) => ({
    group: 'translations',
    Message: () => i18n('AdminRecentActionMessage.ToggleAutoTranslation'),
    ExpandableContent: () => (
      <BooleanKeyValue value={action.new_value} />
    )
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
