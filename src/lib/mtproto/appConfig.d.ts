export interface MTAppConfig {
  test?:                                     number;
  emojies_animated_zoom?:                    number;
  emojies_send_dice?:                        any[];
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
  autoarchive_setting_available?:            boolean;
  pending_suggestions?:                      string[];
  autologin_domains?:                        string[];
  url_auth_domains?:                         string[];
  round_video_encoding?:                     RoundVideoEncoding;
  chat_read_mark_expire_period?:             number;
  chat_read_mark_size_threshold?:            number;
  chatlists_joined_limit_default:            number;
  chatlists_joined_limit_premium:            number;
  chatlist_invites_limit_default:            number;
  chatlist_invites_limit_premium:            number;
  chatlist_update_period:                    number;
  reactions_uniq_max?:                       number;
  ringtone_duration_max?:                    number;
  ringtone_size_max?:                        number;
  ringtone_saved_count_max?:                 number;
  premium_purchase_blocked?:                 boolean;
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
  reactions_user_max_default?:               number;
  reactions_user_max_premium?:               number;
  reactions_in_chat_max?:                    number;
  default_emoji_statuses_stickerset_id?:     string;
  premium_promo_order?:                      string[];
  premium_bot_username?:                     string;
  premium_playmarket_direct_currency_list?:  string[];
  forum_upgrade_participants_min?:           number;
  whitelisted_domains?:                      string[];
  restriction_add_platforms?:                string[];
  topics_pinned_limit?:                      number;
  telegram_antispam_user_id?:                string;
  telegram_antispam_group_size_min?:         number;
  fragment_prefixes?:                        string[];
  hidden_members_group_size_min?:            number;
  ios_disable_parallel_channel_reset?:       number;
  getfile_experimental_params?:              boolean;
  lite_battery_min_pct?:                     number;
  lite_device_class?:                        number;
  lite_app_options?:                         LiteAppOptions;
  premium_gift_attach_menu_icon?:            boolean;
  premium_gift_text_field_icon?:             boolean;
  ignore_restriction_reasons?:               string[];
  emojies_send_dice?:                        string[];
  emojies_send_dice_success?:                EmojiesSendDiceSuccess;
  emojies_sounds?:                           EmojiesSoundsClass;
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

export interface LiteAppOptions {
  chat_open_animation_enabled?: boolean[];
  video_autoplay_enabled?:      boolean[];
}

export interface RoundVideoEncoding {
  diameter?:      number;
  video_bitrate?: number;
  audio_bitrate?: number;
  max_size?:      number;
}
