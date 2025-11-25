import {Message} from '../../../../layer';

export const getPhoto = (message: Message) => {
  if(message?._ !== 'message' || message?.media?._ !== 'messageMediaPhoto' || message?.media?.photo?._ !== 'photo') return;
  return message.media.photo;
};
