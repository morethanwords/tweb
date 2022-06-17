/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatInput from "./input";
import type { MessageEntity } from "../../layer";
import AutocompleteHelperController from "./autocompleteHelperController";
import AutocompletePeerHelper from "./autocompletePeerHelper";
import { AppManagers } from "../../lib/appManagers/managers";

export default class MentionsHelper extends AutocompletePeerHelper {
  constructor(
    appendTo: HTMLElement, 
    controller: AutocompleteHelperController, 
    chatInput: ChatInput, 
    private managers: AppManagers
  ) {
    super(
      appendTo, 
      controller,
      'mentions-helper',
      (target) => {
        const userId = (target as HTMLElement).dataset.peerId.toUserId();
        const user = Promise.resolve(managers.appUsersManager.getUser(userId)).then((user) => {
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
        });
      }
    );
  }

  public checkQuery(query: string, peerId: PeerId, topMsgId: number) {
    const trimmed = query.trim(); // check that there is no whitespace
    if(query.length !== trimmed.length) return false;

    const middleware = this.controller.getMiddleware();
    this.managers.appProfileManager.getMentions(peerId && peerId.toChatId(), trimmed, topMsgId).then(async(peerIds) => {
      if(!middleware()) return;
      
      const username = trimmed.slice(1).toLowerCase();

      const p = peerIds.map(async(peerId) => {
        const user = await this.managers.appUsersManager.getUser(peerId);
        if(user.username && user.username.toLowerCase() === username) { // hide full matched suggestion
          return;
        }

        return {
          peerId,
          description: user.username ? '@' + user.username : undefined
        };
      });

      this.render((await Promise.all(p)).filter(Boolean));
    });

    return true;
  }
}
