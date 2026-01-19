import {formatDate} from '@helpers/date';
import {makeDateFromTimestamp} from '@helpers/date/makeDateFromTimestamp';
import formatDuration from '@helpers/formatDuration';
import prepareTextWithEntitiesForCopying from '@helpers/prepareTextWithEntitiesForCopying';
import {ChannelAdminLogEventAction, ChatBannedRights, Message} from '@layer';
import getParticipantPeerId from '@appManagers/utils/chats/getParticipantPeerId';
import {isBannedParticipant} from '@appManagers/utils/chats/isBannedParticipant';
import removeChatBannedRightsFromParticipant from '@appManagers/utils/chats/removeChatBannedRightsFromParticipant';
import I18n from '@lib/langPack';
import type apiManagerProxy from '@lib/apiManagerProxy';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {resolveAdminRightFlagI18n} from '@components/sidebarRight/tabs/adminRecentActions/adminRightsI18nResolver';
import {participantRightsMap} from '@components/sidebarRight/tabs/adminRecentActions/participantRightsMap';
import {diffFlags} from '@components/sidebarRight/tabs/adminRecentActions/utils';
import {wrapFormattedDuration} from '@components/wrappers/wrapDuration';


type ApiManagerProxyType = typeof apiManagerProxy;

export type CopyTextResult = {
  text: string;
  html?: string;
};

export function getDateTextForCopy(timestamp: number): string {
  const date = makeDateFromTimestamp(timestamp);
  const dateElement = formatDate(date, {withTime: true});
  return dateElement.textContent || '';
}


export function formatDurationAsText(seconds: number): string {
  return wrapFormattedDuration(formatDuration(seconds), true);
}

export function extractBanChanges(
  action: Extract<ChannelAdminLogEventAction, {_: 'channelAdminLogEventActionParticipantToggleBan'}>,
  channelId: ChatId,
  apiManagerProxy: ApiManagerProxyType
) {
  const isBanned = isBannedParticipant(action.new_participant);
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
  const removed = diff.new.map(key => participantRightsMap[key]).filter(Boolean).map(key => I18n.format(key, true));
  const added = diff.old.map(key => participantRightsMap[key]).filter(Boolean).map(key => I18n.format(key, true));

  return {isBanned, participantPeerId, participantUser, username, added, removed};
}

export function extractAdminChanges(
  action: Extract<ChannelAdminLogEventAction, {_: 'channelAdminLogEventActionParticipantToggleAdmin'}>,
  apiManagerProxy: ApiManagerProxyType,
  isBroadcast: boolean
) {
  const prevParticipantRights = 'admin_rights' in action.prev_participant ? action.prev_participant.admin_rights : null;
  const newParticipantRights = 'admin_rights' in action.new_participant ? action.new_participant.admin_rights : null;

  const diff = diffFlags(prevParticipantRights?.pFlags, newParticipantRights?.pFlags);
  const participantPeerId = getParticipantPeerId(action.prev_participant || action.new_participant);

  const participantUser = apiManagerProxy.getUser(participantPeerId.toUserId());
  const username = participantUser?.username || '';

  const added = diff.new.map(key => I18n.format(resolveAdminRightFlagI18n(key as any, {isBroadcast}), true));
  const removed = diff.old.map(key => I18n.format(resolveAdminRightFlagI18n(key as any, {isBroadcast}), true));

  return {participantPeerId, participantUser, username, added, removed};
}

export function extractDefaultRightsChanges(
  action: Extract<ChannelAdminLogEventAction, {_: 'channelAdminLogEventActionDefaultBannedRights'}>
) {
  const diff = diffFlags(action.prev_banned_rights?.pFlags, action.new_banned_rights?.pFlags);

  const added = diff.old.map(key => participantRightsMap[key]).filter(Boolean).map(key => I18n.format(key, true));
  const removed = diff.new.map(key => participantRightsMap[key]).filter(Boolean).map(key => I18n.format(key, true));

  return {added, removed};
}

export function getMessageTextForCopy(message: Message) {
  if(message._ !== 'message') {
    return {text: '', html: ''};
  }

  return prepareTextWithEntitiesForCopying({
    text: message.message,
    entities: message.entities
  });
}

