/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatInput from "./input";
import type { MessageEntity } from "../../layer";
import AutocompleteHelperController from "./autocompleteHelperController";
import AutocompletePeerHelper from "./autocompletePeerHelper";
import appUsersManager from "../../lib/appManagers/appUsersManager";

export default class MentionsHelper extends AutocompletePeerHelper {
  constructor(appendTo: HTMLElement, controller: AutocompleteHelperController, private chatInput: ChatInput) {
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
}
