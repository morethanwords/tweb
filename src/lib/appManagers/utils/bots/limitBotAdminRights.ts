import {Chat, ChatAdminRights} from '@layer';
import {BOT_ADMIN_RIGHTS} from '@appManagers/utils/bots/constants';
import mergeBotAdminRights from '@appManagers/utils/bots/mergeBotAdminRights';

export default function limitBotAdminRights(
  chat: Chat.chat | Chat.channel,
  rights: ChatAdminRights
): ChatAdminRights {
  const normalized = mergeBotAdminRights(rights);
  if(chat._ === 'chat' || chat.pFlags.creator) {
    return normalized;
  }

  const editableRights = chat.admin_rights;
  const pFlags: ChatAdminRights['pFlags'] = {};
  BOT_ADMIN_RIGHTS.forEach((flag) => {
    if(normalized.pFlags[flag] && editableRights?.pFlags[flag]) {
      pFlags[flag] = true;
    }
  });

  return {
    _: 'chatAdminRights',
    pFlags
  };
}
