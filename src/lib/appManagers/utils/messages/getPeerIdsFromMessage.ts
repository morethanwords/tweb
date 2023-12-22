/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Message, MessageAction, MessageMedia, Peer, WebPage, WebPageAttribute} from '../../../../layer';
import getPeerId from '../peers/getPeerId';

export default function getPeerIdsFromMessage(message: Message.message | Message.messageService) {
  const peerIds: number[] = [
    message.fromId,
    message.viaBotId,
    (message as Message.message).fwdFromId
  ];

  const media = (message as Message.message).media;
  if(media) {
    const userIds: UserId[] = [
      (media as MessageMedia.messageMediaContact).user_id,
      ...((media as MessageMedia.messageMediaGiveawayResults).winners || [])
    ];
    peerIds.push(...userIds.filter(Boolean).map((userId) => userId.toPeerId()));

    const chatIds: ChatId[] = [
      ...((media as MessageMedia.messageMediaGiveaway).channels || []),
      (media as MessageMedia.messageMediaGiveawayResults).channel_id
    ];
    peerIds.push(...chatIds.filter(Boolean).map((chatId) => chatId.toPeerId(true)));

    const peers: Peer[] = [
      ...((media as MessageMedia.messageMediaPoll).results?.recent_voters || []),
      (media as MessageMedia.messageMediaStory).peer
    ];
    const webPage = (media as MessageMedia.messageMediaWebPage)?.webpage as WebPage.webPage;
    if(webPage) {
      const storyAttribute = webPage.attributes?.find((attribute) => attribute._ === 'webPageAttributeStory') as WebPageAttribute.webPageAttributeStory;
      peers.push(storyAttribute?.peer);
    }
    peerIds.push(...peers.filter(Boolean).map((peer) => getPeerId(peer)));
  }

  const recentReactions = ((message as Message.message).reactions)?.recent_reactions;
  if(recentReactions?.length) {
    peerIds.push(...recentReactions.map((reaction) => getPeerId(reaction.peer_id)));
  }

  const action = (message as Message.messageService).action;
  if(action) {
    const userIds: UserId[] = [
      ...((action as MessageAction.messageActionChatAddUser).users || []),
      (action as MessageAction.messageActionChatDeleteUser).user_id,
      (action as MessageAction.messageActionChatJoinedByLink).inviter_id
    ];
    peerIds.push(...userIds.filter(Boolean).map((userId) => userId.toPeerId()));

    const chatIds: ChatId[] = [
      (action as MessageAction.messageActionChatMigrateTo).channel_id,
      (action as MessageAction.messageActionChannelMigrateFrom).chat_id
    ];
    peerIds.push(...chatIds.filter(Boolean).map((chatId) => chatId.toPeerId(true)));

    const peers: Peer[] = [
      (action as MessageAction.messageActionGiftCode).boost_peer,
      ...(action as MessageAction.messageActionRequestedPeer).peers || [],
      (action as MessageAction.messageActionGeoProximityReached).from_id,
      (action as MessageAction.messageActionGeoProximityReached).to_id
    ];
    peerIds.push(...peers.filter(Boolean).map((peer) => getPeerId(peer)));
  }

  const recentRepliers = ((message as Message.message).replies)?.recent_repliers;
  if(recentRepliers?.length) {
    peerIds.push(...recentRepliers.map((reply) => getPeerId(reply)));
  }

  return new Set(peerIds.filter(Boolean));
}
