/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatInput from "./input";
import type { AppProfileManager } from "../../lib/appManagers/appProfileManager";
import type { AppUsersManager } from "../../lib/appManagers/appUsersManager";
import type { BotInfo, ChatFull, UserFull } from "../../layer";
import AutocompleteHelperController from "./autocompleteHelperController";
import AutocompletePeerHelper from "./autocompletePeerHelper";
import SearchIndex from "../../lib/searchIndex";

export function processPeerFullForCommands(full: ChatFull.chatFull | ChatFull.channelFull | UserFull.userFull, query?: string) {
  const botInfos: BotInfo.botInfo[] = [].concat(full.bot_info);
  let index: SearchIndex<string>; 
  
  if(query !== undefined) {
    index = new SearchIndex<string>({
      ignoreCase: true
    });
  }
  
  type T = {peerId: PeerId, name: string, description: string, index: number, command: string};
  const commands: Map<string, T> = new Map();
  botInfos.forEach(botInfo => {
    botInfo.commands.forEach((botCommand, idx) => {
      const c = '/' + botCommand.command;
      commands.set(botCommand.command, {
        peerId: botInfo.user_id.toPeerId(false), 
        command: botCommand.command, 
        name: c, 
        description: botCommand.description,
        index: idx
      });

      if(index) {
        index.indexObject(botCommand.command, c);
      }
    });
  });

  let out: T[];
  if(!index) {
    out = [...commands.values()];
  } else {
    const found = index.search(query);
    out = Array.from(found).map(command => commands.get(command));
  }

  out = out.sort((a, b) => commands.get(a.command).index - commands.get(b.command).index);
  
  return out;
}

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

  public checkQuery(query: string, peerId: PeerId) {
    if(!this.appUsersManager.isBot(peerId)) {
      return false;
    }

    const middleware = this.controller.getMiddleware();
    Promise.resolve(this.appProfileManager.getProfileByPeerId(peerId)).then(full => {
      if(!middleware()) {
        return;
      }

      const filtered = processPeerFullForCommands(full, query);
      this.render(filtered);
      // console.log('found commands', found, filtered);
    });

    return true;
  }
}
