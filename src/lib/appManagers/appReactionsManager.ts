/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MessagesReactions, type AvailableReaction, type Message, type MessagePeerReaction, type MessagesAvailableReactions, type Reaction, type ReactionCount, type Update, type Updates, ChatReactions, Peer, Document, MessagesSavedReactionTags, SavedReactionTag, AvailableEffect, MessagesAvailableEffects, MessageReactions, PaidReactionPrivacy} from '../../layer';
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
import {NULL_PEER_ID, SEND_PAID_REACTION_ANONYMOUS_PEER_ID} from '../mtproto/mtproto_config';
import insertInDescendSortedArray from '../../helpers/array/insertInDescendSortedArray';
import {BroadcastEvents} from '../rootScope';
import {md5} from 'js-md5';
import bytesFromHex from '../../helpers/bytes/bytesFromHex';
import {bigIntFromBytes} from '../../helpers/bigInt/bigIntConversion';
import bigInt from 'big-integer';
import forEachReverse from '../../helpers/array/forEachReverse';
import fixEmoji from '../richTextProcessor/fixEmoji';

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

const REFRESH_TAGS_INTERVAL = 10 * 60e3;
// const REFRESH_TAGS_INTERVAL = 15e3;

export type PeerAvailableReactions = {
  type: ChatReactions['_'],
  reactions: Reaction[],
  trulyAll?: boolean
};

export type SendReactionOptions = {
  message: Message.message | ReactionsContext,
  reaction?: Reaction | AvailableReaction,
  onlyLocal?: boolean,
  onlyLocalWithUpdate?: boolean,
  onlyReturn?: boolean,
  sendAsPeerId?: PeerId,
  count?: number
};

export type ReactionsContext = Pick<Message.message, 'peerId' | 'mid' | 'reactions'>;

export class AppReactionsManager extends AppManager {
  private availableReactions: AvailableReaction[];
  private availableEffects: MaybePromise<AvailableEffect[]>;
  private sendReactionPromises: Map<string, Promise<any>>;
  // private lastSendingTimes: Map<string, number>;
  private reactions: {[key in 'recent' | 'top' | 'tags']?: Reaction[]};
  private savedReactionsTags: Map<PeerId, MaybePromise<SavedReactionTag[]>>;
  private paidReactionPrivacy?: PaidReactionPrivacy

