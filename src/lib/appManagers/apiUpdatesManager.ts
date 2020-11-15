//import apiManager from '../mtproto/apiManager';
import { logger, LogLevels } from '../logger';
import apiManager from '../mtproto/mtprotoworker';
import { MOUNT_CLASS_TO } from '../mtproto/mtproto_config';
import rootScope from '../rootScope';
//import networkerFactory from '../mtproto/networkerFactory';
import appChatsManager from "./appChatsManager";
import appPeersManager from "./appPeersManager";
import appStateManager from './appStateManager';
import appUsersManager from "./appUsersManager";

export class ApiUpdatesManager {
  public updatesState: {
    pendingPtsUpdates: any[],
    pendingSeqUpdates: any,
    syncPending: any,
    syncLoading: any,

    seq?: number,
    pts?: number,
    date?: number
  } = {
    pendingPtsUpdates: [],
    pendingSeqUpdates: {},
    syncPending: false,
    syncLoading: true
  };

  public channelStates: any = {};
  private attached = false;

  private log = logger('UPDATES', LogLevels.error);

  constructor() {
    appStateManager.addListener('save', () => {
      const us = this.updatesState;
      appStateManager.pushToState('updates', {
        seq: us.seq,
        pts: us.pts,
        date: us.date
      });
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

  public popPendingPtsUpdate(channelID: number) {
    var curState = channelID ? this.getChannelState(channelID) : this.updatesState;
    if(!curState.pendingPtsUpdates.length) {
      return false;
    }
    curState.pendingPtsUpdates.sort((a: any, b: any) => {
      return a.pts - b.pts;
    });
    // this.log('pop update', channelID, curState.pendingPtsUpdates)
  
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
  
    this.log('pop pending pts updates', goodPts, curState.pendingPtsUpdates.slice(0, goodIndex + 1));
  
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

  processUpdateMessage = (updateMessage: any) => {
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
      case 'updateShortChatMessage': {
        this.log('updateShortMessage | updateShortChatMessage', {...updateMessage});
        const isOut = updateMessage.pFlags.out;
        const fromID = updateMessage.from_id || (isOut ? rootScope.myID : updateMessage.user_id);
        const toID = updateMessage.chat_id
          ? -updateMessage.chat_id
          : (updateMessage.user_id || rootScope.myID);
  
        this.processUpdate({
          _: 'updateNewMessage',
          message: {
            _: 'message',
            pFlags: updateMessage.pFlags,
            id: updateMessage.id,
            from_id: appPeersManager.getOutputPeer(fromID),
            peer_id: appPeersManager.getOutputPeer(toID),
            date: updateMessage.date,
            message: updateMessage.message,
            fwd_from: updateMessage.fwd_from,
            reply_to: updateMessage.reply_to,
            entities: updateMessage.entities
          },
          pts: updateMessage.pts,
          pts_count: updateMessage.pts_count
        }, processOpts);
        break;
      }
  
      case 'updatesCombined':
      case 'updates':
        appUsersManager.saveApiUsers(updateMessage.users);
        appChatsManager.saveApiChats(updateMessage.chats);
  
        updateMessage.updates.forEach((update: any) => {
          this.processUpdate(update, processOpts);
        });
        break;
  
      default:
        this.log.warn('Unknown update message', updateMessage);
    }
  };
  
  public getDifference() {
    // this.trace('Get full diff')
    const updatesState = this.updatesState;
    if(!updatesState.syncLoading) {
      updatesState.syncLoading = true;
      updatesState.pendingSeqUpdates = {};
      updatesState.pendingPtsUpdates = [];
    }
  
    if(updatesState.syncPending) {
      clearTimeout(updatesState.syncPending.timeout);
      updatesState.syncPending = false;
    }
  
    return apiManager.invokeApi('updates.getDifference', {
      pts: updatesState.pts, 
      date: updatesState.date, 
      qts: -1
    }, {
      timeout: 0x7fffffff
    }).then((differenceResult) => {
      if(differenceResult._ == 'updates.differenceEmpty') {
        this.log('apply empty diff', differenceResult.seq);
        updatesState.date = differenceResult.date;
        updatesState.seq = differenceResult.seq;
        updatesState.syncLoading = false;
        rootScope.broadcast('stateSynchronized');
        return false;
      }

      if(differenceResult._ != 'updates.differenceTooLong') {
        appUsersManager.saveApiUsers(differenceResult.users);
        appChatsManager.saveApiChats(differenceResult.chats);

        // Should be first because of updateMessageID
        // this.log('applying', differenceResult.other_updates.length, 'other updates')
    
        differenceResult.other_updates.forEach((update) => {
          switch(update._) {
            case 'updateChannelTooLong':
            case 'updateNewChannelMessage':
            case 'updateEditChannelMessage':
              this.processUpdate(update);
              return;
          }
          
          this.saveUpdate(update);
        });

        // this.log('applying', differenceResult.new_messages.length, 'new messages')
        differenceResult.new_messages.forEach((apiMessage) => {
          this.saveUpdate({
            _: 'updateNewMessage',
            message: apiMessage,
            pts: updatesState.pts,
            pts_count: 0
          });
        });

        const nextState = differenceResult._ == 'updates.difference' ? differenceResult.state : differenceResult.intermediate_state;
        updatesState.seq = nextState.seq;
        updatesState.pts = nextState.pts;
        updatesState.date = nextState.date;
      } else {
        updatesState.pts = differenceResult.pts;
        delete updatesState.seq;
        delete updatesState.date;
      }
  
      // this.log('apply diff', updatesState.seq, updatesState.pts)
  
      if(differenceResult._ == 'updates.differenceSlice') {
        this.getDifference();
      } else {
        // this.log('finished get diff')
        rootScope.broadcast('stateSynchronized');
        updatesState.syncLoading = false;
      }
    }, () => {
      updatesState.syncLoading = false;
    });
  }

  public getChannelDifference(channelID: number) {
    const channelState = this.getChannelState(channelID);
    if(!channelState.syncLoading) {
      channelState.syncLoading = true;
      channelState.pendingPtsUpdates = [];
    }

    if(channelState.syncPending) {
      clearTimeout(channelState.syncPending.timeout);
      channelState.syncPending = false;
    }

    // this.log('Get channel diff', appChatsManager.getChat(channelID), channelState.pts)
    apiManager.invokeApi('updates.getChannelDifference', {
      channel: appChatsManager.getChannelInput(channelID),
      filter: {_: 'channelMessagesFilterEmpty'},
      pts: channelState.pts,
      limit: 30
    }, {timeout: 0x7fffffff}).then((differenceResult) => {
      // this.log('channel diff result', differenceResult)
      channelState.pts = 'pts' in differenceResult ? differenceResult.pts : undefined;
  
      if(differenceResult._ == 'updates.channelDifferenceEmpty') {
        this.log('apply channel empty diff', differenceResult);
        channelState.syncLoading = false;
        rootScope.broadcast('stateSynchronized');
        return false;
      }
  
      if(differenceResult._ == 'updates.channelDifferenceTooLong') {
        this.log('channel diff too long', differenceResult);
        channelState.syncLoading = false;
        delete this.channelStates[channelID];
        this.saveUpdate({_: 'updateChannelReload', channel_id: channelID});
        return false;
      }
  
      appUsersManager.saveApiUsers(differenceResult.users);
      appChatsManager.saveApiChats(differenceResult.chats);
  
      // Should be first because of updateMessageID
      this.log('applying', differenceResult.other_updates.length, 'channel other updates');
      differenceResult.other_updates.forEach((update) => {
        this.saveUpdate(update);
      });
  
      this.log('applying', differenceResult.new_messages.length, 'channel new messages');
      differenceResult.new_messages.forEach((apiMessage) => {
        this.saveUpdate({
          _: 'updateNewChannelMessage',
          message: apiMessage,
          pts: channelState.pts,
          pts_count: 0
        });
      });
  
      this.log('apply channel diff', channelState.pts);
  
      if(differenceResult._ == 'updates.channelDifference' &&
        !differenceResult.pFlags['final']) {
        this.getChannelDifference(channelID);
      } else {
        this.log('finished channel get diff');
        rootScope.broadcast('stateSynchronized');
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
        channelID = -appPeersManager.getPeerID(update.message.peer_id);
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
  
    // this.log.log('process', channelID, curState.pts, update)
  
    if(curState.syncLoading) {
      return false;
    }
  
    if(update._ == 'updateChannelTooLong') {
      if(!curState.lastPtsUpdateTime ||
          curState.lastPtsUpdateTime < Date.now() - 10000) {
        // this.log.trace('channel too long, get diff', channelID, update)
        this.getChannelDifference(channelID);
      }
      return false;
    }
  
    if(update._ == 'updateNewMessage' ||
        update._ == 'updateEditMessage' ||
        update._ == 'updateNewChannelMessage' ||
        update._ == 'updateEditChannelMessage') {
      var message = update.message;
      var toPeerID = appPeersManager.getPeerID(message.peer_id);
      var fwdHeader = message.fwd_from || {};
      var reason: any = false;
      if(message.from_id && !appUsersManager.hasUser(appPeersManager.getPeerID(message.from_id), message.pFlags.post/* || channelID*/) && (reason = 'author') ||
          fwdHeader.from_id && !appUsersManager.hasUser(appPeersManager.getPeerID(fwdHeader.from_id), !!fwdHeader.channel_id) && (reason = 'fwdAuthor') ||
          fwdHeader.channel_id && !appChatsManager.hasChat(fwdHeader.channel_id, true) && (reason = 'fwdChannel') ||
          toPeerID > 0 && !appUsersManager.hasUser(toPeerID) && (reason = 'toPeer User') ||
          toPeerID < 0 && !appChatsManager.hasChat(-toPeerID) && (reason = 'toPeer Chat')) {
        this.log.warn('Not enough data for message update', toPeerID, reason, message)
        if(channelID && appChatsManager.hasChat(channelID)) {
          this.getChannelDifference(channelID);
        } else {
          this.forceGetDifference();
        }
        return false;
      }
    } else if(channelID && !appChatsManager.hasChat(channelID)) {
      // this.log.log('skip update, missing channel', channelID, update)
      return false;
    }
  
    var popPts;
    var popSeq;
  
    if(update.pts) {
      var newPts = curState.pts + (update.pts_count || 0);
      if(newPts < update.pts) {
        this.log.warn('Pts hole', curState, update, channelID && appChatsManager.getChat(channelID));
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
  
        curState.lastPtsUpdateTime = Date.now();
      } else if(update.pts_count) {
        // this.log.warn('Duplicate update', update)
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
          this.log.warn('Seq hole', curState, curState.syncPending && curState.syncPending.seqAwaiting);
  
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
    rootScope.broadcast('apiUpdate', update);
  }
  
  public attach() {
    if(this.attached) return;

    //return;
    
    this.attached = true;

    appStateManager.getState().then(_state => {
      const state = _state.updates;

      apiManager.setUpdatesProcessor(this.processUpdateMessage);

      if(!state || !state.pts || !state.date || !state.seq) {
        apiManager.invokeApi('updates.getState', {}, {noErrorBox: true}).then((stateResult) => {
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
      } else {
        Object.assign(this.updatesState, state);
        this.getDifference();
      }
    });
  }
}

const apiUpdatesManager = new ApiUpdatesManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.apiUpdatesManager = apiUpdatesManager);
export default apiUpdatesManager
