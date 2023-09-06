/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatInput from './input';
import type {BotInfo, ChatFull, UserFull} from '../../layer';
import AutocompleteHelperController from './autocompleteHelperController';
import AutocompletePeerHelper from './autocompletePeerHelper';
import SearchIndex from '../../lib/searchIndex';
import {AppManagers} from '../../lib/appManagers/managers';

export function processPeerFullForCommands(peerId: PeerId, full: ChatFull.chatFull | ChatFull.channelFull | UserFull.userFull, query?: string) {
  const botInfos: BotInfo.botInfo[] = [].concat(full.bot_info);
  let index: SearchIndex<string>;

  if(query !== undefined) {
    index = new SearchIndex<string>({
      ignoreCase: true
    });
  }

  type T = {peerId: PeerId, name: string, description: string, index: number, command: string};
  const commands: Map<string, T> = new Map();
  botInfos.forEach((botInfo) => {
    if(!botInfo.commands) {
      return;
    }

    botInfo.commands.forEach(({command, description}, idx) => {
      const c = '/' + command;
      commands.set(command, {
        peerId: botInfo.user_id ? botInfo.user_id.toPeerId(false) : peerId,
        command: command,
        name: c,
        description: description,
        index: idx
      });

      if(index) {
        index.indexObject(command, c);
      }
    });
  });

  let out: T[];
  if(!index) {
    out = [...commands.values()];
  } else {
    const found = index.search(query);
    out = Array.from(found).map((command) => commands.get(command));
  }

  out = out.sort((a, b) => commands.get(a.command).index - commands.get(b.command).index);

  return out;
}

export default class CommandsHelper extends AutocompletePeerHelper {
  constructor(
    appendTo: HTMLElement,
    controller: AutocompleteHelperController,
    chatInput: ChatInput,
    private managers: AppManagers
  ) {
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

  public async checkQuery(query: string, peerId: PeerId) {
    if(!(await this.managers.appUsersManager.isBot(peerId))) {
      return false;
    }

    const middleware = this.controller.getMiddleware();
    this.managers.appProfileManager.getProfileByPeerId(peerId).then((full) => {
      if(!middleware()) {
        return;
      }

      const filtered = processPeerFullForCommands(peerId, full, query);
      this.render(filtered, middleware);
      // console.log('found commands', found, filtered);
    });

    return true;
  }
}
