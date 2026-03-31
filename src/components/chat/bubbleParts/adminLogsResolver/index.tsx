import {Component, For, JSX, Show} from 'solid-js';
import {makeDateFromTimestamp} from '@helpers/date/makeDateFromTimestamp';
import formatDuration from '@helpers/formatDuration';
import {I18nTsx} from '@helpers/solid/i18n';
import {ChannelAdminLogEvent, ChannelAdminLogEventAction, ChatBannedRights, ForumTopic} from '@layer';
import {AdminLog} from '@appManagers/appChatsManager';
import {MyMessage} from '@appManagers/appMessagesManager';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import {isBannedParticipant} from '@appManagers/utils/chats/isBannedParticipant';
import removeChatBannedRightsFromParticipant from '@appManagers/utils/chats/removeChatBannedRightsFromParticipant';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import I18n, {i18n, LangPackKey} from '@lib/langPack';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';
import wrapTelegramUrlToAnchor from '@lib/richTextProcessor/wrapTelegramUrlToAnchor';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {resolveAdminRightFlagI18n} from '@components/sidebarRight/tabs/adminRecentActions/adminRightsI18nResolver';
import {participantRightsMap} from '@components/sidebarRight/tabs/adminRecentActions/participantRightsMap';
import {TopicName} from '@components/sidebarRight/tabs/adminRecentActions/topicName';
import {diffFlags} from '@components/sidebarRight/tabs/adminRecentActions/utils';
import Space from '@components/space';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';
import {isMessage, linkColor} from '@components/chat/utils';
import {MinimalBubbleMessageContent} from '@components/chat/bubbleParts/minimalBubbleMessageContent';
import {Reply} from '@components/chat/bubbleParts/adminLogsResolver/reply';
import {CopyTextResult, createMessageCopyText, createMessageWithPreviousCopyText, createMultiLineCopyText, createPreviousValueCopyText, createSimpleServiceCopyText, createTwoPeerCopyText, extractAdminChanges, extractBanChanges, extractDefaultRightsChanges, formatDurationAsText, getDateTextForCopy, getMessageTextForCopy} from '@components/chat/bubbleParts/adminLogsResolver/copyTextHelpers';


type RenderArgs = {
  channelId: ChatId;
  event: AdminLog;
  isBroadcast: boolean;
  isForum: boolean;
  peerId: PeerId;
  makePeerTitle: (peerId: PeerId) => Node;
  makeMessagePeerTitle: (peerId: PeerId) => Node;
  isOut: boolean;
};

type ServiceResult = {
  type: 'service';
  Content: (plain?: boolean) => JSX.Element;
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
  action: Extract<ChannelAdminLogEventAction, {_: Key}>;
} & RenderArgs;

type MapCallback<Key extends ChannelAdminLogEventAction['_']> = (args: MapCallbackArgs<Key>) => MapCallbackResult;

const defaultBubbleClass = 'can-have-tail has-fake-service is-forced-rounded';

function makeSimpleServiceEntry(
  key: LangPackKey,
  peerId: PeerId,
  event: AdminLog,
  makePeerTitle: RenderArgs['makePeerTitle']
): ServiceResult {
  return {
    type: 'service',
    Content: () => i18n(key, [makePeerTitle(peerId)]),
    getCopyText: () => createSimpleServiceCopyText(
      event.date,
      peerId,
      (peerTitle) => I18n.format(key, true, [peerTitle])
    )
  };
}

function makeSimpleServiceEntryWithArgs(
  key: LangPackKey,
  peerId: PeerId,
  event: AdminLog,
  makePeerTitle: RenderArgs['makePeerTitle'],
  extraArgs: string[]
): ServiceResult {
  return {
    type: 'service',
    Content: () => i18n(key, [makePeerTitle(peerId), ...extraArgs]),
    getCopyText: () => createSimpleServiceCopyText(
      event.date,
      peerId,
      (peerTitle) => I18n.format(key, true, [peerTitle, ...extraArgs])
    )
  };
}

function makeToggleServiceEntry(
  condition: boolean,
  trueKey: LangPackKey,
  falseKey: LangPackKey,
  peerId: PeerId,
  event: AdminLog,
  makePeerTitle: RenderArgs['makePeerTitle']
): ServiceResult {
  const key = condition ? trueKey : falseKey;
  return makeSimpleServiceEntry(key, peerId, event, makePeerTitle);
}

