import type ChatInput from '@components/chat/input';
import AutocompleteHelperController from '@components/chat/autocompleteHelperController';
import AutocompletePeerHelper from '@components/chat/autocompletePeerHelper';
import {AppManagers} from '@lib/managers';
import processPeerFullForCommands from '@components/chat/processPeerFullForCommands';
import hideCommandAutocomplete from '@components/chat/hideCommandAutocomplete';
import apiManagerProxy from '@lib/apiManagerProxy';
import getPeerActiveUsernames from '@appManagers/utils/peers/getPeerActiveUsernames';

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
        const targetElement = target as HTMLElement;
        const botPeerId = targetElement.dataset.peerId.toPeerId();
        let innerHTML = target.querySelector(`.${AutocompletePeerHelper.BASE_CLASS_LIST_ELEMENT}-name`).innerHTML;
        if(chatInput.chat.peerId.isAnyChat()) {
          const username = getPeerActiveUsernames(apiManagerProxy.getPeer(botPeerId))[0];
          if(username) {
            innerHTML += '@' + username;
          }
        }

        const ephemeralReceiverId = chatInput.chat.peerId.isAnyChat() &&
          targetElement.dataset.ephemeral === '1' ?
          botPeerId.toUserId() :
          undefined;
        hideCommandAutocomplete(controller);
        return chatInput.getReadyToSend(() => {
          chatInput.messageInput.innerHTML = innerHTML;
          chatInput.sendMessage(true, ephemeralReceiverId);
        });
      }
    );
  }

  public async checkQuery(query: string, peerId: PeerId) {
    const [isBot, isGroup] = await Promise.all([
      this.managers.appUsersManager.isBot(peerId),
      this.managers.appPeersManager.isAnyGroup(peerId)
    ]);
    if(!isBot && !isGroup) {
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
