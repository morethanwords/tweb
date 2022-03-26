/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import findAndSplice from "../../helpers/array/findAndSplice";
import assumeType from "../../helpers/assumeType";
import callbackify from "../../helpers/callbackify";
import callbackifyAll from "../../helpers/callbackifyAll";
import copy from "../../helpers/object/copy";
import { AvailableReaction, Message, MessagePeerReaction, MessagesAvailableReactions, Update, Updates } from "../../layer";
import apiManager from "../mtproto/mtprotoworker";
import { ReferenceContext } from "../mtproto/referenceDatabase";
import rootScope from "../rootScope";
import apiUpdatesManager from "./apiUpdatesManager";
import appDocsManager from "./appDocsManager";
import appMessagesIdsManager from "./appMessagesIdsManager";
import appPeersManager from "./appPeersManager";
import appProfileManager from "./appProfileManager";
import appUsersManager from "./appUsersManager";

const SAVE_DOC_KEYS = [
  'static_icon' as const,
  'appear_animation' as const,
  'select_animation' as const,
  'activate_animation' as const,
  'effect_animation' as const,
  'around_animation' as const,
  'center_icon' as const
];

const REFERENCE_CONTEXT: ReferenceContext = {
  type: 'reactions'
};

export class AppReactionsManager {
  private availableReactions: AvailableReaction[];
  private sendReactionPromises: Map<string, Promise<any>>;
  private lastSendingTimes: Map<string, number>;

  constructor() {
    rootScope.addEventListener('language_change', () => {
      this.availableReactions = undefined;
      this.getAvailableReactions();
    });

    this.sendReactionPromises = new Map();
    this.lastSendingTimes = new Map();

    setTimeout(() => {
      Promise.resolve(this.getAvailableReactions()).then(async(availableReactions) => {
        for(const availableReaction of availableReactions) {
          await Promise.all([
            availableReaction.around_animation && appDocsManager.downloadDoc(availableReaction.around_animation),
            availableReaction.static_icon && appDocsManager.downloadDoc(availableReaction.static_icon),
            availableReaction.appear_animation && appDocsManager.downloadDoc(availableReaction.appear_animation),
            availableReaction.center_icon && appDocsManager.downloadDoc(availableReaction.center_icon)
          ]);
        }
      });
    }, 7.5e3);
  }

  public getAvailableReactions() {
    if(this.availableReactions) return this.availableReactions;
    return apiManager.invokeApiSingleProcess({
      method: 'messages.getAvailableReactions',
      processResult: (messagesAvailableReactions) => {
        assumeType<MessagesAvailableReactions.messagesAvailableReactions>(messagesAvailableReactions);

        const availableReactions = this.availableReactions = messagesAvailableReactions.reactions;
        for(const reaction of availableReactions) {
          for(const key of SAVE_DOC_KEYS) {
            if(!reaction[key]) {
              continue;
            }
            
            reaction[key] = appDocsManager.saveDoc(reaction[key], REFERENCE_CONTEXT);
          }
        }

        return availableReactions;
      },
      params: {
        hash: 0
      }
    });
  }

  public getActiveAvailableReactions() {
    return callbackify(this.getAvailableReactions(), (availableReactions) => {
      return availableReactions.filter(availableReaction => !availableReaction.pFlags.inactive);
    });
  }

  public getAvailableReactionsForPeer(peerId: PeerId) {
    const activeAvailableReactions = this.getActiveAvailableReactions();
    if(peerId.isUser()) {
      return this.unshiftQuickReaction(activeAvailableReactions);
    }

    const chatFull = appProfileManager.getChatFull(peerId.toChatId());
    return callbackifyAll([activeAvailableReactions, chatFull, this.getQuickReaction()], ([activeAvailableReactions, chatFull, quickReaction]) => {
      const chatAvailableReactions = chatFull.available_reactions ?? [];

      const filteredChatAvailableReactions = chatAvailableReactions.map(reaction => {
        return activeAvailableReactions.find(availableReaction => availableReaction.reaction === reaction);
      }).filter(Boolean);

      return this.unshiftQuickReactionInner(filteredChatAvailableReactions, quickReaction);
    });
  }

  private unshiftQuickReactionInner(availableReactions: AvailableReaction.availableReaction[], quickReaction: AvailableReaction.availableReaction) {
    const availableReaction = findAndSplice(availableReactions, availableReaction => availableReaction.reaction === quickReaction.reaction);
    if(availableReaction) {
      availableReactions.unshift(availableReaction);
    }

    return availableReactions;
  }

