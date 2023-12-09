/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MessagesReactions, type AvailableReaction, type Message, type MessagePeerReaction, type MessagesAvailableReactions, type Reaction, type ReactionCount, type Update, type Updates, ChatReactions, Peer, Document} from '../../layer';
import findAndSplice from '../../helpers/array/findAndSplice';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import assumeType from '../../helpers/assumeType';
import callbackify from '../../helpers/callbackify';
import callbackifyAll from '../../helpers/callbackifyAll';
import copy from '../../helpers/object/copy';
import pause from '../../helpers/schedulers/pause';
import tsNow from '../../helpers/tsNow';
import {ReferenceContext} from '../mtproto/referenceDatabase';
import {AppManager} from './manager';
import getServerMessageId from './utils/messageId/getServerMessageId';
import reactionsEqual from './utils/reactions/reactionsEqual';
import MTProtoMessagePort from '../mtproto/mtprotoMessagePort';
import availableReactionToReaction from './utils/reactions/availableReactionToReaction';
import {NULL_PEER_ID} from '../mtproto/mtproto_config';

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

export type PeerAvailableReactions = {
  type: ChatReactions['_'],
  reactions: Reaction[]
};

export class AppReactionsManager extends AppManager {
  private availableReactions: AvailableReaction[];
  private sendReactionPromises: Map<string, Promise<any>>;
  private lastSendingTimes: Map<string, number>;
  private reactions: {[key in 'recent' | 'top']?: Reaction[]};

  protected after() {
    this.sendReactionPromises = new Map();
    this.lastSendingTimes = new Map();
    this.reactions = {};

    this.rootScope.addEventListener('user_auth', () => {
      setTimeout(() => {
        Promise.resolve(this.getAvailableReactions()).then(async(availableReactions) => {
          const toLoad: (Extract<keyof AvailableReaction, 'around_animation' | 'static_icon' | 'appear_animation' | 'center_icon'>)[] = [
            'around_animation',
            'static_icon',
            'appear_animation',
            'center_icon'
          ];

          for(let i = 0, length = Math.min(7, availableReactions.length); i < length; ++i) {
            const availableReaction = availableReactions[i];
            const promises = toLoad.map((key) => {
              return availableReaction[key] && this.apiFileManager.downloadMedia({media: availableReaction[key]});
            });
            await Promise.all(promises);
            await pause(1000);
          }
        });

        this.getTopReactions();
      }, 7.5e3);
    });
  }

  public resetAvailableReactions() {
    this.availableReactions = undefined;
    this.getAvailableReactions();
  }

