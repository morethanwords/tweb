import type ChatInput from '@components/chat/input';
import AutocompleteHelperController from '@components/chat/autocompleteHelperController';
import AutocompletePeerHelper from '@components/chat/autocompletePeerHelper';
import {AppManagers} from '@lib/managers';
import processPeerFullForCommands from '@components/chat/processPeerFullForCommands';

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
