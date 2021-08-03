/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatInput from "./input";
import type { MessageEntity } from "../../layer";
import type { AppProfileManager } from "../../lib/appManagers/appProfileManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import AutocompleteHelperController from "./autocompleteHelperController";
import AutocompletePeerHelper from "./autocompletePeerHelper";

export default class MentionsHelper extends AutocompletePeerHelper {
  constructor(appendTo: HTMLElement, 
    controller: AutocompleteHelperController, 
    chatInput: ChatInput, 
    private appProfileManager: AppProfileManager,
    private appUsersManager: AppUsersManager) {
    super(appendTo, 
      controller,
      'mentions-helper',
      (target) => {
        const user = appUsersManager.getUser(+(target as HTMLElement).dataset.peerId);
        let str = '', entity: MessageEntity;
        if(user.username) {
          str = '@' + user.username;
        } else {
          str = user.first_name || user.last_name;
          entity = {
            _: 'messageEntityMentionName',
            length: str.length,
            offset: 0,
            user_id: user.id
          };
        }

        str += ' ';
        chatInput.insertAtCaret(str, entity);
      }
    );
  }

  public checkQuery(query: string, peerId: number, topMsgId: number) {
    const trimmed = query.trim(); // check that there is no whitespace
    if(query.length !== trimmed.length) return false;

    const middleware = this.controller.getMiddleware();
    this.appProfileManager.getMentions(peerId ? -peerId : 0, trimmed, topMsgId).then(peerIds => {
      if(!middleware()) return;
      
      const username = trimmed.slice(1).toLowerCase();
      this.render(peerIds.map(peerId => {
        const user = this.appUsersManager.getUser(peerId);
        if(user.username && user.username.toLowerCase() === username) { // hide full matched suggestion
          return;
        }

        return {
          peerId,
          description: user.username ? '@' + user.username : undefined
        };
      }).filter(Boolean));
    });

    return true;
  }
}
