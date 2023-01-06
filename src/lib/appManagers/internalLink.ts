/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export enum INTERNAL_LINK_TYPE {
  MESSAGE,
  PRIVATE_POST,
  STICKER_SET,
  JOIN_CHAT,
  VOICE_CHAT,
  USER_PHONE_NUMBER,
  INVOICE,
  EMOJI_SET
};

export type InternalLink = InternalLink.InternalLinkMessage | InternalLink.InternalLinkPrivatePost | InternalLink.InternalLinkStickerSet | InternalLink.InternalLinkJoinChat | InternalLink.InternalLinkVoiceChat | InternalLink.InternalLinkUserPhoneNumber | InternalLink.InternalLinkInvoice | InternalLink.InternalLinkEmojiSet;

export namespace InternalLink {
  export interface InternalLinkMessage {
    _: INTERNAL_LINK_TYPE.MESSAGE,
    domain: string,
    post?: string,
    comment?: string,
    thread?: string,
    start?: string,
    stack?: number // local
  }

  export interface InternalLinkPrivatePost {
    _: INTERNAL_LINK_TYPE.PRIVATE_POST,
    channel: string,
    post: string,
    thread?: string,
    comment?: string,
    stack?: number // local
  }

  export interface InternalLinkStickerSet {
    _: INTERNAL_LINK_TYPE.STICKER_SET,
    set: string
  }

  export interface InternalLinkJoinChat {
    _: INTERNAL_LINK_TYPE.JOIN_CHAT,
    invite: string
  }

  /**
   * LOCAL LINK
   */
  export interface InternalLinkVoiceChat {
    _: INTERNAL_LINK_TYPE.VOICE_CHAT,
    id: string,
    access_hash: string,
    chat_id: string
  }

  export interface InternalLinkUserPhoneNumber {
    _: INTERNAL_LINK_TYPE.USER_PHONE_NUMBER,
    phone: string
  }

  export interface InternalLinkInvoice {
    _: INTERNAL_LINK_TYPE.INVOICE,
    slug: string
  }

  export interface InternalLinkEmojiSet {
    _: INTERNAL_LINK_TYPE.EMOJI_SET,
    set: string
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
  [INTERNAL_LINK_TYPE.EMOJI_SET]: InternalLink.InternalLinkEmojiSet
};