function makeTwoPeerServiceEntry(
  key: LangPackKey,
  peerId: PeerId,
  secondPeerId: PeerId,
  event: AdminLog,
  makePeerTitle: RenderArgs['makePeerTitle']
): ServiceResult {
  return {
    type: 'service',
    Content: () => i18n(key, [makePeerTitle(peerId), makePeerTitle(secondPeerId)]),
    getCopyText: () => createTwoPeerCopyText(
      event.date,
      peerId,
      secondPeerId,
      (peerTitle, secondTitle) => I18n.format(key, true, [peerTitle, secondTitle])
    )
  };
}

function makeDefaultMessageEntry(
  key: LangPackKey,
  message: MyMessage,
  peerId: PeerId,
  event: AdminLog,
  makePeerTitle: RenderArgs['makePeerTitle']
): DefaultResult {
  return {
    type: 'default',
    message,
    ServiceContent: () => i18n(key, [makePeerTitle(peerId)]),
    getCopyText: () => createMessageCopyText(
      event.date,
      peerId,
      message,
      (peerTitle) => I18n.format(key, true, [peerTitle])
    )
  };
}

function makeTopicServiceEntry(
  key: LangPackKey,
  topic: ForumTopic,
  peerId: PeerId,
  event: AdminLog,
  makePeerTitle: RenderArgs['makePeerTitle']
): ServiceResult {
  return {
    type: 'service',
    Content: () => <I18nTsx key={key} args={[makePeerTitle(peerId), <TopicName topic={topic} />]} />,
    getCopyText: () => createSimpleServiceCopyText(
      event.date,
      peerId,
      (peerTitle) => {
        const topicTitle = topic._ === 'forumTopicDeleted' ? '' : topic.title;
        return I18n.format(key, true, [peerTitle, topicTitle]);
      }
    )
  };
}

function makeDurationToggleServiceEntry(
  enabledKey: LangPackKey,
  disabledKey: LangPackKey,
  durationValue: number,
  peerId: PeerId,
  event: AdminLog,
  makePeerTitle: RenderArgs['makePeerTitle']
): ServiceResult {
  const key: LangPackKey = durationValue ? enabledKey : disabledKey;
  return {
    type: 'service',
    Content: () => {
      if(durationValue) {
        const duration = wrapFormattedDuration(formatDuration(durationValue));
        return i18n(key, [makePeerTitle(peerId), duration]);
      } else {
        return i18n(key, [makePeerTitle(peerId)]);
      }
    },
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      if(durationValue) {
        const duration = formatDurationAsText(durationValue);
        const text = I18n.format(key, true, [peerTitle, duration]);
        return {text: `${text} [${dateText}]`};
      } else {
        const text = I18n.format(key, true, [peerTitle]);
        return {text: `${text} [${dateText}]`};
      }
    }
  };
}

function makeRankServiceEntry(
  action: Extract<ChannelAdminLogEventAction, {_: 'channelAdminLogEventActionParticipantEditRank'}>,
  event: AdminLog,
  makePeerTitle: RenderArgs['makePeerTitle']
): ServiceResult {
  let key: LangPackKey;
  if(action.user_id === event.user_id) {
    if(action.new_rank) {
      key = action.prev_rank ? 'EventLogRankSelfEdit' : 'EventLogRankSelfAdd';
    } else {
      key = 'EventLogRankSelfRemove';
    }
  } else {
    if(action.new_rank) {
      key = action.prev_rank ? 'EventLogRankEdit' : 'EventLogRankAdd';
    } else {
      key = 'EventLogRankRemove';
    }
  }

  const adminPeerId = event.user_id.toPeerId(false);
  const targetPeerId = action.user_id.toPeerId(false);
  const prevRank = action.prev_rank || '';
  const newRank = action.new_rank || '';

  return {
    type: 'service',
    Content: () => i18n(key, [makePeerTitle(adminPeerId), makePeerTitle(targetPeerId), prevRank, newRank]),
    getCopyText: () => createTwoPeerCopyText(
      event.date,
      adminPeerId,
      targetPeerId,
      (peerTitle, secondTitle) => I18n.format(key, true, [peerTitle, secondTitle, prevRank, newRank])
    )
  };
}

