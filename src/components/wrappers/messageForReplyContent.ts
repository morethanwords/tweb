import type {MyDraftMessage} from '@appManagers/appDraftsManager';
import type {MyMessage} from '@appManagers/appMessagesManager';
import type {DraftMessage, Message} from '@layer';
import getRichMessagePreview from '@components/wrappers/richMessagePreview';

export default function getMessageForReplyContent(
  message: MyMessage | MyDraftMessage,
  explicitText?: string
) {
  let text = explicitText ?? (message as Message.message).message;
  let entities = (message as Message.message).totalEntities ??
    (message as DraftMessage.draftMessage).entities;

  // a rich message's preview is already one line of its own length (getRichMessagePreview)
  const richMessage = (message as Message.message | DraftMessage.draftMessage).rich_message;
  const isRichPreview = explicitText === undefined && !!richMessage;
  if(isRichPreview) {
    const preview = getRichMessagePreview(richMessage);
    text = preview.text;
    entities = preview.entities;
  }

  return {text, entities, isRichPreview};
}
