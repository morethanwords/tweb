export interface MTAppConfig {
  test?:                                     number;
  emojies_animated_zoom?:                    number;
  emojies_send_dice?:                        string[];
  emojies_send_dice_success?:                EmojiesSendDiceSuccess;
  emojies_sounds?:                           EmojiesSoundsClass;
  gif_search_branding?:                      string;
  gif_search_emojies?:                       string[];
  stickers_emoji_suggest_only_api?:          boolean;
  stickers_emoji_cache_time?:                number;
  groupcall_video_participants_max?:         number;
  youtube_pip?:                              string;
  qr_login_camera?:                          boolean;
  qr_login_code?:                            string;
  dialog_filters_enabled?:                   boolean;
  dialog_filters_tooltip?:                   boolean;
  ignore_restriction_reasons?:               string[];
  autoarchive_setting_available?:            boolean;
  pending_suggestions?:                      any[];
  autologin_token?:                          string;
  autologin_domains?:                        string[];
  url_auth_domains?:                         string[];
  round_video_encoding?:                     RoundVideoEncoding;
  chat_read_mark_expire_period?:             number;
  chat_read_mark_size_threshold?:            number;
  reactions_default?:                        string;
  reactions_uniq_max?:                       number;
  ringtone_duration_max?:                    number;
  ringtone_size_max?:                        number;
  ringtone_saved_count_max?:                 number;
  channels_limit_default?:                   number;
  channels_limit_premium?:                   number;
  saved_gifs_limit_default?:                 number;
  saved_gifs_limit_premium?:                 number;
  stickers_faved_limit_default?:             number;
  stickers_faved_limit_premium?:             number;
  dialog_filters_limit_default?:             number;
  dialog_filters_limit_premium?:             number;
  dialog_filters_chats_limit_default?:       number;
  dialog_filters_chats_limit_premium?:       number;
  dialogs_pinned_limit_default?:             number;
  dialogs_pinned_limit_premium?:             number;
  dialogs_folder_pinned_limit_default?:      number;
  dialogs_folder_pinned_limit_premium?:      number;
  channels_public_limit_default?:            number;
  channels_public_limit_premium?:            number;
  caption_length_limit_default?:             number;
  caption_length_limit_premium?:             number;
  upload_max_fileparts_default?:             number;
  upload_max_fileparts_premium?:             number;
  about_length_limit_default?:               number;
  about_length_limit_premium?:               number;
  stickers_premium_by_emoji_num?:            number;
  stickers_normal_by_emoji_per_premium_num?: number;
  message_animated_emoji_max?:               number;
  premium_promo_order?:                      string[];
  premium_bot_username?:                     string;
}

export interface EmojiesSendDiceSuccess {
  [k]: EmojiesSendDiceSuccessDetails
}

export interface EmojiesSendDiceSuccessDetails {
  value?:       number;
  frame_start?: number;
}

export type EmojiesSounds = Record<string, EmojiSound>;

export interface EmojiSound {
  id?:                    string;
  access_hash?:           string;
  file_reference_base64?: string;
}

export interface RoundVideoEncoding {
  diameter?:      number;
  video_bitrate?: number;
  audio_bitrate?: number;
  max_size?:      number;
}