  protected after() {
    this.clear(true);

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

      this.getSavedReactionTags();
    });

    this.apiUpdatesManager.addMultipleEventsListeners({
      updateSavedReactionTags: ({tags, savedPeerId}) => {
        if(!tags) {
          if(this.savedReactionsTags.get(savedPeerId)) {
            Promise.resolve(this.getSavedReactionTags(savedPeerId, true)).then((tags) => {
              this.apiUpdatesManager.processLocalUpdate({_: 'updateSavedReactionTags', tags, savedPeerId});
            });
          }

          return;
        }

        this.setSavedReactionTags(savedPeerId, tags);
      },
      updatePaidReactionPrivacy: this.onUpdatePaidReactionPrivacy
    });

    this.rootScope.addEventListener('messages_reactions', (arr) => {
      for(const item of arr) {
        this.processMessageReactionsChanges(item);
      }
    });

    setInterval(() => {
      if(!this.savedReactionsTags.size) {
        return;
      }

      this.savedReactionsTags.clear();
      this.rootScope.dispatchEvent('saved_tags_clear');
    }, REFRESH_TAGS_INTERVAL);
  }

  public clear = (init = false) => {
    if(init) {
      this.sendReactionPromises = new Map();
      // this.lastSendingTimes = new Map();
      this.reactions = {};
    }

    this.savedReactionsTags = new Map();
  };

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
          value: availableReactions,
          accountNumber: this.getAccountNumber()
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

      let trulyAll: boolean;
      if(chatAvailableReactions._ === 'chatReactionsAll' && !chatAvailableReactions.pFlags.allow_custom) {
        chatAvailableReactions = {
          _: 'chatReactionsSome',
          reactions: activeAvailableReactions.map(availableReactionToReaction)
        };
        trulyAll = true;
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
        reactions: filteredChatReactions,
        trulyAll
      };

      if(chatAvailableReactions._ === 'chatReactionsAll' && unshiftQuickReaction) {
        this.unshiftQuickReactionInner(p, quickReaction);
      }

      if(chatFull._ === 'channelFull' && chatFull.pFlags.paid_reactions_available) {
        p.reactions.unshift({_: 'reactionPaid'});
      }

      return p;
    });
  }

  public getReactions(type: 'recent' | 'top' | 'tags') {
    if(this.reactions[type]) {
      return this.reactions[type];
    }

    let method: 'messages.getRecentReactions' | 'messages.getTopReactions' | 'messages.getDefaultTagReactions';
    if(type === 'recent') {
      method = 'messages.getRecentReactions';
    } else if(type === 'top') {
      method = 'messages.getTopReactions';
    } else {
      method = 'messages.getDefaultTagReactions';
    }

    return this.apiManager.invokeApiHashable({
      method,
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

  public getTagReactions(peerId?: PeerId) {
    return callbackifyAll([
      this.getReactions('tags'),
      this.getSavedReactionTags(peerId)
    ], ([reactions, tags]) => {
      reactions = reactions.slice();
      forEachReverse(tags, (tag) => {
        const reaction = findAndSplice(reactions, (reaction) => reactionsEqual(reaction, tag.reaction));
        if(reaction) {
          reactions.unshift(reaction);
        }
      });

      return reactions;
    });
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
    message?: Message.message,
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

    if(peerId === this.appPeersManager.peerId) {
      const {reactions} = message;
      if(!reactions || reactions.pFlags.reactions_as_tags) {
        return callbackify(this.getTagReactions(), (reactions) => {
          const p: PeerAvailableReactions = {type: 'chatReactionsAll', reactions};
          return p;
        });
      }
    }

    return callbackify(
      this.getAvailableReactionsForPeer(peerId, unshiftQuickReaction),
      (peerAvailableReactions) => {
        const messageReactionsResults = message?.reactions?.results;
        if(
          messageReactionsResults &&
          peerAvailableReactions.type === 'chatReactionsSome' &&
          !peerAvailableReactions.trulyAll
        ) {
          peerAvailableReactions.reactions.sort((a, b) => {
            if(a._ === 'reactionPaid') return -Infinity;
            else if(a._ === 'reactionEmoji') return Infinity;
            const idx1 = messageReactionsResults.findIndex((reactionCount) => reactionsEqual(reactionCount.reaction, a));
            const idx2 = messageReactionsResults.findIndex((reactionCount) => reactionsEqual(reactionCount.reaction, b));
            return (idx1 === -1 ? Infinity : idx1) - (idx2 === -1 ? Infinity : idx2);
          });
        }

        return peerAvailableReactions;
      }
    );
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

  public async sendReaction({
    message,
    reaction,
    onlyLocal,
    onlyLocalWithUpdate,
    onlyReturn,
    sendAsPeerId,
    count
  }: SendReactionOptions): Promise<MessageReactions> {
    message = this.appMessagesManager.getMessageByPeer(message.peerId, message.mid) as Message.message;

    if(reaction._ === 'availableReaction') {
      reaction = {
        _: 'reactionEmoji',
        emoticon: reaction.reaction
      };
    }

    const isPaidReaction = reaction._ === 'reactionPaid';
    const [limit, paidReactionPrivacy] = await Promise.all([
      this.apiManager.getLimit('reactions'),
      isPaidReaction && this.getPaidReactionPrivacy()
    ]);

    // const lastSendingTimeKey = message.peerId + '_' + message.mid;
    // const lastSendingTime = this.lastSendingTimes.get(lastSendingTimeKey);
    // if(lastSendingTime) {
    //   return;
    // } else {
    //   this.lastSendingTimes.set(lastSendingTimeKey, Date.now());
    //   setTimeout(() => {
    //     this.lastSendingTimes.delete(lastSendingTimeKey);
    //   }, 333);
    // }

    const {peerId, mid} = message;
    let myPeer: Peer;
    if(sendAsPeerId) {
      myPeer = this.appPeersManager.getOutputPeer(sendAsPeerId);
    } else {
      myPeer = this.appMessagesManager.generateFromId(peerId) ?? this.appPeersManager.getOutputPeer(peerId);
    }
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
        findAndSplice(
          reactions.recent_reactions,
          (recentReaction) => reactionsEqual(recentReaction.reaction, reactionCount.reaction) &&
            this.appPeersManager.getPeerId(recentReaction.peer_id) === myPeerId
        );
      }

      if(!reactions.results.length) {
        reactions = undefined;
      }
    };

    const canSeeList = message.reactions?.pFlags?.can_see_list ||
      !this.appPeersManager.isBroadcast(message.peerId) ||
      message.peerId.isUser();
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
    const chosenReactions = reactions.results.filter((reactionCount) => reactionCount.chosen_order !== undefined && reactionCount.chosen_order >= 0);
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

      if(!reactions.results.length && peerId === this.appPeersManager.peerId) {
        reactions.pFlags.reactions_as_tags = true;
      }

      let reactionCountIdx = reactions.results.findIndex((reactionCount) => reactionsEqual(reactionCount.reaction, reaction as Reaction));
      let reactionCount = reactionCountIdx !== -1 && reactions.results[reactionCountIdx];
      if(!reactionCount) {
        reactionCount = {
          _: 'reactionCount',
          count: 0,
          reaction
        };

        if(isPaidReaction) {
          reactions.results.unshift(reactionCount);
          reactionCountIdx = 0;
        } else {
          reactionCountIdx = reactions.results.push(reactionCount) - 1;
        }
      }

      if(isPaidReaction) {
        reactionCount.count += count;
        reactionCount.chosen_order = -1;

        reactions.top_reactors ??= [];
        let topReactor = findAndSplice(reactions.top_reactors, (topReactor) => topReactor.pFlags.my);
        if(!topReactor) {
          topReactor = {
            _: 'messageReactor',
            count: 0,
            pFlags: {
              my: true
            }
          };
        }

        let myPeerId = sendAsPeerId;
        if(!myPeerId) {
          if(topReactor.pFlags.anonymous) {
            myPeerId = SEND_PAID_REACTION_ANONYMOUS_PEER_ID;
          } else if(topReactor.peer_id) {
            myPeerId = this.appPeersManager.getPeerId(topReactor.peer_id);
          } else if(paidReactionPrivacy._ === 'paidReactionPrivacyPeer') {
            myPeerId = this.appPeersManager.getPeerId(paidReactionPrivacy.peer);
          } else if(paidReactionPrivacy._ === 'paidReactionPrivacyDefault') {
            myPeerId = this.appPeersManager.peerId;
          } else {
            myPeerId = SEND_PAID_REACTION_ANONYMOUS_PEER_ID;
          }
        }

        delete topReactor.pFlags.anonymous;
        if(sendAsPeerId === SEND_PAID_REACTION_ANONYMOUS_PEER_ID) {
          topReactor.pFlags.anonymous = true;
          myPeerId = this.appPeersManager.peerId;
        }

        topReactor.peer_id = this.appPeersManager.getOutputPeer(myPeerId);

        topReactor.count += count;
        insertInDescendSortedArray(reactions.top_reactors, topReactor, 'count');
        topReactor.pFlags.top = reactions.top_reactors.indexOf(topReactor) < 3 || undefined;
      } else {
        ++reactionCount.count;
        reactionCount.chosen_order = chosenReactions.length ? chosenReactions[0].chosen_order + 1 : 0;
        chosenReactions.unshift(reactionCount);
      }

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

      const paidReactionIndex = reactions.results.findIndex((reactionCount) => reactionCount.reaction._ === 'reactionPaid');
      if(paidReactionIndex !== -1) {
        reactions.results.unshift(reactions.results.splice(paidReactionIndex, 1)[0]);
      }
    }

    if(onlyReturn) {
      return reactions;
    }

    if(onlyLocal) {
      message.reactions = reactions;
      this.rootScope.dispatchEvent('messages_reactions', [{
        message: message as Message.message,
        changedResults: [],
        removedResults: []
      }]);
      return;
    }

    this.apiUpdatesManager.processLocalUpdate({
      _: 'updateMessageReactions',
      peer: (message as Message.message).peer_id,
      msg_id: (message as Message.message).id,
      reactions: reactions,
      local: true
    });

    if(onlyLocalWithUpdate) {
      return;
    }

    const onUpdates = (updates: Updates) => {
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
      if(isPaidReaction) this.apiUpdatesManager.processPaidMessageUpdate({
        paidStars: count,
        wereStarsReserved: true
      });
    };

    const msgId = getServerMessageId(mid);
    if(isPaidReaction) {
      const currentTime = tsNow(true);

      const randomPart = Math.floor(Math.random() * Math.pow(2, 32));
      const uniqueId = bigInt(currentTime).shiftLeft(32).or(randomPart);
      const randomId = uniqueId.toString();

      this.apiManager.invokeApi('messages.sendPaidReaction', {
        count,
        msg_id: msgId,
        peer: this.appPeersManager.getInputPeerById(peerId),
        random_id: randomId,
        private: this.peerIdToPaidReactionPrivacy(sendAsPeerId)
      }).then(onUpdates);
      return;
    }

    const promiseKey = [peerId, mid].join('-');
    const promise = this.apiManager.invokeApi('messages.sendReaction', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: msgId,
      reaction: chosenReactions.map((reactionCount) => reactionCount.reaction).reverse()
    }).then(onUpdates).catch((err: ApiError) => {
      if(err.type === 'REACTION_INVALID' && this.sendReactionPromises.get(promiseKey) === promise) {
        this.sendReaction({
          message,
          reaction: chosenReactions[0]?.reaction,
          onlyLocal: true,
          sendAsPeerId
        });
      }
    }).finally(() => {
      if(this.sendReactionPromises.get(promiseKey) === promise) {
        this.sendReactionPromises.delete(promiseKey);
      }
    });

    this.sendReactionPromises.set(promiseKey, promise);
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

  private setSavedReactionTags(savedPeerId: PeerId, tags: SavedReactionTag[]) {
    this.savedReactionsTags.set(savedPeerId, tags);
    this.rootScope.dispatchEvent('saved_tags', {savedPeerId, tags});
  }

  public getSavedReactionTags(savedPeerId?: PeerId, overwrite?: boolean): MaybePromise<SavedReactionTag[]> {
    const {savedReactionsTags} = this;
    const cache = savedReactionsTags.get(savedPeerId);
    if(cache && !overwrite) {
      return cache;
    }

    const promise = this.apiManager.invokeApi('messages.getSavedReactionTags', {
      peer: savedPeerId ? this.appPeersManager.getInputPeerById(savedPeerId) : undefined,
      hash: 0
    }).then((messagesSavedReactionTags) => {
      const tags = (messagesSavedReactionTags as MessagesSavedReactionTags.messagesSavedReactionTags).tags || [];
      if(savedReactionsTags.get(savedPeerId) === promise) {
        // for(const tag of tags) {
        //   const {historyStorage} = this.appMessagesManager.processRequestHistoryOptions({
        //     peerId: peerId || this.appPeersManager.peerId,
        //     savedReaction: [tag.reaction as Reaction.reactionCustomEmoji]
        //   });

        //   historyStorage.count = tag.count;
        // }

        this.setSavedReactionTags(savedPeerId, tags);
      }

      return this.getSavedReactionTags(savedPeerId);
    });

    savedReactionsTags.set(savedPeerId, promise);
    return promise;
  }

  public async updateSavedReactionTag(reaction: Reaction, title?: string) {
    await this.apiManager.invokeApi('messages.updateSavedReactionTag', {reaction, title});
    const tags = await this.getSavedReactionTags();
    const tag = tags.find((tag) => reactionsEqual(tag.reaction, reaction));
    if(title) tag.title = title;
    else delete tag.title;
    this.apiUpdatesManager.processLocalUpdate({_: 'updateSavedReactionTags', tags});
  }

  public getAvailableEffects(overwrite?: boolean) {
    if(this.availableEffects && overwrite) {
      this.availableEffects = undefined;
    }

    return this.availableEffects ??= this.apiManager.invokeApiSingleProcess({
      method: 'messages.getAvailableEffects',
      processResult: (availableEffects) => {
        assumeType<MessagesAvailableEffects.messagesAvailableEffects>(availableEffects);
        availableEffects.documents.forEach((doc, idx, arr) => {
          arr[idx] = this.appDocsManager.saveDoc(doc);
        });

        availableEffects.effects.forEach((availableEffect) => {
          availableEffect.emoticon = fixEmoji(availableEffect.emoticon);
        });

        return this.availableEffects = availableEffects.effects;
      }
    });
  }

  public getAvailableEffect(effect: DocId) {
    return callbackify(this.getAvailableEffects(), (effects) => {
      return effects.find((availableEffect) => availableEffect.id === effect);
    });
  }

  public async searchAvailableEffects({q, emoticon}: {q?: string, emoticon?: string[]}) {
    const [emojis, availableEffects] = await Promise.all([
      q?.trim() ? (await this.appEmojiManager.prepareAndSearchEmojis({q, limit: Infinity})).map((emoji) => emoji.emoji) : emoticon,
      this.getAvailableEffects()
    ]);

    const set = new Set(emojis);
    return availableEffects.filter((availableEffect) => set.has(availableEffect.emoticon));
  }

  public processMessageReactionsChanges({message, changedResults, removedResults, savedPeerId}: BroadcastEvents['messages_reactions'][0] & {savedPeerId?: PeerId}) {
    if(message.peerId !== this.appPeersManager.peerId) {
      return;
    }

    const {reactions} = message;
    if(reactions && !reactions.pFlags.reactions_as_tags) {
      return;
    }

    if(savedPeerId === undefined) {
      this.processMessageReactionsChanges({
        message,
        changedResults,
        removedResults,
        savedPeerId: this.appPeersManager.getPeerId(message.saved_peer_id)
      });
    }

    const tags = this.savedReactionsTags.get(savedPeerId);
    if(!tags) {
      return;
    }

    if(tags instanceof Promise) {
      this.apiUpdatesManager.processLocalUpdate({_: 'updateSavedReactionTags', savedPeerId});
      return;
    }

    assumeType<SavedReactionTag[]>(tags);

    const getTagLongId = (tag: SavedReactionTag) => {
      const docId = (tag.reaction as Reaction.reactionCustomEmoji).document_id;
      if(docId) {
        return bigInt('' + docId, 10);
      }

      return bigIntFromBytes(bytesFromHex(md5((tag.reaction as Reaction.reactionEmoji).emoticon).slice(0, 16)));
    };

    const insert = (tag: SavedReactionTag) => {
      const cmp = (tag1: SavedReactionTag, tag2: SavedReactionTag) => {
        const diff = tag1.count - tag2.count;
        if(diff) {
          return diff;
        }

        const tag1LongId = getTagLongId(tag1);
        const tag2LongId = getTagLongId(tag2);
        return tag1LongId.compare(tag2LongId);
      };

      insertInDescendSortedArray(
        tags,
        tag,
        ((tag: any) => tag) as any,
        undefined,
        cmp as any
      );
    };

    for(const reactionCount of removedResults) {
      const index = tags.findIndex((tag) => reactionsEqual(tag.reaction, reactionCount.reaction));
      const tag = tags[index];
      if(!tag) {
        continue;
      }

      if(!--tag.count) {
        tags.splice(index, 1);
      } else {
        insert(tag);
      }
    }

    for(const reactionCount of changedResults) {
      let tag = tags.find((tag) => reactionsEqual(tag.reaction, reactionCount.reaction));
      if(!tag) {
        tag = {
          _: 'savedReactionTag',
          count: 0,
          reaction: reactionCount.reaction
        };
      }

      ++tag.count;
      insert(tag);
    }

    this.apiUpdatesManager.processLocalUpdate({
      _: 'updateSavedReactionTags',
      tags,
      savedPeerId
    });
  }

  public async getPaidReactionPrivacy() {
    if(!this.paidReactionPrivacy) {
      const response = await this.apiManager.invokeApiSingleProcess({
        method: 'messages.getPaidReactionPrivacy',
        params: {}
      });

      if(!this.paidReactionPrivacy) { // (good) if not set in another request or update
        const update = (response as Updates.updates).updates[0] as Update.updatePaidReactionPrivacy;
        this.onUpdatePaidReactionPrivacy(update);
      }
    }

    return this.paidReactionPrivacy;
  }

  private peerIdToPaidReactionPrivacy(peerId: PeerId) {
    let privacy: PaidReactionPrivacy;
    if(peerId === SEND_PAID_REACTION_ANONYMOUS_PEER_ID) {
      privacy = {_: 'paidReactionPrivacyAnonymous'};
    } else if(peerId === this.appPeersManager.peerId) {
      privacy = {_: 'paidReactionPrivacyDefault'};
    } else if(peerId) {
      privacy = {_: 'paidReactionPrivacyPeer', peer: this.appPeersManager.getInputPeerById(peerId)};
    }

    return privacy;
  }

  public togglePaidReactionPrivacy(peerId: PeerId, mid: number, sendAsPeerId: PeerId) {
    return this.apiManager.invokeApi('messages.togglePaidReactionPrivacy', {
      peer: this.appPeersManager.getInputPeerById(peerId),
      msg_id: getServerMessageId(mid),
      private: this.peerIdToPaidReactionPrivacy(sendAsPeerId)
    }).then(() => {
      this.sendReaction({
        message: this.appMessagesManager.getMessageByPeer(peerId, mid),
        count: 0,
        onlyLocalWithUpdate: true,
        reaction: {_: 'reactionPaid'},
        sendAsPeerId
      });
    });
  }

  private onUpdatePaidReactionPrivacy = (update: Update.updatePaidReactionPrivacy) => {
    this.paidReactionPrivacy = update.private;
  };
}
