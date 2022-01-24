export interface MTAppConfig {
  test?:                             number;
  emojies_animated_zoom?:            number;
  emojies_send_dice?:                string[];
  emojies_send_dice_success?:        EmojiesSendDiceSuccess;
  emojies_sounds?:                   EmojiesSounds;
  gif_search_branding?:              string;
  gif_search_emojies?:               string[];
  stickers_emoji_suggest_only_api?:  boolean;
  stickers_emoji_cache_time?:        number;
  groupcall_video_participants_max?: number;
  youtube_pip?:                      string;
  qr_login_camera?:                  boolean;
  qr_login_code?:                    string;
  dialog_filters_enabled?:           boolean;
  dialog_filters_tooltip?:           boolean;
  ignore_restriction_reasons?:       string[];
  autoarchive_setting_available?:    boolean;
  pending_suggestions?:              any[];
  autologin_token?:                  string;
  autologin_domains?:                string[];
  round_video_encoding?:             RoundVideoEncoding;
  chat_read_mark_expire_period?:     number;
  chat_read_mark_size_threshold?:    number;
  reactions_default?:                string;
  reactions_uniq_max?:               number;
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
