import type { Dialog, DialogsStorage, FiltersStorage } from './appMessagesManager';
import type { AppStickersManager } from './appStickersManager';
import type { AppPeersManager } from './appPeersManager';
import { App, MOUNT_CLASS_TO, UserAuth } from '../mtproto/mtproto_config';
import EventListenerBase from '../../helpers/eventListenerBase';
import $rootScope from '../rootScope';
import AppStorage from '../storage';
import { logger } from '../logger';

const REFRESH_EVERY = 24 * 60 * 60 * 1000; // 1 day
const STATE_VERSION = App.version;

type State = Partial<{
  dialogs: Dialog[],
  allDialogsLoaded: DialogsStorage['allDialogsLoaded'], 
  peers: {[peerID: string]: ReturnType<AppPeersManager['getPeer']>},
  messages: any[],
  contactsList: number[],
  updates: any,
  filters: FiltersStorage['filters'],
  maxSeenMsgID: number,
  stateCreatedTime: number,
  recentEmoji: string[],
  topPeers: number[],
  recentSearch: number[],
  stickerSets: AppStickersManager['stickerSets'],
  version: typeof STATE_VERSION
}>;

const REFRESH_KEYS = ['dialogs', 'allDialogsLoaded', 'messages', 'contactsList', 'stateCreatedTime',
  'updates', 'maxSeenMsgID', 'filters', 'topPeers'] as any as Array<keyof State>;

export class AppStateManager extends EventListenerBase<{
  save: (state: State) => void
}> {
  public loaded: Promise<State>;
  private log = logger('STATE'/* , LogLevels.error */);

  private state: State;

  constructor() {
    super();
    this.loadSavedState();
  }

  public loadSavedState() {
    if(this.loaded) return this.loaded;
    //console.time('load state');
    return this.loaded = new Promise((resolve) => {
      AppStorage.get<[State, UserAuth]>('state', 'user_auth').then(([state, auth]) => {
        const time = Date.now();
        if(state) {
          if(state.version != STATE_VERSION) {
            state = {};
          } else if((state.stateCreatedTime || 0) + REFRESH_EVERY < time) {
            this.log('will refresh state', state.stateCreatedTime, time);
            REFRESH_KEYS.forEach(key => {
              delete state[key];
            });
            //state = {};
          }
        }
        
        // will not throw error because state can be `FALSE`
        const {peers} = state;
        
        this.state = state || {};
        this.state.peers = peers || {};
        this.state.version = STATE_VERSION;
        
        // ??= doesn't compiles
        if(!this.state.hasOwnProperty('stateCreatedTime')) {
          this.state.stateCreatedTime = Date.now();
        }

        this.log('state res', state);
        
        //return resolve();

        if(auth?.id) {
          $rootScope.$broadcast('user_auth', {id: auth.id});
        }
        
        //console.timeEnd('load state');
        resolve(state);
      }).catch(resolve).finally(() => {
        setInterval(() => this.saveState(), 10000);
      });
    });
  }

  public getState() {
    return this.state === undefined ? this.loadSavedState() : Promise.resolve(this.state);
  }

  public saveState() {
    if(this.state === undefined) return;

    //let perf = performance.now();
    this.setListenerResult('save', this.state);
    //this.log('saveState: event time:', performance.now() - perf);

    //const pinnedOrders = appMessagesManager.dialogsStorage.pinnedOrders;

    //perf = performance.now();
    AppStorage.set({
      state: this.state
    });
    //this.log('saveState: storage set time:', performance.now() - perf);
  }

  public pushToState<T extends keyof State>(key: T, value: State[T]) {
    this.state[key] = value;
  }

  public setPeer(peerID: number, peer: any) {
    if(this.state.peers.hasOwnProperty(peerID)) return;
    this.state.peers[peerID] = peer;
  }
}

//console.trace('appStateManager include');

const appStateManager = new AppStateManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appStateManager = appStateManager);
export default appStateManager;