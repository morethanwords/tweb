import type ListenerSetter from "./helpers/listenerSetter";
import type { Chat, Document, User } from "./layer";

declare global {
  interface AddEventListenerOptions extends EventListenerOptions {
    once?: boolean;
    passive?: boolean;
    // ls?: ListenerSetter;
  }

  type UserId = User.user['id'];
  type ChatId = Chat.chat['id'];
  // type PeerId = `u${UserId}` | `c${ChatId}`;
  // type PeerId = `${UserId}` | `-${ChatId}`;
  type PeerId = number;
  // type PeerId = number;
  type BotId = UserId;
  type DocId = Document.document['id'];
  type Long = string | number;
  type MTLong = string;

  type LocalErrorType = 'DOWNLOAD_CANCELED';
  type ServerErrorType = 'FILE_REFERENCE_EXPIRED';

  interface Error {
    type?: LocalErrorType | ServerErrorType;
  }

  declare module 'worker-loader!*' {
    class WebpackWorker extends Worker {
      constructor();
    }
  
    export default WebpackWorker;
  }

  declare const electronHelpers: {
    openExternal(url): void;
  } | undefined;
}
