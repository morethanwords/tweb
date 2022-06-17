import { Document, Message, MessageAction, MessageMedia, Photo, WebPage } from "../../../../layer";

export default function getMediaFromMessage(message: Message) {
  if(!message) return;
  
  const media = (message as Message.messageService).action ? 
    ((message as Message.messageService).action as MessageAction.messageActionChannelEditPhoto).photo : 
    (message as Message.message).media && (
      ((message as Message.message).media as MessageMedia.messageMediaPhoto).photo || 
      ((message as Message.message).media as MessageMedia.messageMediaDocument).document || (
        ((message as Message.message).media as MessageMedia.messageMediaWebPage).webpage && (
          (((message as Message.message).media as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage).document || 
          (((message as Message.message).media as MessageMedia.messageMediaWebPage).webpage as WebPage.webPage).photo
        )
      )
    );

  return media as Photo.photo | Document.document;
}
