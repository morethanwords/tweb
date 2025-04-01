/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import DEBUG from '../../config/debug';
import {ConstructorDeclMap, Message, MessageEntity, MessageFwdHeader, Peer, Update, Updates} from '../../layer';
import {logger, LogTypes} from '../logger';
import assumeType from '../../helpers/assumeType';
import App from '../../config/app';
import filterUnique from '../../helpers/array/filterUnique';
import {AppManager} from './manager';
import parseMarkdown from '../richTextProcessor/parseMarkdown';
import ctx from '../../environment/ctx';
import EventListenerBase from '../../helpers/eventListenerBase';
import applyMixins from '../../helpers/applyMixins';
import tsNow from '../../helpers/tsNow';
import formatStarsAmount from './utils/payments/formatStarsAmount';
import debounce from '../../helpers/schedulers/debounce';

type UpdatesState = {
  pendingPtsUpdates: (Update & {pts: number, pts_count: number})[],
  pendingSeqUpdates?: {[seq: number]: {seq: number, date: number, updates: any[]}},
  syncPending: {
    seqAwaiting?: number,
    ptsAwaiting?: boolean,
    timeout: number
  },
  syncLoading: Promise<void>,

  seq?: number,
  pts?: number,
  date?: number,
  lastPtsUpdateTime?: number,
  lastDifferenceTime?: number
};

const SYNC_DELAY = 6;

class ApiUpdatesManager {
  public updatesState: UpdatesState = {
    pendingPtsUpdates: [],
    pendingSeqUpdates: {},
    syncPending: null,
    syncLoading: null
  };

  private channelStates: {[channelId: ChatId]: UpdatesState} = {};
  private attached = false;

  private log = logger('UPDATES', LogTypes.Error | LogTypes.Warn | LogTypes.Log/*  | LogTypes.Debug */);
  private debug = DEBUG;

  private subscriptions: {[channelId: ChatId]: {count: number, interval?: number}} = {};

  constructor() {
    this._constructor(false);
  }

  private setProxy() {
    const self = this;
    this.updatesState = new Proxy(this.updatesState, {
      set: function(target: ApiUpdatesManager['updatesState'], key: keyof ApiUpdatesManager['updatesState'], value: ApiUpdatesManager['updatesState'][typeof key]) {
        // @ts-ignore
        target[key] = value;
        self.saveUpdatesState();
        return true;
      }
    });
  }

  public saveUpdatesState() {
    const us = this.updatesState;
    this.appStateManager.pushToState('updates', {
      seq: us.seq,
      pts: us.pts,
      date: us.date
    });
  }

  private popPendingSeqUpdate() {
    const state = this.updatesState;
    const nextSeq = state.seq + 1;
    const pendingUpdatesData = state.pendingSeqUpdates[nextSeq];
    if(!pendingUpdatesData) {
      return false;
    }

    const updates = pendingUpdatesData.updates;
    for(let i = 0, length = updates.length; i < length; ++i) {
      this.saveUpdate(updates[i]);
    }

    state.seq = pendingUpdatesData.seq;
    if(pendingUpdatesData.date && state.date < pendingUpdatesData.date) {
      state.date = pendingUpdatesData.date;
    }
    delete state.pendingSeqUpdates[nextSeq];

    if(!this.popPendingSeqUpdate() &&
      state.syncPending?.seqAwaiting &&
      state.seq >= state.syncPending.seqAwaiting) {
      if(!state.syncPending.ptsAwaiting) {
        this.clearStatePendingSync(state);
      } else {
        delete state.syncPending.seqAwaiting;
      }
    }

    return true;
  }

