import {Component, For, Show} from 'solid-js';
import {makeDateFromTimestamp} from '../../../../helpers/date/makeDateFromTimestamp';
import formatDuration from '../../../../helpers/formatDuration';
import {I18nTsx} from '../../../../helpers/solid/i18n';
import {ChannelAdminLogEvent, ChannelAdminLogEventAction, ChatBannedRights} from '../../../../layer';
import {AdminLog} from '../../../../lib/appManagers/appChatsManager';
import {MyMessage} from '../../../../lib/appManagers/appMessagesManager';
import getParticipantPeerId from '../../../../lib/appManagers/utils/chats/getParticipantPeerId';
import {isBannedParticipant} from '../../../../lib/appManagers/utils/chats/isBannedParticipant';
import removeChatBannedRightsFromParticipant from '../../../../lib/appManagers/utils/chats/removeChatBannedRightsFromParticipant';
import getPeerId from '../../../../lib/appManagers/utils/peers/getPeerId';
import {i18n, LangPackKey} from '../../../../lib/langPack';
import wrapRichText from '../../../../lib/richTextProcessor/wrapRichText';
import wrapTelegramUrlToAnchor from '../../../../lib/richTextProcessor/wrapTelegramUrlToAnchor';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import {resolveAdminRightFlagI18n} from '../../../sidebarRight/tabs/adminRecentActions/adminRightsI18nResolver';
import {participantRightsMap} from '../../../sidebarRight/tabs/adminRecentActions/participantRightsMap';
import {TopicName} from '../../../sidebarRight/tabs/adminRecentActions/topicName';
import {diffFlags} from '../../../sidebarRight/tabs/adminRecentActions/utils';
import Space from '../../../space';
import {wrapFormattedDuration} from '../../../wrappers/wrapDuration';
import {isMessage, linkColor} from '../../utils';
import {MinimalBubbleMessageContent} from '../minimalBubbleMessageContent';
import {Reply} from './reply';


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
  colorPeerId?: PeerId;
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
            <Reply
              colorPeerId={peerId}
              title={i18n('AdminRecentActions.PreviousDescription')}
              text={action.prev_value}
            />
          </MinimalBubbleMessageContent>
        </>
      );
    }
  }),
  'channelAdminLogEventActionChangeUsername': ({isBroadcast, event, action, peerId, makePeerTitle, makeMessagePeerTitle}) => ({
    type: 'regular',
    bubbleClass: defaultBubbleClass,
    Content: () => {
      const translationKey = ((): LangPackKey => {
        if(action.new_value) {
          return isBroadcast ? 'AdminLog.ChangeLinkChannel' : 'AdminLog.ChangeLinkGroup';
        } else {
          return isBroadcast ? 'AdminLog.RemovedLinkChannel' : 'AdminLog.RemovedLinkGroup';
        }
      })();

      const anchor = (() => {
        if(!action.new_value) return;
        const link = `t.me/${action.new_value}`

        const anchor = wrapTelegramUrlToAnchor(link);
        anchor.textContent = link;

        return anchor;
      })();

      return (
        <>
          <div class='service-msg'>
            <I18nTsx key={translationKey} args={[makePeerTitle(peerId)]} />
          </div>
          <MinimalBubbleMessageContent
            date={makeDateFromTimestamp(event.date)}
            name={makeMessagePeerTitle(peerId)}
          >
            <Show when={anchor}>
              {anchor}
              <Space amount='0.5rem' />
            </Show>
            <Reply
              colorPeerId={peerId}
              title={i18n('AdminRecentActions.PreviousLink')}
              text={`https://t.me/${action.prev_value}`}
            />
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
    colorPeerId: peerId,
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
  'channelAdminLogEventActionParticipantInvite': ({peerId, action, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantInvited', [makePeerTitle(peerId), makePeerTitle(getParticipantPeerId(action.participant))])
  }),
  'channelAdminLogEventActionParticipantToggleBan': ({event, action, channelId, peerId, makeMessagePeerTitle, makePeerTitle}) => ({
    type: 'regular',
    bubbleClass: defaultBubbleClass,
    Content: () => {
      const isBanned = isBannedParticipant(action.new_participant);
      const {apiManagerProxy} = useHotReloadGuard();

      const prevBannedParticipant = action.prev_participant?._ === 'channelParticipantBanned' ? action.prev_participant : undefined;
      const newBannedParticipant = action.new_participant?._ === 'channelParticipantBanned' ? action.new_participant : undefined;

      const channel = apiManagerProxy.getChat(channelId);

      const removeDefaultRights = (rights: ChatBannedRights.chatBannedRights) =>
        channel?._ === 'channel' && rights ?
          removeChatBannedRightsFromParticipant(channel, rights) :
          rights;

      const participantPeerId = getParticipantPeerId(action.prev_participant || action.new_participant);

      const participantUser = apiManagerProxy.getUser(participantPeerId.toUserId());
      const username = participantUser?.username || '';

      const diff = diffFlags(
        removeDefaultRights(prevBannedParticipant?.banned_rights)?.pFlags,
        removeDefaultRights(newBannedParticipant?.banned_rights)?.pFlags
      );

      // yes, they need to be inversed here
      const removed = diff.new.map(key => participantRightsMap[key])
      .filter(Boolean).map(key => i18n(key))

      const added = diff.old.map(key => participantRightsMap[key])
      .filter(Boolean).map(key => i18n(key))


      return (
        <>
          <MinimalBubbleMessageContent
            date={makeDateFromTimestamp(event.date)}
            name={makeMessagePeerTitle(peerId)}
          >
            <Show when={isBanned}>
              <I18nTsx
                key={username ? 'AdminLog.ParticipantBannedUsername' : 'AdminLog.ParticipantBanned'}
                args={[linkColor(makePeerTitle(participantPeerId)), username ? linkColor(`@${username}`) : '']}
              />
            </Show>
            <Show when={!isBanned}>
              <I18nTsx
                key={username ? 'AdminLog.ParticipantPermissionsToggledUsername' : 'AdminLog.ParticipantPermissionsToggled'}
                args={[linkColor(makePeerTitle(participantPeerId)), username ? linkColor(`@${username}`) : '']}
              />
            </Show>
            <Space amount='0.5rem' />
            <For each={added}>
              {key => (
                <div>+ {key}</div>
              )}
            </For>
            <For each={removed}>
              {key => (
                <div>- {key}</div>
              )}
            </For>
          </MinimalBubbleMessageContent>
        </>
      );
    }
  }),
  'channelAdminLogEventActionParticipantToggleAdmin': ({event, action, peerId, makePeerTitle, makeMessagePeerTitle, isBroadcast}) => ({
    type: 'regular',
    bubbleClass: defaultBubbleClass,
    Content: () => {
      const {apiManagerProxy} = useHotReloadGuard();

      const prevParticipantRights = 'admin_rights' in action.prev_participant ? action.prev_participant.admin_rights : null;
      const newParticipantRights = 'admin_rights' in action.new_participant ? action.new_participant.admin_rights : null;

      const diff = diffFlags(prevParticipantRights?.pFlags, newParticipantRights?.pFlags);
      const participantPeerId = getParticipantPeerId(action.prev_participant || action.new_participant);

      const participantUser = apiManagerProxy.getUser(participantPeerId.toUserId());
      const username = participantUser?.username || '';

      const added = diff.new.map(key => i18n(resolveAdminRightFlagI18n(key, {isBroadcast})));
      const removed = diff.old.map(key => i18n(resolveAdminRightFlagI18n(key, {isBroadcast})));

      return (
        <>
          <MinimalBubbleMessageContent
            date={makeDateFromTimestamp(event.date)}
            name={makeMessagePeerTitle(peerId)}
          >
            <I18nTsx
              key={username ? 'AdminLog.AdminPermissionsChangedUsername' : 'AdminLog.AdminPermissionsChanged'}
              args={[linkColor(makePeerTitle(participantPeerId)), username ? linkColor(`@${username}`) : '']}
            />
            <Space amount='0.5rem' />
            <For each={added}>
              {key => (
                <div>+ {key}</div>
              )}
            </For>
            <For each={removed}>
              {key => (
                <div>- {key}</div>
              )}
            </For>
          </MinimalBubbleMessageContent>
        </>
      );
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
  'channelAdminLogEventActionDefaultBannedRights': ({event, action, peerId, makePeerTitle, makeMessagePeerTitle}) => ({
    type: 'regular',
    bubbleClass: defaultBubbleClass,
    Content: () => {
      const diff = diffFlags(action.prev_banned_rights?.pFlags, action.new_banned_rights?.pFlags);

      const added = diff.old.map(key => participantRightsMap[key])
      .filter(Boolean).map(key => i18n(key))

      const removed = diff.new.map(key => participantRightsMap[key])
      .filter(Boolean).map(key => i18n(key))

      return (
        <>
          <MinimalBubbleMessageContent
            date={makeDateFromTimestamp(event.date)}
            name={makeMessagePeerTitle(peerId)}
          >
            <I18nTsx key={'AdminLog.DefaultBannedRightsChanged'} />
            <Space amount='0.5rem' />
            <For each={added}>
              {key => (
                <div>+ {key}</div>
              )}
            </For>
            <For each={removed}>
              {key => (
                <div>- {key}</div>
              )}
            </For>
          </MinimalBubbleMessageContent>
        </>
      );
    }
  }),
  'channelAdminLogEventActionStopPoll':  ({action, peerId, makePeerTitle}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => i18n('AdminLog.PollStopped', [makePeerTitle(peerId)])
  }) : null,
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
  'channelAdminLogEventActionParticipantMute': ({peerId, action, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantMuted', [makePeerTitle(getPeerId(action.participant?.peer)), makePeerTitle(peerId)])
  }),
  'channelAdminLogEventActionParticipantUnmute': ({peerId, action, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantUnmuted', [makePeerTitle(getPeerId(action.participant?.peer)), makePeerTitle(peerId)])
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
  'channelAdminLogEventActionParticipantVolume': ({peerId, action, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantVolumeChanged', [makePeerTitle(getPeerId(action.participant?.peer)), makePeerTitle(peerId)])
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
  'channelAdminLogEventActionParticipantJoinByRequest': ({peerId, action, makePeerTitle}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantJoinedByRequest', [makePeerTitle(peerId), makePeerTitle(action.approved_by.toPeerId())])
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
  'channelAdminLogEventActionCreateTopic': ({peerId, action, makePeerTitle}) => ({
    type: 'service',
    Content: () => <I18nTsx key='AdminLog.TopicCreated' args={[makePeerTitle(peerId), <TopicName topic={action.topic} />]} />
  }),
  'channelAdminLogEventActionEditTopic': ({peerId, makePeerTitle, action}) => ({
    type: 'service',
    Content: () => <I18nTsx key='AdminLog.TopicEdited' args={[makePeerTitle(peerId), <TopicName topic={action.new_topic} />]} />
  }),
  'channelAdminLogEventActionDeleteTopic': ({peerId, makePeerTitle, action}) => ({
    type: 'service',
    Content: () => <I18nTsx key='AdminLog.TopicDeleted' args={[makePeerTitle(peerId), <TopicName topic={action.topic} />]} />
  }),
  'channelAdminLogEventActionPinTopic': ({action, peerId, makePeerTitle}) => ({
    type: 'service',
    Content: () => {
      const pinned = !!action.new_topic;
      const topic = action.new_topic ? action.new_topic : action.prev_topic;

      return <I18nTsx key={pinned ? 'AdminLog.TopicPinned' : 'AdminLog.TopicUnpinned'} args={[makePeerTitle(peerId), <TopicName topic={topic} />]} />;
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
