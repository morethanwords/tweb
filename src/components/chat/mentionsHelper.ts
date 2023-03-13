/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type ChatInput from './input';
import AutocompleteHelperController from './autocompleteHelperController';
import AutocompletePeerHelper from './autocompletePeerHelper';
import {AppManagers} from '../../lib/appManagers/managers';
import getPeerActiveUsernames from '../../lib/appManagers/utils/peers/getPeerActiveUsernames';
import rootScope from '../../lib/rootScope';

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
        chatInput.mentionUser(userId, true);
      }
    );
  }

  public checkQuery(query: string, peerId: PeerId, topMsgId: number) {
    const trimmed = query.trim(); // check that there is no whitespace
    if(query.length !== trimmed.length) return false;

    const middleware = this.controller.getMiddleware();
    this.managers.appProfileManager.getMentions(peerId && peerId.toChatId(), trimmed, topMsgId).then(async(peerIds) => {
      if(!middleware()) return;

      peerIds = peerIds.filter((peerId) => peerId !== rootScope.myId);

      // const username = trimmed.slice(1).toLowerCase();

      const p = peerIds.map(async(peerId) => {
        const user = await this.managers.appUsersManager.getUser(peerId);
        const usernames = getPeerActiveUsernames(user);
        // if(usernames.length && usernames.some((_username) => _username.toLowerCase() === username)) { // hide full matched suggestion
        //   return;
        // }

        return {
          peerId,
          description: usernames[0] ? '@' + usernames[0] : undefined
        };
      });

      this.render((await Promise.all(p)).filter(Boolean));
    });

    return true;
  }
}
