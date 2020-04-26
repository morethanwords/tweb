//import apiManager from '../mtproto/apiManager';
import apiManager from '../mtproto/mtprotoworker';
//import networkerFactory from '../mtproto/networkerFactory';
import { dT, $rootScope, tsNow } from "../utils";
import appPeersManager from "./appPeersManager";
import appUsersManager from "./appUsersManager";
import appChatsManager from "./appChatsManager";

export class ApiUpdatesManager {
  public updatesState: {
    pendingPtsUpdates: any[],
    pendingSeqUpdates: any,
    syncPending: any,
    syncLoading: any,

    seq?: any,
    pts?: any,
    date?: any
  } = {
    pendingPtsUpdates: [],
    pendingSeqUpdates: {},
    syncPending: false,
    syncLoading: true
  };

  public channelStates: any = {};
  
  public myID = 0;

  constructor() {
    apiManager.getUserID().then((id) => {
      this.myID = id;
    });
  }
 
  public popPendingSeqUpdate() {
    var nextSeq = this.updatesState.seq + 1;
    var pendingUpdatesData = this.updatesState.pendingSeqUpdates[nextSeq];
    if(!pendingUpdatesData) {
      return false;
    }

    var updates = pendingUpdatesData.updates;
    var length;
    for(var i = 0, length = updates.length; i < length; i++) {
      this.saveUpdate(updates[i]);
    }
    this.updatesState.seq = pendingUpdatesData.seq;
    if(pendingUpdatesData.date && this.updatesState.date < pendingUpdatesData.date) {
      this.updatesState.date = pendingUpdatesData.date;
    }
    delete this.updatesState.pendingSeqUpdates[nextSeq];
  
    if(!this.popPendingSeqUpdate() &&
      this.updatesState.syncPending &&
      this.updatesState.syncPending.seqAwaiting &&
      this.updatesState.seq >= this.updatesState.syncPending.seqAwaiting) {
      if(!this.updatesState.syncPending.ptsAwaiting) {
        clearTimeout(this.updatesState.syncPending.timeout)
        this.updatesState.syncPending = false
      } else {
        delete this.updatesState.syncPending.seqAwaiting;
      }
    }
  
    return true;
  }

  public popPendingPtsUpdate(channelID: any) {
    var curState = channelID ? this.getChannelState(channelID) : this.updatesState;
    if(!curState.pendingPtsUpdates.length) {
      return false;
    }
    curState.pendingPtsUpdates.sort((a: any, b: any) => {
      return a.pts - b.pts;
    });
    // console.log(dT(), 'pop update', channelID, curState.pendingPtsUpdates)
  
    var curPts = curState.pts;
    var goodPts = false;
    var goodIndex = 0;
    var update;
    for(var i = 0, length = curState.pendingPtsUpdates.length; i < length; i++) {
      update = curState.pendingPtsUpdates[i];
      curPts += update.pts_count;
      if(curPts >= update.pts) {
        goodPts = update.pts;
        goodIndex = i;
      }
    }
  
    if(!goodPts) {
      return false;
    }
  
    console.log(dT(), 'pop pending pts updates', goodPts, curState.pendingPtsUpdates.slice(0, goodIndex + 1));
  
    curState.pts = goodPts;
    for(i = 0; i <= goodIndex; i++) {
      update = curState.pendingPtsUpdates[i];
      this.saveUpdate(update);
    }
    curState.pendingPtsUpdates.splice(0, goodIndex + 1);
  
    if(!curState.pendingPtsUpdates.length && curState.syncPending) {
      if(!curState.syncPending.seqAwaiting) {
        clearTimeout(curState.syncPending.timeout);
        curState.syncPending = false;
      } else {
        delete curState.syncPending.ptsAwaiting;
      }
    }
  
    return true;
  }

  public forceGetDifference() {
    if(!this.updatesState.syncLoading) {
      this.getDifference();
    }
  }

