export class AppMessagesIDsManager {
  public channelLocals = {} as any;
  public channelsByLocals = {} as any;
  public channelCurLocal = 0;
  public fullMsgIDModulus = 4294967296;

  public getFullMessageID(msgID: number, channelID: number): number {
    if(!channelID || msgID <= 0) {
      return msgID;
    }
    msgID = this.getMessageLocalID(msgID);
    var localStart = this.channelLocals[channelID];
    if(!localStart) {
      localStart = (++this.channelCurLocal) * this.fullMsgIDModulus;
      this.channelsByLocals[localStart] = channelID;
      this.channelLocals[channelID] = localStart;
    }

    return localStart + msgID;
  }

  public getMessageIDInfo(fullMsgID: number) {
    if (fullMsgID < this.fullMsgIDModulus) {
      return [fullMsgID, 0];
    }
    var msgID = fullMsgID % this.fullMsgIDModulus;
    var channelID = this.channelsByLocals[fullMsgID - msgID];

    return [msgID, channelID];
  }

  public getMessageLocalID(fullMsgID: number) {
    if(!fullMsgID) {
      return 0;
    }
    return fullMsgID % this.fullMsgIDModulus;
  }

  public splitMessageIDsByChannels (mids: any[]) {
    var msgIDsByChannels: {[channelID: number]: number[]} = {};
    var midsByChannels: {[channelID: number]: number[]} = {};
    var i;
    var mid, msgChannel;
    var channelID;
    for(i = 0; i < mids.length; i++) {
      mid = mids[i];
      msgChannel = this.getMessageIDInfo(mid);
      channelID = msgChannel[1];
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
