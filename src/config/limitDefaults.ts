/**
 * What a limit of the app config is when the config does not have it: tdesktop's defaults
 * (data_premium_limits.cpp, data_message_reactions.cpp)
 */
const LIMIT_DEFAULTS = {
  dialogs_pinned_limit_default: 5,
  dialogs_pinned_limit_premium: 10,
  dialogs_folder_pinned_limit_default: 100,
  dialogs_folder_pinned_limit_premium: 200,
  dialog_filters_limit_default: 10,
  dialog_filters_limit_premium: 30,
  stickers_faved_limit_default: 5,
  stickers_faved_limit_premium: 10,
  reactions_user_max_default: 1,
  reactions_user_max_premium: 3,
  about_length_limit_default: 70,
  about_length_limit_premium: 140,
  topics_pinned_limit: 5,
  caption_length_limit_default: 1024,
  caption_length_limit_premium: 2048,
  chatlist_invites_limit_default: 3,
  chatlist_invites_limit_premium: 20,
  chatlists_joined_limit_default: 2,
  chatlists_joined_limit_premium: 20,
  channels_limit_default: 500,
  channels_limit_premium: 1000,
  channels_public_limit_default: 10,
  channels_public_limit_premium: 20,
  saved_gifs_limit_default: 200,
  saved_gifs_limit_premium: 400,
  dialog_filters_chats_limit_default: 100,
  dialog_filters_chats_limit_premium: 200,
  upload_max_fileparts_default: 4000,
  upload_max_fileparts_premium: 8000,
  recommended_channels_limit_default: 10,
  recommended_channels_limit_premium: 100,
  saved_dialogs_pinned_limit_default: 5,
  saved_dialogs_pinned_limit_premium: 100
} satisfies {[key in keyof MTAppConfig]?: number};

export default LIMIT_DEFAULTS;
