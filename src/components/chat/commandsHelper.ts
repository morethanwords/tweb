/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatInput from "./input";
import type { AppProfileManager } from "../../lib/appManagers/appProfileManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import type { BotInfo } from "../../layer";
import AutocompleteHelperController from "./autocompleteHelperController";
import AutocompletePeerHelper from "./autocompletePeerHelper";
import SearchIndex from "../../lib/searchIndex";

export default class CommandsHelper extends AutocompletePeerHelper {
  constructor(appendTo: HTMLElement, 
    controller: AutocompleteHelperController, 
    chatInput: ChatInput, 
    private appProfileManager: AppProfileManager,
    private appUsersManager: AppUsersManager) {
    super(appendTo, 
      controller,
      'commands-helper',
      (target) => {
        const innerHTML = target.querySelector(`.${AutocompletePeerHelper.BASE_CLASS_LIST_ELEMENT}-name`).innerHTML;
        return chatInput.getReadyToSend(() => {
          chatInput.messageInput.innerHTML = innerHTML;
          chatInput.sendMessage(true);
        });
      }
    );
  }

  public checkQuery(query: string, peerId: number) {
    if(!this.appUsersManager.isBot(peerId)) {
      return false;
    }

    const middleware = this.controller.getMiddleware();
    this.appProfileManager.getProfileByPeerId(peerId).then(full => {
      if(!middleware()) {
        return;
      }

      const botInfos: BotInfo.botInfo[] = [].concat(full.bot_info);
      const index = new SearchIndex<string>({
        ignoreCase: true
      });
      
      const commands: Map<string, {peerId: number, name: string, description: string}> = new Map();
      botInfos.forEach(botInfo => {
        botInfo.commands.forEach(botCommand => {
          const c = '/' + botCommand.command;
          commands.set(botCommand.command, {
            peerId: botInfo.user_id, 
            name: c, 
            description: botCommand.description
          });

          index.indexObject(botCommand.command, c);
        });
      });

      const found = index.search(query);
      const filtered = Array.from(found).map(command => commands.get(command));
      this.render(filtered);
      // console.log('found commands', found, filtered);
    });

    return true;
  }
}
