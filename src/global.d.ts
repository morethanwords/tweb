import type ListenerSetter from './helpers/listenerSetter';
import type {Middleware, MiddlewareHelper} from './helpers/middleware';
import type {Chat, Document, Message, User} from './layer';
import type {MediaSize} from './helpers/mediaSize';
import type {AnimationItemGroup} from './components/animationIntersector';
import type LazyLoadQueue from './components/lazyLoadQueue';
import type {AppManagers} from './lib/appManagers/managers';
import type {CustomProperty} from './helpers/dom/customProperties';
import type Icons from './icons';
import type {CancellablePromise} from './helpers/cancellablePromise';
import type Languages from './lib/tinyld/languages';

declare global {
  interface AddEventListenerOptions extends EventListenerOptions {
    once?: boolean;
    passive?: boolean;
    // ls?: ListenerSetter;
  }

  interface HTMLCanvasElement {
    dpr?: number
  }

  interface HTMLElement {
    middlewareHelper?: MiddlewareHelper;
    timeAppenders?: {element: HTMLElement, callback: () => void}[];
    timeSpan?: HTMLElement;
    onMiniVideoMouseMove?: (e: MouseEvent) => void;
    message?: Message;
    // middleware?: Middleware;
  }

  interface HTMLMediaElement {
    isSeeking?: boolean;
    ignoreLeak?: boolean;
  }

  interface HTMLVideoElement {
    _loop?: boolean | number;
    _autoplay?: boolean;
    mini?: boolean;
  }

  interface Window {
    Prism?: {
      manual?: boolean
    };
  }

  interface NotificationAction {
    action: string;
    title: string;
  }

  interface NotificationOptions {
    actions?: NotificationAction[];
  }

  // typescript is lack of types
  interface Selection {
    modify(alter: 'move' | 'extend', direction: 'forward' | 'backward' | 'left' | 'right', granularity: 'character' | 'word' | 'sentence' | 'line' | 'paragraph' | 'lineboundary' | 'sentenceboundary' | 'paragraphboundary' | 'documentboundary'): void;
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

  type AppEmoji = {emoji: string, docId?: DocId};
  type Icon = keyof typeof Icons;
  type PremiumPromoFeatureType = 'stories' | 'double_limits' | 'voice_to_text' | 'faster_download' |
    'translations' | 'animated_emoji' | 'more_upload' | 'emoji_status' | 'profile_badge' |
    'advanced_chat_management' | 'no_ads' | 'app_icons' | 'infinite_reactions' |
    'animated_userpics' | 'premium_stickers' | 'peer_colors' | 'wallpapers' |
    'saved_tags' | 'last_seen' | 'message_privacy';

  type MTMimeType = 'video/quicktime' | 'image/gif' | 'image/jpeg' | 'application/pdf' |
    'video/mp4' | 'image/webp' | 'audio/mpeg' | 'audio/ogg' | 'application/octet-stream' |
    'application/x-tgsticker' | 'video/webm' | 'image/svg+xml' | 'image/png' | 'application/json' |
    'application/x-tgwallpattern' | 'audio/wav' | 'image/avif' | 'image/jxl' | 'image/bmp' |
    'application/x-mpegurl';

  type MTFileExtension = 'mov' | 'gif' | 'pdf' | 'jpg' | 'jpeg' | 'wav' |
    'tgv' | 'tgs' | 'svg' | 'mp4' | 'webm' | 'webp' | 'mp3' | 'ogg' | 'json' |
    'png' | 'avif' | 'jxl' | 'bmp';

  type ApiFileManagerError = 'DOWNLOAD_CANCELED' | 'UPLOAD_CANCELED' | 'FILE_TOO_BIG' | 'REFERENCE_IS_NOT_REFRESHED';
  type StorageError = 'STORAGE_OFFLINE' | 'NO_ENTRY_FOUND' | 'IDB_CREATE_TIMEOUT';
  type ReferenceError = 'NO_NEW_CONTEXT';
  type NetworkerError = 'NETWORK_BAD_RESPONSE' | 'NETWORK_BAD_REQUEST';
  type FiltersError = 'PINNED_DIALOGS_TOO_MUCH';

  type LocalFileError = ApiFileManagerError | ReferenceError | StorageError;
  type LocalErrorType = LocalFileError | NetworkerError | FiltersError |
    'UNKNOWN' | 'NO_DOC' | 'MIDDLEWARE' | 'PORT_DISCONNECTED' | 'NO_AUTO_DOWNLOAD' | 'CHAT_PRIVATE' | 'NO_WASM' | 'CANCELED';

  type ServerErrorType = 'FILE_REFERENCE_EXPIRED' | 'SESSION_REVOKED' | 'AUTH_KEY_DUPLICATED' |
    'SESSION_PASSWORD_NEEDED' | 'CONNECTION_NOT_INITED' | 'ERROR_EMPTY' | 'MTPROTO_CLUSTER_INVALID' |
    'BOT_PRECHECKOUT_TIMEOUT' | 'TMP_PASSWORD_INVALID' | 'PASSWORD_HASH_INVALID' | 'CHANNEL_PRIVATE' |
    'VOICE_MESSAGES_FORBIDDEN' | 'PHOTO_INVALID_DIMENSIONS' | 'PHOTO_SAVE_FILE_INVALID' |
    'USER_ALREADY_PARTICIPANT' | 'USERNAME_INVALID' | 'USERNAME_PURCHASE_AVAILABLE' | 'USERNAMES_ACTIVE_TOO_MUCH' |
    'BOT_INVALID' | 'USERNAME_NOT_OCCUPIED' | 'PINNED_TOO_MUCH' | 'LOCATION_INVALID' |
    'FILE_ID_INVALID' | 'CHANNEL_FORUM_MISSING' | 'TRANSCRIPTION_FAILED' | 'USER_NOT_PARTICIPANT' |
    'PEER_ID_INVALID' | 'MSG_VOICE_MISSING' | 'CHAT_ADMIN_REQUIRED' | 'QUERY_ID_INVALID' |
    'CHAT_ADMIN_INVITE_REQUIRED' | 'BOT_APP_INVALID' | 'FILTER_NOT_SUPPORTED' | 'INVITES_TOO_MUCH' |
    'FILTERS_TOO_MUCH' | 'PEERS_LIST_EMPTY' | 'INVITE_SLUG_EXPIRED' | 'DIALOG_FILTERS_TOO_MUCH' |
    'CHATLISTS_TOO_MUCH' | 'FRESH_RESET_AUTHORISATION_FORBIDDEN' | 'NO_USER' | 'USER_PRIVACY_RESTRICTED' |
    'REACTION_INVALID' | 'INVITE_HASH_EXPIRED' | 'PHONE_NOT_OCCUPIED' | 'PARTICIPANT_ID_INVALID' |
    'PREMIUM_ACCOUNT_REQUIRED' | 'BOOST_NOT_MODIFIED' | 'PREMIUM_GIFTED_NOT_ALLOWED' | `FLOOD_WAIT_${number}` |
    'MESSAGE_NOT_MODIFIED' | 'MESSAGE_EMPTY' | 'SLUG_INVALID' | `PREMIUM_SUB_ACTIVE_UNTIL_${number}` |
    `PHONE_MIGRATE_${number}` | `NETWORK_MIGRATE_${number}` | `USER_MIGRATE_${number}` | `STATS_MIGRATE_${number}` |
    `FILE_MIGRATE_${number}` | `CALL_MIGRATE_${number}` | 'MSG_WAIT_FAILED' | 'MSG_WAIT_TIMEOUT' |
    'SAVED_DIALOGS_UNSUPPORTED' | 'YOUR_PRIVACY_RESTRICTED' | 'INVITE_REQUEST_SENT' | 'GROUPCALL_INVALID' |
    'TIME_TOO_BIG' | 'TIME_TOO_SMALL' | 'TIME_INVALID' | 'GROUPCALL_FORBIDDEN' | 'VIDEO_CHANNEL_INVALID' |
    'GROUPCALL_JOIN_MISSING' | `SLOWMODE_WAIT_${number}` | 'BALANCE_TOO_LOW' | 'FORM_EXPIRED' |
    `FLOOD_PREMIUM_WAIT_${number}` | 'STORY_ID_TOO_MANY' | `FILE_REFERENCE_${number}_EXPIRED` |
    'ADDRESS_STREET_LINE1_INVALID' | 'ADDRESS_STREET_LINE2_INVALID' | 'ADDRESS_COUNTRY_INVALID' |
    'ADDRESS_CITY_INVALID' | 'ADDRESS_STATE_INVALID' | 'ADDRESS_POSTCODE_INVALID' |
    'REQ_INFO_NAME_INVALID' | 'REQ_INFO_EMAIL_INVALID' | 'REQ_INFO_PHONE_INVALID' |
    'FILE_REFERENCE_INVALID' | 'USER_NOT_MUTUAL_CONTACT' | 'FROZEN_METHOD_INVALID';

  type ErrorType = LocalErrorType | ServerErrorType;

  type TelegramChoosePeerType = 'users' | 'bots' | 'groups' | 'channels';

  type TranslatableLanguageISO = typeof Languages[number][0];

  type ApiError = {
    type: ErrorType,
    stack: string,
    message?: string,
    code?: number,
    handled?: boolean,
    originalError?: any,
  };

  declare const electronHelpers: {
    openExternal(url): void;
  } | undefined;

  type DOMRectMinified = {top: number, right: number, bottom: number, left: number};
  type DOMRectEditable = DOMRectMinified & {width: number, height: number};
  type MaybePromise<T> = Promise<T> | T;
  type MaybeDeferredPromise<T> = CancellablePromise<T> | T;

  type WrapSomethingOptions = {
    lazyLoadQueue?: LazyLoadQueue | false,
    middleware?: Middleware,
    customEmojiSize?: MediaSize,
    textColor?: CustomProperty,
    animationGroup?: AnimationItemGroup,
    managers?: AppManagers
  };
}
