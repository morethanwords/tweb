/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {FormatterArguments, LangPackKey} from '../../lib/langPack';
import {Document} from '../../layer';
import {ApiLimitType} from '../../lib/mtproto/api_methods';
import {AppManagers} from '../../lib/appManagers/managers';
import formatBytes from '../../helpers/formatBytes';

export interface PremiumPromoFeature {
  feature: PremiumPromoFeatureType;
  icon: Icon;
  titleLangKey: LangPackKey;
  subtitleLangKey: LangPackKey;
  actionTitleLangKey?: LangPackKey;
  actionIcon?: Icon;
  headerLangKey?: LangPackKey;
  titleLangArgs?: FormatterArguments;
  subtitleLangArgs?: FormatterArguments;
  _titleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>;
  _subtitleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>;
  videoPosition?: 'bottom' | 'top';
  video?: Document.document;
  wrappedVideo?: any;
  type?: string;
  content?: Array<{
    titleLangKey?: LangPackKey,
    titleLangArgs?: FormatterArguments,
    _titleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>;
    subtitleLangKey?: LangPackKey,
    subtitleLangArgs?: FormatterArguments,
    _subtitleLangArgs?: (managers: AppManagers) => MaybePromise<FormatterArguments>,
    iconColor?: string,
    icon?: Icon,
    backgroundColor?: string,
    limitType?: ApiLimitType,
    name?: string,
    free?: number,
    premium?: number
  }>;
  new?: boolean,
  builded?: boolean
}

export const PREMIUM_FEATURES_COLORS: string[] = [
  '#ef6922',
  '#e95a2c',
  '#e74e33',
  '#e3433c',
  '#db374b',
  '#cb3e6d',
  '#bc4395',
  '#ab4ac4',
  '#9b4fed',
  '#8958ff',
  '#676bff',
  '#5b79ff',
  '#4492ff',
  '#429bd5',
  '#41a6a5',
  '#3eb26d',
  '#3dbd4a'
];

const stories: PremiumPromoFeature = {
  feature: 'stories',
  icon: 'stories',
  titleLangKey: 'Premium.Boarding.Stories.Title',
  subtitleLangKey: 'Premium.Boarding.Stories.Info',
  type: 'upgraded-stories',
  content: [{
    titleLangKey: 'PremiumStoriesPriority',
    subtitleLangKey: 'PremiumStoriesPriorityDescription',
    iconColor: '#0079FE',
    icon: 'multistories'
  }, {
    titleLangKey: 'PremiumStoriesStealth',
    subtitleLangKey: 'PremiumStoriesStealthDescription',
    iconColor: '#7889FE',
    icon: 'eyecross_outline'
  }, {
    titleLangKey: 'PremiumStoriesViews',
    subtitleLangKey: 'PremiumStoriesViewsDescription',
    iconColor: '#A45FE6',
    icon: 'eye'
  }, {
    titleLangKey: 'PremiumStoriesExpiration',
    subtitleLangKey: 'PremiumStoriesExpirationDescription',
    iconColor: '#C355AE',
    icon: 'timer'
  }, {
    titleLangKey: 'PremiumStoriesSaveToGallery',
    subtitleLangKey: 'PremiumStoriesSaveToGalleryDescription',
    iconColor: '#E85D43',
    icon: 'arrowcircle'
  }, {
    titleLangKey: 'PremiumStoriesCaption',
    subtitleLangKey: 'PremiumStoriesCaptionDescription',
    iconColor: '#F1822A',
    icon: 'list'
  }, {
    titleLangKey: 'PremiumStoriesFormatting',
    subtitleLangKey: 'PremiumStoriesFormattingDescription',
    iconColor: '#E6AC19',
    icon: 'limit_link'
  }]
};

const wrapGetLimitArgument = (limitType: ApiLimitType) => (managers: AppManagers) => managers.apiManager.getLimit(limitType, true).then((limit) => [limit]);

