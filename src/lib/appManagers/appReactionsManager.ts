/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import assumeType from "../../helpers/assumeType";
import callbackify from "../../helpers/callbackify";
import { AvailableReaction, MessagesAvailableReactions } from "../../layer";
import apiManager from "../mtproto/mtprotoworker";
import { ReferenceContext } from "../mtproto/referenceDatabase";
import rootScope from "../rootScope";
import appDocsManager from "./appDocsManager";

const SAVE_DOC_KEYS = [
  'static_icon' as const,
  'appear_animation' as const,
  'select_animation' as const,
  'activate_animation' as const,
  'effect_animation' as const,
  'around_animation' as const,
  'center_icon' as const
];

const REFERENCE_CONTEXXT: ReferenceContext = {
  type: 'reactions'
};

export class AppReactionsManager {
  private availableReactions: AvailableReaction[];

  constructor() {
    rootScope.addEventListener('language_change', () => {
      this.availableReactions = undefined;
      this.getAvailableReactions();
    });
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
            
            reaction[key] = appDocsManager.saveDoc(reaction[key], REFERENCE_CONTEXXT);
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

  public isReactionActive(reaction: string) {
    if(!this.availableReactions) return false;
    return !!this.availableReactions.find(availableReaction => availableReaction.reaction === reaction);
  }

  public getQuickReaction() {
    return Promise.all([
      apiManager.getAppConfig(), 
      this.getAvailableReactions()
    ]).then(([appConfig, availableReactions]) => {
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

  /* public getMessagesReactions(peerId: PeerId, mids: number[]) {
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
  } */

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
}

const appReactionsManager = new AppReactionsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appReactionsManager = appReactionsManager);
export default appReactionsManager;
