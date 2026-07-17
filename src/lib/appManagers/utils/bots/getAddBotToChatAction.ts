import {User, UserFull} from '@layer';
import {REPLIES_PEER_ID, VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';
import hasBotAdminRights from '@appManagers/utils/bots/hasBotAdminRights';
import {LangPackKey} from '@lib/langPack';

export default function getAddBotToChatAction(
  user: User.user,
  userFull?: UserFull.userFull
): {
  text: LangPackKey,
  about?: LangPackKey,
  pickerTitle: LangPackKey
} | undefined {
  const userId = +user?.id;
  if(
    !user?.pFlags.bot ||
    user.pFlags.support ||
    userId === REPLIES_PEER_ID ||
    userId === VERIFICATION_CODES_BOT_ID
  ) {
    return;
  }

  const canAddToGroup = !user.pFlags.bot_nochats;
  const canManageGroup = hasBotAdminRights(userFull?.bot_group_admin_rights);
  const canAddToChannel = hasBotAdminRights(userFull?.bot_broadcast_admin_rights);
  if(!canAddToGroup && !canAddToChannel) {
    return;
  }

  if(canAddToGroup && canAddToChannel) {
    return {
      text: 'BotAddToGroupOrChannel',
      about: canManageGroup ? 'BotAddToGroupOrChannelAbout' : 'BotAddToChannelAbout',
      pickerTitle: 'SelectChat'
    };
  }

  if(canAddToChannel) {
    return {
      text: 'AddToChannel',
      about: 'BotAddToChannelAbout',
      pickerTitle: 'SelectChat'
    };
  }

  return {
    text: 'AddToGroup',
    about: canManageGroup ? 'BotAddToGroupAbout' : undefined,
    pickerTitle: 'BotChooseGroup'
  };
}