  public getAvailableReactions() {
    if(this.availableReactions) return this.availableReactions;
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.getAvailableReactions',
      processResult: (messagesAvailableReactions) => {
        assumeType<MessagesAvailableReactions.messagesAvailableReactions>(messagesAvailableReactions);

        const availableReactions = this.availableReactions = messagesAvailableReactions.reactions;
        for(const reaction of availableReactions) {
          for(const key of SAVE_DOC_KEYS) {
            if(!reaction[key]) {
              continue;
            }

            reaction[key] = this.appDocsManager.saveDoc(reaction[key], REFERENCE_CONTEXT);
          }
        }

        MTProtoMessagePort.getInstance<false>().invokeVoid('mirror', {
          name: 'availableReactions',
          value: availableReactions
        });

        return availableReactions;
      },
      params: {
        hash: 0
      }
    });
  }

  public getActiveAvailableReactions() {
    return callbackify(this.getAvailableReactions(), (availableReactions) => {
      return availableReactions.filter((availableReaction) => !availableReaction.pFlags.inactive);
    });
  }

  public getAvailableReactionsForPeer(
    peerId: PeerId,
    unshiftQuickReaction?: boolean
  ): PeerAvailableReactions | Promise<PeerAvailableReactions> {
    const activeAvailableReactions = this.getActiveAvailableReactions();
    const topReactions = this.getTopReactions();
    const quickReaction = this.getQuickReaction();
    if(peerId.isUser()) {
      return callbackifyAll([
        topReactions,
        quickReaction
      ], ([topReactions, quickReaction]) => {
        const p: PeerAvailableReactions = {type: 'chatReactionsAll', reactions: topReactions};
        if(unshiftQuickReaction) {
          this.unshiftQuickReactionInner(p, quickReaction);
        }
        return p;
      });
    }

    const chatFull = this.appProfileManager.getChatFull(peerId.toChatId());
    return callbackifyAll([
      activeAvailableReactions,
      chatFull,
      quickReaction,
      topReactions
    ], ([
      activeAvailableReactions,
      chatFull,
      quickReaction,
      topReactions
    ]) => {
      let chatAvailableReactions = chatFull.available_reactions ?? {_: 'chatReactionsNone'};

      if(chatAvailableReactions._ === 'chatReactionsAll' && !chatAvailableReactions.pFlags.allow_custom) {
        chatAvailableReactions = {
          _: 'chatReactionsSome',
          reactions: activeAvailableReactions.map(availableReactionToReaction)
        };
      }

      let filteredChatReactions: Reaction[] = [];
      if(chatAvailableReactions._ === 'chatReactionsAll') {
        filteredChatReactions = topReactions;
      } else if(chatAvailableReactions._ === 'chatReactionsSome') {
        const filteredChatAvailableReactions = chatAvailableReactions.reactions.map((reaction) => {
          return activeAvailableReactions.find((availableReaction) => availableReaction.reaction === (reaction as Reaction.reactionEmoji).emoticon) || reaction;
        }).filter(Boolean);
        const indexes = new Map(activeAvailableReactions.map((availableReaction, idx) => [availableReaction.reaction, idx]));
        filteredChatAvailableReactions.sort((a, b) => (indexes.get((a as AvailableReaction.availableReaction).reaction) || 0) - (indexes.get((b as AvailableReaction.availableReaction).reaction) || 0));
        filteredChatReactions = filteredChatAvailableReactions.map((reaction) => {
          return reaction._ === 'availableReaction' ? availableReactionToReaction(reaction) : reaction;
        });
      }

      const p: PeerAvailableReactions = {
        type: chatAvailableReactions._,
        reactions: filteredChatReactions
      };

      if(chatAvailableReactions._ === 'chatReactionsAll' && unshiftQuickReaction) {
        this.unshiftQuickReactionInner(p, quickReaction);
      }

      return p;
    });
  }

  public getReactions(type: 'recent' | 'top') {
    if(this.reactions[type]) {
      return this.reactions[type];
    }

    return this.apiManager.invokeApiHashable({
      method: type === 'recent' ? 'messages.getRecentReactions' : 'messages.getTopReactions',
      params: {
        limit: 75
      },
      processResult: (messagesReactions) => {
        assumeType<MessagesReactions.messagesReactions>(messagesReactions);
        return this.reactions[type] = messagesReactions.reactions;
      }
    });
  }

  public getTopReactions() {
    return this.getReactions('top');
  }

  public getRecentReactions() {
    return this.getReactions('recent');
  }

  private unshiftQuickReactionInner(peerAvailableReactions: PeerAvailableReactions, quickReaction: Reaction | AvailableReaction) {
    if(quickReaction._ === 'availableReaction') {
      quickReaction = availableReactionToReaction(quickReaction);
    }

    peerAvailableReactions.reactions = peerAvailableReactions.reactions.slice();
    findAndSplice(peerAvailableReactions.reactions, (reaction) => reactionsEqual(reaction, quickReaction));
    peerAvailableReactions.reactions.unshift(quickReaction);

    return peerAvailableReactions;
  }

  // private unshiftQuickReaction(
  //   availableReactions: AvailableReaction[] | PromiseLike<AvailableReaction.availableReaction[]>,
  //   quickReaction: ReturnType<AppReactionsManager['getQuickReaction']> = this.getQuickReaction()
  // ) {
  //   return callbackifyAll([
  //     availableReactions,
  //     quickReaction
  //   ], ([availableReactions, quickReaction]) => {
  //     return this.unshiftQuickReactionInner(availableReactions, quickReaction);
  //   });
  // }

  public getAvailableReactionsByMessage(
    message: Message.message,
    unshiftQuickReaction?: boolean
  ): ReturnType<AppReactionsManager['getAvailableReactionsForPeer']> {
    // if(!message) return {type: 'chatReactionsNone', reactions: []};
    let peerId: PeerId;
    if(!message) {
      peerId = NULL_PEER_ID;
    } else {
      peerId = (
        message.fwd_from?.channel_post &&
        this.appPeersManager.isMegagroup(message.peerId) &&
        message.fromId === message.fwdFromId &&
        message.fromId
      ) || message.peerId;
    }

    return this.getAvailableReactionsForPeer(peerId, unshiftQuickReaction);
  }

  // public isReactionActive(reaction: string) {
  //   if(!this.availableReactions) return false;
  //   return this.availableReactions.some((availableReaction) => availableReaction.reaction === reaction);
  // }

  public getQuickReaction() {
    return callbackifyAll([
      this.apiManager.getConfig(),
      this.getAvailableReactions()
    ], ([config, availableReactions]) => {
      const reaction = config.reactions_default;
      if(reaction?._ === 'reactionEmoji') {
        return availableReactions.find((availableReaction) => availableReaction.reaction === reaction.emoticon);
      }

      return reaction as Reaction.reactionCustomEmoji;
    });
  }

  public getReactionCached(reaction: string) {
    return this.availableReactions.find((availableReaction) => availableReaction.reaction === reaction);
  }

  public getReaction(reaction: string) {
    return callbackify(this.getAvailableReactions(), () => {
      return this.getReactionCached(reaction);
    });
  }

  public getMessagesReactions(peerId: PeerId, mids: number[]) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.getMessagesReactions',
      params: {
        id: mids.map((mid) => getServerMessageId(mid)),
        peer: this.appPeersManager.getInputPeerById(peerId)
      },
      processResult: (updates) => {
        this.apiUpdatesManager.processUpdateMessage(updates);

        // const update = (updates as Updates.updates).updates.find((update) => update._ === 'updateMessageReactions') as Update.updateMessageReactions;
        // return update.reactions;
      }
    });
  }

  public getMessageReactionsList(peerId: PeerId, mid: number, limit: number, reaction?: Reaction, offset?: string) {
    return this.apiManager.invokeApiSingleProcess({
      method: 'messages.getMessageReactionsList',
      params: {
        peer: this.appPeersManager.getInputPeerById(peerId),
        id: getServerMessageId(mid),
        limit,
        reaction,
        offset
      },
      processResult: (messageReactionsList) => {
        this.appUsersManager.saveApiUsers(messageReactionsList.users);
        return messageReactionsList;
      }
    });
  }

  public setDefaultReaction(reaction: Reaction) {
    return this.apiManager.invokeApi('messages.setDefaultReaction', {reaction}).then(async(value) => {
      if(value) {
        const appConfig = await this.apiManager.getConfig();
        if(appConfig) {
          appConfig.reactions_default = reaction;
        }/*  else { // if no config or loading it - overwrite
          this.apiManager.getAppConfig(true);
        } */

        this.rootScope.dispatchEvent('quick_reaction', reaction);
      }

      return value;
    });
  }

  public async sendReaction(message: Message.message, reaction?: Reaction | AvailableReaction, onlyLocal?: boolean) {
    message = this.appMessagesManager.getMessageByPeer(message.peerId, message.mid) as typeof message;

    if(reaction._ === 'availableReaction') {
      reaction = {
        _: 'reactionEmoji',
        emoticon: reaction.reaction
      };
    }

    const limit = await this.apiManager.getLimit('reactions');

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
    const myPeer = this.appMessagesManager.generateFromId(peerId) ?? this.appPeersManager.getOutputPeer(peerId);
    const myPeerId = this.appPeersManager.getPeerId(myPeer);

    const unsetReactionCount = (reactionCount: ReactionCount) => {
      --reactionCount.count;
      delete reactionCount.chosen_order;

      if(reactionsEqual(reaction as Reaction, reactionCount.reaction)) {
        reaction = undefined as Reaction;
      }

      if(!reactionCount.count) {
        indexOfAndSplice(reactions.results, reactionCount);
      }/*  else {
        insertInDescendSortedArray(reactions.results, chosenReaction, 'count', chosenReactionIdx);
      } */

      if(reactions.recent_reactions) {
        findAndSplice(reactions.recent_reactions, (recentReaction) => reactionsEqual(recentReaction.reaction, reactionCount.reaction) && this.appPeersManager.getPeerId(recentReaction.peer_id) === myPeerId);
      }

      if(!reactions.results.length) {
        reactions = undefined;
      }
    };

    const canSeeList = message.reactions?.pFlags?.can_see_list || !this.appPeersManager.isBroadcast(message.peerId) || message.peerId.isUser();
    if(!message.reactions) {
      message.reactions = {
        _: 'messageReactions',
        results: [],
        recent_reactions: canSeeList ? [] : undefined,
        pFlags: {
          can_see_list: canSeeList || undefined
        }
      };
    }

    let reactions = onlyLocal ? message.reactions : copy(message.reactions);
    const chosenReactions = reactions.results.filter((reactionCount) => reactionCount.chosen_order !== undefined);
    chosenReactions.sort((a, b) => b.chosen_order - a.chosen_order);
    const unsetReactions: ReactionCount[] = [];
    const chosenReactionIdx = chosenReactions.findIndex((reactionCount) => reactionsEqual(reactionCount.reaction, reaction as Reaction));
    if(chosenReactionIdx !== -1) unsetReactions.push(...chosenReactions.splice(chosenReactionIdx, 1));
    unsetReactions.push(...chosenReactions.splice(limit - +(chosenReactionIdx === -1)));
    unsetReactions.forEach((reactionCount) => {
      chosenReactions.forEach((chosenReactionCount) => {
        if(chosenReactionCount.chosen_order > reactionCount.chosen_order) {
          --chosenReactionCount.chosen_order;
        }
      });

      unsetReactionCount(reactionCount);
    });

    const chosenReactionsLength = chosenReactions.length;
    chosenReactions.forEach((reactionCount, idx) => {
      reactionCount.chosen_order = chosenReactionsLength - 1 - idx;
    });

    if(reaction) {
      if(!reactions) {
        reactions/*  = message.reactions */ = {
          _: 'messageReactions',
          results: [],
          pFlags: {}
        };

        if(canSeeList) {
          reactions.pFlags.can_see_list = true;
        }
      }

      let reactionCountIdx = reactions.results.findIndex((reactionCount) => reactionsEqual(reactionCount.reaction, reaction as Reaction));
      let reactionCount = reactionCountIdx !== -1 && reactions.results[reactionCountIdx];
      if(!reactionCount) {
        reactionCount = {
          _: 'reactionCount',
          count: 0,
          reaction
        };

        reactionCountIdx = reactions.results.push(reactionCount) - 1;
      }

      ++reactionCount.count;
      reactionCount.chosen_order = chosenReactions.length ? chosenReactions[0].chosen_order + 1 : 0;
      chosenReactions.unshift(reactionCount);

      if(!reactions.recent_reactions && canSeeList) {
        reactions.recent_reactions = [];
      }

      if(reactions.recent_reactions) {
        const peerReaction: MessagePeerReaction = {
          _: 'messagePeerReaction',
          reaction,
          peer_id: myPeer,
          pFlags: {},
          date: tsNow(true)
        };

        if(!this.appPeersManager.isMegagroup(peerId) && false) {
          reactions.recent_reactions.push(peerReaction);
          reactions.recent_reactions = reactions.recent_reactions.slice(-3);
        } else {
          reactions.recent_reactions.unshift(peerReaction);
          reactions.recent_reactions = reactions.recent_reactions.slice(0, 3);
        }
      }

      // insertInDescendSortedArray(reactions.results, reactionCount, 'count', reactionCountIdx);
    }

    const availableReactions = this.availableReactions;
    if(reactions && availableReactions?.length) {
      const indexes: Map<DocId | string, number> = new Map();
      availableReactions.forEach((availableReaction, idx) => {
        indexes.set(availableReaction.reaction, idx);
      });

      reactions.results.sort((a, b) => {
        const id1 = (a.reaction as Reaction.reactionCustomEmoji).document_id || (a.reaction as Reaction.reactionEmoji).emoticon;
        const id2 = (b.reaction as Reaction.reactionCustomEmoji).document_id || (b.reaction as Reaction.reactionEmoji).emoticon;
        return (b.count - a.count) || ((indexes.get(id1) ?? 0) - (indexes.get(id2) ?? 0));
      });
    }

    if(onlyLocal) {
      message.reactions = reactions;
      this.rootScope.dispatchEvent('messages_reactions', [{message, changedResults: []}]);
      return Promise.resolve();
    }

    this.apiUpdatesManager.processLocalUpdate({
      _: 'updateMessageReactions',
      peer: message.peer_id,
      msg_id: message.id,
      reactions: reactions,
      local: true
    });

    const promiseKey = [peerId, mid].join('-');
    const msgId = getServerMessageId(mid);
    const promise = this.apiManager.invokeApi('messages.sendReaction', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: msgId,
      reaction: chosenReactions.map((reactionCount) => reactionCount.reaction).reverse()
    }).then((updates) => {
      assumeType<Updates.updates>(updates);

      const editMessageUpdateIdx = updates.updates.findIndex((update) => update._ === 'updateEditMessage' || update._ === 'updateEditChannelMessage');
      if(editMessageUpdateIdx !== -1) {
        const editMessageUpdate = updates.updates[editMessageUpdateIdx] as Update.updateEditMessage | Update.updateEditChannelMessage;
        updates.updates[editMessageUpdateIdx] = {
          _: 'updateMessageReactions',
          msg_id: msgId,
          peer: this.appPeersManager.getOutputPeer(peerId),
          reactions: (editMessageUpdate.message as Message.message).reactions,
          pts: editMessageUpdate.pts,
          pts_count: editMessageUpdate.pts_count
        };
      }

      this.apiUpdatesManager.processUpdateMessage(updates);
    }).catch((err: ApiError) => {
      if(err.type === 'REACTION_INVALID' && this.sendReactionPromises.get(promiseKey) === promise) {
        this.sendReaction(message, chosenReactions[0]?.reaction, true);
      }
    }).finally(() => {
      if(this.sendReactionPromises.get(promiseKey) === promise) {
        this.sendReactionPromises.delete(promiseKey);
      }
    });

    this.sendReactionPromises.set(promiseKey, promise);
    return promise;
  }

  public getRandomGenericAnimation() {
    return callbackify(this.appStickersManager.getLocalStickerSet('inputStickerSetEmojiGenericAnimations'), (messagesStickerSet) => {
      const length = messagesStickerSet.documents.length;
      if(!length) {
        return;
      }

      const document = messagesStickerSet.documents[Math.floor(Math.random() * length)];
      return document as Document.document;
    });
  }
}
