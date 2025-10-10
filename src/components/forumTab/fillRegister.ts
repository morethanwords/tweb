import {Chat} from '../../layer';
import {SIMULATED_BOTFORUM_IDS} from '../../lib/mtproto/mtproto_config';
import apiManagerProxy from '../../lib/mtproto/mtprotoworker';
import {BotforumTab} from './botforumTab';
import {ForumTab} from './forumTab';
import {GroupForumTab} from './groupForumTab';
import {MonoforumTab} from './monoforumTab';


export function fillForumTabRegister() {
  ForumTab.register.addEntry({
    check: (peerId) => {
      return SIMULATED_BOTFORUM_IDS.has(peerId);
      // const peer = apiManagerProxy.getPeer(peerId);
      // return !!(peer as Chat.channel)?.pFlags?.monoforum;
    },
    payload: BotforumTab
  });

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