  private popPendingPtsUpdate(channelId: ChatId) {
    const curState = channelId ? this.getChannelState(channelId) : this.updatesState;
    if(!curState.pendingPtsUpdates.length) {
      return false;
    }

    curState.pendingPtsUpdates.sort((a, b) => {
      return a.pts - b.pts;
    });
    // this.log('pop update', channelId, curState.pendingPtsUpdates)

    let curPts = curState.pts;
    let goodPts = 0;
    let goodIndex = 0;
    for(let i = 0, length = curState.pendingPtsUpdates.length; i < length; ++i) {
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

    this.log.debug('pop pending pts updates', goodPts, curState.pendingPtsUpdates.slice(0, goodIndex + 1));

    curState.pts = goodPts;
    for(let i = 0; i <= goodIndex; ++i) {
      const update = curState.pendingPtsUpdates[i];

      // @ts-ignore
      this.saveUpdate(update);
    }
    curState.pendingPtsUpdates.splice(0, goodIndex + 1);

    if(!curState.pendingPtsUpdates.length && curState.syncPending) {
      if(!curState.syncPending.seqAwaiting) {
        this.clearStatePendingSync(curState);
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

  public processLocalUpdate(update: Update) {
    this.processUpdateMessage({
      _: 'updateShort',
      update
    } as Updates, {
      local: true,
      ignoreSyncLoading: true
    });
  }

  public processUpdateMessage = (updateMessage: any, options: Partial<{
    override: boolean,
    ignoreSyncLoading: boolean,
    local: boolean
  }> = {}) => {
    const log = this.log.bindPrefix('processUpdateMessage');
    // return forceGetDifference()
    const processOpts = {
      date: updateMessage.date,
      seq: updateMessage.seq,
      seqStart: updateMessage.seq_start,
      ignoreSyncLoading: options.ignoreSyncLoading,
      local: options.local
    };

    log.debug('processUpdateMessage', updateMessage, options);

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
        assumeType<Updates.updateShortChatMessage | Updates.updateShortMessage>(updateMessage);
        log.debug('updateShortMessage | updateShortChatMessage', {...updateMessage});
        const isOut = updateMessage.pFlags.out;
        const fromId = (updateMessage as Updates.updateShortChatMessage).from_id || (isOut ? this.appPeersManager.peerId : (updateMessage as Updates.updateShortMessage).user_id);
        const toId = (updateMessage as Updates.updateShortChatMessage).chat_id ?
          (updateMessage as Updates.updateShortChatMessage).chat_id.toPeerId(true) :
          ((updateMessage as Updates.updateShortMessage).user_id.toPeerId(false) || this.appPeersManager.peerId);

        this.processUpdate({
          _: 'updateNewMessage',
          message: {
            _: 'message',
            pFlags: updateMessage.pFlags,
            id: updateMessage.id,
            from_id: this.appPeersManager.getOutputPeer(fromId.toPeerId()),
            peer_id: this.appPeersManager.getOutputPeer(toId),
            date: updateMessage.date,
            message: updateMessage.message,
            fwd_from: updateMessage.fwd_from,
            reply_to: updateMessage.reply_to,
            entities: updateMessage.entities,
            ttl_period: updateMessage.ttl_period
          },
          pts: updateMessage.pts,
          pts_count: updateMessage.pts_count
        }, processOpts);
        break;
      }

      case 'updatesCombined':
      case 'updates':
        this.appUsersManager.saveApiUsers(updateMessage.users, options.override);
        this.appChatsManager.saveApiChats(updateMessage.chats, options.override);

        updateMessage.updates.forEach((update: Update) => {
          this.processUpdate(update, processOpts);
        });
        break;

      default:
        log.warn('unknown update message', updateMessage);
    }
  };

  public processPaidMessageUpdate(options: {paidStars: number, wereStarsReserved: boolean}) {
    const starsStatus = this.appPaymentsManager.getCachedStarsStatus();

    if(options.paidStars && starsStatus) {
      const currentBalance = formatStarsAmount(starsStatus.balance);
      const newBalance = currentBalance - options.paidStars;

      this.appPaymentsManager.updateLocalStarsBalance(
        formatStarsAmount(newBalance),
        options.wereStarsReserved ? options.paidStars : undefined
      );

      this.debouncedUpdateStarsBalance();
    }
  }

  private debouncedUpdateStarsBalance = debounce(() => {
    const promise = this.appPaymentsManager.getStarsStatus(true);

    if(promise instanceof Promise) promise.then(newStarsStatus => {
      this.appPaymentsManager.updateLocalStarsBalance(newStarsStatus.balance);
    });
  }, 1_000, false, true);

  private getDifference(first = false): Promise<void> {
    const log = this.log.bindPrefix('getDifference');
    log('get', first);

    const updatesState = this.updatesState;
    const wasSyncing = updatesState.syncLoading;
    if(!wasSyncing) {
      updatesState.pendingSeqUpdates = {};
      updatesState.pendingPtsUpdates = [];
    }

    this.clearStatePendingSync(updatesState);

    const promise = this.apiManager.invokeApi('updates.getDifference', {
      pts: updatesState.pts,
      pts_total_limit: first /* && false  */? /* 50 */1200 : undefined,
      date: updatesState.date,
      qts: -1
    }, {
      timeout: 0x7fffffff
    }).then((differenceResult) => {
      log('result', differenceResult);

      if(differenceResult._ === 'updates.differenceEmpty') {
        log('apply empty diff', differenceResult.seq);
        updatesState.date = differenceResult.date;
        updatesState.seq = differenceResult.seq;
        return;
      }

      // ! SORRY I'M SORRY I'M SORRY
      if(first) {
        this.rootScope.dispatchEvent('state_synchronizing');
      }

      if(differenceResult._ !== 'updates.differenceTooLong') {
        this.appUsersManager.saveApiUsers(differenceResult.users);
        this.appChatsManager.saveApiChats(differenceResult.chats);

        // Should be first because of updateMessageID
        log('applying', differenceResult.other_updates.length, 'other updates');

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

        log('applying', differenceResult.new_messages.length, 'new messages');
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
        updatesState.date = tsNow(true) + this.timeManager.getServerTimeOffset();
        delete updatesState.seq;

        this.channelStates = {};

        log.warn('result type', differenceResult._);
        this.onDifferenceTooLong();
      }

      log('apply diff', updatesState.seq, updatesState.pts);

      if(differenceResult._ === 'updates.differenceSlice') {
        return this.getDifference();
      } else {
        log('finish');
      }
    });

    if(!wasSyncing) {
      this.setDifferencePromise(updatesState, promise);
    }

    return promise;
  }

  private clearStatePendingSync(state: UpdatesState) {
    if(state.syncPending) {
      clearTimeout(state.syncPending.timeout);
      state.syncPending = null;
    }
  }

  private getChannelDifference(channelId: ChatId): Promise<void> {
    const channelState = this.getChannelState(channelId);
    const wasSyncing = channelState.syncLoading;
    if(!wasSyncing) {
      channelState.pendingPtsUpdates = [];
    }

    const log = this.log.bindPrefix('getChannelDifference-' + channelId);

    this.clearStatePendingSync(channelState);

    log('get', channelState.pts);
    const promise = this.apiManager.invokeApi('updates.getChannelDifference', {
      channel: this.appChatsManager.getChannelInput(channelId),
      filter: {_: 'channelMessagesFilterEmpty'},
      pts: channelState.pts,
      limit: 1000
    }, {timeout: 0x7fffffff}).then((differenceResult) => {
      log('diff result', differenceResult)
      channelState.pts = 'pts' in differenceResult ? differenceResult.pts : undefined;
      channelState.lastDifferenceTime = Date.now();

      if(differenceResult._ === 'updates.channelDifferenceEmpty') {
        log('apply channel empty diff', differenceResult);
        return;
      }

      if(differenceResult._ === 'updates.channelDifferenceTooLong') {
        log('channel diff too long', differenceResult);
        delete this.channelStates[channelId];

        this.saveUpdate({_: 'updateChannelReload', channel_id: channelId});
        return;
      }

      this.appUsersManager.saveApiUsers(differenceResult.users);
      this.appChatsManager.saveApiChats(differenceResult.chats);

      // Should be first because of updateMessageID
      log('applying', differenceResult.other_updates.length, 'channel other updates');
      differenceResult.other_updates.forEach((update) => {
        this.saveUpdate(update);
      });

      log('applying', differenceResult.new_messages.length, 'channel new messages');
      differenceResult.new_messages.forEach((apiMessage) => {
        this.saveUpdate({
          _: 'updateNewChannelMessage',
          message: apiMessage,
          pts: channelState.pts,
          pts_count: 0
        });
      });

      log('apply channel diff', channelState.pts);

      if(differenceResult._ === 'updates.channelDifference' &&
        !differenceResult.pFlags.final) {
        return this.getChannelDifference(channelId);
      } else {
        log('finished channel get diff');
      }
    });

    if(!wasSyncing) {
      this.setDifferencePromise(channelState, promise, channelId);
    }

    return promise;
  }

  private onDifferenceTooLong() {
    for(const i in this) {
      const value = this[i];
      if(value instanceof AppManager) {
        value.clear?.();
      }
    }

    this.rootScope.dispatchEvent('state_cleared');
  }

  private setDifferencePromise(state: UpdatesState, promise: UpdatesState['syncLoading'], channelId?: ChatId) {
    state.syncLoading = promise;
    !channelId && this.rootScope.dispatchEvent('state_synchronizing');

    promise.then(() => {
      state.syncLoading = null;
      !channelId && this.rootScope.dispatchEvent('state_synchronized');
    }, () => {
      state.syncLoading = null;
    });
  }

  public addChannelState(channelId: ChatId, pts: number) {
    if(!pts) {
      throw new Error('Add channel state without pts ' + channelId);
    }

    return this.channelStates[channelId] ??= {
      pts,
      pendingPtsUpdates: [],
      syncPending: null,
      syncLoading: null
    };
  }

  public getChannelState(channelId: ChatId, pts?: number) {
    if(this.channelStates[channelId] === undefined) {
      this.addChannelState(channelId, pts);
    }

    return this.channelStates[channelId];
  }

  private processUpdate(update: Update, options: Partial<{
    date: number,
    seq: number,
    seqStart: number
  }> & Parameters<ApiUpdatesManager['processUpdateMessage']>[1] = {}) {
    let channelId: ChatId;
    switch(update._) {
      case 'updateNewChannelMessage':
      case 'updateEditChannelMessage':
        channelId = this.appPeersManager.getPeerId(update.message.peer_id).toChatId();
        break;
      /* case 'updateDeleteChannelMessages':
        channelId = update.channel_id;
        break; */
      case 'updateChannelTooLong':
        channelId = update.channel_id;
        if(!(channelId in this.channelStates)) {
          return false;
        }
        break;
      default:
        if('channel_id' in update && 'pts' in update) {
          channelId = update.channel_id;
        }
        break;
    }

    const {pts, pts_count} = update as Update.updateNewMessage;
    const curState = channelId ? this.getChannelState(channelId, pts) : this.updatesState;

    const log = this.log.bindPrefix(`processUpdate${channelId ? `-${channelId}` : ''}`);
    log('process', curState.pts, update);

    if(curState.syncLoading && !options.ignoreSyncLoading) {
      log('ignoring update, sync loading');
      return false;
    } else if(curState.syncLoading) {
      log('ignoring syncLoading');
    }

    if(update._ === 'updateChannelTooLong') {
      if(!curState.lastPtsUpdateTime ||
          curState.lastPtsUpdateTime < (Date.now() - SYNC_DELAY)) {
        log.warn('channel too long, get diff');
        this.getChannelDifference(channelId);
      }
      return false;
    }

    if(update._ === 'updateNewMessage' ||
        update._ === 'updateEditMessage' ||
        update._ === 'updateNewChannelMessage' ||
        update._ === 'updateEditChannelMessage') {
      const message = update.message as Message.message;
      const toPeerId = this.appPeersManager.getPeerId(message.peer_id);
      const fwdHeader: MessageFwdHeader.messageFwdHeader = message.fwd_from || {} as any;
      let reason: string;
      if(message.from_id && !this.appUsersManager.hasUser(this.appPeersManager.getPeerId(message.from_id), message.pFlags.post/* || channelId*/) && (reason = 'author') ||
          fwdHeader.from_id && !this.appUsersManager.hasUser(this.appPeersManager.getPeerId(fwdHeader.from_id), !!(fwdHeader.from_id as Peer.peerChannel).channel_id) && (reason = 'fwdAuthor') ||
          (fwdHeader.from_id as Peer.peerChannel)?.channel_id && !this.appChatsManager.hasChat((fwdHeader.from_id as Peer.peerChannel).channel_id, true) && (reason = 'fwdChannel') ||
          toPeerId.isUser() && !this.appUsersManager.hasUser(toPeerId) && (reason = 'toPeer User') ||
          toPeerId.isAnyChat() && !this.appChatsManager.hasChat(toPeerId.toChatId()) && (reason = 'toPeer Chat')) {
        log.warn('not enough data for message update', toPeerId, reason, message);
        if(channelId && this.appChatsManager.hasChat(channelId)) {
          this.getChannelDifference(channelId);
        } else {
          this.forceGetDifference();
        }
        return false;
      }
    } else if(channelId && !this.appChatsManager.hasChat(channelId)) {
      log('skipping update, missing channel');
      return false;
    }

    let popPts: boolean;
    let popSeq: boolean;

    if(pts) {
      const newPts = curState.pts + (pts_count || 0);
      if(newPts < pts) {
        log.warn('pts hole', curState, update, channelId && this.appChatsManager.getChat(channelId));
        curState.pendingPtsUpdates.push(update as Update.updateNewMessage);
        if(!curState.syncPending && !curState.syncLoading) {
          curState.syncPending = {
            timeout: ctx.setTimeout(() => {
              curState.syncPending = null;

              if(curState.syncLoading) {
                return;
              }

              if(channelId) {
                this.getChannelDifference(channelId);
              } else {
                this.getDifference();
              }
            }, SYNC_DELAY)
          };
        }

        if(curState.syncPending) {
          curState.syncPending.ptsAwaiting = true;
        }

        return false;
      }

      if(pts > curState.pts) {
        curState.pts = pts;
        popPts = true;

        curState.lastPtsUpdateTime = Date.now();
      } else if(pts_count) {
        log.warn('duplicate update');
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
          log.warn('seq hole', curState, curState.syncPending?.seqAwaiting);

          curState.pendingSeqUpdates[seqStart] ??= {seq, date: options.date, updates: []};
          curState.pendingSeqUpdates[seqStart].updates.push(update);

          if(!curState.syncPending) {
            curState.syncPending = {
              timeout: ctx.setTimeout(() => {
                curState.syncPending = null;

                if(curState.syncLoading) {
                  return;
                }

                this.getDifference();
              }, SYNC_DELAY)
            };
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

  public saveUpdate(update: Update) {
    this.log.debug('update', update);
    this.dispatchEvent(update._, update as any);
  }

  public subscribeToChannelUpdates(channelId: ChatId) {
    const subscription = this.subscriptions[channelId] ??= {count: 0};
    ++subscription.count;

    const cb = () => {
      const state = this.getChannelState(channelId);
      if(!state.syncLoading && (!state.lastDifferenceTime || (Date.now() - state.lastDifferenceTime) > 2500)) {
        this.getChannelDifference(channelId);
      }
    };

    subscription.interval ??= ctx.setInterval(cb, 3000);
    cb();
  }

  public unsubscribeFromChannelUpdates(channelId: ChatId, force?: boolean) {
    const subscription = this.subscriptions[channelId];
    if(!subscription?.interval || (--subscription.count && !force)) {
      return;
    }

    clearInterval(subscription.interval);
    subscription.interval = undefined;
    delete this.subscriptions[channelId];
  }

  public attach(langCode?: string) {
    if(this.attached) return;

    // return;

    this.log('attach');

    this.attached = true;

    this.appStateManager.getState().then(({updates: state}) => {
      const newVersion = this.appStateManager.newVersion/*  || '1.6.0' */;

      // rootScope.broadcast('state_synchronizing');
      if(!state || !state.pts || !state.date/*  || !state.seq */) { // seq can be undefined because of updates.differenceTooLong
        this.log('will get new state');

        this.updatesState.syncLoading = new Promise((resolve) => {
          this.apiManager.invokeApi('updates.getState', {}, {noErrorBox: true}).then((stateResult) => {
            this.updatesState.seq = stateResult.seq;
            this.updatesState.pts = stateResult.pts;
            this.updatesState.date = stateResult.date;
            this.saveUpdatesState();
            // setTimeout(() => {
            this.updatesState.syncLoading = null;
            resolve();
            // rootScope.broadcast('state_synchronized');
            // }, 1000);

          // ! for testing
          // updatesState.seq = 1
          // updatesState.pts = stateResult.pts - 5000
          // updatesState.date = 1
          // getDifference()
          });
        });
      } else {
        // ! for testing
        /* state.seq = 1;
        state.pts = state.pts - 15;
        state.date = 1; */
        // state.pts -= 100;

        // state.date = 1628623682;
        // state.pts = 2007500;
        // state.seq = 503;

        Object.assign(this.updatesState, state);

        this.log('will get difference', Object.assign({}, state));

        this.getDifference(true)/* .finally(() => {
          if(this.updatesState.syncLoading) {
            rootScope.broadcast('state_synchronizing');
          }
        }) */;
      }

      this.apiManager.setUpdatesProcessor(this.processUpdateMessage);

      // this.updatesState.syncLoading.then(() => {
      this.setProxy();
      // });

      if(newVersion) {
        this.updatesState.syncLoading.then(async() => {
          const strs: Record<string, string> = {
            en: 'was updated to version',
            ru: 'обновлён до версии'
          };

          const getChangelog = (lang: string) => {
            return fetch(`changelogs/${lang}_${newVersion.split(' ')[0]}.md`)
            .then((res) => (res.status === 200 && res.ok && res.text()) || Promise.reject())
            .then((text) => {
              const langStr = strs[lang] || strs.en;
              const pre = `**Telegram Web${App.suffix} ${langStr} ${newVersion}**\n\n`;

              text = pre + text;

              const [message, entities] = parseMarkdown(text, []);

              const update: Update.updateServiceNotification = {
                _: 'updateServiceNotification',
                entities,
                message,
                type: 'local',
                pFlags: {},
                inbox_date: tsNow(true),
                media: undefined
              };

              this.processLocalUpdate(update);
            });
          };

          const languages = filterUnique([langCode, 'en']);
          for(const language of languages) {
            try {
              await getChangelog(language);
              break;
            } catch(err) {

            }
          }
        });
      }
    });
  }
}

interface ApiUpdatesManager extends EventListenerBase<{
  [name in Update['_']]: (update: ConstructorDeclMap[name]) => void
}>, AppManager {}
applyMixins(ApiUpdatesManager, [EventListenerBase, AppManager]);

export {ApiUpdatesManager};
