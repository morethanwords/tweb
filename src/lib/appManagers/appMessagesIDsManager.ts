import { MOUNT_CLASS_TO } from "../mtproto/mtproto_config";
import appStateManager from "./appStateManager";

export class AppMessagesIDsManager {
  public channelLocals: {[channelID: string]: number} = {};
  public channelsByLocals: {[localStart: string]: number} = {};
  public channelCurLocal = 0;
  public fullMsgIDModulus = 4294967296;

  constructor() {
    appStateManager.getState().then(state => {
      const cached = state.messagesIDsLocals;
      if(cached) {
        this.channelLocals = cached.channelLocals;
        this.channelsByLocals = cached.channelsByLocals;
        this.channelCurLocal = cached.channelCurLocal;
      }
    });

    appStateManager.addListener('save', () => {
      appStateManager.pushToState('messagesIDsLocals', {
        channelLocals: this.channelLocals,
        channelsByLocals: this.channelsByLocals,
        channelCurLocal: this.channelCurLocal
      });
    });
  }

  public getFullMessageID(msgID: number, channelID: number): number {
    if(!channelID || msgID <= 0) {
      return msgID;
    }

    msgID = this.getMessageLocalID(msgID);
    let localStart = this.channelLocals[channelID];
    if(!localStart) {
      localStart = (++this.channelCurLocal) * this.fullMsgIDModulus;
      this.channelsByLocals[localStart] = channelID;
      this.channelLocals[channelID] = localStart;
    }

    return localStart + msgID;
  }

  public getMessageIDInfo(fullMsgID: number) {
    if(fullMsgID < this.fullMsgIDModulus) {
      return [fullMsgID, 0];
    }

    const msgID = fullMsgID % this.fullMsgIDModulus;
    const channelID = this.channelsByLocals[fullMsgID - msgID];

    return [msgID, channelID];
  }

  public getMessageLocalID(fullMsgID: number) {
    return fullMsgID ? fullMsgID % this.fullMsgIDModulus : 0;
  }

  public splitMessageIDsByChannels(mids: number[]) {
    const msgIDsByChannels: {[channelID: number]: number[]} = {};
    const midsByChannels: {[channelID: number]: number[]} = {};
    for(const mid of mids) {
      const msgChannel = this.getMessageIDInfo(mid);
      const channelID = msgChannel[1];

      if(msgIDsByChannels[channelID] === undefined) {
        msgIDsByChannels[channelID] = [];
        midsByChannels[channelID] = [];
      }

      msgIDsByChannels[channelID].push(msgChannel[0]);
      midsByChannels[channelID].push(mid);
    }

    return {
      msgIDs: msgIDsByChannels,
      mids: midsByChannels
    };
  }
}

const appMessagesIDsManager = new AppMessagesIDsManager();
MOUNT_CLASS_TO.appMessagesIDsManager = appMessagesIDsManager;
export default appMessagesIDsManager;
