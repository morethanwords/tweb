import {User} from '@layer';

/**
 * What a user's last-seen status weighs when users are put in order of how recently they were
 * seen: the time for an exact one, and a small rank for the approximate ones, which the server
 * gives for users who hide theirs - so any exact time comes before any of those.
 */
export default function getUserStatusForSort(status: User.user['status']) {
  if(status) {
    const expires = status._ === 'userStatusOnline' ? status.expires : (status._ === 'userStatusOffline' ? status.was_online : 0);
    if(expires) {
      return expires;
    }

    switch(status._) {
      case 'userStatusRecently':
        return 3;
      case 'userStatusLastWeek':
        return 2;
      case 'userStatusLastMonth':
        return 1;
    }
  }

  return 0;
}
