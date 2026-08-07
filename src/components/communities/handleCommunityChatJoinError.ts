import {toastNew} from '@components/toast';
import type {AppManagers} from '@lib/managers';

export default function handleCommunityChatJoinError(options: {
  error: ApiError,
  isBroadcast: boolean,
  communityId?: ChatId,
  managers: Pick<AppManagers, 'appProfileManager'>
}) {
  switch(options.error.type) {
    case 'INVITE_REQUEST_SENT': {
      toastNew({
        langPackKey: options.isBroadcast ?
          'Community.ChannelRequestSent' :
          'Community.GroupRequestSent'
      });
      return true;
    }
    case 'USERS_TOO_MUCH':
    case 'GROUP_FULL': {
      toastNew({langPackKey: 'Community.GroupFull'});
      return true;
    }
    case 'CHANNEL_PRIVATE':
    case 'CHANNEL_PUBLIC_GROUP_NA':
    case 'USER_BANNED_IN_CHANNEL':
    case 'ACCESS_DENIED': {
      toastNew({
        langPackKey: options.isBroadcast ?
          'Community.ChannelNotAccessible' :
          'Community.GroupNotAccessible'
      });
      if(options.communityId) {
        void Promise.resolve(options.managers.appProfileManager.getChatFull(
          options.communityId,
          true
        )).catch(() => {});
      }
      return true;
    }
    default:
      return false;
  }
}
