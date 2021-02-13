//import apiManager from '../mtproto/apiManager';
import { MOUNT_CLASS_TO } from '../../config/debug';
import { logger, LogLevels } from '../logger';
import apiManager from '../mtproto/mtprotoworker';
import rootScope from '../rootScope';
//import networkerFactory from '../mtproto/networkerFactory';
import appChatsManager from "./appChatsManager";
import appPeersManager from "./appPeersManager";
import appStateManager from './appStateManager';
import appUsersManager from "./appUsersManager";

type UpdatesState = {
  pendingPtsUpdates: any[],
  pendingSeqUpdates?: any,
  syncPending: {
    seqAwaiting?: number,
    ptsAwaiting?: true,
    timeout: number
  },
  syncLoading: boolean,

  seq?: number,
  pts?: number,
  date?: number,
  lastPtsUpdateTime?: number
};

const SYNC_DELAY = 25;

export class ApiUpdatesManager {
  public updatesState: UpdatesState = {
    pendingPtsUpdates: [],
    pendingSeqUpdates: {},
    syncPending: null,
    syncLoading: true
  };

  public channelStates: {[channelId: number]: UpdatesState} = {};
  private attached = false;

  private log = logger('UPDATES', LogLevels.error/*  | LogLevels.log */);

  constructor() {
    // * false for test purposes
    /* false &&  */appStateManager.addListener('save', async() => {
      const us = this.updatesState;
      appStateManager.pushToState('updates', {
        seq: us.seq,
        pts: us.pts,
        date: us.date
      });
    });
  }
 
  public popPendingSeqUpdate() {
    const nextSeq = this.updatesState.seq + 1;
    const pendingUpdatesData = this.updatesState.pendingSeqUpdates[nextSeq];
    if(!pendingUpdatesData) {
      return false;
    }

    const updates = pendingUpdatesData.updates;
    for(let i = 0, length = updates.length; i < length; i++) {
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
        clearTimeout(this.updatesState.syncPending.timeout);
        this.updatesState.syncPending = null;
      } else {
        delete this.updatesState.syncPending.seqAwaiting;
      }
    }
  
