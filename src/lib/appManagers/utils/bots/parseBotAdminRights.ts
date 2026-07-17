import {ChatAdminRights} from '@layer';
import {BOT_ADMIN_RIGHTS_BY_LINK_NAME} from '@appManagers/utils/bots/constants';

export default function parseBotAdminRights(value?: string): ChatAdminRights {
  const rights: ChatAdminRights = {
    _: 'chatAdminRights',
    pFlags: {}
  };

  value?.split(/[+ ]/).forEach((name) => {
    const flag = BOT_ADMIN_RIGHTS_BY_LINK_NAME[name];
    if(flag) {
      rights.pFlags[flag] = true;
    }
  });

  return rights;
}