const doubleLimits: PremiumPromoFeature = {
  feature: 'double_limits',
  icon: 'premium_limits',
  titleLangKey: 'Premium.Boarding.Double.Title',
  subtitleLangKey: 'Premium.Boarding.Double.Info',
  headerLangKey: 'Premium.Boarding.Double.Title',
  _subtitleLangArgs: (managers) => Promise.all(
    (['channels', 'folders', 'pin', 'links'] as ApiLimitType[]).map((type) => {
      return managers.apiManager.getLimit(type, true);
    })
  ),
  type: 'limits',
  content: [{
    titleLangKey: 'GroupsAndChannelsLimitTitle',
    subtitleLangKey: 'GroupsAndChannelsLimitSubtitle',
    _subtitleLangArgs: wrapGetLimitArgument('channels'),
    limitType: 'channels',
    backgroundColor: '#5B9FFF'
  }, {
    titleLangKey: 'PinChatsLimitTitle',
    subtitleLangKey: 'PinChatsLimitSubtitle',
    _subtitleLangArgs: wrapGetLimitArgument('pin'),
    limitType: 'pin',
    backgroundColor: '#7889FE'
  }, {
    titleLangKey: 'PublicLinksLimitTitle',
    subtitleLangKey: 'PublicLinksLimitSubtitle',
    _subtitleLangArgs: wrapGetLimitArgument('links'),
    limitType: 'links',
    backgroundColor: '#9376FF'
  }, {
    titleLangKey: 'SavedGifsLimitTitle',
    subtitleLangKey: 'SavedGifsLimitSubtitle',
    _subtitleLangArgs: wrapGetLimitArgument('gifs'),
    limitType: 'gifs',
    backgroundColor: '#AB63F2'
  }, {
    titleLangKey: 'FavoriteStickersLimitTitle',
    subtitleLangKey: 'FavoriteStickersLimitSubtitle',
    _subtitleLangArgs: wrapGetLimitArgument('favedStickers'),
    limitType: 'favedStickers',
    backgroundColor: '#C456AE'
  }, {
    titleLangKey: 'BioLimitTitle',
    subtitleLangKey: 'BioLimitSubtitle',
    limitType: 'bio',
    backgroundColor: '#CE569A'
  }, {
    titleLangKey: 'CaptionsLimitTitle',
    subtitleLangKey: 'CaptionsLimitSubtitle',
    limitType: 'caption',
    backgroundColor: '#DA5786'
  }, {
    titleLangKey: 'FoldersLimitTitle',
    subtitleLangKey: 'FoldersLimitSubtitle',
    _subtitleLangArgs: wrapGetLimitArgument('folders'),
    limitType: 'folders',
    backgroundColor: '#DB496F'
  }, {
    titleLangKey: 'ChatPerFolderLimitTitle',
    subtitleLangKey: 'ChatPerFolderLimitSubtitle',
    _subtitleLangArgs: wrapGetLimitArgument('folderPeers'),
    limitType: 'folderPeers',
    backgroundColor: '#E85D43'
  }, {
    titleLangKey: 'ConnectedAccountsLimitTitle',
    subtitleLangKey: 'ConnectedAccountsLimitSubtitle',
    subtitleLangArgs: [4],
    free: 3,
    premium: 4,
    backgroundColor: '#F1822A'
  }]
};

const formatParts = (parts: number) => formatBytes(parts * 1.024 * 512 * 1024, 0);

