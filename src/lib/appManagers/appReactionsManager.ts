/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MOUNT_CLASS_TO } from "../../config/debug";
import assumeType from "../../helpers/assumeType";
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
    if(this.availableReactions) return Promise.resolve(this.availableReactions);
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

  public getQuickReaction() {
    return Promise.all([
      apiManager.getAppConfig(), 
      this.getAvailableReactions()
    ]).then(([appConfig, availableReactions]) => {
      return availableReactions.find(reaction => reaction.reaction === appConfig.reactions_default);
    });
  }
}

const appReactionsManager = new AppReactionsManager();
MOUNT_CLASS_TO && (MOUNT_CLASS_TO.appReactionsManager = appReactionsManager);
export default appReactionsManager;
