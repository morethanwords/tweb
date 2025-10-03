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
  upload_premium_speedup_download?:          number;
  upload_premium_speedup_notify_period?:     number;
  upload_premium_speedup_upload?:            number;
  about_length_limit_default?:               number;
  about_length_limit_premium?:               number;
  stickers_premium_by_emoji_num?:            number;
  stickers_normal_by_emoji_per_premium_num?: number;
  message_animated_emoji_max?:               number;
  reactions_user_max_default?:               number;
  reactions_user_max_premium?:               number;
  reactions_in_chat_max?:                    number;
  default_emoji_statuses_stickerset_id?:     string;
  premium_promo_order?:                      PremiumPromoFeatureType[];
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
  stories_all_hidden?:                       boolean;
  stories_changelog_user_id?:                UserId;
  stories_export_nopublic_link?:             boolean;
  stories_posting?:                          'enabled' | 'premium' | 'disabled';
  giveaway_add_peers_max?:                   number;
  giveaway_boosts_per_premium?:              number;
  giveaway_countries_max?:                   number;
  giveaway_gifts_purchase_available?:        boolean;
  giveaway_period_max?:                      number;
  quote_length_max?:                         number;
  recommended_channels_limit_default?:       number;
  recommended_channels_limit_premium?:       number;
  saved_dialogs_pinned_limit_default?:       number;
  saved_dialogs_pinned_limit_premium?:       number;
  boosts_per_sent_gift?:                     number;
  cachedTime?:                               number;
  hash?:                                     number;
  pm_read_date_expire_period?:               number;
  new_noncontact_peers_require_premium_without_ownpremium?: boolean;
  stars_purchase_blocked?:                   boolean;
  can_edit_factcheck?:                       boolean;
  stories_pinned_to_top_count_max?:          number;
  stars_paid_post_amount_max?:               number;
  stars_gifts_enabled?:                      boolean;
  stars_paid_reaction_amount_max?:           number;
  stars_purchase_blocked?:                   boolean;
  stars_revenue_withdrawal_min?:             number;
  stars_subscription_amount_max?:            number;
  stars_usd_sell_rate_x1000?:                number;
  stars_usd_withdraw_rate_x1000?:            number;
  stars_paid_message_commission_permille?:   number;
  stargifts_blocked?:                        boolean;
  stargifts_convert_period_max?:             number;
  stargifts_message_length_max?:             number;
  stargifts_pinned_to_top_limit?:            number;
  stars_suggested_post_age_min?:             number;
  stars_suggested_post_amount_max?:          number;
  stars_suggested_post_amount_min?:          number;
  stars_suggested_post_commission_permille?: number;
  stars_suggested_post_future_max?:          number;
  stars_suggested_post_future_min?:          number;
  web_app_allowed_protocols?:                string[];
  todo_item_length_max?:                     number;
  todo_items_max?:                           number;
  todo_title_length_max?:                    number;
  need_age_video_verification?:              boolean;
  verify_age_min?:                           number;
  verify_age_bot_username?:                  string;
  verify_age_country?:                       string;
  ton_usd_rate?:                             number;
  ton_topup_url?:                            string;
  ton_stargift_resale_amount_max?:            number;
  ton_stargift_resale_amount_min?:            number;
  ton_stargift_resale_commission_permille?:   number;
  stars_stargift_resale_amount_max?:          number;
  stars_stargift_resale_amount_min?:          number;
  stars_stargift_resale_commission_permille?: number;
  channel_autotranslation_level_min?:         number;
  translations_auto_enabled?:                 'enabled' | 'disabled';
  translations_manual_enabled?:               'enabled' | 'disabled';
  freeze_since_date?:                         number;
  freeze_until_date?:                         number;
  freeze_appeal_url?:                         string;
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
