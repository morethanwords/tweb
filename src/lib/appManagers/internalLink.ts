/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {ChatSetPeerOptions} from './appImManager';

// * https://core.telegram.org/api/links

export enum INTERNAL_LINK_TYPE {
  MESSAGE,
  PRIVATE_POST,
  STICKER_SET,
  JOIN_CHAT,
  VOICE_CHAT,
  USER_PHONE_NUMBER,
  INVOICE,
  EMOJI_SET,
  ATTACH_MENU_BOT,
  WEB_APP,
  ADD_LIST,
  STORY,
  BOOST,
  PREMIUM_FEATURES,
  GIFT_CODE,
  BUSINESS_CHAT,
  STARS_TOPUP,
  SHARE,
  UNIQUE_STAR_GIFT,
  STAR_GIFT_COLLECTION,
  STORY_ALBUM,
};

export type InternalLink =
  InternalLink.InternalLinkMessage |
  InternalLink.InternalLinkPrivatePost |
  InternalLink.InternalLinkStickerSet |
  InternalLink.InternalLinkJoinChat |
  InternalLink.InternalLinkVoiceChat |
  InternalLink.InternalLinkUserPhoneNumber |
  InternalLink.InternalLinkInvoice |
  InternalLink.InternalLinkEmojiSet |
  InternalLink.InternalLinkAttachMenuBot |
  InternalLink.InternalLinkWebApp |
  InternalLink.InternalLinkAddList |
  InternalLink.InternalLinkStory |
  InternalLink.InternalLinkBoost |
  InternalLink.InternalLinkPremiumFeatures |
  InternalLink.InternalLinkGiftCode |
  InternalLink.InternalLinkBusinessChat |
  InternalLink.InternalLinkStarsTopup |
  InternalLink.InternalLinkShare |
  InternalLink.InternalLinkUniqueStarGift |
  InternalLink.InternalLinkStarGiftCollection |
  InternalLink.InternalLinkStoryAlbum;

export namespace InternalLink {
  export interface InternalLinkMessage {
    _: INTERNAL_LINK_TYPE.MESSAGE,
    domain: string,
    post?: string,
    comment?: string,
    thread?: string,
    start?: string,
    t?: string, // media timestamp
    single?: string,
    text?: string,
    stack?: ChatSetPeerOptions['stack'] // local
  }

  export interface InternalLinkPrivatePost {
    _: INTERNAL_LINK_TYPE.PRIVATE_POST,
    channel: string,
    post: string,
    thread?: string,
    comment?: string,
    t?: string // media timestamp
    stack?: ChatSetPeerOptions['stack'] // local
  }

  export interface InternalLinkStickerSet {
    _: INTERNAL_LINK_TYPE.STICKER_SET,
    set: string
  }

  export interface InternalLinkJoinChat {
    _: INTERNAL_LINK_TYPE.JOIN_CHAT,
    invite: string
  }

  export interface InternalLinkVoiceChat {
    _: INTERNAL_LINK_TYPE.VOICE_CHAT,
    id?: string,
    access_hash?: string,
    chat_id?: string,
    domain?: string,
    livestream?: string,
    videochat?: string,
    voicechat?: string
  }

  export interface InternalLinkUserPhoneNumber {
    _: INTERNAL_LINK_TYPE.USER_PHONE_NUMBER,
    phone: string,
    text?: string
  }

  export interface InternalLinkInvoice {
    _: INTERNAL_LINK_TYPE.INVOICE,
    slug: string
  }

  export interface InternalLinkEmojiSet {
    _: INTERNAL_LINK_TYPE.EMOJI_SET,
    set: string
  }

  export interface InternalLinkAttachMenuBot {
    _: INTERNAL_LINK_TYPE.ATTACH_MENU_BOT,
    startattach?: string,
    choose?: TelegramChoosePeerType,
    attach?: string,
    domain?: string,
    nestedLink?: InternalLink
  }

  export interface InternalLinkWebApp {
    _: INTERNAL_LINK_TYPE.WEB_APP,
    domain: string,
    appname: string,
    startapp?: string,
    masked?: boolean,
    mode?: 'compact' | 'fullscreen'
  }

  export interface InternalLinkAddList {
    _: INTERNAL_LINK_TYPE.ADD_LIST,
    slug: string
  }