export async function createSimpleServiceCopyText(
  timestamp: number,
  peerId: PeerId,
  formatText: (peerTitle: string) => string
): Promise<CopyTextResult> {
  const {getPeerTitle} = useHotReloadGuard();
  const dateText = getDateTextForCopy(timestamp);
  const peerTitle = await getPeerTitle({peerId, plainText: true});
  const text = formatText(peerTitle);
  return {text: `${text} [${dateText}]`};
}

export async function createMessageCopyText(
  timestamp: number,
  peerId: PeerId,
  message: Message,
  formatText: (peerTitle: string) => string
): Promise<CopyTextResult> {
  const {getPeerTitle} = useHotReloadGuard();
  const dateText = getDateTextForCopy(timestamp);
  const peerTitle = await getPeerTitle({peerId, plainText: true});
  const text = formatText(peerTitle);
  const msg = getMessageTextForCopy(message);
  return {
    text: `${text} [${dateText}]\n${msg.text}`,
    html: `${text} [${dateText}]<br/>${msg.html}`
  };
}

export async function createPreviousValueCopyText(
  timestamp: number,
  peerId: PeerId,
  formatMainText: (peerTitle: string) => string,
  newValue: string,
  prevValue: string,
  formatPreviousLabel: () => string
): Promise<CopyTextResult> {
  const {getPeerTitle} = useHotReloadGuard();
  const dateText = getDateTextForCopy(timestamp);
  const peerTitle = await getPeerTitle({peerId, plainText: true});
  const mainText = formatMainText(peerTitle);
  const previousLabel = formatPreviousLabel();
  return {
    text: `${mainText} [${dateText}]\n${newValue}\n\n${previousLabel}:\n${prevValue}`
  };
}

export async function createMultiLineCopyText(
  timestamp: number,
  peerId: PeerId,
  buildLines: (peerTitle: string, dateText: string) => string[]
): Promise<CopyTextResult> {
  const {getPeerTitle} = useHotReloadGuard();
  const dateText = getDateTextForCopy(timestamp);
  const peerTitle = await getPeerTitle({peerId, plainText: true});
  const lines = buildLines(peerTitle, dateText);
  return {text: lines.join('\n')};
}

export async function createMessageWithPreviousCopyText(
  timestamp: number,
  peerId: PeerId,
  newMessage: Message,
  prevMessage: Message,
  formatMainText: (peerTitle: string) => string,
  formatPreviousLabel: () => string
): Promise<CopyTextResult> {
  const {getPeerTitle} = useHotReloadGuard();
  const dateText = getDateTextForCopy(timestamp);
  const peerTitle = await getPeerTitle({peerId, plainText: true});
  const mainText = formatMainText(peerTitle);
  const newMsg = getMessageTextForCopy(newMessage);
  const prevMsg = getMessageTextForCopy(prevMessage);
  const previousLabel = formatPreviousLabel();
  return {
    text: `${mainText} [${dateText}]\n${newMsg.text}\n\n${previousLabel}:\n${prevMsg.text}`,
    html: `${mainText} [${dateText}]<br/>${newMsg.html}<br/><br/>${previousLabel}:<br/>${prevMsg.html}`
  };
}

export async function createTwoPeerCopyText(
  timestamp: number,
  peerId: PeerId,
  secondPeerId: PeerId,
  formatText: (peerTitle: string, secondPeerTitle: string) => string
): Promise<CopyTextResult> {
  const {getPeerTitle} = useHotReloadGuard();
  const dateText = getDateTextForCopy(timestamp);
  const peerTitle = await getPeerTitle({peerId, plainText: true});
  const secondPeerTitle = await getPeerTitle({peerId: secondPeerId, plainText: true});
  const text = formatText(peerTitle, secondPeerTitle);
  return {text: `${text} [${dateText}]`};
}

export async function createConditionalCopyText(
  timestamp: number,
  peerId: PeerId,
  condition: boolean,
  formatTexts: (peerTitle: string) => {trueText: string; falseText: string}
): Promise<CopyTextResult> {
  const {getPeerTitle} = useHotReloadGuard();
  const dateText = getDateTextForCopy(timestamp);
  const peerTitle = await getPeerTitle({peerId, plainText: true});
  const {trueText, falseText} = formatTexts(peerTitle);
  const text = condition ? trueText : falseText;
  return {text: `${text} [${dateText}]`};
}
