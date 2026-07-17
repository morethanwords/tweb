import {ChatAdminRights} from '@layer';
import hasBotAdminRights from '@appManagers/utils/bots/hasBotAdminRights';

export type AddBotToChatScope = 'all' | 'groupAdmin' | 'channelAdmin';

export default function getBotAddToChatScope(
  link: {startgroup?: string, startchannel?: string},
  requestedRights?: ChatAdminRights
): AddBotToChatScope | undefined {
  if(link.startgroup !== undefined) {
    return hasBotAdminRights(requestedRights) ? 'groupAdmin' : 'all';
  }

  if(link.startchannel !== undefined) {
    return 'channelAdmin';
  }
}