  export interface InternalLinkStory {
    _: INTERNAL_LINK_TYPE.STORY,
    domain: string,
    story: string
  }

  export interface InternalLinkBoost {
    _: INTERNAL_LINK_TYPE.BOOST,
    domain?: string,
    channel?: string
  }

  export interface InternalLinkPremiumFeatures {
    _: INTERNAL_LINK_TYPE.PREMIUM_FEATURES,
    ref?: string
  }

  export interface InternalLinkGiftCode {
    _: INTERNAL_LINK_TYPE.GIFT_CODE,
    slug: string,
    stack?: ChatSetPeerOptions['stack'] // local
  }

  export interface InternalLinkBusinessChat {
    _: INTERNAL_LINK_TYPE.BUSINESS_CHAT,
    slug: string
  }

  export interface InternalLinkStarsTopup {
    _: INTERNAL_LINK_TYPE.STARS_TOPUP,
    balance: string,
    purpose: string
  }

  export interface InternalLinkShare {
    _: INTERNAL_LINK_TYPE.SHARE,
    url?: string,
    text?: string
  }

  export interface InternalLinkUniqueStarGift {
    _: INTERNAL_LINK_TYPE.UNIQUE_STAR_GIFT,
    slug: string
  }

  export interface InternalLinkStarGiftCollection {
    _: INTERNAL_LINK_TYPE.STAR_GIFT_COLLECTION,
    domain: string,
    id: string
  }

  export interface InternalLinkStoryAlbum {
    _: INTERNAL_LINK_TYPE.STORY_ALBUM,
    domain: string,
    id: string
  }
}

export type InternalLinkTypeMap = {
  [INTERNAL_LINK_TYPE.MESSAGE]: InternalLink.InternalLinkMessage,
  [INTERNAL_LINK_TYPE.PRIVATE_POST]: InternalLink.InternalLinkPrivatePost,
  [INTERNAL_LINK_TYPE.STICKER_SET]: InternalLink.InternalLinkStickerSet,
  [INTERNAL_LINK_TYPE.JOIN_CHAT]: InternalLink.InternalLinkJoinChat,
  [INTERNAL_LINK_TYPE.VOICE_CHAT]: InternalLink.InternalLinkVoiceChat,
  [INTERNAL_LINK_TYPE.USER_PHONE_NUMBER]: InternalLink.InternalLinkUserPhoneNumber,
  [INTERNAL_LINK_TYPE.INVOICE]: InternalLink.InternalLinkInvoice,
  [INTERNAL_LINK_TYPE.EMOJI_SET]: InternalLink.InternalLinkEmojiSet,
  [INTERNAL_LINK_TYPE.ATTACH_MENU_BOT]: InternalLink.InternalLinkAttachMenuBot,
  [INTERNAL_LINK_TYPE.WEB_APP]: InternalLink.InternalLinkWebApp,
  [INTERNAL_LINK_TYPE.ADD_LIST]: InternalLink.InternalLinkAddList,
  [INTERNAL_LINK_TYPE.STORY]: InternalLink.InternalLinkStory,
  [INTERNAL_LINK_TYPE.BOOST]: InternalLink.InternalLinkBoost,
  [INTERNAL_LINK_TYPE.PREMIUM_FEATURES]: InternalLink.InternalLinkPremiumFeatures,
  [INTERNAL_LINK_TYPE.GIFT_CODE]: InternalLink.InternalLinkGiftCode,
  [INTERNAL_LINK_TYPE.BUSINESS_CHAT]: InternalLink.InternalLinkBusinessChat,
  [INTERNAL_LINK_TYPE.STARS_TOPUP]: InternalLink.InternalLinkStarsTopup,
  [INTERNAL_LINK_TYPE.SHARE]: InternalLink.InternalLinkShare,
  [INTERNAL_LINK_TYPE.UNIQUE_STAR_GIFT]: InternalLink.InternalLinkUniqueStarGift,
  [INTERNAL_LINK_TYPE.STAR_GIFT_COLLECTION]: InternalLink.InternalLinkStarGiftCollection,
  [INTERNAL_LINK_TYPE.STORY_ALBUM]: InternalLink.InternalLinkStoryAlbum
};
