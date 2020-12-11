import { MOUNT_CLASS_TO } from "../mtproto/mtproto_config";
import appStateManager from "./appStateManager";

export class AppMessagesIdsManager {
  public channelLocals: {[channelId: string]: number} = {};
  public channelsByLocals: {[localStart: string]: number} = {};
  public channelCurLocal = 0;
  public fullMsgIdModulus = 4294967296;

  constructor() {
    appStateManager.getState().then(state => {
      const cached = state.messagesIdsLocals;
      if(cached) {
        this.channelLocals = cached.channelLocals;
        this.channelsByLocals = cached.channelsByLocals;
        this.channelCurLocal = cached.channelCurLocal;
      }
    });

    appStateManager.addListener('save', () => {
      appStateManager.pushToState('messagesIdsLocals', {
        channelLocals: this.channelLocals,
        channelsByLocals: this.channelsByLocals,
        channelCurLocal: this.channelCurLocal
      });
    });
  }

  public getFullMessageId(msgId: number, channelId: number): number {
    if(!channelId || msgId <= 0) {
      return msgId;
    }

    msgId = this.getMessageLocalId(msgId);
    let localStart = this.channelLocals[channelId];
    if(!localStart) {
      localStart = (++this.channelCurLocal) * this.fullMsgIdModulus;
      this.channelsByLocals[localStart] = channelId;
      this.channelLocals[channelId] = localStart;
    }

    return localStart + msgId;
  }

  public getMessageIdInfo(fullMsgId: number) {
    if(fullMsgId < this.fullMsgIdModulus) {
      return [fullMsgId, 0];
    }

    const msgId = fullMsgId % this.fullMsgIdModulus;
    const channelId = this.channelsByLocals[fullMsgId - msgId];

    return [msgId, channelId];
  }

  public getMessageLocalId(fullMsgId: number) {
    return fullMsgId ? fullMsgId % this.fullMsgIdModulus : 0;
  }

  public splitMessageIdsByChannels(mids: number[]) {
    const msgIdsByChannels: {[channelId: number]: number[]} = {};
    const midsByChannels: {[channelId: number]: number[]} = {};
    for(const mid of mids) {
      const msgChannel = this.getMessageIdInfo(mid);
      const channelId = msgChannel[1];

      if(msgIdsByChannels[channelId] === undefined) {
        msgIdsByChannels[channelId] = [];
        midsByChannels[channelId] = [];
      }

      msgIdsByChannels[channelId].push(msgChannel[0]);
      midsByChannels[channelId].push(mid);
    }

    return {
      msgIds: msgIdsByChannels,
      mids: midsByChannels
    };
  }
}

const appMessagesIdsManager = new AppMessagesIdsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appMessagesIdsManager = appMessagesIdsManager);
export default appMessagesIdsManager;
