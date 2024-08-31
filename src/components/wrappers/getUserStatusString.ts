/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {formatFullSentTimeRaw} from '../../helpers/date';
import numberThousandSplitter from '../../helpers/number/numberThousandSplitter';
import {User} from '../../layer';
import {LangPackKey, i18n} from '../../lib/langPack';
import {REPLIES_PEER_ID, SERVICE_PEER_ID} from '../../lib/mtproto/mtproto_config';

export default function getUserStatusString(user: User.user): HTMLElement {
  if(!user) {
    return document.createElement('span');
  }

  let key: LangPackKey;
  let args: any[];

  switch(user.id) {
    case REPLIES_PEER_ID.toUserId():
      key = 'Peer.RepliesNotifications';
      break;
    case SERVICE_PEER_ID.toUserId():
      key = 'Peer.ServiceNotifications';
      break;
    default: {
      if(user.pFlags.bot) {
        if(user.bot_active_users === undefined) {
          key = 'Bot';
          break;
        }

        key = 'BotUsers';
        args = [numberThousandSplitter(user.bot_active_users)];
        break;
      }

      if(user.pFlags.support) {
        key = 'SupportStatus';
        break;
      }

      switch(user.status?._) {
        case 'userStatusRecently': {
          key = 'Lately';
          break;
        }

        case 'userStatusLastWeek': {
          key = 'WithinAWeek';
          break;
        }

        case 'userStatusLastMonth': {
          key = 'WithinAMonth';
          break;
        }

        case 'userStatusOffline': {
          const date = user.status.was_online;
          const today = new Date();
          const now = today.getTime() / 1000 | 0;

          const diff = now - date;
          if(diff < 60) {
            key = 'Peer.Status.justNow';
          } else if(diff < 3600) {
            key = 'Peer.Status.minAgo';
            const c = diff / 60 | 0;
            args = [c];
          } else if(diff < 86400 && today.getDate() === new Date(date * 1000).getDate()) {
            key = 'LastSeen.HoursAgo';
            const c = diff / 3600 | 0;
            args = [c];
          } else {
            key = 'Peer.Status.LastSeenAt';
            const {dateEl, timeEl} = formatFullSentTimeRaw(date);
            args = [dateEl, timeEl];
          }

          break;
        }

        case 'userStatusOnline': {
          key = 'Online';
          break;
        }

        default: {
          key = 'ALongTimeAgo';
          break;
        }
      }

      break;
    }
  }

  return i18n(key, args);
}