  private unshiftQuickReaction(
    availableReactions: AvailableReaction.availableReaction[] | PromiseLike<AvailableReaction.availableReaction[]>, 
    quickReaction: ReturnType<AppReactionsManager['getQuickReaction']> = this.getQuickReaction()
  ) {
    return callbackifyAll([
      availableReactions,
      quickReaction
    ], ([availableReactions, quickReaction]) => {
      return this.unshiftQuickReactionInner(availableReactions, quickReaction);
    });
  }

  public getAvailableReactionsByMessage(message: Message.message) {
    const peerId = (message.fwd_from?.channel_post && appPeersManager.isMegagroup(message.peerId) && message.fwdFromId) || message.peerId;
    return this.getAvailableReactionsForPeer(peerId);
  }

  public isReactionActive(reaction: string) {
    if(!this.availableReactions) return false;
    return !!this.availableReactions.find(availableReaction => availableReaction.reaction === reaction);
  }

  public getQuickReaction() {
    return callbackifyAll([
      apiManager.getAppConfig(),
      this.getAvailableReactions()
    ], ([appConfig, availableReactions]) => {
      return availableReactions.find(reaction => reaction.reaction === appConfig.reactions_default);
    });
  }

  public getReactionCached(reaction: string) {
    return this.availableReactions.find(availableReaction => availableReaction.reaction === reaction);
  }

  public getReaction(reaction: string) {
    return callbackify(this.getAvailableReactions(), () => {
      return this.getReactionCached(reaction);
    });
  }

  public getMessagesReactions(peerId: PeerId, mids: number[]) {
    return apiManager.invokeApiSingleProcess({
      method: 'messages.getMessagesReactions',
      params: {
        id: mids.map(mid => appMessagesIdsManager.getServerMessageId(mid)),
        peer: appPeersManager.getInputPeerById(peerId)
      },
      processResult: (updates) => {
        apiUpdatesManager.processUpdateMessage(updates);

        // const update = (updates as Updates.updates).updates.find(update => update._ === 'updateMessageReactions') as Update.updateMessageReactions;
        // return update.reactions;
      }
    });
  }

  public getMessageReactionsList(peerId: PeerId, mid: number, limit: number, reaction?: string, offset?: string) {
    return apiManager.invokeApiSingleProcess({
      method: 'messages.getMessageReactionsList',
      params: {
        peer: appPeersManager.getInputPeerById(peerId),
        id: appMessagesIdsManager.getServerMessageId(mid),
        limit,
        reaction,
        offset
      },
      processResult: (messageReactionsList) => {
        appUsersManager.saveApiUsers(messageReactionsList.users);
        return messageReactionsList;
      }
    });
  }

  public setDefaultReaction(reaction: string) {
    return apiManager.invokeApi('messages.setDefaultReaction', {reaction}).then(value => {
      if(value) {
        const appConfig = rootScope.appConfig;
        if(appConfig) {
          appConfig.reactions_default = reaction;
        } else { // if no config or loading it - overwrite
          apiManager.getAppConfig(true);
        }

        rootScope.dispatchEvent('quick_reaction', reaction);
      }

      return value;
    });
  }

