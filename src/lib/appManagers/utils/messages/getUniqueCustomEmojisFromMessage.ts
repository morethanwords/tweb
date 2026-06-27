import filterUnique from '@helpers/array/filterUnique';
import {Message, MessageEntity, Reaction, MessageMedia} from '@layer';

export default function getUniqueCustomEmojisFromMessage(message: Message) {
  const docIds: DocId[] = [];

  const iterateEntities = (entities: MessageEntity[]) => {
    if(!entities) {
      return;
    }

    const filtered = entities.filter((entity) => entity._ === 'messageEntityCustomEmoji') as MessageEntity.messageEntityCustomEmoji[];
    docIds.push(...filtered.map((entity) => entity.document_id));
  };

  iterateEntities((message as Message.message).entities);

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
