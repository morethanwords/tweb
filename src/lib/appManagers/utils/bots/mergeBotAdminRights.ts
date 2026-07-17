import {ChatAdminRights} from '@layer';
import {BOT_ADMIN_RIGHTS} from '@appManagers/utils/bots/constants';

export default function mergeBotAdminRights(
  ...values: (ChatAdminRights | undefined)[]
): ChatAdminRights {
  const rights: ChatAdminRights = {
    _: 'chatAdminRights',
    pFlags: {}
  };

  BOT_ADMIN_RIGHTS.forEach((flag) => {
    if(values.some((value) => value?.pFlags[flag])) {
      rights.pFlags[flag] = true;
    }
  });

  return rights;
}