  public sendReaction(message: Message.message, reaction?: string, onlyLocal?: boolean) {
    const lastSendingTimeKey = message.peerId + '_' + message.mid;
    const lastSendingTime = this.lastSendingTimes.get(lastSendingTimeKey);
    if(lastSendingTime) {
      return;
    } else {
      this.lastSendingTimes.set(lastSendingTimeKey, Date.now());
      setTimeout(() => {
        this.lastSendingTimes.delete(lastSendingTimeKey);
      }, 333);
    }

    const {peerId, mid} = message;
    const myPeerId = rootScope.myId;

    let reactions = onlyLocal ? message.reactions : copy(message.reactions);
    let chosenReactionIdx = reactions ? reactions.results.findIndex((reactionCount) => reactionCount.pFlags.chosen) : -1;
    let chosenReaction = chosenReactionIdx !== -1 && reactions.results[chosenReactionIdx];
    if(chosenReaction) { // clear current reaction
      --chosenReaction.count;
      delete chosenReaction.pFlags.chosen;

      if(reaction === chosenReaction.reaction) {
        reaction = undefined;
      }

      if(!chosenReaction.count) {
        reactions.results.splice(chosenReactionIdx, 1);
      }/*  else {
        insertInDescendSortedArray(reactions.results, chosenReaction, 'count', chosenReactionIdx);
      } */

      if(reactions.recent_reactions) {
        findAndSplice(reactions.recent_reactions, (recentReaction) => appPeersManager.getPeerId(recentReaction.peer_id) === myPeerId);
      }

      if(!reactions.results.length) {
        reactions = undefined;
      }
    }

    if(reaction) {
      if(!reactions) {
        reactions/*  = message.reactions */ = {
          _: 'messageReactions',
          results: [],
          pFlags: {}
        };

        if(!appPeersManager.isBroadcast(message.peerId)) {
          reactions.pFlags.can_see_list = true;
        }
      }

      let reactionCountIdx = reactions.results.findIndex((reactionCount) => reactionCount.reaction === reaction);
      let reactionCount = reactionCountIdx !== -1 && reactions.results[reactionCountIdx];
      if(!reactionCount) {
        reactionCount = {
          _: 'reactionCount',
          count: 0,
          reaction,
          pFlags: {}
        };

        reactionCountIdx = reactions.results.push(reactionCount) - 1;
      }

      ++reactionCount.count;
      reactionCount.pFlags.chosen = true;

      if(!reactions.recent_reactions && reactions.pFlags.can_see_list) {
        reactions.recent_reactions = [];
      }

      if(reactions.recent_reactions) {
        const userReaction: MessagePeerReaction = {
          _: 'messagePeerReaction',
          reaction,
          peer_id: appPeersManager.getOutputPeer(myPeerId)
        };

        if(!appPeersManager.isMegagroup(peerId)) {
          reactions.recent_reactions.push(userReaction);
          reactions.recent_reactions = reactions.recent_reactions.slice(-3);
        } else {
          reactions.recent_reactions.unshift(userReaction);
          reactions.recent_reactions = reactions.recent_reactions.slice(0, 3);
        }
      }

      // insertInDescendSortedArray(reactions.results, reactionCount, 'count', reactionCountIdx);
    }

    const availableReactions = this.availableReactions;
    if(reactions && availableReactions?.length) {
      const indexes: Map<string, number> = new Map();
      availableReactions.forEach((availableReaction, idx) => {
        indexes.set(availableReaction.reaction, idx);
      });

      reactions.results.sort((a, b) => {
        return (b.count - a.count) || (indexes.get(a.reaction) - indexes.get(b.reaction));
      });
    }

    if(onlyLocal) {
      message.reactions = reactions;
      rootScope.dispatchEvent('message_reactions', {message, changedResults: []});
      return Promise.resolve();
    }

    apiUpdatesManager.processLocalUpdate({
      _: 'updateMessageReactions',
      peer: message.peer_id,
      msg_id: message.id,
      reactions: reactions,
      local: true
    });

    const promiseKey = [peerId, mid].join('-');
    const msgId = appMessagesIdsManager.getServerMessageId(mid);
    const promise = apiManager.invokeApi('messages.sendReaction', {
      peer: appPeersManager.getInputPeerById(peerId),
      msg_id: msgId,
      reaction
    }).then((updates) => {
      assumeType<Updates.updates>(updates);
      
      const editMessageUpdateIdx = updates.updates.findIndex(update => update._ === 'updateEditMessage' || update._ === 'updateEditChannelMessage');
      if(editMessageUpdateIdx !== -1) {
        const editMessageUpdate = updates.updates[editMessageUpdateIdx] as Update.updateEditMessage | Update.updateEditChannelMessage;
        updates.updates[editMessageUpdateIdx] = {
          _: 'updateMessageReactions',
          msg_id: msgId,
          peer: appPeersManager.getOutputPeer(peerId),
          reactions: (editMessageUpdate.message as Message.message).reactions,
          pts: editMessageUpdate.pts,
          pts_count: editMessageUpdate.pts_count
        };
      }

      apiUpdatesManager.processUpdateMessage(updates);
    }).catch(err => {
      if(err.type === 'REACTION_INVALID' && this.sendReactionPromises.get(promiseKey) === promise) {
        this.sendReaction(message, chosenReaction?.reaction, true);
      }
    }).finally(() => {
      if(this.sendReactionPromises.get(promiseKey) === promise) {
        this.sendReactionPromises.delete(promiseKey);
      }
    });
    
    this.sendReactionPromises.set(promiseKey, promise);
    return promise;
  }
}

const appReactionsManager = new AppReactionsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appReactionsManager = appReactionsManager);
export default appReactionsManager;