  public processUpdateMessage(updateMessage: any) {
    // return forceGetDifference()
    var processOpts = {
      date: updateMessage.date,
      seq: updateMessage.seq,
      seqStart: updateMessage.seq_start
    };
  
    switch(updateMessage._) {
      case 'updatesTooLong':
      case 'new_session_created':
        this.forceGetDifference();
        break;
  
      case 'updateShort':
        this.processUpdate(updateMessage.update, processOpts);
        break;
  
      case 'updateShortMessage':
      case 'updateShortChatMessage':
        var isOut = updateMessage.flags & 2;
        var fromID = updateMessage.from_id || (isOut ? this.myID : updateMessage.user_id);
        var toID = updateMessage.chat_id
          ? -updateMessage.chat_id
          : (isOut ? updateMessage.user_id : this.myID);
  
        this.processUpdate({
          _: 'updateNewMessage',
          message: {
            _: 'message',
            flags: updateMessage.flags,
            pFlags: updateMessage.pFlags,
            id: updateMessage.id,
            from_id: fromID,
            to_id: appPeersManager.getOutputPeer(toID),
            date: updateMessage.date,
            message: updateMessage.message,
            fwd_from: updateMessage.fwd_from,
            reply_to_msg_id: updateMessage.reply_to_msg_id,
            entities: updateMessage.entities
          },
          pts: updateMessage.pts,
          pts_count: updateMessage.pts_count
        }, processOpts);
        break;
  
      case 'updatesCombined':
      case 'updates':
        appUsersManager.saveApiUsers(updateMessage.users);
        appChatsManager.saveApiChats(updateMessage.chats);
  
        updateMessage.updates.forEach((update: any) => {
          this.processUpdate(update, processOpts);
        });
        break;
  
      default:
        console.warn(dT(), 'Unknown update message', updateMessage);
    }
  }
  
  public getDifference() {
    // console.trace(dT(), 'Get full diff')
    let updatesState = this.updatesState;
    if (!updatesState.syncLoading) {
      updatesState.syncLoading = true;
      updatesState.pendingSeqUpdates = {};
      updatesState.pendingPtsUpdates = [];
    }
  
    if(updatesState.syncPending) {
      clearTimeout(updatesState.syncPending.timeout);
      updatesState.syncPending = false;
    }
  
    apiManager.invokeApi('updates.getDifference', {
      pts: updatesState.pts, 
      date: updatesState.date, 
      qts: -1
    }, {
      timeout: 0x7fffffff
    }).then((differenceResult: any) => {
      if(differenceResult._ == 'updates.differenceEmpty') {
        console.log(dT(), 'apply empty diff', differenceResult.seq);
        updatesState.date = differenceResult.date;
        updatesState.seq = differenceResult.seq;
        updatesState.syncLoading = false;
        $rootScope.$broadcast('stateSynchronized');
        return false;
      }
  
      appUsersManager.saveApiUsers(differenceResult.users);
      appChatsManager.saveApiChats(differenceResult.chats);
  
      // Should be first because of updateMessageID
      // console.log(dT(), 'applying', differenceResult.other_updates.length, 'other updates')
  
      differenceResult.other_updates.forEach((update: any) => {
        switch(update._) {
          case 'updateChannelTooLong':
          case 'updateNewChannelMessage':
          case 'updateEditChannelMessage':
            this.processUpdate(update);
            return;
        }
        
        this.saveUpdate(update);
      });
  
      // console.log(dT(), 'applying', differenceResult.new_messages.length, 'new messages')
      differenceResult.new_messages.forEach((apiMessage: any) => {
        this.saveUpdate({
          _: 'updateNewMessage',
          message: apiMessage,
          pts: updatesState.pts,
          pts_count: 0
        });
      });
  
      var nextState = differenceResult.intermediate_state || differenceResult.state;
      updatesState.seq = nextState.seq;
      updatesState.pts = nextState.pts;
      updatesState.date = nextState.date;
  
      // console.log(dT(), 'apply diff', updatesState.seq, updatesState.pts)
  
      if(differenceResult._ == 'updates.differenceSlice') {
        this.getDifference();
      } else {
        // console.log(dT(), 'finished get diff')
        $rootScope.$broadcast('stateSynchronized');
        updatesState.syncLoading = false;
      }
    }, () => {
      updatesState.syncLoading = false;
    });
  }

