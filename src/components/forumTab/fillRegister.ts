import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {BotforumTab} from './botforumTab';
import {ForumTab} from './forumTab';
import {GroupForumTab} from './groupForumTab';
import {MonoforumTab} from './monoforumTab';


export function fillForumTabRegister() {
  ForumTab.register.addEntry({
    check: (peerId) => {
      const peer = apiManagerProxy.getPeer(peerId);
      return !!(peer?._ === 'channel' && peer?.pFlags?.forum);
    },
    payload: GroupForumTab
  });

  ForumTab.register.addEntry({
    check: (peerId) => {
      const peer = apiManagerProxy.getPeer(peerId);
      return !!(peer?._ === 'channel' && peer?.pFlags?.monoforum);
    },
    payload: MonoforumTab
  });

  ForumTab.register.addEntry({
    check: (peerId) => {
      const peer = apiManagerProxy.getPeer(peerId);
      return !!(peer?._ === 'user' && peer?.pFlags?.bot_forum_view);
    },
    payload: BotforumTab
  });
}
