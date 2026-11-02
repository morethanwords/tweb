import type {ChatRights} from '@appManagers/appChatsManager';
import type {LangPackKey} from '@lib/langPack';

/** What a chat that does not let the user post something says when they try */
export const POSTING_NOT_ALLOWED_MAP: {[action in ChatRights]?: LangPackKey} = {
  send_audios: 'GlobalAttachAudioRestricted',
  send_docs: 'GlobalAttachDocumentsRestricted',
  send_photos: 'GlobalAttachPhotoRestricted',
  send_videos: 'GlobalAttachVideoRestricted',
  send_voices: 'GlobalAttachVoiceRestricted',
  send_stickers: 'GlobalAttachStickersRestricted',
  send_gifs: 'GlobalAttachGifRestricted',
  send_media: 'GlobalAttachMediaRestricted',
  send_plain: 'GlobalSendMessageRestricted',
  send_polls: 'ErrorSendRestrictedPollsAll',
  send_inline: 'GlobalAttachInlineRestricted'
};