  public getChannelDifference(channelID: any) {
    var channelState = this.getChannelState(channelID);
    if(!channelState.syncLoading) {
      channelState.syncLoading = true;
      channelState.pendingPtsUpdates = [];
    }
    if(channelState.syncPending) {
      clearTimeout(channelState.syncPending.timeout);
      channelState.syncPending = false;
    }
    // console.log(dT(), 'Get channel diff', appChatsManager.getChat(channelID), channelState.pts)
    apiManager.invokeApi('updates.getChannelDifference', {
      channel: appChatsManager.getChannelInput(channelID),
      filter: {_: 'channelMessagesFilterEmpty'},
      pts: channelState.pts,
      limit: 30
    }, {timeout: 0x7fffffff}).then((differenceResult: any) => {
      // console.log(dT(), 'channel diff result', differenceResult)
      channelState.pts = differenceResult.pts;
  
      if (differenceResult._ == 'updates.channelDifferenceEmpty') {
        console.log(dT(), 'apply channel empty diff', differenceResult);
        channelState.syncLoading = false;
        $rootScope.$broadcast('stateSynchronized');
        return false;
      }
  
      if(differenceResult._ == 'updates.channelDifferenceTooLong') {
        console.log(dT(), 'channel diff too long', differenceResult);
        channelState.syncLoading = false;
        delete this.channelStates[channelID];
        this.saveUpdate({_: 'updateChannelReload', channel_id: channelID});
        return false;
      }
  
      appUsersManager.saveApiUsers(differenceResult.users);
      appChatsManager.saveApiChats(differenceResult.chats);
  
      // Should be first because of updateMessageID
      console.log(dT(), 'applying', differenceResult.other_updates.length, 'channel other updates')
      differenceResult.other_updates.forEach((update: any) => {
        this.saveUpdate(update);
      });
  
      console.log(dT(), 'applying', differenceResult.new_messages.length, 'channel new messages')
      differenceResult.new_messages.forEach((apiMessage: any) => {
        this.saveUpdate({
          _: 'updateNewChannelMessage',
          message: apiMessage,
          pts: channelState.pts,
          pts_count: 0
        });
      });
  
      console.log(dT(), 'apply channel diff', channelState.pts);
  
      if(differenceResult._ == 'updates.channelDifference' &&
        !differenceResult.pFlags['final']) {
        this.getChannelDifference(channelID);
      } else {
        console.log(dT(), 'finished channel get diff');
        $rootScope.$broadcast('stateSynchronized');
        channelState.syncLoading = false;
      }
    }, () => {
      channelState.syncLoading = false;
    });
  }
  
  public addChannelState(channelID: number, pts: number) {
    if(!pts) {
      throw new Error('Add channel state without pts ' + channelID);
    }
    if(!(channelID in this.channelStates)) {
      this.channelStates[channelID] = {
        pts: pts,
        pendingPtsUpdates: [],
        syncPending: false,
        syncLoading: false
      };
      return true;
    }
    return false;
  }
  
  public getChannelState(channelID: number, pts?: any) {
    if(this.channelStates[channelID] === undefined) {
      this.addChannelState(channelID, pts);
    }
    return this.channelStates[channelID];
  }