export const PREMIUM_FEATURES: {[type in PremiumPromoFeatureType]?: PremiumPromoFeature} = {
  stories: stories,
  double_limits: doubleLimits,
  voice_to_text: {
    feature: 'voice_to_text',
    icon: 'premium_transcription',
    titleLangKey: 'Premium.Boarding.Voice.Title',
    subtitleLangKey: 'Premium.Boarding.Voice.Info',
    videoPosition: 'top'
  },
  faster_download: {
    feature: 'faster_download',
    icon: 'premium_speed',
    titleLangKey: 'Premium.Boarding.Download.Title',
    subtitleLangKey: 'Premium.Boarding.Download.Info',
    videoPosition: 'top'
  },
  translations: {
    feature: 'translations',
    icon: 'premium_translate',
    titleLangKey: 'Premium.Boarding.Translate.Title',
    subtitleLangKey: 'Premium.Boarding.Translate.Info',
    videoPosition: 'top'
  },
  animated_emoji: {
    feature: 'animated_emoji',
    icon: 'premium_emoji',
    titleLangKey: 'Premium.Boarding.Emoji.Title',
    subtitleLangKey: 'Premium.Boarding.Emoji.Info'
  },
  more_upload: {
    feature: 'more_upload',
    icon: 'premium_filesize',
    titleLangKey: 'Premium.Boarding.FileSize.Title',
    _titleLangArgs: (managers) => managers.apiManager.getLimit('uploadFileParts', true).then((parts) => [formatParts(parts)]),
    subtitleLangKey: 'Premium.Boarding.FileSize.Info',
    _subtitleLangArgs: (managers) => Promise.all(
      [false, true].map(async(isPremium) => {
        const parts = await managers.apiManager.getLimit('uploadFileParts', isPremium);
        return formatParts(parts);
      })
    )
  },
  emoji_status: {
    feature: 'emoji_status',
    icon: 'premium_status',
    titleLangKey: 'Premium.Boarding.Status.Title',
    subtitleLangKey: 'Premium.Boarding.Status.Info',
    videoPosition: 'top'
  },
  peer_colors: {
    feature: 'peer_colors',
    icon: 'premium_colors',
    titleLangKey: 'Premium.Promo.Colors.Title',
    subtitleLangKey: 'Premium.Promo.Colors.Subtitle',
    videoPosition: 'top'
  },
  wallpapers: {
    feature: 'wallpapers',
    icon: 'premium_wallpaper',
    titleLangKey: 'Premium.Promo.Wallpaper.Title',
    subtitleLangKey: 'Premium.Promo.Wallpaper.Subtitle',
    videoPosition: 'top',
    new: true
  },
  profile_badge: {
    feature: 'profile_badge',
    icon: 'star',
    titleLangKey: 'Premium.Boarding.Badge.Title',
    subtitleLangKey: 'Premium.Boarding.Badge.Info',
    videoPosition: 'top'
  },
  advanced_chat_management: {
    feature: 'advanced_chat_management',
    icon: 'premium_management',
    titleLangKey: 'Premium.Boarding.Chats.Title',
    subtitleLangKey: 'Premium.Boarding.Chats.Info',
    videoPosition: 'top'
  },
  no_ads: {
    feature: 'no_ads',
    icon: 'premium_noads',
    titleLangKey: 'Premium.Boarding.NoAds.Title',
    subtitleLangKey: 'Premium.Boarding.NoAds.Info'
    // actionTitleLangKey: 'Premium.Boarding.NoAds.Action',
    // actionIcon: 'premium_badge'
  },
  infinite_reactions: {
    feature: 'infinite_reactions',
    icon: 'premium_reactions',
    titleLangKey: 'Premium.Boarding.ReactionsNew.Title',
    subtitleLangKey: 'Premium.Boarding.ReactionsNew.Info',
    videoPosition: 'top'
    // actionIcon: 'premium_unlock'
  },
  animated_userpics: {
    feature: 'animated_userpics',
    icon: 'premium_avatars',
    titleLangKey: 'Premium.Boarding.Avatar.Title',
    subtitleLangKey: 'Premium.Boarding.Avatar.Info',
    videoPosition: 'top'
  },
  premium_stickers: {
    feature: 'premium_stickers',
    icon: 'premium_stickers',
    titleLangKey: 'Premium.Boarding.Stickers.Title',
    subtitleLangKey: 'Premium.Boarding.Stickers.Info',
    // actionIcon: 'premium_unlock',
    type: 'premium-stickers'
  },
  last_seen: {
    feature: 'last_seen',
    icon: 'premium_lastseen',
    titleLangKey: 'PremiumPreviewLastSeen',
    subtitleLangKey: 'PremiumPreviewLastSeenDescription',
    new: true
  },
  message_privacy: {
    feature: 'message_privacy',
    icon: 'premium_privacy',
    titleLangKey: 'PremiumPreviewMessagePrivacy',
    subtitleLangKey: 'PremiumPreviewMessagePrivacyDescription',
    new: true
  },
  saved_tags: {
    feature: 'saved_tags',
    icon: 'premium_tags',
    titleLangKey: 'PremiumPreviewTags',
    subtitleLangKey: 'PremiumPreviewTagsDescription2'
  }
};
