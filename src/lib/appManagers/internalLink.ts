/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

export enum INTERNAL_LINK_TYPE {
  MESSAGE,
  PRIVATE_POST,
  STICKER_SET,
  JOIN_CHAT
};

export type InternalLink = InternalLink.InternalLinkMessage | InternalLink.InternalLinkPrivatePost | InternalLink.InternalLinkStickerSet | InternalLink.InternalLinkJoinChat;

export namespace InternalLink {
  export interface InternalLinkMessage {
    _: INTERNAL_LINK_TYPE.MESSAGE,
    domain: string,
    post?: string,
    comment?: string
  }

  export interface InternalLinkPrivatePost {
    _: INTERNAL_LINK_TYPE.PRIVATE_POST,
    channel: string,
    post: string,
    thread?: string,
    comment?: string
  }

  export interface InternalLinkStickerSet {
    _: INTERNAL_LINK_TYPE.STICKER_SET,
    set: string
  }

  export interface InternalLinkJoinChat {
    _: INTERNAL_LINK_TYPE.JOIN_CHAT,
    invite: string
  }
}

export type InternalLinkTypeMap = {
  [INTERNAL_LINK_TYPE.MESSAGE]: InternalLink.InternalLinkMessage,
  [INTERNAL_LINK_TYPE.PRIVATE_POST]: InternalLink.InternalLinkPrivatePost,
  [INTERNAL_LINK_TYPE.STICKER_SET]: InternalLink.InternalLinkStickerSet,
  [INTERNAL_LINK_TYPE.JOIN_CHAT]: InternalLink.InternalLinkJoinChat
};
