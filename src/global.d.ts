import type ListenerSetter from './helpers/listenerSetter';
import type {Chat, Document, User} from './layer';

declare global {
  interface AddEventListenerOptions extends EventListenerOptions {
    once?: boolean;
    passive?: boolean;
    // ls?: ListenerSetter;
  }

  interface HTMLCanvasElement {
    dpr?: number
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

  type ApiFileManagerError = 'DOWNLOAD_CANCELED' | 'UPLOAD_CANCELED' | 'FILE_TOO_BIG' | 'REFERENCE_IS_NOT_REFRESHED';
  type StorageError = 'STORAGE_OFFLINE' | 'NO_ENTRY_FOUND' | 'IDB_CREATE_TIMEOUT';
  type ReferenceError = 'NO_NEW_CONTEXT';
  type NetworkerError = 'NETWORK_BAD_RESPONSE';
  type FiltersError = 'PINNED_DIALOGS_TOO_MUCH';

  type LocalFileError = ApiFileManagerError | ReferenceError | StorageError;
  type LocalErrorType = LocalFileError | NetworkerError | FiltersError | 'UNKNOWN';

  type ServerErrorType = 'FILE_REFERENCE_EXPIRED' | 'SESSION_REVOKED' | 'AUTH_KEY_DUPLICATED' |
    'SESSION_PASSWORD_NEEDED' | 'CONNECTION_NOT_INITED' | 'ERROR_EMPTY' | 'MTPROTO_CLUSTER_INVALID' |
    'BOT_PRECHECKOUT_TIMEOUT' | 'TMP_PASSWORD_INVALID' | 'PASSWORD_HASH_INVALID' | 'CHANNEL_PRIVATE';

  type ErrorType = LocalErrorType | ServerErrorType;

  interface Error {
    type?: ErrorType;
  }

  type ApiError = Partial<{
    code: number,
    type: ErrorType,
    description: string,
    originalError: any,
    stack: string,
    handled: boolean,
    input: string,
    message: ApiError
  }>;

  declare const electronHelpers: {
    openExternal(url): void;
  } | undefined;
}
