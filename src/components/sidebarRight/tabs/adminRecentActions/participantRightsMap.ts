import {ChatBannedRights} from '@layer';
import {LangPackKey} from '@lib/langPack';

export const participantRightsMap: Record<keyof ChatBannedRights.chatBannedRights['pFlags'], LangPackKey | null> = {
  send_plain:        'UserRestrictionsSend',
  send_media:        'UserRestrictionsSendMedia',
  invite_users:      'UserRestrictionsInviteUsers',
  pin_messages:      'UserRestrictionsPinMessages',
  manage_topics:     'CreateTopicsPermission',
  change_info:       'UserRestrictionsChangeInfo',
  send_photos:       'UserRestrictionsSendPhotos',
  send_videos:       'UserRestrictionsSendVideos',
  send_stickers:     'UserRestrictionsSendStickersOnly',
  send_gifs:         'UserRestrictionsSendGIFsOnly',
  send_audios:       'UserRestrictionsSendMusic',
  send_docs:         'UserRestrictionsSendFiles',
  send_voices:       'UserRestrictionsSendVoices',
  send_roundvideos:  'UserRestrictionsSendRound',
  embed_links:       'UserRestrictionsEmbedLinks',
  send_polls:        'UserRestrictionsSendPolls',
  view_messages:     null,
  send_messages:     null,
  send_games:        null,
  send_inline:       null
};
