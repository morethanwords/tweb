export default function getMediaFromMessage(message: any) {
  return message.action ? 
    message.action.photo : 
    message.media && (
      message.media.photo || 
      message.media.document || (
        message.media.webpage && (
          message.media.webpage.document || 
          message.media.webpage.photo
        )
      )
    );
}