    return true;
  }

  public popPendingPtsUpdate(channelId: number) {
    const curState = channelId ? this.getChannelState(channelId) : this.updatesState;
    if(!curState.pendingPtsUpdates.length) {
      return false;
    }
    curState.pendingPtsUpdates.sort((a: any, b: any) => {
      return a.pts - b.pts;
    });
    // this.log('pop update', channelId, curState.pendingPtsUpdates)
  
    let curPts = curState.pts;
    let goodPts = 0;
    let goodIndex = 0;
    for(let i = 0, length = curState.pendingPtsUpdates.length; i < length; i++) {
      const update = curState.pendingPtsUpdates[i];
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
    for(let i = 0; i <= goodIndex; i++) {
      const update = curState.pendingPtsUpdates[i];
      this.saveUpdate(update);
    }
    curState.pendingPtsUpdates.splice(0, goodIndex + 1);
  
    if(!curState.pendingPtsUpdates.length && curState.syncPending) {
      if(!curState.syncPending.seqAwaiting) {
        clearTimeout(curState.syncPending.timeout);
        curState.syncPending = null;
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

  processUpdateMessage = (updateMessage: any, options: Partial<{
    ignoreSyncLoading: boolean
  }> = {}) => {
    // return forceGetDifference()
    const processOpts = {
      date: updateMessage.date,
      seq: updateMessage.seq,
      seqStart: updateMessage.seq_start,
      ignoreSyncLoading: options.ignoreSyncLoading
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
        const fromId = updateMessage.from_id || (isOut ? rootScope.myId : updateMessage.user_id);
        const toId = updateMessage.chat_id
          ? -updateMessage.chat_id
          : (updateMessage.user_id || rootScope.myId);
  
        this.processUpdate({
          _: 'updateNewMessage',
          message: {
            _: 'message',
            pFlags: updateMessage.pFlags,
            id: updateMessage.id,
            from_id: appPeersManager.getOutputPeer(fromId),
            peer_id: appPeersManager.getOutputPeer(toId),
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
  
  public getDifference(first = false) {
    // this.trace('Get full diff')
    const updatesState = this.updatesState;
    if(!updatesState.syncLoading) {
      updatesState.syncLoading = true;
      updatesState.pendingSeqUpdates = {};
      updatesState.pendingPtsUpdates = [];
      rootScope.broadcast('state_synchronizing');
    }
  
    if(updatesState.syncPending) {
      clearTimeout(updatesState.syncPending.timeout);
      updatesState.syncPending = null;
    }
  
    return apiManager.invokeApi('updates.getDifference', {
      pts: updatesState.pts, 
      date: updatesState.date, 
      qts: -1
    }, {
      timeout: 0x7fffffff
    }).then((differenceResult) => {
      this.log('Get diff result', differenceResult);

      if(differenceResult._ === 'updates.differenceEmpty') {
        this.log('apply empty diff', differenceResult.seq);
        updatesState.date = differenceResult.date;
        updatesState.seq = differenceResult.seq;
        updatesState.syncLoading = false;
        rootScope.broadcast('state_synchronized');
        return false;
      }

      // ! SORRY I'M SORRY I'M SORRY
      if(first) {
        rootScope.broadcast('state_synchronizing');
      }

      if(differenceResult._ !== 'updates.differenceTooLong') {
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

        const nextState = differenceResult._ === 'updates.difference' ? differenceResult.state : differenceResult.intermediate_state;
        updatesState.seq = nextState.seq;
        updatesState.pts = nextState.pts;
        updatesState.date = nextState.date;
      } else {
        updatesState.pts = differenceResult.pts;
        delete updatesState.seq;
        delete updatesState.date;
      }
  
      // this.log('apply diff', updatesState.seq, updatesState.pts)
  
      if(differenceResult._ === 'updates.differenceSlice') {
        this.getDifference();
      } else {
        // this.log('finished get diff')
        rootScope.broadcast('state_synchronized');
        updatesState.syncLoading = false;
      }
    }, () => {
      updatesState.syncLoading = false;
    });
  }

  public getChannelDifference(channelId: number) {
    const channelState = this.getChannelState(channelId);
    if(!channelState.syncLoading) {
      channelState.syncLoading = true;
      channelState.pendingPtsUpdates = [];
      rootScope.broadcast('state_synchronizing', channelId);
    }

    if(channelState.syncPending) {
      clearTimeout(channelState.syncPending.timeout);
      channelState.syncPending = null;
    }

    //this.log.trace('Get channel diff', appChatsManager.getChat(channelId), channelState.pts);
    apiManager.invokeApi('updates.getChannelDifference', {
      channel: appChatsManager.getChannelInput(channelId),
      filter: {_: 'channelMessagesFilterEmpty'},
      pts: channelState.pts,
      limit: 30
    }, {timeout: 0x7fffffff}).then((differenceResult) => {
      this.log('Get channel diff result', differenceResult)
      channelState.pts = 'pts' in differenceResult ? differenceResult.pts : undefined;
  
      if(differenceResult._ === 'updates.channelDifferenceEmpty') {
        this.log('apply channel empty diff', differenceResult);
        channelState.syncLoading = false;
        rootScope.broadcast('state_synchronized', channelId);
        return false;
      }
  
      if(differenceResult._ === 'updates.channelDifferenceTooLong') {
        this.log('channel diff too long', differenceResult);
        channelState.syncLoading = false;
        delete this.channelStates[channelId];
        this.saveUpdate({_: 'updateChannelReload', channel_id: channelId});
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
  
      if(differenceResult._ === 'updates.channelDifference' &&
        !differenceResult.pFlags['final']) {
        this.getChannelDifference(channelId);
      } else {
        this.log('finished channel get diff');
        rootScope.broadcast('state_synchronized', channelId);
        channelState.syncLoading = false;
      }
    }, () => {
      channelState.syncLoading = false;
    });
  }
  
  public addChannelState(channelId: number, pts: number) {
    if(!pts) {
      throw new Error('Add channel state without pts ' + channelId);
    }

    if(!(channelId in this.channelStates)) {
      this.channelStates[channelId] = {
        pts,
        pendingPtsUpdates: [],
        syncPending: null,
        syncLoading: false
      };

      return true;
    }

    return false;
  }
  
  public getChannelState(channelId: number, pts?: number) {
    if(this.channelStates[channelId] === undefined) {
      this.addChannelState(channelId, pts);
    }

    return this.channelStates[channelId];
  }

  public processUpdate(update: any, options: Partial<{
    date: number,
    seq: number,
    seqStart: number,
    ignoreSyncLoading: boolean
  }> = {}) {
    let channelId = 0;
    switch(update._) {
      case 'updateNewChannelMessage':
      case 'updateEditChannelMessage':
        channelId = -appPeersManager.getPeerId(update.message.peer_id);
        break;
      case 'updateDeleteChannelMessages':
        channelId = update.channel_id;
        break;
      case 'updateChannelTooLong':
        channelId = update.channel_id;
        if(!(channelId in this.channelStates)) {
          return false;
        }
        break;
    }
  
    const curState = channelId ? this.getChannelState(channelId, update.pts) : this.updatesState;
  
    // this.log.log('process', channelId, curState.pts, update)
  
    if(curState.syncLoading && !options.ignoreSyncLoading) {
      return false;
    }
  
    if(update._ === 'updateChannelTooLong') {
      if(!curState.lastPtsUpdateTime ||
          curState.lastPtsUpdateTime < Date.now() - 10000) {
        // this.log.trace('channel too long, get diff', channelId, update)
        this.getChannelDifference(channelId);
      }
      return false;
    }
  
    if(update._ === 'updateNewMessage' ||
        update._ === 'updateEditMessage' ||
        update._ === 'updateNewChannelMessage' ||
        update._ === 'updateEditChannelMessage') {
      const message = update.message;
      const toPeerId = appPeersManager.getPeerId(message.peer_id);
      const fwdHeader = message.fwd_from || {};
      let reason: any = false;
      if(message.from_id && !appUsersManager.hasUser(appPeersManager.getPeerId(message.from_id), message.pFlags.post/* || channelId*/) && (reason = 'author') ||
          fwdHeader.from_id && !appUsersManager.hasUser(appPeersManager.getPeerId(fwdHeader.from_id), !!fwdHeader.channel_id) && (reason = 'fwdAuthor') ||
          fwdHeader.channel_id && !appChatsManager.hasChat(fwdHeader.channel_id, true) && (reason = 'fwdChannel') ||
          toPeerId > 0 && !appUsersManager.hasUser(toPeerId) && (reason = 'toPeer User') ||
          toPeerId < 0 && !appChatsManager.hasChat(-toPeerId) && (reason = 'toPeer Chat')) {
        this.log.warn('Not enough data for message update', toPeerId, reason, message)
        if(channelId && appChatsManager.hasChat(channelId)) {
          this.getChannelDifference(channelId);
        } else {
          this.forceGetDifference();
        }
        return false;
      }
    } else if(channelId && !appChatsManager.hasChat(channelId)) {
      // this.log.log('skip update, missing channel', channelId, update)
      return false;
    }
  
    let popPts: boolean;
    let popSeq: boolean;
  
    if(update.pts) {
      const newPts = curState.pts + (update.pts_count || 0);
      if(newPts < update.pts) {
        this.log.warn('Pts hole', curState, update, channelId && appChatsManager.getChat(channelId));
        curState.pendingPtsUpdates.push(update);
        if(!curState.syncPending) {
          curState.syncPending = {
            timeout: window.setTimeout(() => {
              if(channelId) {
                this.getChannelDifference(channelId);
              } else {
                this.getDifference();
              }
            }, SYNC_DELAY)
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

      if(channelId && options.date && this.updatesState.date < options.date) {
        this.updatesState.date = options.date;
      }
    } else if(!channelId && options.seq > 0) {
      const seq = options.seq;
      const seqStart = options.seqStart || seq;
  
      if(seqStart !== curState.seq + 1) {
        if(seqStart > curState.seq) {
          this.log.warn('Seq hole', curState, curState.syncPending && curState.syncPending.seqAwaiting);
  
          if(curState.pendingSeqUpdates[seqStart] === undefined) {
            curState.pendingSeqUpdates[seqStart] = {seq, date: options.date, updates: []};
          }
          curState.pendingSeqUpdates[seqStart].updates.push(update);
  
          if(!curState.syncPending) {
            curState.syncPending = {
              timeout: window.setTimeout(() => {
                this.getDifference();
              }, SYNC_DELAY)
            }
          }

          if(!curState.syncPending.seqAwaiting ||
            curState.syncPending.seqAwaiting < seqStart) {
            curState.syncPending.seqAwaiting = seqStart;
          }
          return false;
        }
      }
  
      if(curState.seq !== seq) {
        curState.seq = seq;
        if(options.date && curState.date < options.date) {
          curState.date = options.date;
        }

        popSeq = true;
      }
    }
  
    this.saveUpdate(update);
  
    if(popPts) {
      this.popPendingPtsUpdate(channelId);
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

      //rootScope.broadcast('state_synchronizing');
      if(!state || !state.pts || !state.date || !state.seq) {
        apiManager.invokeApi('updates.getState', {}, {noErrorBox: true}).then((stateResult) => {
          this.updatesState.seq = stateResult.seq;
          this.updatesState.pts = stateResult.pts;
          this.updatesState.date = stateResult.date;
          //setTimeout(() => {
            this.updatesState.syncLoading = false;
            //rootScope.broadcast('state_synchronized');
          //}, 1000);
      
        // ! for testing
        // updatesState.seq = 1
        // updatesState.pts = stateResult.pts - 5000
        // updatesState.date = 1
        // getDifference()
        });
      } else {
        // ! for testing
        /* state.seq = 1;
        state.pts = state.pts - 1000;
        state.date = 1; */

        Object.assign(this.updatesState, state);
        
        this.getDifference(true)/* .finally(() => {
          if(this.updatesState.syncLoading) {
            rootScope.broadcast('state_synchronizing');
          }
        }) */;
      }
    });
  }
}

const apiUpdatesManager = new ApiUpdatesManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.apiUpdatesManager = apiUpdatesManager);
export default apiUpdatesManager
