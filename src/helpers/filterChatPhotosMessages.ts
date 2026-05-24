import type {Message, MessageAction} from '@layer';
import type {HistoryResult, MyMessage} from '@appManagers/appMessagesManager';
import forEachReverse from '@helpers/array/forEachReverse';

export default function filterChatPhotosMessages(value: HistoryResult) {
  forEachReverse(value.messages, (message, idx, arr) => {
    if(!((message as Message.messageService).action as MessageAction.messageActionChatEditPhoto).photo) {
      arr.splice(idx, 1);
      if(value.count !== undefined) {
        --value.count;
      }
    }
  });
}
