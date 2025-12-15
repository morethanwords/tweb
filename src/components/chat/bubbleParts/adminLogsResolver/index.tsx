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
import I18n, {i18n, LangPackKey} from '../../../../lib/langPack';
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
import {CopyTextResult, extractAdminChanges, extractBanChanges, extractDefaultRightsChanges, formatDurationAsText, getDateTextForCopy, getMessageTextForCopy} from './copyTextHelpers';


type ServiceResult = {
  type: 'service';
  Content: Component;
  getCopyText: () => Promise<CopyTextResult>;
};

type RegularResult = {
  type: 'regular';
  bubbleClass: string;
  Content: Component;
  getCopyText: () => Promise<CopyTextResult>;
};

type DefaultResult = {
  type: 'default';
  message: MyMessage;
  originalMessage?: MyMessage;
  colorPeerId?: PeerId;
  ServiceContent: Component;
  getCopyText: () => Promise<CopyTextResult>;
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
  'channelAdminLogEventActionChangeTitle': ({isBroadcast, action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangeTitleChannel' : 'AdminLog.ChangeTitleGroup', [makePeerTitle(peerId), action.new_value]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(isBroadcast ? 'AdminLog.ChangeTitleChannel' : 'AdminLog.ChangeTitleGroup', true, [peerTitle, action.new_value]);
      return {text: `${text} [${dateText}]`};
    }
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
    },
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const username = await getPeerTitle({peerId, plainText: true});
      const previousLabel = I18n.format('AdminRecentActions.PreviousDescription', true);
      return {
        text: `${username} [${dateText}]\n${action.new_value}\n${previousLabel}: ${action.prev_value}`
      };
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
            <Show when={action.prev_value}>
              <Reply
                colorPeerId={peerId}
                title={i18n('AdminRecentActions.PreviousLink')}
                text={`https://t.me/${action.prev_value}`}
              />
            </Show>
          </MinimalBubbleMessageContent>
        </>
      );
    },
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const translationKey: LangPackKey = action.new_value ?
        (isBroadcast ? 'AdminLog.ChangeLinkChannel' : 'AdminLog.ChangeLinkGroup') :
        (isBroadcast ? 'AdminLog.RemovedLinkChannel' : 'AdminLog.RemovedLinkGroup');
      const previousLabel = I18n.format('AdminRecentActions.PreviousLink', true);
      const lines = [`${I18n.format(translationKey, true, [peerTitle])} [${dateText}]`];
      if(action.new_value) {
        lines.push(`t.me/${action.new_value}`);
      }
      if(action.prev_value) {
        lines.push(`${previousLabel}: https://t.me/${action.prev_value}`);
      }
      return {text: lines.join('\n')};
    }
  }),
  'channelAdminLogEventActionChangePhoto': ({isBroadcast, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangePhotoChannel' : 'AdminLog.ChangePhotoGroup', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(isBroadcast ? 'AdminLog.ChangePhotoChannel' : 'AdminLog.ChangePhotoGroup', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionToggleInvites': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleInvitesEnabled' : 'AdminLog.ToggleInvitesDisabled', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(action.new_value ? 'AdminLog.ToggleInvitesEnabled' : 'AdminLog.ToggleInvitesDisabled', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionToggleSignatures': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleSignaturesEnabled' : 'AdminLog.ToggleSignaturesDisabled', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(action.new_value ? 'AdminLog.ToggleSignaturesEnabled' : 'AdminLog.ToggleSignaturesDisabled', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionUpdatePinned': ({action, peerId, makePeerTitle, event}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => {
      const pinned = action.message._ === 'message' && action.message.pFlags?.pinned;
      return i18n(pinned ? 'AdminLog.PinnedMessage' : 'AdminLog.UnpinnedMessage', [makePeerTitle(peerId)]);
    },
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const pinned = action.message._ === 'message' && action.message.pFlags?.pinned;
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(pinned ? 'AdminLog.PinnedMessage' : 'AdminLog.UnpinnedMessage', true, [peerTitle]);
      const msg = isMessage(action.message) ? getMessageTextForCopy(action.message) : {text: '', html: ''};
      return {
        text: `${text} [${dateText}]\n${msg.text}`,
        html: `${text} [${dateText}]<br/>${msg.html}`
      };
    }
  }) : null,
  'channelAdminLogEventActionEditMessage': ({action, peerId, makePeerTitle, event}) => isMessage(action.new_message) ? ({
    type: 'default',
    message: action.new_message,
    colorPeerId: peerId,
    originalMessage: isMessage(action.prev_message) ? action.prev_message : null,
    ServiceContent: () => i18n('AdminLog.EditedMessage', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.EditedMessage', true, [peerTitle]);
      const newMsg = isMessage(action.new_message) ? getMessageTextForCopy(action.new_message) : {text: '', html: ''};
      const prevMsg = (isMessage(action.prev_message)) ? getMessageTextForCopy(action.prev_message) : {text: '', html: ''};
      const previousLabel = I18n.format('AdminRecentActions.PreviousDescription', true);
      return {
        text: `${text} [${dateText}]\n${newMsg.text}\n${previousLabel}: ${prevMsg.text}`,
        html: `${text} [${dateText}]<br/>${newMsg.html}<br/>${previousLabel}: ${prevMsg.html}`
      };
    }
  }) : null,
  'channelAdminLogEventActionDeleteMessage': ({action, peerId, makePeerTitle, event}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => i18n('AdminLog.DeletedMessage', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.DeletedMessage', true, [peerTitle]);
      const msg = isMessage(action.message) ? getMessageTextForCopy(action.message) : {text: '', html: ''};
      return {
        text: `${text} [${dateText}]\n${msg.text}`,
        html: `${text} [${dateText}]<br/>${msg.html}`
      };
    }
  }) : null,
  'channelAdminLogEventActionParticipantJoin': ({isBroadcast, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ParticipantJoinedChannel' : 'AdminLog.ParticipantJoinedGroup', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(isBroadcast ? 'AdminLog.ParticipantJoinedChannel' : 'AdminLog.ParticipantJoinedGroup', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionParticipantLeave': ({isBroadcast, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ParticipantLeftChannel' : 'AdminLog.ParticipantLeftGroup', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(isBroadcast ? 'AdminLog.ParticipantLeftChannel' : 'AdminLog.ParticipantLeftGroup', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionParticipantInvite': ({peerId, action, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantInvited', [makePeerTitle(peerId), makePeerTitle(getParticipantPeerId(action.participant))]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const participantPeerId = getParticipantPeerId(action.participant);
      const participantTitle = await getPeerTitle({peerId: participantPeerId, plainText: true});
      const text = I18n.format('AdminLog.ParticipantInvited', true, [peerTitle, participantTitle]);
      return {text: `${text} [${dateText}]`};
    }
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
    },
    getCopyText: async() => {
      const dateText = getDateTextForCopy(event.date);
      const {apiManagerProxy, getPeerTitle} = useHotReloadGuard();
      const {isBanned, participantPeerId, participantUser, username, added, removed} = extractBanChanges(action, channelId, apiManagerProxy);
      const participantName = await getPeerTitle({peerId: participantPeerId, plainText: true});

      const lines = [`${participantName} [${dateText}]`];
      added.forEach(perm => lines.push(`+ ${perm}`));
      removed.forEach(perm => lines.push(`- ${perm}`));

      return {text: lines.join('\n')};
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
    },
    getCopyText: async() => {
      const dateText = getDateTextForCopy(event.date);
      const {apiManagerProxy, getPeerTitle} = useHotReloadGuard();
      const {participantPeerId, participantUser, username, added, removed} = extractAdminChanges(action, apiManagerProxy, isBroadcast);
      const participantName = await getPeerTitle({peerId: participantPeerId, plainText: true});

      const lines = [`${participantName} [${dateText}]`];
      added.forEach(perm => lines.push(`+ ${perm}`));
      removed.forEach(perm => lines.push(`- ${perm}`));

      return {text: lines.join('\n')};
    }
  }),
  'channelAdminLogEventActionChangeStickerSet': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeStickerSet', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ChangeStickerSet', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionTogglePreHistoryHidden': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.TogglePreHistoryHiddenEnabled' : 'AdminLog.TogglePreHistoryHiddenDisabled', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(action.new_value ? 'AdminLog.TogglePreHistoryHiddenEnabled' : 'AdminLog.TogglePreHistoryHiddenDisabled', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
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
    },
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const username = await getPeerTitle({peerId, plainText: true});
      const {added, removed} = extractDefaultRightsChanges(action);

      const lines = [`${username} [${dateText}]`];
      added.forEach(perm => lines.push(`+ ${perm}`));
      removed.forEach(perm => lines.push(`- ${perm}`));

      return {text: lines.join('\n')};
    }
  }),
  'channelAdminLogEventActionStopPoll':  ({action, peerId, makePeerTitle, event}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => i18n('AdminLog.PollStopped', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.PollStopped', true, [peerTitle]);
      const msg = isMessage(action.message) ? getMessageTextForCopy(action.message) : {text: '', html: ''};
      return {
        text: `${text} [${dateText}]\n${msg.text}`,
        html: `${text} [${dateText}]<br/>${msg.html}`
      };
    }
  }) : null,
  'channelAdminLogEventActionChangeLinkedChat': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeLinkedChat', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ChangeLinkedChat', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionChangeLocation': ({isBroadcast, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(isBroadcast ? 'AdminLog.ChangeLocationChannel' : 'AdminLog.ChangeLocationGroup', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(isBroadcast ? 'AdminLog.ChangeLocationChannel' : 'AdminLog.ChangeLocationGroup', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionToggleSlowMode': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => {
      if(action.new_value) {
        const duration = wrapFormattedDuration(formatDuration(action.new_value));
        return i18n('AdminLog.ToggleSlowModeSet', [makePeerTitle(peerId), duration]);
      } else {
        return i18n('AdminLog.ToggleSlowModeDisabled', [makePeerTitle(peerId)]);
      }
    },
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      if(action.new_value) {
        const duration = formatDurationAsText(action.new_value);
        const text = I18n.format('AdminLog.ToggleSlowModeSet', true, [peerTitle, duration]);
        return {text: `${text} [${dateText}]`};
      } else {
        const text = I18n.format('AdminLog.ToggleSlowModeDisabled', true, [peerTitle]);
        return {text: `${text} [${dateText}]`};
      }
    }
  }),
  'channelAdminLogEventActionStartGroupCall': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.StartGroupCall', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.StartGroupCall', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionDiscardGroupCall': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.DiscardGroupCall', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.DiscardGroupCall', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionParticipantMute': ({peerId, action, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantMuted', [makePeerTitle(getPeerId(action.participant?.peer)), makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const participantPeerId = getPeerId(action.participant?.peer);
      const participantTitle = await getPeerTitle({peerId: participantPeerId, plainText: true});
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ParticipantMuted', true, [participantTitle, peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionParticipantUnmute': ({peerId, action, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantUnmuted', [makePeerTitle(getPeerId(action.participant?.peer)), makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const participantPeerId = getPeerId(action.participant?.peer);
      const participantTitle = await getPeerTitle({peerId: participantPeerId, plainText: true});
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ParticipantUnmuted', true, [participantTitle, peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionToggleGroupCallSetting': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(action.join_muted ? 'AdminLog.ToggleGroupCallSettingEnabled' : 'AdminLog.ToggleGroupCallSettingDisabled', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(action.join_muted ? 'AdminLog.ToggleGroupCallSettingEnabled' : 'AdminLog.ToggleGroupCallSettingDisabled', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionParticipantJoinByInvite': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantJoinedByInvite', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ParticipantJoinedByInvite', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionExportedInviteDelete': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ExportedInviteDeleted', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ExportedInviteDeleted', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionExportedInviteRevoke': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ExportedInviteRevoked', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ExportedInviteRevoked', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionExportedInviteEdit': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ExportedInviteEdit', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ExportedInviteEdit', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionParticipantVolume': ({peerId, action, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantVolumeChanged', [makePeerTitle(getPeerId(action.participant?.peer)), makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const participantPeerId = getPeerId(action.participant?.peer);
      const participantTitle = await getPeerTitle({peerId: participantPeerId, plainText: true});
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ParticipantVolumeChanged', true, [participantTitle, peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionChangeHistoryTTL': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => {
      if(action.new_value) {
        const duration = wrapFormattedDuration(formatDuration(action.new_value));
        return i18n('AdminLog.ChangeHistoryTTLEnabled', [makePeerTitle(peerId), duration]);
      } else {
        return i18n('AdminLog.ChangeHistoryTTLDisabled', [makePeerTitle(peerId)]);
      }
    },
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      if(action.new_value) {
        const duration = formatDurationAsText(action.new_value);
        const text = I18n.format('AdminLog.ChangeHistoryTTLEnabled', true, [peerTitle, duration]);
        return {text: `${text} [${dateText}]`};
      } else {
        const text = I18n.format('AdminLog.ChangeHistoryTTLDisabled', true, [peerTitle]);
        return {text: `${text} [${dateText}]`};
      }
    }
  }),
  'channelAdminLogEventActionParticipantJoinByRequest': ({peerId, action, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantJoinedByRequest', [makePeerTitle(peerId), makePeerTitle(action.approved_by.toPeerId())]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const approvedByPeerId = action.approved_by.toPeerId();
      const approvedByTitle = await getPeerTitle({peerId: approvedByPeerId, plainText: true});
      const text = I18n.format('AdminLog.ParticipantJoinedByRequest', true, [peerTitle, approvedByTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionToggleNoForwards': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleNoForwardsEnabled' : 'AdminLog.ToggleNoForwardsDisabled', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(action.new_value ? 'AdminLog.ToggleNoForwardsEnabled' : 'AdminLog.ToggleNoForwardsDisabled', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionSendMessage': ({action, peerId, makePeerTitle, event}) => isMessage(action.message) ? ({
    type: 'default',
    message: action.message,
    ServiceContent: () => i18n('AdminLog.MessageSent', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.MessageSent', true, [peerTitle]);
      const msg = isMessage(action.message) ? getMessageTextForCopy(action.message) : {text: '', html: ''};
      return {
        text: `${text} [${dateText}]\n${msg.text}`,
        html: `${text} [${dateText}]<br/>${msg.html}`
      };
    }
  }) : null,
  'channelAdminLogEventActionChangeAvailableReactions': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeAvailableReactions', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ChangeAvailableReactions', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionChangeUsernames': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () =>
      i18n('AdminLog.ChangeUsernames', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ChangeUsernames', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionToggleForum': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleForumEnabled' : 'AdminLog.ToggleForumDisabled', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(action.new_value ? 'AdminLog.ToggleForumEnabled' : 'AdminLog.ToggleForumDisabled', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionCreateTopic': ({peerId, action, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => <I18nTsx key='AdminLog.TopicCreated' args={[makePeerTitle(peerId), <TopicName topic={action.topic} />]} />,
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const topicTitle = action.topic._ === 'forumTopicDeleted' ? '' : action.topic.title;
      const text = I18n.format('AdminLog.TopicCreated', true, [peerTitle, topicTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionEditTopic': ({peerId, makePeerTitle, action, event}) => ({
    type: 'service',
    Content: () => <I18nTsx key='AdminLog.TopicEdited' args={[makePeerTitle(peerId), <TopicName topic={action.new_topic} />]} />,
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const topicTitle = action.new_topic._ === 'forumTopicDeleted' ? '' : action.new_topic.title;
      const text = I18n.format('AdminLog.TopicEdited', true, [peerTitle, topicTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionDeleteTopic': ({peerId, makePeerTitle, action, event}) => ({
    type: 'service',
    Content: () => <I18nTsx key='AdminLog.TopicDeleted' args={[makePeerTitle(peerId), <TopicName topic={action.topic} />]} />,
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const topicTitle = action.topic._ === 'forumTopicDeleted' ? '' : action.topic.title;
      const text = I18n.format('AdminLog.TopicDeleted', true, [peerTitle, topicTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionPinTopic': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => {
      const pinned = !!action.new_topic;
      const topic = action.new_topic ? action.new_topic : action.prev_topic;

      return <I18nTsx key={pinned ? 'AdminLog.TopicPinned' : 'AdminLog.TopicUnpinned'} args={[makePeerTitle(peerId), <TopicName topic={topic} />]} />;
    },
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const pinned = !!action.new_topic;
      const topic = action.new_topic ? action.new_topic : action.prev_topic;
      const topicTitle = topic._ === 'forumTopicDeleted' ? '' : topic.title;
      const text = I18n.format(pinned ? 'AdminLog.TopicPinned' : 'AdminLog.TopicUnpinned', true, [peerTitle, topicTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionToggleAntiSpam': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleAntiSpamEnabled' : 'AdminLog.ToggleAntiSpamDisabled', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(action.new_value ? 'AdminLog.ToggleAntiSpamEnabled' : 'AdminLog.ToggleAntiSpamDisabled', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionChangePeerColor': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangePeerColor', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ChangePeerColor', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionChangeProfilePeerColor': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeProfilePeerColor', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ChangeProfilePeerColor', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionChangeWallpaper': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeWallpaper', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ChangeWallpaper', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionChangeEmojiStatus': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeEmojiStatus', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ChangeEmojiStatus', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionChangeEmojiStickerSet': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ChangeEmojiStickerSet', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ChangeEmojiStickerSet', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionToggleSignatureProfiles': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleSignatureProfilesEnabled' : 'AdminLog.ToggleSignatureProfilesDisabled', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(action.new_value ? 'AdminLog.ToggleSignatureProfilesEnabled' : 'AdminLog.ToggleSignatureProfilesDisabled', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionParticipantSubExtend': ({peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n('AdminLog.ParticipantSubscriptionExtended', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format('AdminLog.ParticipantSubscriptionExtended', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
  }),
  'channelAdminLogEventActionToggleAutotranslation': ({action, peerId, makePeerTitle, event}) => ({
    type: 'service',
    Content: () => i18n(action.new_value ? 'AdminLog.ToggleAutoTranslationEnabled' : 'AdminLog.ToggleAutoTranslationDisabled', [makePeerTitle(peerId)]),
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const text = I18n.format(action.new_value ? 'AdminLog.ToggleAutoTranslationEnabled' : 'AdminLog.ToggleAutoTranslationDisabled', true, [peerTitle]);
      return {text: `${text} [${dateText}]`};
    }
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
