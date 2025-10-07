import {Chat} from '../../layer';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {ForumTab} from './forumTab';
import {GroupForumTab} from './groupForumTab';
import {MonoforumTab} from './monoforumTab';


export function fillForumTabRegister() {
  ForumTab.register.addEntry({
    check: (peerId) => {
      const peer = apiManagerProxy.getPeer(peerId);
      return !!(peer as Chat.channel)?.pFlags?.forum;
    },
    payload: GroupForumTab
  });

  ForumTab.register.addEntry({
    check: (peerId) => {
      const peer = apiManagerProxy.getPeer(peerId);
      return !!(peer as Chat.channel)?.pFlags?.monoforum;
    },
    payload: MonoforumTab
  });
}
