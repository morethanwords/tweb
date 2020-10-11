export class AppMessagesIDsManager {
  public channelLocals: {[channelID: string]: number} = {};
  public channelsByLocals: {[localStart: string]: number} = {};
  public channelCurLocal = 0;
  public fullMsgIDModulus = 4294967296;

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

export default new AppMessagesIDsManager();
