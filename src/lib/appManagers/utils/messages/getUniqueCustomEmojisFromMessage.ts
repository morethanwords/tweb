import filterUnique from '@helpers/array/filterUnique';
import {Message, MessageEntity, Reaction, MessageMedia} from '@layer';
import {flattenRichMessageContent} from '@lib/richMessage';

export default function getUniqueCustomEmojisFromMessage(message: Message) {
  const docIds: DocId[] = [];

  const iterateEntities = (entities: MessageEntity[]) => {
    if(!entities) {
      return;
    }

    // * an image in a rich text is drawn by the same entity, with its size: it is no emoji of a pack
    const filtered = entities.filter((entity) => entity._ === 'messageEntityCustomEmoji' && !entity.w) as MessageEntity.messageEntityCustomEmoji[];
    docIds.push(...filtered.map((entity) => entity.document_id));
  };

  iterateEntities((message as Message.message).entities);

  // * a rich message keeps its text in its blocks, not in `message`
  const richMessage = (message as Message.message).rich_message;
  if(richMessage) {
    iterateEntities(flattenRichMessageContent(richMessage).entities);
  }

  const reactions = (message as Message.message).reactions;
  if(reactions) {
    const results = reactions.results.filter((reactionCount) => reactionCount.reaction._ === 'reactionCustomEmoji');
    docIds.push(...results.map((reactionCount) => (reactionCount.reaction as Reaction.reactionCustomEmoji).document_id));
  }

  const poll = ((message as Message.message).media as MessageMedia.messageMediaPoll)?.poll;
  if(poll) {
    iterateEntities(poll.question.entities);
    poll.answers.forEach((answer) => {
      iterateEntities(answer.text.entities);
    });
  }

  const todo = ((message as Message.message).media as MessageMedia.messageMediaToDo)?.todo;
  if(todo) {
    iterateEntities(todo.title.entities);
    todo.list.forEach((item) => {
      iterateEntities(item.title.entities);
    });
  }

  return filterUnique(docIds);
}
