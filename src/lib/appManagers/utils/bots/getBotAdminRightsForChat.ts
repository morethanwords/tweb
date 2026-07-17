import {Chat, ChatAdminRights, UserFull} from '@layer';
import type {AddBotToChatScope} from '@appManagers/utils/bots/getBotAddToChatScope';
import hasBotAdminRights from '@appManagers/utils/bots/hasBotAdminRights';

export default function getBotAdminRightsForChat({
  chat,
  userFull,
  scope,
  requestedRights
}: {
  chat: Chat.chat | Chat.channel,
  userFull: UserFull.userFull,
  scope: AddBotToChatScope,
  requestedRights?: ChatAdminRights
}) {
  if(scope === 'groupAdmin') {
    if(chat._ === 'channel' && chat.pFlags.broadcast) {
      return;
    }

    return hasBotAdminRights(requestedRights) ? requestedRights : userFull.bot_group_admin_rights;
  }

  if(scope === 'channelAdmin') {
    if(chat._ !== 'channel' || !chat.pFlags.broadcast) {
      return;
    }

    return hasBotAdminRights(requestedRights) ? requestedRights : userFull.bot_broadcast_admin_rights;
  }

  return chat._ === 'channel' && chat.pFlags.broadcast ?
    userFull.bot_broadcast_admin_rights :
    userFull.bot_group_admin_rights;
}