  public processUpdate(update: any, options: any = {}) {
    var channelID: any = false;
    switch(update._) {
      case 'updateNewChannelMessage':
      case 'updateEditChannelMessage':
        channelID = -appPeersManager.getPeerID(update.message.to_id);
        break;
      case 'updateDeleteChannelMessages':
        channelID = update.channel_id;
        break;
      case 'updateChannelTooLong':
        channelID = update.channel_id;
        if(!(channelID in this.channelStates)) {
          return false;
        }
        break;
    }
  
    var curState = channelID ? this.getChannelState(channelID, update.pts) : this.updatesState;
  
    // console.log(dT(), 'process', channelID, curState.pts, update)
  
    if(curState.syncLoading) {
      return false;
    }
  
    if(update._ == 'updateChannelTooLong') {
      if(!curState.lastPtsUpdateTime ||
          curState.lastPtsUpdateTime < tsNow() - 10000) {
        // console.trace(dT(), 'channel too long, get diff', channelID, update)
        this.getChannelDifference(channelID);
      }
      return false;
    }
  
    if(update._ == 'updateNewMessage' ||
        update._ == 'updateEditMessage' ||
        update._ == 'updateNewChannelMessage' ||
        update._ == 'updateEditChannelMessage') {
      var message = update.message;
      var toPeerID = appPeersManager.getPeerID(message.to_id);
      var fwdHeader = message.fwd_from || {};
      var reason: any = false;
      if(message.from_id && !appUsersManager.hasUser(message.from_id, message.pFlags.post/* || channelID*/) && (reason = 'author') ||
          fwdHeader.from_id && !appUsersManager.hasUser(fwdHeader.from_id, !!fwdHeader.channel_id) && (reason = 'fwdAuthor') ||
          fwdHeader.channel_id && !appChatsManager.hasChat(fwdHeader.channel_id, true) && (reason = 'fwdChannel') ||
          toPeerID > 0 && !appUsersManager.hasUser(toPeerID) && (reason = 'toPeer User') ||
          toPeerID < 0 && !appChatsManager.hasChat(-toPeerID) && (reason = 'toPeer Chat')) {
        console.warn(dT(), 'Not enough data for message update', toPeerID, reason, message)
        if(channelID && appChatsManager.hasChat(channelID)) {
          this.getChannelDifference(channelID);
        } else {
          this.forceGetDifference();
        }
        return false;
      }
    } else if(channelID && !appChatsManager.hasChat(channelID)) {
      // console.log(dT(), 'skip update, missing channel', channelID, update)
      return false;
    }
  
    var popPts;
    var popSeq;
  
    if(update.pts) {
      var newPts = curState.pts + (update.pts_count || 0);
      if(newPts < update.pts) {
        console.warn(dT(), 'Pts hole', curState, update, channelID && appChatsManager.getChat(channelID));
        curState.pendingPtsUpdates.push(update);
        if(!curState.syncPending) {
          curState.syncPending = {
            timeout: setTimeout(() => {
              if(channelID) {
                this.getChannelDifference(channelID);
              } else {
                this.getDifference();
              }
            }, 5000)
          }
        }

        curState.syncPending.ptsAwaiting = true;
        return false;
      }

      if(update.pts > curState.pts) {
        curState.pts = update.pts;
        popPts = true;
  
        curState.lastPtsUpdateTime = tsNow();
      } else if(update.pts_count) {
        // console.warn(dT(), 'Duplicate update', update)
        return false;
      }

      if(channelID && options.date && this.updatesState.date < options.date) {
        this.updatesState.date = options.date;
      }
    } else if (!channelID && options.seq > 0) {
      var seq = options.seq;
      var seqStart = options.seqStart || seq;
  
      if(seqStart != curState.seq + 1) {
        if(seqStart > curState.seq) {
          console.warn(dT(), 'Seq hole', curState, curState.syncPending && curState.syncPending.seqAwaiting);
  
          if(curState.pendingSeqUpdates[seqStart] === undefined) {
            curState.pendingSeqUpdates[seqStart] = {seq: seq, date: options.date, updates: []};
          }
          curState.pendingSeqUpdates[seqStart].updates.push(update);
  
          if(!curState.syncPending) {
            curState.syncPending = {
              timeout: setTimeout(() => {
                this.getDifference();
              }, 5000)
            }
          }

          if(!curState.syncPending.seqAwaiting ||
            curState.syncPending.seqAwaiting < seqStart) {
            curState.syncPending.seqAwaiting = seqStart;
          }
          return false;
        }
      }
  
      if(curState.seq != seq) {
        curState.seq = seq;
        if(options.date && curState.date < options.date) {
          curState.date = options.date;
        }

        popSeq = true;
      }
    }
  
    this.saveUpdate(update);
  
    if(popPts) {
      this.popPendingPtsUpdate(channelID);
    } else if(popSeq) {
      this.popPendingSeqUpdate();
    }
  }

  public saveUpdate(update: any) {
    $rootScope.$broadcast('apiUpdate', update);
  }
  
  public attach() {
    apiManager.setUpdatesProcessor(this.processUpdateMessage.bind(this));
    apiManager.invokeApi('updates.getState', {}, {noErrorBox: true}).then((stateResult: any) => {
      this.updatesState.seq = stateResult.seq;
      this.updatesState.pts = stateResult.pts;
      this.updatesState.date = stateResult.date;
      setTimeout(() => {
        this.updatesState.syncLoading = false;
      }, 1000);
  
    // updatesState.seq = 1
    // updatesState.pts = stateResult.pts - 5000
    // updatesState.date = 1
    // getDifference()
    });
  }
}

export default new ApiUpdatesManager();
