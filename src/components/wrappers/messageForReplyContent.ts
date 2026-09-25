import type {MyDraftMessage} from '@appManagers/appDraftsManager';
import type {MyMessage} from '@appManagers/appMessagesManager';
import type {DraftMessage, Message} from '@layer';
import {flattenRichMessageSummary} from '@lib/richMessage';

export default function getMessageForReplyContent(
  message: MyMessage | MyDraftMessage,
  explicitText?: string
) {
  let text = explicitText ?? (message as Message.message).message;
  let entities = (message as Message.message).totalEntities ??
    (message as DraftMessage.draftMessage).entities;

  const richMessage = (message as Message.message | DraftMessage.draftMessage).rich_message;
  if(explicitText === undefined && richMessage) {
    const summary = flattenRichMessageSummary(richMessage);
    text = summary.text;
    entities = summary.entities;
  }

  return {text, entities};
}
