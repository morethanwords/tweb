import assumeType from "../../../../helpers/assumeType";
import { Message, MessageEntity } from "../../../../layer";

export default function getAlbumText(messages: Message.message[]) {
  let foundMessages = 0, message: string, totalEntities: MessageEntity[], entities: MessageEntity[];
  for(const m of messages) {
    assumeType<Message.message>(m);
    if(m.message) {
      if(++foundMessages > 1) break;
      message = m.message;
      totalEntities = m.totalEntities;
      entities = m.entities;
    }
  }

  if(foundMessages > 1) {
    message = undefined;
    totalEntities = undefined;
    entities = undefined;
  }

  return {message, entities, totalEntities};
}
