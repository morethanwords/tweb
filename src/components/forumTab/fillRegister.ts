import apiManagerProxy from '@lib/apiManagerProxy';
import {BotforumTab} from '@components/forumTab/botforumTab';
import {ForumTab} from '@components/forumTab/forumTab';
import {GroupForumTab} from '@components/forumTab/groupForumTab';
import {MonoforumTab} from '@components/forumTab/monoforumTab';


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