const adminLogsMap: { [Key in ChannelAdminLogEventAction['_']]: MapCallback<Key> } = {
  'channelAdminLogEventActionChangeTitle': ({isBroadcast, action, peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntryWithArgs(
      isBroadcast ? 'AdminLog.ChangeTitleChannel' : 'AdminLog.ChangeTitleGroup',
      peerId, event, makePeerTitle,
      [action.new_value]
    ),
  'channelAdminLogEventActionChangeAbout': ({isBroadcast, action, event, peerId, makePeerTitle, makeMessagePeerTitle, isOut}) => {
    const key: LangPackKey = isBroadcast ? 'AdminLog.ChangeAboutChannel' : 'AdminLog.ChangeAboutGroup';
    return {
      type: 'regular' as const,
      bubbleClass: defaultBubbleClass,
      Content: () => {
        return (
          <>
            <div class='service-msg'>
              <I18nTsx key={key} args={[makePeerTitle(peerId)]} />
            </div>
            <MinimalBubbleMessageContent
              date={makeDateFromTimestamp(event.date)}
              name={isOut ? null : makeMessagePeerTitle(peerId)}
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
      getCopyText: () => createPreviousValueCopyText(
        event.date,
        peerId,
        (peerTitle) => I18n.format(key, true, [peerTitle]),
        action.new_value,
        action.prev_value,
        () => I18n.format('AdminRecentActions.PreviousDescription', true)
      )
    };
  },
  'channelAdminLogEventActionChangeUsername': ({isBroadcast, event, action, peerId, makePeerTitle, makeMessagePeerTitle, isOut}) => {
    const key: LangPackKey = action.new_value ?
      (isBroadcast ? 'AdminLog.ChangeLinkChannel' : 'AdminLog.ChangeLinkGroup') :
      (isBroadcast ? 'AdminLog.RemovedLinkChannel' : 'AdminLog.RemovedLinkGroup');

    return {
      type: 'regular' as const,
      bubbleClass: defaultBubbleClass,
      Content: () => {
        const anchor = (() => {
          if(!action.new_value) return;
          const link = `t.me/${action.new_value}`;
          const anchor = wrapTelegramUrlToAnchor(link);
          anchor.textContent = link;
          return anchor;
        })();

        return (
          <>
            <div class='service-msg'>
              <I18nTsx key={key} args={[makePeerTitle(peerId)]} />
            </div>
            <MinimalBubbleMessageContent
              date={makeDateFromTimestamp(event.date)}
              name={isOut ? null : makeMessagePeerTitle(peerId)}
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
      getCopyText: () => createMultiLineCopyText(
        event.date,
        peerId,
        (peerTitle, dateText) => {
          const previousLabel = I18n.format('AdminRecentActions.PreviousLink', true);
          const lines = [`${I18n.format(key, true, [peerTitle])} [${dateText}]`];
          if(action.new_value) {
            lines.push(`https://t.me/${action.new_value}`);
          }
          if(action.prev_value) {
            lines.push(`${previousLabel}: https://t.me/${action.prev_value}`);
          }
          return lines;
        }
      )
    };
  },
  'channelAdminLogEventActionChangePhoto': ({isBroadcast, peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry(
      isBroadcast ? 'AdminLog.ChangePhotoChannel' : 'AdminLog.ChangePhotoGroup',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionToggleInvites': ({action, peerId, makePeerTitle, event}) =>
    makeToggleServiceEntry(
      action.new_value,
      'AdminLog.ToggleInvitesEnabled', 'AdminLog.ToggleInvitesDisabled',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionToggleSignatures': ({action, peerId, makePeerTitle, event}) =>
    makeToggleServiceEntry(
      action.new_value,
      'AdminLog.ToggleSignaturesEnabled', 'AdminLog.ToggleSignaturesDisabled',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionUpdatePinned': ({action, peerId, makePeerTitle, event}) => {
    if(!isMessage(action.message)) return null;
    const pinned = action.message._ === 'message' && action.message.pFlags?.pinned;
    const key: LangPackKey = pinned ? 'AdminLog.PinnedMessage' : 'AdminLog.UnpinnedMessage';
    return makeDefaultMessageEntry(key, action.message, peerId, event, makePeerTitle);
  },
  'channelAdminLogEventActionEditMessage': ({action, peerId, makePeerTitle, event}) => {
    if(!isMessage(action.new_message)) return null;
    const key: LangPackKey = 'AdminLog.EditedMessage';
    return {
      type: 'default' as const,
      message: action.new_message,
      colorPeerId: peerId,
      originalMessage: isMessage(action.prev_message) ? action.prev_message : null,
      ServiceContent: () => i18n(key, [makePeerTitle(peerId)]),
      getCopyText: () => createMessageWithPreviousCopyText(
        event.date,
        peerId,
        action.new_message,
        action.prev_message,
        (peerTitle) => I18n.format(key, true, [peerTitle]),
        () => I18n.format('AdminRecentActions.PreviousMessage', true)
      )
    };
  },
  'channelAdminLogEventActionDeleteMessage': ({action, peerId, makePeerTitle, event}) =>
    isMessage(action.message) ? makeDefaultMessageEntry(
      'AdminLog.DeletedMessage', action.message, peerId, event, makePeerTitle
    ) : null,
  'channelAdminLogEventActionParticipantJoin': ({isBroadcast, peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry(
      isBroadcast ? 'AdminLog.ParticipantJoinedChannel' : 'AdminLog.ParticipantJoinedGroup',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionParticipantLeave': ({isBroadcast, peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry(
      isBroadcast ? 'AdminLog.ParticipantLeftChannel' : 'AdminLog.ParticipantLeftGroup',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionParticipantInvite': ({peerId, action, makePeerTitle, event}) =>
    makeTwoPeerServiceEntry(
      'AdminLog.ParticipantInvited',
      peerId, getParticipantPeerId(action.participant),
      event, makePeerTitle
    ),
  'channelAdminLogEventActionParticipantToggleBan': ({event, action, channelId, peerId, makeMessagePeerTitle, makePeerTitle, isOut}) => ({
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
            name={isOut ? null : makeMessagePeerTitle(peerId)}
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
            <Show when={!isBanned}>
              <Space amount='0.5rem' />
              <For each={added}>
                {key => <div>+ {key}</div>}
              </For>
              <For each={removed}>
                {key => <div>- {key}</div>}
              </For>
            </Show>
          </MinimalBubbleMessageContent>
        </>
      );
    },
    getCopyText: async() => {
      const dateText = getDateTextForCopy(event.date);
      const {apiManagerProxy, getPeerTitle} = useHotReloadGuard();
      const {isBanned, participantPeerId, added, removed} = extractBanChanges(action, channelId, apiManagerProxy);
      const participantName = await getPeerTitle({peerId: participantPeerId, plainText: true});
      const adminName = await getPeerTitle({peerId, plainText: true});

      const lines = [`${adminName} [${dateText}]`];
      lines.push(I18n.format(isBanned ? 'AdminLog.ParticipantBanned' : 'AdminLog.ParticipantPermissionsToggled', true, [participantName]));
      added.forEach(perm => lines.push(`+ ${perm}`));
      removed.forEach(perm => lines.push(`- ${perm}`));

      return {text: lines.join('\n')};
    }
  }),
  'channelAdminLogEventActionParticipantToggleAdmin': ({event, action, peerId, makePeerTitle, makeMessagePeerTitle, isBroadcast, isOut}) => ({
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
            name={isOut ? null : makeMessagePeerTitle(peerId)}
          >
            <I18nTsx
              key={username ? 'AdminLog.AdminPermissionsChangedUsername' : 'AdminLog.AdminPermissionsChanged'}
              args={[linkColor(makePeerTitle(participantPeerId)), username ? linkColor(`@${username}`) : '']}
            />
            <Space amount='0.5rem' />
            <For each={added}>
              {key => <div>+ {key}</div>}
            </For>
            <For each={removed}>
              {key => <div>- {key}</div>}
            </For>
          </MinimalBubbleMessageContent>
        </>
      );
    },
    getCopyText: async() => {
      const dateText = getDateTextForCopy(event.date);
      const {apiManagerProxy, getPeerTitle} = useHotReloadGuard();
      const {participantPeerId, added, removed} = extractAdminChanges(action, apiManagerProxy, isBroadcast);
      const participantName = await getPeerTitle({peerId: participantPeerId, plainText: true});
      const adminName = await getPeerTitle({peerId, plainText: true});

      const lines = [`${adminName} [${dateText}]`];
      lines.push(I18n.format('AdminLog.AdminPermissionsChanged', true, [participantName]));
      added.forEach(perm => lines.push(`+ ${perm}`));
      removed.forEach(perm => lines.push(`- ${perm}`));

      return {text: lines.join('\n')};
    }
  }),
  'channelAdminLogEventActionChangeStickerSet': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ChangeStickerSet', peerId, event, makePeerTitle),
  'channelAdminLogEventActionTogglePreHistoryHidden': ({action, peerId, makePeerTitle, event}) =>
    makeToggleServiceEntry(
      action.new_value,
      'AdminLog.TogglePreHistoryHiddenEnabled', 'AdminLog.TogglePreHistoryHiddenDisabled',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionDefaultBannedRights': ({event, action, peerId, makeMessagePeerTitle, isOut}) => ({
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
            name={isOut ? null : makeMessagePeerTitle(peerId)}
          >
            <I18nTsx key={'AdminLog.DefaultBannedRightsChanged'} />
            <Space amount='0.5rem' />
            <For each={added}>
              {key => <div>+ {key}</div>}
            </For>
            <For each={removed}>
              {key => <div>- {key}</div>}
            </For>
          </MinimalBubbleMessageContent>
        </>
      );
    },
    getCopyText: async() => {
      const {getPeerTitle} = useHotReloadGuard();
      const dateText = getDateTextForCopy(event.date);
      const peerTitle = await getPeerTitle({peerId, plainText: true});
      const {added, removed} = extractDefaultRightsChanges(action);

      const lines = [`${peerTitle} [${dateText}]`];
      lines.push(I18n.format('AdminLog.DefaultBannedRightsChanged', true, [peerTitle]));
      added.forEach(perm => lines.push(`+ ${perm}`));
      removed.forEach(perm => lines.push(`- ${perm}`));

      return {text: lines.join('\n')};
    }
  }),
  'channelAdminLogEventActionStopPoll': ({action, peerId, makePeerTitle, event}) =>
    isMessage(action.message) ? makeDefaultMessageEntry(
      'AdminLog.PollStopped', action.message, peerId, event, makePeerTitle
    ) : null,
  'channelAdminLogEventActionChangeLinkedChat': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ChangeLinkedChat', peerId, event, makePeerTitle),
  'channelAdminLogEventActionChangeLocation': ({isBroadcast, peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry(
      isBroadcast ? 'AdminLog.ChangeLocationChannel' : 'AdminLog.ChangeLocationGroup',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionToggleSlowMode': ({action, peerId, makePeerTitle, event}) =>
    makeDurationToggleServiceEntry(
      'AdminLog.ToggleSlowModeSet', 'AdminLog.ToggleSlowModeDisabled',
      action.new_value, peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionStartGroupCall': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.StartGroupCall', peerId, event, makePeerTitle),
  'channelAdminLogEventActionDiscardGroupCall': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.DiscardGroupCall', peerId, event, makePeerTitle),
  'channelAdminLogEventActionParticipantMute': ({peerId, action, makePeerTitle, event}) =>
    makeTwoPeerServiceEntry(
      'AdminLog.ParticipantMuted',
      getPeerId(action.participant?.peer), peerId,
      event, makePeerTitle
    ),
  'channelAdminLogEventActionParticipantUnmute': ({peerId, action, makePeerTitle, event}) =>
    makeTwoPeerServiceEntry(
      'AdminLog.ParticipantUnmuted',
      getPeerId(action.participant?.peer), peerId,
      event, makePeerTitle
    ),
  'channelAdminLogEventActionToggleGroupCallSetting': ({action, peerId, makePeerTitle, event}) =>
    makeToggleServiceEntry(
      action.join_muted,
      'AdminLog.ToggleGroupCallSettingEnabled', 'AdminLog.ToggleGroupCallSettingDisabled',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionParticipantJoinByInvite': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ParticipantJoinedByInvite', peerId, event, makePeerTitle),
  'channelAdminLogEventActionExportedInviteDelete': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ExportedInviteDeleted', peerId, event, makePeerTitle),
  'channelAdminLogEventActionExportedInviteRevoke': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ExportedInviteRevoked', peerId, event, makePeerTitle),
  'channelAdminLogEventActionExportedInviteEdit': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ExportedInviteEdit', peerId, event, makePeerTitle),
  'channelAdminLogEventActionParticipantVolume': ({peerId, action, makePeerTitle, event}) =>
    makeTwoPeerServiceEntry(
      'AdminLog.ParticipantVolumeChanged',
      getPeerId(action.participant?.peer), peerId,
      event, makePeerTitle
    ),
  'channelAdminLogEventActionChangeHistoryTTL': ({action, peerId, makePeerTitle, event}) =>
    makeDurationToggleServiceEntry(
      'AdminLog.ChangeHistoryTTLEnabled', 'AdminLog.ChangeHistoryTTLDisabled',
      action.new_value, peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionParticipantJoinByRequest': ({peerId, action, makePeerTitle, event}) =>
    makeTwoPeerServiceEntry(
      'AdminLog.ParticipantJoinedByRequest',
      peerId, action.approved_by.toPeerId(),
      event, makePeerTitle
    ),
  'channelAdminLogEventActionToggleNoForwards': ({action, peerId, makePeerTitle, event}) =>
    makeToggleServiceEntry(
      action.new_value,
      'AdminLog.ToggleNoForwardsEnabled', 'AdminLog.ToggleNoForwardsDisabled',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionSendMessage': ({action, peerId, makePeerTitle, event}) =>
    isMessage(action.message) ? makeDefaultMessageEntry(
      'AdminLog.MessageSent', action.message, peerId, event, makePeerTitle
    ) : null,
  'channelAdminLogEventActionChangeAvailableReactions': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ChangeAvailableReactions', peerId, event, makePeerTitle),
  'channelAdminLogEventActionChangeUsernames': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ChangeUsernames', peerId, event, makePeerTitle),
  'channelAdminLogEventActionToggleForum': ({action, peerId, makePeerTitle, event}) =>
    makeToggleServiceEntry(
      action.new_value,
      'AdminLog.ToggleForumEnabled', 'AdminLog.ToggleForumDisabled',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionCreateTopic': ({peerId, action, makePeerTitle, event}) =>
    makeTopicServiceEntry('AdminLog.TopicCreated', action.topic, peerId, event, makePeerTitle),
  'channelAdminLogEventActionEditTopic': ({peerId, action, makePeerTitle, event}) =>
    makeTopicServiceEntry('AdminLog.TopicEdited', action.new_topic, peerId, event, makePeerTitle),
  'channelAdminLogEventActionDeleteTopic': ({peerId, action, makePeerTitle, event}) =>
    makeTopicServiceEntry('AdminLog.TopicDeleted', action.topic, peerId, event, makePeerTitle),
  'channelAdminLogEventActionPinTopic': ({action, peerId, makePeerTitle, event}) => {
    const pinned = !!action.new_topic;
    const key: LangPackKey = pinned ? 'AdminLog.TopicPinned' : 'AdminLog.TopicUnpinned';
    const topic = action.new_topic ? action.new_topic : action.prev_topic;
    return makeTopicServiceEntry(key, topic, peerId, event, makePeerTitle);
  },
  'channelAdminLogEventActionToggleAntiSpam': ({action, peerId, makePeerTitle, event}) =>
    makeToggleServiceEntry(
      action.new_value,
      'AdminLog.ToggleAntiSpamEnabled', 'AdminLog.ToggleAntiSpamDisabled',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionChangePeerColor': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ChangePeerColor', peerId, event, makePeerTitle),
  'channelAdminLogEventActionChangeProfilePeerColor': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ChangeProfilePeerColor', peerId, event, makePeerTitle),
  'channelAdminLogEventActionChangeWallpaper': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ChangeWallpaper', peerId, event, makePeerTitle),
  'channelAdminLogEventActionChangeEmojiStatus': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ChangeEmojiStatus', peerId, event, makePeerTitle),
  'channelAdminLogEventActionChangeEmojiStickerSet': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ChangeEmojiStickerSet', peerId, event, makePeerTitle),
  'channelAdminLogEventActionToggleSignatureProfiles': ({action, peerId, makePeerTitle, event}) =>
    makeToggleServiceEntry(
      action.new_value,
      'AdminLog.ToggleSignatureProfilesEnabled', 'AdminLog.ToggleSignatureProfilesDisabled',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionParticipantSubExtend': ({peerId, makePeerTitle, event}) =>
    makeSimpleServiceEntry('AdminLog.ParticipantSubscriptionExtended', peerId, event, makePeerTitle),
  'channelAdminLogEventActionToggleAutotranslation': ({action, peerId, makePeerTitle, event}) =>
    makeToggleServiceEntry(
      action.new_value,
      'AdminLog.ToggleAutoTranslationEnabled', 'AdminLog.ToggleAutoTranslationDisabled',
      peerId, event, makePeerTitle
    ),
  'channelAdminLogEventActionParticipantEditRank': ({action, makePeerTitle, event}) =>
    makeRankServiceEntry(action, event, makePeerTitle)
};

type ResolveAdminLogArgs = RenderArgs;

export const resolveAdminLog = (args: ResolveAdminLogArgs) => {
  const {event} = args;
  const resolver = adminLogsMap[event.action._];

  if(!resolver) {
    return null;
  }

  return resolver({...args, action: event.action as never});
};
