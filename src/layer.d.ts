/**
 * @link https://core.telegram.org/type/Error
 */
export type Error = Error.error;

export namespace Error {
  export type error = {
    _: 'error',
    code: number,
    text: string
  };
}

/**
 * @link https://core.telegram.org/type/InputPeer
 */
export type InputPeer = InputPeer.inputPeerEmpty | InputPeer.inputPeerSelf | InputPeer.inputPeerChat | InputPeer.inputPeerUser | InputPeer.inputPeerChannel | InputPeer.inputPeerUserFromMessage | InputPeer.inputPeerChannelFromMessage;

export namespace InputPeer {
  export type inputPeerEmpty = {
    _: 'inputPeerEmpty'
  };

  export type inputPeerSelf = {
    _: 'inputPeerSelf'
  };

  export type inputPeerChat = {
    _: 'inputPeerChat',
    chat_id: string | number
  };

  export type inputPeerUser = {
    _: 'inputPeerUser',
    user_id: string | number,
    access_hash: string | number
  };

  export type inputPeerChannel = {
    _: 'inputPeerChannel',
    channel_id: string | number,
    access_hash: string | number
  };

  export type inputPeerUserFromMessage = {
    _: 'inputPeerUserFromMessage',
    peer: InputPeer,
    msg_id: number,
    user_id: string | number
  };

  export type inputPeerChannelFromMessage = {
    _: 'inputPeerChannelFromMessage',
    peer: InputPeer,
    msg_id: number,
    channel_id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/InputUser
 */
export type InputUser = InputUser.inputUserEmpty | InputUser.inputUserSelf | InputUser.inputUser | InputUser.inputUserFromMessage;

export namespace InputUser {
  export type inputUserEmpty = {
    _: 'inputUserEmpty'
  };

  export type inputUserSelf = {
    _: 'inputUserSelf'
  };

  export type inputUser = {
    _: 'inputUser',
    user_id: string | number,
    access_hash: string | number
  };

  export type inputUserFromMessage = {
    _: 'inputUserFromMessage',
    peer: InputPeer,
    msg_id: number,
    user_id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/InputContact
 */
export type InputContact = InputContact.inputPhoneContact;

export namespace InputContact {
  export type inputPhoneContact = {
    _: 'inputPhoneContact',
    client_id: string | number,
    phone: string,
    first_name: string,
    last_name: string
  };
}

/**
 * @link https://core.telegram.org/type/InputFile
 */
export type InputFile = InputFile.inputFile | InputFile.inputFileBig;

export namespace InputFile {
  export type inputFile = {
    _: 'inputFile',
    id: string | number,
    parts: number,
    name: string,
    md5_checksum: string
  };

  export type inputFileBig = {
    _: 'inputFileBig',
    id: string | number,
    parts: number,
    name: string
  };
}

/**
 * @link https://core.telegram.org/type/InputMedia
 */
export type InputMedia = InputMedia.inputMediaEmpty | InputMedia.inputMediaUploadedPhoto | InputMedia.inputMediaPhoto | InputMedia.inputMediaGeoPoint | InputMedia.inputMediaContact | InputMedia.inputMediaUploadedDocument | InputMedia.inputMediaDocument | InputMedia.inputMediaVenue | InputMedia.inputMediaPhotoExternal | InputMedia.inputMediaDocumentExternal | InputMedia.inputMediaGame | InputMedia.inputMediaInvoice | InputMedia.inputMediaGeoLive | InputMedia.inputMediaPoll | InputMedia.inputMediaDice;

export namespace InputMedia {
  export type inputMediaEmpty = {
    _: 'inputMediaEmpty'
  };

  export type inputMediaUploadedPhoto = {
    _: 'inputMediaUploadedPhoto',
    flags?: number,
    pFlags: Partial<{
      spoiler?: true,
    }>,
    file: InputFile,
    stickers?: Array<InputDocument>,
    ttl_seconds?: number
  };

  export type inputMediaPhoto = {
    _: 'inputMediaPhoto',
    flags?: number,
    pFlags: Partial<{
      spoiler?: true,
    }>,
    id: InputPhoto,
    ttl_seconds?: number
  };

  export type inputMediaGeoPoint = {
    _: 'inputMediaGeoPoint',
    geo_point: InputGeoPoint
  };

  export type inputMediaContact = {
    _: 'inputMediaContact',
    phone_number: string,
    first_name: string,
    last_name: string,
    vcard: string,
    user_id?: UserId
  };

  export type inputMediaUploadedDocument = {
    _: 'inputMediaUploadedDocument',
    flags?: number,
    pFlags: Partial<{
      nosound_video?: true,
      force_file?: true,
      spoiler?: true,
    }>,
    file: InputFile,
    thumb?: InputFile,
    mime_type: string,
    attributes: Array<DocumentAttribute>,
    stickers?: Array<InputDocument>,
    ttl_seconds?: number
  };

  export type inputMediaDocument = {
    _: 'inputMediaDocument',
    flags?: number,
    pFlags: Partial<{
      spoiler?: true,
    }>,
    id: InputDocument,
    ttl_seconds?: number,
    query?: string
  };

  export type inputMediaVenue = {
    _: 'inputMediaVenue',
    geo_point: InputGeoPoint,
    title: string,
    address: string,
    provider: string,
    venue_id: string,
    venue_type: string
  };

  export type inputMediaPhotoExternal = {
    _: 'inputMediaPhotoExternal',
    flags?: number,
    pFlags: Partial<{
      spoiler?: true,
    }>,
    url: string,
    ttl_seconds?: number
  };

  export type inputMediaDocumentExternal = {
    _: 'inputMediaDocumentExternal',
    flags?: number,
    pFlags: Partial<{
      spoiler?: true,
    }>,
    url: string,
    ttl_seconds?: number
  };

  export type inputMediaGame = {
    _: 'inputMediaGame',
    id: InputGame
  };

  export type inputMediaInvoice = {
    _: 'inputMediaInvoice',
    flags?: number,
    title: string,
    description: string,
    photo?: InputWebDocument,
    invoice: Invoice,
    payload: Uint8Array,
    provider: string,
    provider_data: DataJSON,
    start_param?: string,
    extended_media?: InputMedia
  };

  export type inputMediaGeoLive = {
    _: 'inputMediaGeoLive',
    flags?: number,
    pFlags: Partial<{
      stopped?: true,
    }>,
    geo_point: InputGeoPoint,
    heading?: number,
    period?: number,
    proximity_notification_radius?: number
  };

  export type inputMediaPoll = {
    _: 'inputMediaPoll',
    flags?: number,
    poll: Poll,
    correct_answers?: Array<Uint8Array>,
    solution?: string,
    solution_entities?: Array<MessageEntity>
  };

  export type inputMediaDice = {
    _: 'inputMediaDice',
    emoticon: string
  };
}

/**
 * @link https://core.telegram.org/type/InputChatPhoto
 */
export type InputChatPhoto = InputChatPhoto.inputChatPhotoEmpty | InputChatPhoto.inputChatUploadedPhoto | InputChatPhoto.inputChatPhoto;

export namespace InputChatPhoto {
  export type inputChatPhotoEmpty = {
    _: 'inputChatPhotoEmpty'
  };

  export type inputChatUploadedPhoto = {
    _: 'inputChatUploadedPhoto',
    flags?: number,
    file?: InputFile,
    video?: InputFile,
    video_start_ts?: number,
    video_emoji_markup?: VideoSize
  };

  export type inputChatPhoto = {
    _: 'inputChatPhoto',
    id: InputPhoto
  };
}

/**
 * @link https://core.telegram.org/type/InputGeoPoint
 */
export type InputGeoPoint = InputGeoPoint.inputGeoPointEmpty | InputGeoPoint.inputGeoPoint;

export namespace InputGeoPoint {
  export type inputGeoPointEmpty = {
    _: 'inputGeoPointEmpty'
  };

  export type inputGeoPoint = {
    _: 'inputGeoPoint',
    flags?: number,
    lat: number,
    long: number,
    accuracy_radius?: number
  };
}

/**
 * @link https://core.telegram.org/type/InputPhoto
 */
export type InputPhoto = InputPhoto.inputPhotoEmpty | InputPhoto.inputPhoto;

export namespace InputPhoto {
  export type inputPhotoEmpty = {
    _: 'inputPhotoEmpty'
  };

  export type inputPhoto = {
    _: 'inputPhoto',
    id: string | number,
    access_hash: string | number,
    file_reference: Uint8Array | number[]
  };
}

/**
 * @link https://core.telegram.org/type/InputFileLocation
 */
export type InputFileLocation = InputFileLocation.inputFileLocation | InputFileLocation.inputEncryptedFileLocation | InputFileLocation.inputDocumentFileLocation | InputFileLocation.inputSecureFileLocation | InputFileLocation.inputTakeoutFileLocation | InputFileLocation.inputPhotoFileLocation | InputFileLocation.inputPhotoLegacyFileLocation | InputFileLocation.inputPeerPhotoFileLocation | InputFileLocation.inputStickerSetThumb | InputFileLocation.inputGroupCallStream;

export namespace InputFileLocation {
  export type inputFileLocation = {
    _: 'inputFileLocation',
    volume_id: string | number,
    local_id: number,
    secret: string | number,
    file_reference: Uint8Array | number[]
  };

  export type inputEncryptedFileLocation = {
    _: 'inputEncryptedFileLocation',
    id: string | number,
    access_hash: string | number
  };

  export type inputDocumentFileLocation = {
    _: 'inputDocumentFileLocation',
    id: string | number,
    access_hash: string | number,
    file_reference: Uint8Array | number[],
    thumb_size: string,
    checkedReference?: boolean
  };

  export type inputSecureFileLocation = {
    _: 'inputSecureFileLocation',
    id: string | number,
    access_hash: string | number
  };

  export type inputTakeoutFileLocation = {
    _: 'inputTakeoutFileLocation'
  };

  export type inputPhotoFileLocation = {
    _: 'inputPhotoFileLocation',
    id: string | number,
    access_hash: string | number,
    file_reference: Uint8Array | number[],
    thumb_size: string
  };

  export type inputPhotoLegacyFileLocation = {
    _: 'inputPhotoLegacyFileLocation',
    id: string | number,
    access_hash: string | number,
    file_reference: Uint8Array | number[],
    volume_id: string | number,
    local_id: number,
    secret: string | number
  };

  export type inputPeerPhotoFileLocation = {
    _: 'inputPeerPhotoFileLocation',
    flags?: number,
    pFlags: Partial<{
      big?: true,
    }>,
    peer: InputPeer,
    photo_id: string | number
  };

  export type inputStickerSetThumb = {
    _: 'inputStickerSetThumb',
    stickerset: InputStickerSet,
    thumb_version: number
  };

  export type inputGroupCallStream = {
    _: 'inputGroupCallStream',
    flags?: number,
    call: InputGroupCall,
    time_ms: string | number,
    scale: number,
    video_channel?: number,
    video_quality?: number
  };
}

/**
 * @link https://core.telegram.org/type/Peer
 */
export type Peer = Peer.peerUser | Peer.peerChat | Peer.peerChannel;

export namespace Peer {
  export type peerUser = {
    _: 'peerUser',
    user_id: string | number
  };

  export type peerChat = {
    _: 'peerChat',
    chat_id: string | number
  };

  export type peerChannel = {
    _: 'peerChannel',
    channel_id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/storage.FileType
 */
export type StorageFileType = StorageFileType.storageFileUnknown | StorageFileType.storageFilePartial | StorageFileType.storageFileJpeg | StorageFileType.storageFileGif | StorageFileType.storageFilePng | StorageFileType.storageFilePdf | StorageFileType.storageFileMp3 | StorageFileType.storageFileMov | StorageFileType.storageFileMp4 | StorageFileType.storageFileWebp;

export namespace StorageFileType {
  export type storageFileUnknown = {
    _: 'storage.fileUnknown'
  };

  export type storageFilePartial = {
    _: 'storage.filePartial'
  };

  export type storageFileJpeg = {
    _: 'storage.fileJpeg'
  };

  export type storageFileGif = {
    _: 'storage.fileGif'
  };

  export type storageFilePng = {
    _: 'storage.filePng'
  };

  export type storageFilePdf = {
    _: 'storage.filePdf'
  };

  export type storageFileMp3 = {
    _: 'storage.fileMp3'
  };

  export type storageFileMov = {
    _: 'storage.fileMov'
  };

  export type storageFileMp4 = {
    _: 'storage.fileMp4'
  };

  export type storageFileWebp = {
    _: 'storage.fileWebp'
  };
}

/**
 * @link https://core.telegram.org/type/User
 */
export type User = User.userEmpty | User.user;

export namespace User {
  export type userEmpty = {
    _: 'userEmpty',
    id: string | number
  };

  export type user = {
    _: 'user',
    flags?: number,
    pFlags: Partial<{
      self?: true,
      contact?: true,
      mutual_contact?: true,
      deleted?: true,
      bot?: true,
      bot_chat_history?: true,
      bot_nochats?: true,
      verified?: true,
      restricted?: true,
      min?: true,
      bot_inline_geo?: true,
      support?: true,
      scam?: true,
      apply_min_photo?: true,
      fake?: true,
      bot_attach_menu?: true,
      premium?: true,
      attach_menu_enabled?: true,
      bot_can_edit?: true,
    }>,
    flags2?: number,
    id: string | number,
    access_hash?: string | number,
    first_name?: string,
    last_name?: string,
    username?: string,
    phone?: string,
    photo?: UserProfilePhoto,
    status?: UserStatus,
    bot_info_version?: number,
    restriction_reason?: Array<RestrictionReason>,
    bot_inline_placeholder?: string,
    lang_code?: string,
    emoji_status?: EmojiStatus,
    usernames?: Array<Username>,
    sortName?: string
  };
}

/**
 * @link https://core.telegram.org/type/UserProfilePhoto
 */
export type UserProfilePhoto = UserProfilePhoto.userProfilePhotoEmpty | UserProfilePhoto.userProfilePhoto;

export namespace UserProfilePhoto {
  export type userProfilePhotoEmpty = {
    _: 'userProfilePhotoEmpty'
  };

  export type userProfilePhoto = {
    _: 'userProfilePhoto',
    flags?: number,
    pFlags: Partial<{
      has_video?: true,
      personal?: true,
    }>,
    photo_id: string | number,
    stripped_thumb?: Uint8Array,
    dc_id: number
  };
}

/**
 * @link https://core.telegram.org/type/UserStatus
 */
export type UserStatus = UserStatus.userStatusEmpty | UserStatus.userStatusOnline | UserStatus.userStatusOffline | UserStatus.userStatusRecently | UserStatus.userStatusLastWeek | UserStatus.userStatusLastMonth;

export namespace UserStatus {
  export type userStatusEmpty = {
    _: 'userStatusEmpty'
  };

  export type userStatusOnline = {
    _: 'userStatusOnline',
    expires: number
  };

  export type userStatusOffline = {
    _: 'userStatusOffline',
    was_online: number
  };

  export type userStatusRecently = {
    _: 'userStatusRecently'
  };

  export type userStatusLastWeek = {
    _: 'userStatusLastWeek'
  };

  export type userStatusLastMonth = {
    _: 'userStatusLastMonth'
  };
}

/**
 * @link https://core.telegram.org/type/Chat
 */
export type Chat = Chat.chatEmpty | Chat.chat | Chat.chatForbidden | Chat.channel | Chat.channelForbidden;

export namespace Chat {
  export type chatEmpty = {
    _: 'chatEmpty',
    id: string | number
  };

  export type chat = {
    _: 'chat',
    flags?: number,
    pFlags: Partial<{
      creator?: true,
      left?: true,
      deactivated?: true,
      call_active?: true,
      call_not_empty?: true,
      noforwards?: true,
    }>,
    id: string | number,
    title: string,
    photo: ChatPhoto,
    participants_count: number,
    date: number,
    version: number,
    migrated_to?: InputChannel,
    admin_rights?: ChatAdminRights,
    default_banned_rights?: ChatBannedRights
  };

  export type chatForbidden = {
    _: 'chatForbidden',
    id: string | number,
    title: string,
    pFlags?: {}
  };

  export type channel = {
    _: 'channel',
    flags?: number,
    pFlags: Partial<{
      creator?: true,
      left?: true,
      broadcast?: true,
      verified?: true,
      megagroup?: true,
      restricted?: true,
      signatures?: true,
      min?: true,
      scam?: true,
      has_link?: true,
      has_geo?: true,
      slowmode_enabled?: true,
      call_active?: true,
      call_not_empty?: true,
      fake?: true,
      gigagroup?: true,
      noforwards?: true,
      join_to_send?: true,
      join_request?: true,
      forum?: true,
    }>,
    flags2?: number,
    id: string | number,
    access_hash?: string | number,
    title: string,
    username?: string,
    photo: ChatPhoto,
    date: number,
    restriction_reason?: Array<RestrictionReason>,
    admin_rights?: ChatAdminRights,
    banned_rights?: ChatBannedRights,
    default_banned_rights?: ChatBannedRights,
    participants_count?: number,
    usernames?: Array<Username>
  };

  export type channelForbidden = {
    _: 'channelForbidden',
    flags?: number,
    pFlags: Partial<{
      broadcast?: true,
      megagroup?: true,
    }>,
    id: string | number,
    access_hash: string | number,
    title: string,
    until_date?: number
  };
}

/**
 * @link https://core.telegram.org/type/ChatFull
 */
export type ChatFull = ChatFull.chatFull | ChatFull.channelFull;

export namespace ChatFull {
  export type chatFull = {
    _: 'chatFull',
    flags?: number,
    pFlags: Partial<{
      can_set_username?: true,
      has_scheduled?: true,
      translations_disabled?: true,
    }>,
    id: string | number,
    about: string,
    participants: ChatParticipants,
    chat_photo?: Photo,
    notify_settings: PeerNotifySettings,
    exported_invite?: ExportedChatInvite,
    bot_info?: Array<BotInfo>,
    pinned_msg_id?: number,
    folder_id?: number,
    call?: InputGroupCall,
    ttl_period?: number,
    groupcall_default_join_as?: Peer,
    theme_emoticon?: string,
    requests_pending?: number,
    recent_requesters?: Array<string | number>,
    available_reactions?: ChatReactions
  };

  export type channelFull = {
    _: 'channelFull',
    flags?: number,
    pFlags: Partial<{
      can_view_participants?: true,
      can_set_username?: true,
      can_set_stickers?: true,
      hidden_prehistory?: true,
      can_set_location?: true,
      has_scheduled?: true,
      can_view_stats?: true,
      blocked?: true,
      can_delete_channel?: true,
      antispam?: true,
      participants_hidden?: true,
      translations_disabled?: true,
    }>,
    flags2?: number,
    id: string | number,
    about: string,
    participants_count?: number,
    admins_count?: number,
    kicked_count?: number,
    banned_count?: number,
    online_count?: number,
    read_inbox_max_id: number,
    read_outbox_max_id: number,
    unread_count: number,
    chat_photo: Photo,
    notify_settings: PeerNotifySettings,
    exported_invite?: ExportedChatInvite,
    bot_info: Array<BotInfo>,
    migrated_from_chat_id?: string | number,
    migrated_from_max_id?: number,
    pinned_msg_id?: number,
    stickerset?: StickerSet,
    available_min_id?: number,
    folder_id?: number,
    linked_chat_id?: string | number,
    location?: ChannelLocation,
    slowmode_seconds?: number,
    slowmode_next_send_date?: number,
    stats_dc?: number,
    pts: number,
    call?: InputGroupCall,
    ttl_period?: number,
    pending_suggestions?: Array<string>,
    groupcall_default_join_as?: Peer,
    theme_emoticon?: string,
    requests_pending?: number,
    recent_requesters?: Array<string | number>,
    default_send_as?: Peer,
    available_reactions?: ChatReactions
  };
}

/**
 * @link https://core.telegram.org/type/ChatParticipant
 */
export type ChatParticipant = ChatParticipant.chatParticipant | ChatParticipant.chatParticipantCreator | ChatParticipant.chatParticipantAdmin;

export namespace ChatParticipant {
  export type chatParticipant = {
    _: 'chatParticipant',
    user_id: string | number,
    inviter_id: string | number,
    date: number
  };

  export type chatParticipantCreator = {
    _: 'chatParticipantCreator',
    user_id: string | number
  };

  export type chatParticipantAdmin = {
    _: 'chatParticipantAdmin',
    user_id: string | number,
    inviter_id: string | number,
    date: number
  };
}

/**
 * @link https://core.telegram.org/type/ChatParticipants
 */
export type ChatParticipants = ChatParticipants.chatParticipantsForbidden | ChatParticipants.chatParticipants;

export namespace ChatParticipants {
  export type chatParticipantsForbidden = {
    _: 'chatParticipantsForbidden',
    flags?: number,
    chat_id: string | number,
    self_participant?: ChatParticipant
  };

  export type chatParticipants = {
    _: 'chatParticipants',
    chat_id: string | number,
    participants: Array<ChatParticipant>,
    version: number
  };
}

/**
 * @link https://core.telegram.org/type/ChatPhoto
 */
export type ChatPhoto = ChatPhoto.chatPhotoEmpty | ChatPhoto.chatPhoto;

export namespace ChatPhoto {
  export type chatPhotoEmpty = {
    _: 'chatPhotoEmpty'
  };

  export type chatPhoto = {
    _: 'chatPhoto',
    flags?: number,
    pFlags: Partial<{
      has_video?: true,
    }>,
    photo_id: string | number,
    stripped_thumb?: Uint8Array,
    dc_id: number
  };
}

/**
 * @link https://core.telegram.org/type/Message
 */
export type Message = Message.messageEmpty | Message.message | Message.messageService;

export namespace Message {
  export type messageEmpty = {
    _: 'messageEmpty',
    flags?: number,
    id: number,
    peer_id?: Peer,
    deleted?: boolean,
    mid?: number,
    pFlags?: {}
  };

  export type message = {
    _: 'message',
    flags?: number,
    pFlags: Partial<{
      out?: true,
      mentioned?: true,
      media_unread?: true,
      silent?: true,
      post?: true,
      from_scheduled?: true,
      legacy?: true,
      edit_hide?: true,
      pinned?: true,
      noforwards?: true,
      unread?: true,
      is_outgoing?: true,
      is_scheduled?: true,
      sponsored?: true,
      local?: true,
    }>,
    id: number,
    from_id?: Peer,
    peer_id: Peer,
    fwd_from?: MessageFwdHeader,
    via_bot_id?: string | number,
    reply_to?: MessageReplyHeader,
    date: number,
    message: string,
    media?: MessageMedia,
    reply_markup?: ReplyMarkup,
    entities?: Array<MessageEntity>,
    views?: number,
    forwards?: number,
    replies?: MessageReplies,
    edit_date?: number,
    post_author?: string,
    reactions?: MessageReactions,
    restriction_reason?: Array<RestrictionReason>,
    ttl_period?: number,
    mid?: number,
    deleted?: boolean,
    peerId?: PeerId,
    fromId?: PeerId,
    fwdFromId?: PeerId,
    grouped_id?: string,
    random_id?: string,
    viaBotId?: PeerId,
    clear_history?: boolean,
    pending?: boolean,
    error?: ApiError,
    send?: () => Promise<any>,
    totalEntities?: MessageEntity[],
    reply_to_mid?: number,
    savedFrom?: string,
    sponsoredMessage?: SponsoredMessage.sponsoredMessage,
    promise?: CancellablePromise<void>,
    uploadingFileName?: string,
    storageKey?: MessagesStorageKey
  };

  export type messageService = {
    _: 'messageService',
    flags?: number,
    pFlags: Partial<{
      out?: true,
      mentioned?: true,
      media_unread?: true,
      silent?: true,
      post?: true,
      legacy?: true,
      unread?: true,
      is_outgoing?: true,
      is_single?: true,
      local?: true,
    }>,
    id: number,
    from_id?: Peer,
    peer_id: Peer,
    reply_to?: MessageReplyHeader,
    date: number,
    action: MessageAction,
    ttl_period?: number,
    mid?: number,
    deleted?: boolean,
    peerId?: PeerId,
    fromId?: PeerId,
    viaBotId?: PeerId,
    pending?: boolean,
    error?: ApiError,
    send?: () => Promise<any>,
    random_id?: string,
    reply_to_mid?: number,
    clear_history?: boolean,
    storageKey?: MessagesStorageKey
  };
}

/**
 * @link https://core.telegram.org/type/MessageMedia
 */
export type MessageMedia = MessageMedia.messageMediaEmpty | MessageMedia.messageMediaPhoto | MessageMedia.messageMediaGeo | MessageMedia.messageMediaContact | MessageMedia.messageMediaUnsupported | MessageMedia.messageMediaDocument | MessageMedia.messageMediaWebPage | MessageMedia.messageMediaVenue | MessageMedia.messageMediaGame | MessageMedia.messageMediaInvoice | MessageMedia.messageMediaGeoLive | MessageMedia.messageMediaPoll | MessageMedia.messageMediaDice | MessageMedia.messageMediaCall | MessageMedia.messageMediaPhotoExternal | MessageMedia.messageMediaDocumentExternal;

export namespace MessageMedia {
  export type messageMediaEmpty = {
    _: 'messageMediaEmpty'
  };

  export type messageMediaPhoto = {
    _: 'messageMediaPhoto',
    flags?: number,
    pFlags: Partial<{
      spoiler?: true,
    }>,
    photo?: Photo,
    ttl_seconds?: number
  };

  export type messageMediaGeo = {
    _: 'messageMediaGeo',
    geo: GeoPoint
  };

  export type messageMediaContact = {
    _: 'messageMediaContact',
    phone_number: string,
    first_name: string,
    last_name: string,
    vcard: string,
    user_id: string | number
  };

  export type messageMediaUnsupported = {
    _: 'messageMediaUnsupported'
  };

  export type messageMediaDocument = {
    _: 'messageMediaDocument',
    flags?: number,
    pFlags: Partial<{
      nopremium?: true,
      spoiler?: true,
    }>,
    document?: Document,
    ttl_seconds?: number
  };

  export type messageMediaWebPage = {
    _: 'messageMediaWebPage',
    webpage: WebPage
  };

  export type messageMediaVenue = {
    _: 'messageMediaVenue',
    geo: GeoPoint,
    title: string,
    address: string,
    provider: string,
    venue_id: string,
    venue_type: string
  };

  export type messageMediaGame = {
    _: 'messageMediaGame',
    game: Game
  };

  export type messageMediaInvoice = {
    _: 'messageMediaInvoice',
    flags?: number,
    pFlags: Partial<{
      shipping_address_requested?: true,
      test?: true,
    }>,
    title: string,
    description: string,
    photo?: WebDocument,
    receipt_msg_id?: number,
    currency: string,
    total_amount: string | number,
    start_param: string,
    extended_media?: MessageExtendedMedia
  };

  export type messageMediaGeoLive = {
    _: 'messageMediaGeoLive',
    flags?: number,
    geo: GeoPoint,
    heading?: number,
    period: number,
    proximity_notification_radius?: number
  };

  export type messageMediaPoll = {
    _: 'messageMediaPoll',
    poll: Poll,
    results: PollResults
  };

  export type messageMediaDice = {
    _: 'messageMediaDice',
    value: number,
    emoticon: string
  };

  export type messageMediaCall = {
    _: 'messageMediaCall',
    action?: MessageAction.messageActionPhoneCall
  };

  export type messageMediaPhotoExternal = {
    _: 'messageMediaPhotoExternal',
    photo?: WebDocument
  };

  export type messageMediaDocumentExternal = {
    _: 'messageMediaDocumentExternal',
    document?: WebDocument
  };
}

/**
 * @link https://core.telegram.org/type/MessageAction
 */
export type MessageAction = MessageAction.messageActionEmpty | MessageAction.messageActionChatCreate | MessageAction.messageActionChatEditTitle | MessageAction.messageActionChatEditPhoto | MessageAction.messageActionChatDeletePhoto | MessageAction.messageActionChatAddUser | MessageAction.messageActionChatDeleteUser | MessageAction.messageActionChatJoinedByLink | MessageAction.messageActionChannelCreate | MessageAction.messageActionChatMigrateTo | MessageAction.messageActionChannelMigrateFrom | MessageAction.messageActionPinMessage | MessageAction.messageActionHistoryClear | MessageAction.messageActionGameScore | MessageAction.messageActionPaymentSentMe | MessageAction.messageActionPaymentSent | MessageAction.messageActionPhoneCall | MessageAction.messageActionScreenshotTaken | MessageAction.messageActionCustomAction | MessageAction.messageActionBotAllowed | MessageAction.messageActionSecureValuesSentMe | MessageAction.messageActionSecureValuesSent | MessageAction.messageActionContactSignUp | MessageAction.messageActionGeoProximityReached | MessageAction.messageActionGroupCall | MessageAction.messageActionInviteToGroupCall | MessageAction.messageActionSetMessagesTTL | MessageAction.messageActionGroupCallScheduled | MessageAction.messageActionSetChatTheme | MessageAction.messageActionChatJoinedByRequest | MessageAction.messageActionWebViewDataSentMe | MessageAction.messageActionWebViewDataSent | MessageAction.messageActionGiftPremium | MessageAction.messageActionTopicCreate | MessageAction.messageActionTopicEdit | MessageAction.messageActionSuggestProfilePhoto | MessageAction.messageActionRequestedPeer | MessageAction.messageActionSetChatWallPaper | MessageAction.messageActionSetSameChatWallPaper | MessageAction.messageActionDiscussionStarted | MessageAction.messageActionChatLeave | MessageAction.messageActionChannelDeletePhoto | MessageAction.messageActionChannelEditTitle | MessageAction.messageActionChannelEditPhoto | MessageAction.messageActionChannelEditVideo | MessageAction.messageActionChatEditVideo | MessageAction.messageActionChatAddUsers | MessageAction.messageActionChatJoined | MessageAction.messageActionChatReturn | MessageAction.messageActionChatJoinedYou | MessageAction.messageActionChatReturnYou;

export namespace MessageAction {
  export type messageActionEmpty = {
    _: 'messageActionEmpty'
  };

  export type messageActionChatCreate = {
    _: 'messageActionChatCreate',
    title: string,
    users: Array<string | number>
  };

  export type messageActionChatEditTitle = {
    _: 'messageActionChatEditTitle',
    title: string
  };

  export type messageActionChatEditPhoto = {
    _: 'messageActionChatEditPhoto',
    photo: Photo
  };

  export type messageActionChatDeletePhoto = {
    _: 'messageActionChatDeletePhoto'
  };

  export type messageActionChatAddUser = {
    _: 'messageActionChatAddUser',
    users: Array<string | number>
  };

  export type messageActionChatDeleteUser = {
    _: 'messageActionChatDeleteUser',
    user_id: string | number
  };

  export type messageActionChatJoinedByLink = {
    _: 'messageActionChatJoinedByLink',
    inviter_id: string | number
  };

  export type messageActionChannelCreate = {
    _: 'messageActionChannelCreate',
    title: string
  };

  export type messageActionChatMigrateTo = {
    _: 'messageActionChatMigrateTo',
    channel_id: string | number
  };

  export type messageActionChannelMigrateFrom = {
    _: 'messageActionChannelMigrateFrom',
    title: string,
    chat_id: string | number
  };

  export type messageActionPinMessage = {
    _: 'messageActionPinMessage'
  };

  export type messageActionHistoryClear = {
    _: 'messageActionHistoryClear'
  };

  export type messageActionGameScore = {
    _: 'messageActionGameScore',
    game_id: string | number,
    score: number
  };

  export type messageActionPaymentSentMe = {
    _: 'messageActionPaymentSentMe',
    flags?: number,
    pFlags: Partial<{
      recurring_init?: true,
      recurring_used?: true,
    }>,
    currency: string,
    total_amount: string | number,
    payload: Uint8Array,
    info?: PaymentRequestedInfo,
    shipping_option_id?: string,
    charge: PaymentCharge
  };

  export type messageActionPaymentSent = {
    _: 'messageActionPaymentSent',
    flags?: number,
    pFlags: Partial<{
      recurring_init?: true,
      recurring_used?: true,
    }>,
    currency: string,
    total_amount: string | number,
    invoice_slug?: string
  };

  export type messageActionPhoneCall = {
    _: 'messageActionPhoneCall',
    flags?: number,
    pFlags: Partial<{
      video?: true,
    }>,
    call_id: string | number,
    reason?: PhoneCallDiscardReason,
    duration?: number
  };

  export type messageActionScreenshotTaken = {
    _: 'messageActionScreenshotTaken'
  };

  export type messageActionCustomAction = {
    _: 'messageActionCustomAction',
    message: string
  };

  export type messageActionBotAllowed = {
    _: 'messageActionBotAllowed',
    flags?: number,
    pFlags: Partial<{
      attach_menu?: true,
    }>,
    domain?: string,
    app?: BotApp
  };

  export type messageActionSecureValuesSentMe = {
    _: 'messageActionSecureValuesSentMe',
    values: Array<SecureValue>,
    credentials: SecureCredentialsEncrypted
  };

  export type messageActionSecureValuesSent = {
    _: 'messageActionSecureValuesSent',
    types: Array<SecureValueType>
  };

  export type messageActionContactSignUp = {
    _: 'messageActionContactSignUp'
  };

  export type messageActionGeoProximityReached = {
    _: 'messageActionGeoProximityReached',
    from_id: Peer,
    to_id: Peer,
    distance: number
  };

  export type messageActionGroupCall = {
    _: 'messageActionGroupCall',
    flags?: number,
    call: InputGroupCall,
    duration?: number
  };

  export type messageActionInviteToGroupCall = {
    _: 'messageActionInviteToGroupCall',
    call: InputGroupCall,
    users: Array<string | number>
  };

  export type messageActionSetMessagesTTL = {
    _: 'messageActionSetMessagesTTL',
    flags?: number,
    period: number,
    auto_setting_from?: string | number
  };

  export type messageActionGroupCallScheduled = {
    _: 'messageActionGroupCallScheduled',
    call: InputGroupCall,
    schedule_date: number
  };

  export type messageActionSetChatTheme = {
    _: 'messageActionSetChatTheme',
    emoticon: string
  };

  export type messageActionChatJoinedByRequest = {
    _: 'messageActionChatJoinedByRequest'
  };

  export type messageActionWebViewDataSentMe = {
    _: 'messageActionWebViewDataSentMe',
    text: string,
    data: string
  };

  export type messageActionWebViewDataSent = {
    _: 'messageActionWebViewDataSent',
    text: string
  };

  export type messageActionGiftPremium = {
    _: 'messageActionGiftPremium',
    flags?: number,
    currency: string,
    amount: string | number,
    months: number,
    crypto_currency?: string,
    crypto_amount?: string | number
  };

  export type messageActionTopicCreate = {
    _: 'messageActionTopicCreate',
    flags?: number,
    title: string,
    icon_color: number,
    icon_emoji_id?: string | number
  };

  export type messageActionTopicEdit = {
    _: 'messageActionTopicEdit',
    flags?: number,
    title?: string,
    icon_emoji_id?: string | number,
    closed?: boolean,
    hidden?: boolean
  };

  export type messageActionSuggestProfilePhoto = {
    _: 'messageActionSuggestProfilePhoto',
    photo: Photo
  };

  export type messageActionRequestedPeer = {
    _: 'messageActionRequestedPeer',
    button_id: number,
    peer: Peer
  };

  export type messageActionSetChatWallPaper = {
    _: 'messageActionSetChatWallPaper',
    wallpaper: WallPaper
  };

  export type messageActionSetSameChatWallPaper = {
    _: 'messageActionSetSameChatWallPaper'
  };

  export type messageActionDiscussionStarted = {
    _: 'messageActionDiscussionStarted'
  };

  export type messageActionChatLeave = {
    _: 'messageActionChatLeave',
    user_id?: UserId
  };

  export type messageActionChannelDeletePhoto = {
    _: 'messageActionChannelDeletePhoto'
  };

  export type messageActionChannelEditTitle = {
    _: 'messageActionChannelEditTitle',
    title?: string
  };

  export type messageActionChannelEditPhoto = {
    _: 'messageActionChannelEditPhoto',
    photo?: Photo
  };

  export type messageActionChannelEditVideo = {
    _: 'messageActionChannelEditVideo',
    photo?: Photo
  };

  export type messageActionChatEditVideo = {
    _: 'messageActionChatEditVideo',
    photo?: Photo
  };

  export type messageActionChatAddUsers = {
    _: 'messageActionChatAddUsers',
    users?: Array<UserId>
  };

  export type messageActionChatJoined = {
    _: 'messageActionChatJoined',
    users?: Array<UserId>
  };

  export type messageActionChatReturn = {
    _: 'messageActionChatReturn',
    users?: Array<UserId>
  };

  export type messageActionChatJoinedYou = {
    _: 'messageActionChatJoinedYou',
    users?: Array<UserId>
  };

  export type messageActionChatReturnYou = {
    _: 'messageActionChatReturnYou',
    users?: Array<UserId>
  };
}

/**
 * @link https://core.telegram.org/type/Dialog
 */
export type Dialog = Dialog.dialog | Dialog.dialogFolder;

export namespace Dialog {
  export type dialog = {
    _: 'dialog',
    flags?: number,
    pFlags: Partial<{
      pinned?: true,
      unread_mark?: true,
    }>,
    peer: Peer,
    top_message: number,
    read_inbox_max_id: number,
    read_outbox_max_id: number,
    unread_count: number,
    unread_mentions_count: number,
    unread_reactions_count: number,
    notify_settings: PeerNotifySettings,
    pts?: number,
    draft?: DraftMessage,
    ttl_period?: number,
    folder_id?: 0 | 1,
    index_0?: number,
    index_1?: number,
    index_2?: number,
    index_3?: number,
    index_4?: number,
    index_5?: number,
    index_6?: number,
    index_7?: number,
    index_8?: number,
    index_9?: number,
    index_10?: number,
    index_11?: number,
    index_12?: number,
    index_13?: number,
    index_14?: number,
    index_15?: number,
    index_16?: number,
    index_17?: number,
    index_18?: number,
    index_19?: number,
    index_20?: number,
    index_21?: number,
    peerId?: PeerId,
    topMessage?: any,
    migratedTo?: PeerId
  };

  export type dialogFolder = {
    _: 'dialogFolder',
    flags?: number,
    pFlags: Partial<{
      pinned?: true,
    }>,
    folder: Folder,
    peer: Peer,
    top_message: number,
    unread_muted_peers_count: number,
    unread_unmuted_peers_count: number,
    unread_muted_messages_count: number,
    unread_unmuted_messages_count: number,
    index?: number,
    peerId?: PeerId,
    folder_id?: number
  };
}

/**
 * @link https://core.telegram.org/type/Photo
 */
export type Photo = Photo.photoEmpty | Photo.photo;

export namespace Photo {
  export type photoEmpty = {
    _: 'photoEmpty',
    id: string | number
  };

  export type photo = {
    _: 'photo',
    flags?: number,
    pFlags: Partial<{
      has_stickers?: true,
    }>,
    id: string | number,
    access_hash: string | number,
    file_reference: Uint8Array | number[],
    date: number,
    sizes: Array<PhotoSize>,
    video_sizes?: Array<VideoSize>,
    dc_id: number
  };
}

/**
 * @link https://core.telegram.org/type/PhotoSize
 */
export type PhotoSize = PhotoSize.photoSizeEmpty | PhotoSize.photoSize | PhotoSize.photoCachedSize | PhotoSize.photoStrippedSize | PhotoSize.photoSizeProgressive | PhotoSize.photoPathSize;

export namespace PhotoSize {
  export type photoSizeEmpty = {
    _: 'photoSizeEmpty',
    type: string
  };

  export type photoSize = {
    _: 'photoSize',
    type: string,
    w: number,
    h: number,
    size: number
  };

  export type photoCachedSize = {
    _: 'photoCachedSize',
    type: string,
    w: number,
    h: number,
    bytes: Uint8Array
  };

  export type photoStrippedSize = {
    _: 'photoStrippedSize',
    type: string,
    bytes: Uint8Array,
    w?: number,
    h?: number
  };

  export type photoSizeProgressive = {
    _: 'photoSizeProgressive',
    type: string,
    w: number,
    h: number,
    sizes: Array<number>,
    size?: number
  };

  export type photoPathSize = {
    _: 'photoPathSize',
    type: string,
    bytes: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/GeoPoint
 */
export type GeoPoint = GeoPoint.geoPointEmpty | GeoPoint.geoPoint;

export namespace GeoPoint {
  export type geoPointEmpty = {
    _: 'geoPointEmpty'
  };

  export type geoPoint = {
    _: 'geoPoint',
    flags?: number,
    long: number,
    lat: number,
    access_hash: string | number,
    accuracy_radius?: number
  };
}

/**
 * @link https://core.telegram.org/type/auth.SentCode
 */
export type AuthSentCode = AuthSentCode.authSentCode | AuthSentCode.authSentCodeSuccess;

export namespace AuthSentCode {
  export type authSentCode = {
    _: 'auth.sentCode',
    flags?: number,
    type: AuthSentCodeType,
    phone_code_hash: string,
    next_type?: AuthCodeType,
    timeout?: number,
    phone_number?: string
  };

  export type authSentCodeSuccess = {
    _: 'auth.sentCodeSuccess',
    authorization: AuthAuthorization
  };
}

/**
 * @link https://core.telegram.org/type/auth.Authorization
 */
export type AuthAuthorization = AuthAuthorization.authAuthorization | AuthAuthorization.authAuthorizationSignUpRequired;

export namespace AuthAuthorization {
  export type authAuthorization = {
    _: 'auth.authorization',
    flags?: number,
    pFlags: Partial<{
      setup_password_required?: true,
    }>,
    otherwise_relogin_days?: number,
    tmp_sessions?: number,
    future_auth_token?: Uint8Array,
    user: User
  };

  export type authAuthorizationSignUpRequired = {
    _: 'auth.authorizationSignUpRequired',
    flags?: number,
    terms_of_service?: HelpTermsOfService
  };
}

/**
 * @link https://core.telegram.org/type/auth.ExportedAuthorization
 */
export type AuthExportedAuthorization = AuthExportedAuthorization.authExportedAuthorization;

export namespace AuthExportedAuthorization {
  export type authExportedAuthorization = {
    _: 'auth.exportedAuthorization',
    id: string | number,
    bytes: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/InputNotifyPeer
 */
export type InputNotifyPeer = InputNotifyPeer.inputNotifyPeer | InputNotifyPeer.inputNotifyUsers | InputNotifyPeer.inputNotifyChats | InputNotifyPeer.inputNotifyBroadcasts | InputNotifyPeer.inputNotifyForumTopic;

export namespace InputNotifyPeer {
  export type inputNotifyPeer = {
    _: 'inputNotifyPeer',
    peer: InputPeer
  };

  export type inputNotifyUsers = {
    _: 'inputNotifyUsers'
  };

  export type inputNotifyChats = {
    _: 'inputNotifyChats'
  };

  export type inputNotifyBroadcasts = {
    _: 'inputNotifyBroadcasts'
  };

  export type inputNotifyForumTopic = {
    _: 'inputNotifyForumTopic',
    peer: InputPeer,
    top_msg_id: number
  };
}

/**
 * @link https://core.telegram.org/type/InputPeerNotifySettings
 */
export type InputPeerNotifySettings = InputPeerNotifySettings.inputPeerNotifySettings;

export namespace InputPeerNotifySettings {
  export type inputPeerNotifySettings = {
    _: 'inputPeerNotifySettings',
    flags?: number,
    show_previews?: boolean,
    silent?: boolean,
    mute_until?: number,
    sound?: NotificationSound
  };
}

/**
 * @link https://core.telegram.org/type/PeerNotifySettings
 */
export type PeerNotifySettings = PeerNotifySettings.peerNotifySettings;

export namespace PeerNotifySettings {
  export type peerNotifySettings = {
    _: 'peerNotifySettings',
    flags?: number,
    show_previews?: boolean,
    silent?: boolean,
    mute_until?: number,
    ios_sound?: NotificationSound,
    android_sound?: NotificationSound,
    other_sound?: NotificationSound
  };
}

/**
 * @link https://core.telegram.org/type/PeerSettings
 */
export type PeerSettings = PeerSettings.peerSettings;

export namespace PeerSettings {
  export type peerSettings = {
    _: 'peerSettings',
    flags?: number,
    pFlags: Partial<{
      report_spam?: true,
      add_contact?: true,
      block_contact?: true,
      share_contact?: true,
      need_contacts_exception?: true,
      report_geo?: true,
      autoarchived?: true,
      invite_members?: true,
      request_chat_broadcast?: true,
    }>,
    geo_distance?: number,
    request_chat_title?: string,
    request_chat_date?: number
  };
}

/**
 * @link https://core.telegram.org/type/WallPaper
 */
export type WallPaper = WallPaper.wallPaper | WallPaper.wallPaperNoFile;

export namespace WallPaper {
  export type wallPaper = {
    _: 'wallPaper',
    id: string | number,
    flags?: number,
    pFlags: Partial<{
      creator?: true,
      default?: true,
      pattern?: true,
      dark?: true,
    }>,
    access_hash: string | number,
    slug: string,
    document: Document,
    settings?: WallPaperSettings
  };

  export type wallPaperNoFile = {
    _: 'wallPaperNoFile',
    id: string | number,
    flags?: number,
    pFlags: Partial<{
      default?: true,
      dark?: true,
    }>,
    settings?: WallPaperSettings
  };
}

/**
 * @link https://core.telegram.org/type/ReportReason
 */
export type ReportReason = ReportReason.inputReportReasonSpam | ReportReason.inputReportReasonViolence | ReportReason.inputReportReasonPornography | ReportReason.inputReportReasonChildAbuse | ReportReason.inputReportReasonOther | ReportReason.inputReportReasonCopyright | ReportReason.inputReportReasonGeoIrrelevant | ReportReason.inputReportReasonFake | ReportReason.inputReportReasonIllegalDrugs | ReportReason.inputReportReasonPersonalDetails;

export namespace ReportReason {
  export type inputReportReasonSpam = {
    _: 'inputReportReasonSpam'
  };

  export type inputReportReasonViolence = {
    _: 'inputReportReasonViolence'
  };

  export type inputReportReasonPornography = {
    _: 'inputReportReasonPornography'
  };

  export type inputReportReasonChildAbuse = {
    _: 'inputReportReasonChildAbuse'
  };

  export type inputReportReasonOther = {
    _: 'inputReportReasonOther'
  };

  export type inputReportReasonCopyright = {
    _: 'inputReportReasonCopyright'
  };

  export type inputReportReasonGeoIrrelevant = {
    _: 'inputReportReasonGeoIrrelevant'
  };

  export type inputReportReasonFake = {
    _: 'inputReportReasonFake'
  };

  export type inputReportReasonIllegalDrugs = {
    _: 'inputReportReasonIllegalDrugs'
  };

  export type inputReportReasonPersonalDetails = {
    _: 'inputReportReasonPersonalDetails'
  };
}

/**
 * @link https://core.telegram.org/type/UserFull
 */
export type UserFull = UserFull.userFull;

export namespace UserFull {
  export type userFull = {
    _: 'userFull',
    flags?: number,
    pFlags: Partial<{
      blocked?: true,
      phone_calls_available?: true,
      phone_calls_private?: true,
      can_pin_message?: true,
      has_scheduled?: true,
      video_calls_available?: true,
      voice_messages_forbidden?: true,
      translations_disabled?: true,
    }>,
    id: string | number,
    about?: string,
    settings: PeerSettings,
    personal_photo?: Photo,
    profile_photo?: Photo,
    fallback_photo?: Photo,
    notify_settings: PeerNotifySettings,
    bot_info?: BotInfo,
    pinned_msg_id?: number,
    common_chats_count: number,
    folder_id?: number,
    ttl_period?: number,
    theme_emoticon?: string,
    private_forward_name?: string,
    bot_group_admin_rights?: ChatAdminRights,
    bot_broadcast_admin_rights?: ChatAdminRights,
    premium_gifts?: Array<PremiumGiftOption>,
    wallpaper?: WallPaper
  };
}

/**
 * @link https://core.telegram.org/type/Contact
 */
export type Contact = Contact.contact;

export namespace Contact {
  export type contact = {
    _: 'contact',
    user_id: string | number,
    mutual: boolean
  };
}

/**
 * @link https://core.telegram.org/type/ImportedContact
 */
export type ImportedContact = ImportedContact.importedContact;

export namespace ImportedContact {
  export type importedContact = {
    _: 'importedContact',
    user_id: string | number,
    client_id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/ContactStatus
 */
export type ContactStatus = ContactStatus.contactStatus;

export namespace ContactStatus {
  export type contactStatus = {
    _: 'contactStatus',
    user_id: string | number,
    status: UserStatus
  };
}

/**
 * @link https://core.telegram.org/type/contacts.Contacts
 */
export type ContactsContacts = ContactsContacts.contactsContactsNotModified | ContactsContacts.contactsContacts;

export namespace ContactsContacts {
  export type contactsContactsNotModified = {
    _: 'contacts.contactsNotModified'
  };

  export type contactsContacts = {
    _: 'contacts.contacts',
    contacts: Array<Contact>,
    saved_count: number,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/contacts.ImportedContacts
 */
export type ContactsImportedContacts = ContactsImportedContacts.contactsImportedContacts;

export namespace ContactsImportedContacts {
  export type contactsImportedContacts = {
    _: 'contacts.importedContacts',
    imported: Array<ImportedContact>,
    popular_invites: Array<PopularContact>,
    retry_contacts: Array<string | number>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/contacts.Blocked
 */
export type ContactsBlocked = ContactsBlocked.contactsBlocked | ContactsBlocked.contactsBlockedSlice;

export namespace ContactsBlocked {
  export type contactsBlocked = {
    _: 'contacts.blocked',
    blocked: Array<PeerBlocked>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type contactsBlockedSlice = {
    _: 'contacts.blockedSlice',
    count: number,
    blocked: Array<PeerBlocked>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/messages.Dialogs
 */
export type MessagesDialogs = MessagesDialogs.messagesDialogs | MessagesDialogs.messagesDialogsSlice | MessagesDialogs.messagesDialogsNotModified;

export namespace MessagesDialogs {
  export type messagesDialogs = {
    _: 'messages.dialogs',
    dialogs: Array<Dialog>,
    messages: Array<Message>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type messagesDialogsSlice = {
    _: 'messages.dialogsSlice',
    count: number,
    dialogs: Array<Dialog>,
    messages: Array<Message>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type messagesDialogsNotModified = {
    _: 'messages.dialogsNotModified',
    count: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.Messages
 */
export type MessagesMessages = MessagesMessages.messagesMessages | MessagesMessages.messagesMessagesSlice | MessagesMessages.messagesChannelMessages | MessagesMessages.messagesMessagesNotModified;

export namespace MessagesMessages {
  export type messagesMessages = {
    _: 'messages.messages',
    messages: Array<Message>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type messagesMessagesSlice = {
    _: 'messages.messagesSlice',
    flags?: number,
    pFlags: Partial<{
      inexact?: true,
    }>,
    count: number,
    next_rate?: number,
    offset_id_offset?: number,
    messages: Array<Message>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type messagesChannelMessages = {
    _: 'messages.channelMessages',
    flags?: number,
    pFlags: Partial<{
      inexact?: true,
    }>,
    pts: number,
    count: number,
    offset_id_offset?: number,
    messages: Array<Message>,
    topics: Array<ForumTopic>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type messagesMessagesNotModified = {
    _: 'messages.messagesNotModified',
    count: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.Chats
 */
export type MessagesChats = MessagesChats.messagesChats | MessagesChats.messagesChatsSlice;

export namespace MessagesChats {
  export type messagesChats = {
    _: 'messages.chats',
    chats: Array<Chat>
  };

  export type messagesChatsSlice = {
    _: 'messages.chatsSlice',
    count: number,
    chats: Array<Chat>
  };
}

/**
 * @link https://core.telegram.org/type/messages.ChatFull
 */
export type MessagesChatFull = MessagesChatFull.messagesChatFull;

export namespace MessagesChatFull {
  export type messagesChatFull = {
    _: 'messages.chatFull',
    full_chat: ChatFull,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/messages.AffectedHistory
 */
export type MessagesAffectedHistory = MessagesAffectedHistory.messagesAffectedHistory;

export namespace MessagesAffectedHistory {
  export type messagesAffectedHistory = {
    _: 'messages.affectedHistory',
    pts: number,
    pts_count: number,
    offset: number
  };
}

/**
 * @link https://core.telegram.org/type/MessagesFilter
 */
export type MessagesFilter = MessagesFilter.inputMessagesFilterEmpty | MessagesFilter.inputMessagesFilterPhotos | MessagesFilter.inputMessagesFilterVideo | MessagesFilter.inputMessagesFilterPhotoVideo | MessagesFilter.inputMessagesFilterDocument | MessagesFilter.inputMessagesFilterUrl | MessagesFilter.inputMessagesFilterGif | MessagesFilter.inputMessagesFilterVoice | MessagesFilter.inputMessagesFilterMusic | MessagesFilter.inputMessagesFilterChatPhotos | MessagesFilter.inputMessagesFilterPhoneCalls | MessagesFilter.inputMessagesFilterRoundVoice | MessagesFilter.inputMessagesFilterRoundVideo | MessagesFilter.inputMessagesFilterMyMentions | MessagesFilter.inputMessagesFilterGeo | MessagesFilter.inputMessagesFilterContacts | MessagesFilter.inputMessagesFilterPinned;

export namespace MessagesFilter {
  export type inputMessagesFilterEmpty = {
    _: 'inputMessagesFilterEmpty'
  };

  export type inputMessagesFilterPhotos = {
    _: 'inputMessagesFilterPhotos'
  };

  export type inputMessagesFilterVideo = {
    _: 'inputMessagesFilterVideo'
  };

  export type inputMessagesFilterPhotoVideo = {
    _: 'inputMessagesFilterPhotoVideo'
  };

  export type inputMessagesFilterDocument = {
    _: 'inputMessagesFilterDocument'
  };

  export type inputMessagesFilterUrl = {
    _: 'inputMessagesFilterUrl'
  };

  export type inputMessagesFilterGif = {
    _: 'inputMessagesFilterGif'
  };

  export type inputMessagesFilterVoice = {
    _: 'inputMessagesFilterVoice'
  };

  export type inputMessagesFilterMusic = {
    _: 'inputMessagesFilterMusic'
  };

  export type inputMessagesFilterChatPhotos = {
    _: 'inputMessagesFilterChatPhotos'
  };

  export type inputMessagesFilterPhoneCalls = {
    _: 'inputMessagesFilterPhoneCalls',
    flags?: number,
    pFlags: Partial<{
      missed?: true,
    }>
  };

  export type inputMessagesFilterRoundVoice = {
    _: 'inputMessagesFilterRoundVoice'
  };

  export type inputMessagesFilterRoundVideo = {
    _: 'inputMessagesFilterRoundVideo'
  };

  export type inputMessagesFilterMyMentions = {
    _: 'inputMessagesFilterMyMentions'
  };

  export type inputMessagesFilterGeo = {
    _: 'inputMessagesFilterGeo'
  };

  export type inputMessagesFilterContacts = {
    _: 'inputMessagesFilterContacts'
  };

  export type inputMessagesFilterPinned = {
    _: 'inputMessagesFilterPinned'
  };
}

/**
 * @link https://core.telegram.org/type/Update
 */
export type Update = Update.updateNewMessage | Update.updateMessageID | Update.updateDeleteMessages | Update.updateUserTyping | Update.updateChatUserTyping | Update.updateChatParticipants | Update.updateUserStatus | Update.updateUserName | Update.updateNewEncryptedMessage | Update.updateEncryptedChatTyping | Update.updateEncryption | Update.updateEncryptedMessagesRead | Update.updateChatParticipantAdd | Update.updateChatParticipantDelete | Update.updateDcOptions | Update.updateNotifySettings | Update.updateServiceNotification | Update.updatePrivacy | Update.updateUserPhone | Update.updateReadHistoryInbox | Update.updateReadHistoryOutbox | Update.updateWebPage | Update.updateReadMessagesContents | Update.updateChannelTooLong | Update.updateChannel | Update.updateNewChannelMessage | Update.updateReadChannelInbox | Update.updateDeleteChannelMessages | Update.updateChannelMessageViews | Update.updateChatParticipantAdmin | Update.updateNewStickerSet | Update.updateStickerSetsOrder | Update.updateStickerSets | Update.updateSavedGifs | Update.updateBotInlineQuery | Update.updateBotInlineSend | Update.updateEditChannelMessage | Update.updateBotCallbackQuery | Update.updateEditMessage | Update.updateInlineBotCallbackQuery | Update.updateReadChannelOutbox | Update.updateDraftMessage | Update.updateReadFeaturedStickers | Update.updateRecentStickers | Update.updateConfig | Update.updatePtsChanged | Update.updateChannelWebPage | Update.updateDialogPinned | Update.updatePinnedDialogs | Update.updateBotWebhookJSON | Update.updateBotWebhookJSONQuery | Update.updateBotShippingQuery | Update.updateBotPrecheckoutQuery | Update.updatePhoneCall | Update.updateLangPackTooLong | Update.updateLangPack | Update.updateFavedStickers | Update.updateChannelReadMessagesContents | Update.updateContactsReset | Update.updateChannelAvailableMessages | Update.updateDialogUnreadMark | Update.updateMessagePoll | Update.updateChatDefaultBannedRights | Update.updateFolderPeers | Update.updatePeerSettings | Update.updatePeerLocated | Update.updateNewScheduledMessage | Update.updateDeleteScheduledMessages | Update.updateTheme | Update.updateGeoLiveViewed | Update.updateLoginToken | Update.updateMessagePollVote | Update.updateDialogFilter | Update.updateDialogFilterOrder | Update.updateDialogFilters | Update.updatePhoneCallSignalingData | Update.updateChannelMessageForwards | Update.updateReadChannelDiscussionInbox | Update.updateReadChannelDiscussionOutbox | Update.updatePeerBlocked | Update.updateChannelUserTyping | Update.updatePinnedMessages | Update.updatePinnedChannelMessages | Update.updateChat | Update.updateGroupCallParticipants | Update.updateGroupCall | Update.updatePeerHistoryTTL | Update.updateChatParticipant | Update.updateChannelParticipant | Update.updateBotStopped | Update.updateGroupCallConnection | Update.updateBotCommands | Update.updatePendingJoinRequests | Update.updateBotChatInviteRequester | Update.updateMessageReactions | Update.updateAttachMenuBots | Update.updateWebViewResultSent | Update.updateBotMenuButton | Update.updateSavedRingtones | Update.updateTranscribedAudio | Update.updateReadFeaturedEmojiStickers | Update.updateUserEmojiStatus | Update.updateRecentEmojiStatuses | Update.updateRecentReactions | Update.updateMoveStickerSetToTop | Update.updateMessageExtendedMedia | Update.updateChannelPinnedTopic | Update.updateChannelPinnedTopics | Update.updateUser | Update.updateAutoSaveSettings | Update.updateGroupInvitePrivacyForbidden | Update.updateNewDiscussionMessage | Update.updateDeleteDiscussionMessages | Update.updateChannelReload;

export namespace Update {
  export type updateNewMessage = {
    _: 'updateNewMessage',
    message: Message,
    pts: number,
    pts_count: number
  };

  export type updateMessageID = {
    _: 'updateMessageID',
    id: number,
    random_id: string | number
  };

  export type updateDeleteMessages = {
    _: 'updateDeleteMessages',
    messages: Array<number>,
    pts: number,
    pts_count: number
  };

  export type updateUserTyping = {
    _: 'updateUserTyping',
    user_id: string | number,
    action: SendMessageAction
  };

  export type updateChatUserTyping = {
    _: 'updateChatUserTyping',
    chat_id: string | number,
    from_id: Peer,
    action: SendMessageAction
  };

  export type updateChatParticipants = {
    _: 'updateChatParticipants',
    participants: ChatParticipants
  };

  export type updateUserStatus = {
    _: 'updateUserStatus',
    user_id: string | number,
    status: UserStatus
  };

  export type updateUserName = {
    _: 'updateUserName',
    user_id: string | number,
    first_name: string,
    last_name: string,
    usernames: Array<Username>
  };

  export type updateNewEncryptedMessage = {
    _: 'updateNewEncryptedMessage',
    message: EncryptedMessage,
    qts: number
  };

  export type updateEncryptedChatTyping = {
    _: 'updateEncryptedChatTyping',
    chat_id: number
  };

  export type updateEncryption = {
    _: 'updateEncryption',
    chat: EncryptedChat,
    date: number
  };

  export type updateEncryptedMessagesRead = {
    _: 'updateEncryptedMessagesRead',
    chat_id: number,
    max_date: number,
    date: number
  };

  export type updateChatParticipantAdd = {
    _: 'updateChatParticipantAdd',
    chat_id: string | number,
    user_id: string | number,
    inviter_id: string | number,
    date: number,
    version: number
  };

  export type updateChatParticipantDelete = {
    _: 'updateChatParticipantDelete',
    chat_id: string | number,
    user_id: string | number,
    version: number
  };

  export type updateDcOptions = {
    _: 'updateDcOptions',
    dc_options: Array<DcOption>
  };

  export type updateNotifySettings = {
    _: 'updateNotifySettings',
    peer: NotifyPeer,
    notify_settings: PeerNotifySettings
  };

  export type updateServiceNotification = {
    _: 'updateServiceNotification',
    flags?: number,
    pFlags: Partial<{
      popup?: true,
    }>,
    inbox_date?: number,
    type: string,
    message: string,
    media: MessageMedia,
    entities: Array<MessageEntity>
  };

  export type updatePrivacy = {
    _: 'updatePrivacy',
    key: PrivacyKey,
    rules: Array<PrivacyRule>
  };

  export type updateUserPhone = {
    _: 'updateUserPhone',
    user_id: string | number,
    phone: string
  };

  export type updateReadHistoryInbox = {
    _: 'updateReadHistoryInbox',
    flags?: number,
    folder_id?: number,
    peer: Peer,
    max_id: number,
    still_unread_count: number,
    pts: number,
    pts_count: number
  };

  export type updateReadHistoryOutbox = {
    _: 'updateReadHistoryOutbox',
    peer: Peer,
    max_id: number,
    pts: number,
    pts_count: number
  };

  export type updateWebPage = {
    _: 'updateWebPage',
    webpage: WebPage,
    pts: number,
    pts_count: number
  };

  export type updateReadMessagesContents = {
    _: 'updateReadMessagesContents',
    messages: Array<number>,
    pts: number,
    pts_count: number
  };

  export type updateChannelTooLong = {
    _: 'updateChannelTooLong',
    flags?: number,
    channel_id: string | number,
    pts?: number
  };

  export type updateChannel = {
    _: 'updateChannel',
    channel_id: string | number
  };

  export type updateNewChannelMessage = {
    _: 'updateNewChannelMessage',
    message: Message,
    pts: number,
    pts_count: number
  };

  export type updateReadChannelInbox = {
    _: 'updateReadChannelInbox',
    flags?: number,
    folder_id?: number,
    channel_id: string | number,
    max_id: number,
    still_unread_count: number,
    pts: number
  };

  export type updateDeleteChannelMessages = {
    _: 'updateDeleteChannelMessages',
    channel_id: string | number,
    messages: Array<number>,
    pts: number,
    pts_count: number
  };

  export type updateChannelMessageViews = {
    _: 'updateChannelMessageViews',
    channel_id: string | number,
    id: number,
    views: number
  };

  export type updateChatParticipantAdmin = {
    _: 'updateChatParticipantAdmin',
    chat_id: string | number,
    user_id: string | number,
    is_admin: boolean,
    version: number
  };

  export type updateNewStickerSet = {
    _: 'updateNewStickerSet',
    stickerset: MessagesStickerSet
  };

  export type updateStickerSetsOrder = {
    _: 'updateStickerSetsOrder',
    flags?: number,
    pFlags: Partial<{
      masks?: true,
      emojis?: true,
    }>,
    order: Array<string | number>
  };

  export type updateStickerSets = {
    _: 'updateStickerSets',
    flags?: number,
    pFlags: Partial<{
      masks?: true,
      emojis?: true,
    }>
  };

  export type updateSavedGifs = {
    _: 'updateSavedGifs'
  };

  export type updateBotInlineQuery = {
    _: 'updateBotInlineQuery',
    flags?: number,
    query_id: string | number,
    user_id: string | number,
    query: string,
    geo?: GeoPoint,
    peer_type?: InlineQueryPeerType,
    offset: string
  };

  export type updateBotInlineSend = {
    _: 'updateBotInlineSend',
    flags?: number,
    user_id: string | number,
    query: string,
    geo?: GeoPoint,
    id: string,
    msg_id?: InputBotInlineMessageID
  };

  export type updateEditChannelMessage = {
    _: 'updateEditChannelMessage',
    message: Message,
    pts: number,
    pts_count: number
  };

  export type updateBotCallbackQuery = {
    _: 'updateBotCallbackQuery',
    flags?: number,
    query_id: string | number,
    user_id: string | number,
    peer: Peer,
    msg_id: number,
    chat_instance: string | number,
    data?: Uint8Array,
    game_short_name?: string
  };

  export type updateEditMessage = {
    _: 'updateEditMessage',
    message: Message,
    pts: number,
    pts_count: number
  };

  export type updateInlineBotCallbackQuery = {
    _: 'updateInlineBotCallbackQuery',
    flags?: number,
    query_id: string | number,
    user_id: string | number,
    msg_id: InputBotInlineMessageID,
    chat_instance: string | number,
    data?: Uint8Array,
    game_short_name?: string
  };

  export type updateReadChannelOutbox = {
    _: 'updateReadChannelOutbox',
    channel_id: string | number,
    max_id: number
  };

  export type updateDraftMessage = {
    _: 'updateDraftMessage',
    flags?: number,
    peer: Peer,
    top_msg_id?: number,
    draft: DraftMessage,
    local?: boolean,
    threadId?: number
  };

  export type updateReadFeaturedStickers = {
    _: 'updateReadFeaturedStickers'
  };

  export type updateRecentStickers = {
    _: 'updateRecentStickers'
  };

  export type updateConfig = {
    _: 'updateConfig'
  };

  export type updatePtsChanged = {
    _: 'updatePtsChanged'
  };

  export type updateChannelWebPage = {
    _: 'updateChannelWebPage',
    channel_id: string | number,
    webpage: WebPage,
    pts: number,
    pts_count: number
  };

  export type updateDialogPinned = {
    _: 'updateDialogPinned',
    flags?: number,
    pFlags: Partial<{
      pinned?: true,
    }>,
    folder_id?: number,
    peer: DialogPeer
  };

  export type updatePinnedDialogs = {
    _: 'updatePinnedDialogs',
    flags?: number,
    folder_id?: number,
    order?: Array<DialogPeer>
  };

  export type updateBotWebhookJSON = {
    _: 'updateBotWebhookJSON',
    data: DataJSON
  };

  export type updateBotWebhookJSONQuery = {
    _: 'updateBotWebhookJSONQuery',
    query_id: string | number,
    data: DataJSON,
    timeout: number
  };

  export type updateBotShippingQuery = {
    _: 'updateBotShippingQuery',
    query_id: string | number,
    user_id: string | number,
    payload: Uint8Array,
    shipping_address: PostAddress
  };

  export type updateBotPrecheckoutQuery = {
    _: 'updateBotPrecheckoutQuery',
    flags?: number,
    query_id: string | number,
    user_id: string | number,
    payload: Uint8Array,
    info?: PaymentRequestedInfo,
    shipping_option_id?: string,
    currency: string,
    total_amount: string | number
  };

  export type updatePhoneCall = {
    _: 'updatePhoneCall',
    phone_call: PhoneCall
  };

  export type updateLangPackTooLong = {
    _: 'updateLangPackTooLong',
    lang_code: string
  };

  export type updateLangPack = {
    _: 'updateLangPack',
    difference: LangPackDifference
  };

  export type updateFavedStickers = {
    _: 'updateFavedStickers'
  };

  export type updateChannelReadMessagesContents = {
    _: 'updateChannelReadMessagesContents',
    flags?: number,
    channel_id: string | number,
    top_msg_id?: number,
    messages: Array<number>
  };

  export type updateContactsReset = {
    _: 'updateContactsReset'
  };

  export type updateChannelAvailableMessages = {
    _: 'updateChannelAvailableMessages',
    channel_id: string | number,
    available_min_id: number
  };

  export type updateDialogUnreadMark = {
    _: 'updateDialogUnreadMark',
    flags?: number,
    pFlags: Partial<{
      unread?: true,
    }>,
    peer: DialogPeer
  };

  export type updateMessagePoll = {
    _: 'updateMessagePoll',
    flags?: number,
    poll_id: string | number,
    poll?: Poll,
    results: PollResults
  };

  export type updateChatDefaultBannedRights = {
    _: 'updateChatDefaultBannedRights',
    peer: Peer,
    default_banned_rights: ChatBannedRights,
    version: number
  };

  export type updateFolderPeers = {
    _: 'updateFolderPeers',
    folder_peers: Array<FolderPeer>,
    pts: number,
    pts_count: number
  };

  export type updatePeerSettings = {
    _: 'updatePeerSettings',
    peer: Peer,
    settings: PeerSettings
  };

  export type updatePeerLocated = {
    _: 'updatePeerLocated',
    peers: Array<PeerLocated>
  };

  export type updateNewScheduledMessage = {
    _: 'updateNewScheduledMessage',
    message: Message
  };

  export type updateDeleteScheduledMessages = {
    _: 'updateDeleteScheduledMessages',
    peer: Peer,
    messages: Array<number>
  };

  export type updateTheme = {
    _: 'updateTheme',
    theme: Theme
  };

  export type updateGeoLiveViewed = {
    _: 'updateGeoLiveViewed',
    peer: Peer,
    msg_id: number
  };

  export type updateLoginToken = {
    _: 'updateLoginToken'
  };

  export type updateMessagePollVote = {
    _: 'updateMessagePollVote',
    poll_id: string | number,
    user_id: string | number,
    options: Array<Uint8Array>,
    qts: number
  };

  export type updateDialogFilter = {
    _: 'updateDialogFilter',
    flags?: number,
    id: number,
    filter?: DialogFilter
  };

  export type updateDialogFilterOrder = {
    _: 'updateDialogFilterOrder',
    order: Array<number>
  };

  export type updateDialogFilters = {
    _: 'updateDialogFilters'
  };

  export type updatePhoneCallSignalingData = {
    _: 'updatePhoneCallSignalingData',
    phone_call_id: string | number,
    data: Uint8Array
  };

  export type updateChannelMessageForwards = {
    _: 'updateChannelMessageForwards',
    channel_id: string | number,
    id: number,
    forwards: number
  };

  export type updateReadChannelDiscussionInbox = {
    _: 'updateReadChannelDiscussionInbox',
    flags?: number,
    channel_id: string | number,
    top_msg_id: number,
    read_max_id: number,
    broadcast_id?: string | number,
    broadcast_post?: number
  };

  export type updateReadChannelDiscussionOutbox = {
    _: 'updateReadChannelDiscussionOutbox',
    channel_id: string | number,
    top_msg_id: number,
    read_max_id: number
  };

  export type updatePeerBlocked = {
    _: 'updatePeerBlocked',
    peer_id: Peer,
    blocked: boolean
  };

  export type updateChannelUserTyping = {
    _: 'updateChannelUserTyping',
    flags?: number,
    channel_id: string | number,
    top_msg_id?: number,
    from_id: Peer,
    action: SendMessageAction
  };

  export type updatePinnedMessages = {
    _: 'updatePinnedMessages',
    flags?: number,
    pFlags: Partial<{
      pinned?: true,
    }>,
    peer: Peer,
    messages: Array<number>,
    pts: number,
    pts_count: number
  };

  export type updatePinnedChannelMessages = {
    _: 'updatePinnedChannelMessages',
    flags?: number,
    pFlags: Partial<{
      pinned?: true,
    }>,
    channel_id: string | number,
    messages: Array<number>,
    pts: number,
    pts_count: number
  };

  export type updateChat = {
    _: 'updateChat',
    chat_id: string | number
  };

  export type updateGroupCallParticipants = {
    _: 'updateGroupCallParticipants',
    call: InputGroupCall,
    participants: Array<GroupCallParticipant>,
    version: number
  };

  export type updateGroupCall = {
    _: 'updateGroupCall',
    chat_id: string | number,
    call: GroupCall
  };

  export type updatePeerHistoryTTL = {
    _: 'updatePeerHistoryTTL',
    flags?: number,
    peer: Peer,
    ttl_period?: number
  };

  export type updateChatParticipant = {
    _: 'updateChatParticipant',
    flags?: number,
    chat_id: string | number,
    date: number,
    actor_id: string | number,
    user_id: string | number,
    prev_participant?: ChatParticipant,
    new_participant?: ChatParticipant,
    invite?: ExportedChatInvite,
    qts: number
  };

  export type updateChannelParticipant = {
    _: 'updateChannelParticipant',
    flags?: number,
    pFlags: Partial<{
      via_chatlist?: true,
    }>,
    channel_id: string | number,
    date: number,
    actor_id: string | number,
    user_id: string | number,
    prev_participant?: ChannelParticipant,
    new_participant?: ChannelParticipant,
    invite?: ExportedChatInvite,
    qts: number
  };

  export type updateBotStopped = {
    _: 'updateBotStopped',
    user_id: string | number,
    date: number,
    stopped: boolean,
    qts: number
  };

  export type updateGroupCallConnection = {
    _: 'updateGroupCallConnection',
    flags?: number,
    pFlags: Partial<{
      presentation?: true,
    }>,
    params: DataJSON
  };

  export type updateBotCommands = {
    _: 'updateBotCommands',
    peer: Peer,
    bot_id: string | number,
    commands: Array<BotCommand>
  };

  export type updatePendingJoinRequests = {
    _: 'updatePendingJoinRequests',
    peer: Peer,
    requests_pending: number,
    recent_requesters: Array<string | number>
  };

  export type updateBotChatInviteRequester = {
    _: 'updateBotChatInviteRequester',
    peer: Peer,
    date: number,
    user_id: string | number,
    about: string,
    invite: ExportedChatInvite,
    qts: number
  };

  export type updateMessageReactions = {
    _: 'updateMessageReactions',
    flags?: number,
    peer: Peer,
    msg_id: number,
    top_msg_id?: number,
    reactions: MessageReactions,
    pts?: number,
    pts_count?: number,
    local?: boolean
  };

  export type updateAttachMenuBots = {
    _: 'updateAttachMenuBots'
  };

  export type updateWebViewResultSent = {
    _: 'updateWebViewResultSent',
    query_id: string | number
  };

  export type updateBotMenuButton = {
    _: 'updateBotMenuButton',
    bot_id: string | number,
    button: BotMenuButton
  };

  export type updateSavedRingtones = {
    _: 'updateSavedRingtones'
  };

  export type updateTranscribedAudio = {
    _: 'updateTranscribedAudio',
    flags?: number,
    pFlags: Partial<{
      pending?: true,
    }>,
    peer: Peer,
    msg_id: number,
    transcription_id: string | number,
    text: string
  };

  export type updateReadFeaturedEmojiStickers = {
    _: 'updateReadFeaturedEmojiStickers'
  };

  export type updateUserEmojiStatus = {
    _: 'updateUserEmojiStatus',
    user_id: string | number,
    emoji_status: EmojiStatus
  };

  export type updateRecentEmojiStatuses = {
    _: 'updateRecentEmojiStatuses'
  };

  export type updateRecentReactions = {
    _: 'updateRecentReactions'
  };

  export type updateMoveStickerSetToTop = {
    _: 'updateMoveStickerSetToTop',
    flags?: number,
    pFlags: Partial<{
      masks?: true,
      emojis?: true,
    }>,
    stickerset: string | number
  };

  export type updateMessageExtendedMedia = {
    _: 'updateMessageExtendedMedia',
    peer: Peer,
    msg_id: number,
    extended_media: MessageExtendedMedia
  };

  export type updateChannelPinnedTopic = {
    _: 'updateChannelPinnedTopic',
    flags?: number,
    pFlags: Partial<{
      pinned?: true,
    }>,
    channel_id: string | number,
    topic_id: number
  };

  export type updateChannelPinnedTopics = {
    _: 'updateChannelPinnedTopics',
    flags?: number,
    channel_id: string | number,
    order?: Array<number>
  };

  export type updateUser = {
    _: 'updateUser',
    user_id: string | number
  };

  export type updateAutoSaveSettings = {
    _: 'updateAutoSaveSettings'
  };

  export type updateGroupInvitePrivacyForbidden = {
    _: 'updateGroupInvitePrivacyForbidden',
    user_id: string | number
  };

  export type updateNewDiscussionMessage = {
    _: 'updateNewDiscussionMessage',
    message?: Message
  };

  export type updateDeleteDiscussionMessages = {
    _: 'updateDeleteDiscussionMessages',
    messages?: number[],
    channel_id?: ChatId
  };

  export type updateChannelReload = {
    _: 'updateChannelReload',
    channel_id?: ChatId
  };
}

/**
 * @link https://core.telegram.org/type/updates.State
 */
export type UpdatesState = UpdatesState.updatesState;

export namespace UpdatesState {
  export type updatesState = {
    _: 'updates.state',
    pts: number,
    qts: number,
    date: number,
    seq: number,
    unread_count: number
  };
}

/**
 * @link https://core.telegram.org/type/updates.Difference
 */
export type UpdatesDifference = UpdatesDifference.updatesDifferenceEmpty | UpdatesDifference.updatesDifference | UpdatesDifference.updatesDifferenceSlice | UpdatesDifference.updatesDifferenceTooLong;

export namespace UpdatesDifference {
  export type updatesDifferenceEmpty = {
    _: 'updates.differenceEmpty',
    date: number,
    seq: number
  };

  export type updatesDifference = {
    _: 'updates.difference',
    new_messages: Array<Message>,
    new_encrypted_messages: Array<EncryptedMessage>,
    other_updates: Array<Update>,
    chats: Array<Chat>,
    users: Array<User>,
    state: UpdatesState
  };

  export type updatesDifferenceSlice = {
    _: 'updates.differenceSlice',
    new_messages: Array<Message>,
    new_encrypted_messages: Array<EncryptedMessage>,
    other_updates: Array<Update>,
    chats: Array<Chat>,
    users: Array<User>,
    intermediate_state: UpdatesState
  };

  export type updatesDifferenceTooLong = {
    _: 'updates.differenceTooLong',
    pts: number
  };
}

/**
 * @link https://core.telegram.org/type/Updates
 */
export type Updates = Updates.updatesTooLong | Updates.updateShortMessage | Updates.updateShortChatMessage | Updates.updateShort | Updates.updatesCombined | Updates.updates | Updates.updateShortSentMessage;

export namespace Updates {
  export type updatesTooLong = {
    _: 'updatesTooLong'
  };

  export type updateShortMessage = {
    _: 'updateShortMessage',
    flags?: number,
    pFlags: Partial<{
      out?: true,
      mentioned?: true,
      media_unread?: true,
      silent?: true,
    }>,
    id: number,
    user_id: string | number,
    message: string,
    pts: number,
    pts_count: number,
    date: number,
    fwd_from?: MessageFwdHeader,
    via_bot_id?: string | number,
    reply_to?: MessageReplyHeader,
    entities?: Array<MessageEntity>,
    ttl_period?: number
  };

  export type updateShortChatMessage = {
    _: 'updateShortChatMessage',
    flags?: number,
    pFlags: Partial<{
      out?: true,
      mentioned?: true,
      media_unread?: true,
      silent?: true,
    }>,
    id: number,
    from_id: string | number,
    chat_id: string | number,
    message: string,
    pts: number,
    pts_count: number,
    date: number,
    fwd_from?: MessageFwdHeader,
    via_bot_id?: string | number,
    reply_to?: MessageReplyHeader,
    entities?: Array<MessageEntity>,
    ttl_period?: number
  };

  export type updateShort = {
    _: 'updateShort',
    update: Update,
    date: number
  };

  export type updatesCombined = {
    _: 'updatesCombined',
    updates: Array<Update>,
    users: Array<User>,
    chats: Array<Chat>,
    date: number,
    seq_start: number,
    seq: number
  };

  export type updates = {
    _: 'updates',
    updates: Array<Update>,
    users: Array<User>,
    chats: Array<Chat>,
    date: number,
    seq: number
  };

  export type updateShortSentMessage = {
    _: 'updateShortSentMessage',
    flags?: number,
    pFlags: Partial<{
      out?: true,
    }>,
    id: number,
    pts: number,
    pts_count: number,
    date: number,
    media?: MessageMedia,
    entities?: Array<MessageEntity>,
    ttl_period?: number
  };
}

/**
 * @link https://core.telegram.org/type/photos.Photos
 */
export type PhotosPhotos = PhotosPhotos.photosPhotos | PhotosPhotos.photosPhotosSlice;

export namespace PhotosPhotos {
  export type photosPhotos = {
    _: 'photos.photos',
    photos: Array<Photo>,
    users: Array<User>
  };

  export type photosPhotosSlice = {
    _: 'photos.photosSlice',
    count: number,
    photos: Array<Photo>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/photos.Photo
 */
export type PhotosPhoto = PhotosPhoto.photosPhoto;

export namespace PhotosPhoto {
  export type photosPhoto = {
    _: 'photos.photo',
    photo: Photo,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/upload.File
 */
export type UploadFile = UploadFile.uploadFile | UploadFile.uploadFileCdnRedirect;

export namespace UploadFile {
  export type uploadFile = {
    _: 'upload.file',
    type: StorageFileType,
    mtime: number,
    bytes: Uint8Array
  };

  export type uploadFileCdnRedirect = {
    _: 'upload.fileCdnRedirect',
    dc_id: number,
    file_token: Uint8Array,
    encryption_key: Uint8Array,
    encryption_iv: Uint8Array,
    file_hashes: Array<FileHash>
  };
}

/**
 * @link https://core.telegram.org/type/DcOption
 */
export type DcOption = DcOption.dcOption;

export namespace DcOption {
  export type dcOption = {
    _: 'dcOption',
    flags?: number,
    pFlags: Partial<{
      ipv6?: true,
      media_only?: true,
      tcpo_only?: true,
      cdn?: true,
      static?: true,
      this_port_only?: true,
    }>,
    id: number,
    ip_address: string,
    port: number,
    secret?: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/Config
 */
export type Config = Config.config;

export namespace Config {
  export type config = {
    _: 'config',
    flags?: number,
    pFlags: Partial<{
      default_p2p_contacts?: true,
      preload_featured_stickers?: true,
      revoke_pm_inbox?: true,
      blocked_mode?: true,
      force_try_ipv6?: true,
    }>,
    date: number,
    expires: number,
    test_mode: boolean,
    this_dc: number,
    dc_options: Array<DcOption>,
    dc_txt_domain_name: string,
    chat_size_max: number,
    megagroup_size_max: number,
    forwarded_count_max: number,
    online_update_period_ms: number,
    offline_blur_timeout_ms: number,
    offline_idle_timeout_ms: number,
    online_cloud_timeout_ms: number,
    notify_cloud_delay_ms: number,
    notify_default_delay_ms: number,
    push_chat_period_ms: number,
    push_chat_limit: number,
    edit_time_limit: number,
    revoke_time_limit: number,
    revoke_pm_time_limit: number,
    rating_e_decay: number,
    stickers_recent_limit: number,
    channels_read_media_period: number,
    tmp_sessions?: number,
    call_receive_timeout_ms: number,
    call_ring_timeout_ms: number,
    call_connect_timeout_ms: number,
    call_packet_timeout_ms: number,
    me_url_prefix: string,
    autoupdate_url_prefix?: string,
    gif_search_username?: string,
    venue_search_username?: string,
    img_search_username?: string,
    static_maps_provider?: string,
    caption_length_max: number,
    message_length_max: number,
    webfile_dc_id: number,
    suggested_lang_code?: string,
    lang_pack_version?: number,
    base_lang_pack_version?: number,
    reactions_default?: Reaction,
    autologin_token?: string
  };
}

/**
 * @link https://core.telegram.org/type/NearestDc
 */
export type NearestDc = NearestDc.nearestDc;

export namespace NearestDc {
  export type nearestDc = {
    _: 'nearestDc',
    country: string,
    this_dc: number,
    nearest_dc: number
  };
}

/**
 * @link https://core.telegram.org/type/help.AppUpdate
 */
export type HelpAppUpdate = HelpAppUpdate.helpAppUpdate | HelpAppUpdate.helpNoAppUpdate;

export namespace HelpAppUpdate {
  export type helpAppUpdate = {
    _: 'help.appUpdate',
    flags?: number,
    pFlags: Partial<{
      can_not_skip?: true,
    }>,
    id: number,
    version: string,
    text: string,
    entities: Array<MessageEntity>,
    document?: Document,
    url?: string,
    sticker?: Document
  };

  export type helpNoAppUpdate = {
    _: 'help.noAppUpdate'
  };
}

/**
 * @link https://core.telegram.org/type/help.InviteText
 */
export type HelpInviteText = HelpInviteText.helpInviteText;

export namespace HelpInviteText {
  export type helpInviteText = {
    _: 'help.inviteText',
    message: string
  };
}

/**
 * @link https://core.telegram.org/type/EncryptedChat
 */
export type EncryptedChat = EncryptedChat.encryptedChatEmpty | EncryptedChat.encryptedChatWaiting | EncryptedChat.encryptedChatRequested | EncryptedChat.encryptedChat | EncryptedChat.encryptedChatDiscarded;

export namespace EncryptedChat {
  export type encryptedChatEmpty = {
    _: 'encryptedChatEmpty',
    id: number
  };

  export type encryptedChatWaiting = {
    _: 'encryptedChatWaiting',
    id: number,
    access_hash: string | number,
    date: number,
    admin_id: string | number,
    participant_id: string | number
  };

  export type encryptedChatRequested = {
    _: 'encryptedChatRequested',
    flags?: number,
    folder_id?: number,
    id: number,
    access_hash: string | number,
    date: number,
    admin_id: string | number,
    participant_id: string | number,
    g_a: Uint8Array
  };

  export type encryptedChat = {
    _: 'encryptedChat',
    id: number,
    access_hash: string | number,
    date: number,
    admin_id: string | number,
    participant_id: string | number,
    g_a_or_b: Uint8Array,
    key_fingerprint: string | number
  };

  export type encryptedChatDiscarded = {
    _: 'encryptedChatDiscarded',
    flags?: number,
    pFlags: Partial<{
      history_deleted?: true,
    }>,
    id: number
  };
}

/**
 * @link https://core.telegram.org/type/InputEncryptedChat
 */
export type InputEncryptedChat = InputEncryptedChat.inputEncryptedChat;

export namespace InputEncryptedChat {
  export type inputEncryptedChat = {
    _: 'inputEncryptedChat',
    chat_id: number,
    access_hash: string | number
  };
}

/**
 * @link https://core.telegram.org/type/EncryptedFile
 */
export type EncryptedFile = EncryptedFile.encryptedFileEmpty | EncryptedFile.encryptedFile;

export namespace EncryptedFile {
  export type encryptedFileEmpty = {
    _: 'encryptedFileEmpty'
  };

  export type encryptedFile = {
    _: 'encryptedFile',
    id: string | number,
    access_hash: string | number,
    size: string | number,
    dc_id: number,
    key_fingerprint: number
  };
}

/**
 * @link https://core.telegram.org/type/InputEncryptedFile
 */
export type InputEncryptedFile = InputEncryptedFile.inputEncryptedFileEmpty | InputEncryptedFile.inputEncryptedFileUploaded | InputEncryptedFile.inputEncryptedFile | InputEncryptedFile.inputEncryptedFileBigUploaded;

export namespace InputEncryptedFile {
  export type inputEncryptedFileEmpty = {
    _: 'inputEncryptedFileEmpty'
  };

  export type inputEncryptedFileUploaded = {
    _: 'inputEncryptedFileUploaded',
    id: string | number,
    parts: number,
    md5_checksum: string,
    key_fingerprint: number
  };

  export type inputEncryptedFile = {
    _: 'inputEncryptedFile',
    id: string | number,
    access_hash: string | number
  };

  export type inputEncryptedFileBigUploaded = {
    _: 'inputEncryptedFileBigUploaded',
    id: string | number,
    parts: number,
    key_fingerprint: number
  };
}

/**
 * @link https://core.telegram.org/type/EncryptedMessage
 */
export type EncryptedMessage = EncryptedMessage.encryptedMessage | EncryptedMessage.encryptedMessageService;

export namespace EncryptedMessage {
  export type encryptedMessage = {
    _: 'encryptedMessage',
    random_id: string | number,
    chat_id: number,
    date: number,
    bytes: Uint8Array,
    file: EncryptedFile
  };

  export type encryptedMessageService = {
    _: 'encryptedMessageService',
    random_id: string | number,
    chat_id: number,
    date: number,
    bytes: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/messages.DhConfig
 */
export type MessagesDhConfig = MessagesDhConfig.messagesDhConfigNotModified | MessagesDhConfig.messagesDhConfig;

export namespace MessagesDhConfig {
  export type messagesDhConfigNotModified = {
    _: 'messages.dhConfigNotModified',
    random: Uint8Array
  };

  export type messagesDhConfig = {
    _: 'messages.dhConfig',
    g: number,
    p: Uint8Array,
    version: number,
    random: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/messages.SentEncryptedMessage
 */
export type MessagesSentEncryptedMessage = MessagesSentEncryptedMessage.messagesSentEncryptedMessage | MessagesSentEncryptedMessage.messagesSentEncryptedFile;

export namespace MessagesSentEncryptedMessage {
  export type messagesSentEncryptedMessage = {
    _: 'messages.sentEncryptedMessage',
    date: number
  };

  export type messagesSentEncryptedFile = {
    _: 'messages.sentEncryptedFile',
    date: number,
    file: EncryptedFile
  };
}

/**
 * @link https://core.telegram.org/type/InputDocument
 */
export type InputDocument = InputDocument.inputDocumentEmpty | InputDocument.inputDocument;

export namespace InputDocument {
  export type inputDocumentEmpty = {
    _: 'inputDocumentEmpty'
  };

  export type inputDocument = {
    _: 'inputDocument',
    id: string | number,
    access_hash: string | number,
    file_reference: Uint8Array | number[]
  };
}

/**
 * @link https://core.telegram.org/type/Document
 */
export type Document = Document.documentEmpty | Document.document;

export namespace Document {
  export type documentEmpty = {
    _: 'documentEmpty',
    id: string | number
  };

  export type document = {
    _: 'document',
    flags?: number,
    id: string | number,
    access_hash: string | number,
    file_reference: Uint8Array | number[],
    date: number,
    video_thumbs?: Array<VideoSize>,
    dc_id: number,
    attributes: Array<DocumentAttribute>,
    thumbs?: Array<PhotoSize.photoSize | PhotoSize.photoCachedSize | PhotoSize.photoStrippedSize | PhotoSize.photoPathSize>,
    type?: 'gif' | 'sticker' | 'audio' | 'voice' | 'video' | 'round' | 'photo' | 'pdf',
    h?: number,
    w?: number,
    file_name?: string,
    file?: File,
    duration?: number,
    sticker?: 1 | 2 | 3,
    stickerEmojiRaw?: string,
    stickerSetInput?: InputStickerSet.inputStickerSetID,
    pFlags: Partial<{
      stickerThumbConverted?: true,
    }>,
    animated?: boolean,
    supportsStreaming?: boolean,
    size?: number,
    mime_type?: MTMimeType
  };
}

/**
 * @link https://core.telegram.org/type/help.Support
 */
export type HelpSupport = HelpSupport.helpSupport;

export namespace HelpSupport {
  export type helpSupport = {
    _: 'help.support',
    phone_number: string,
    user: User
  };
}

/**
 * @link https://core.telegram.org/type/NotifyPeer
 */
export type NotifyPeer = NotifyPeer.notifyPeer | NotifyPeer.notifyUsers | NotifyPeer.notifyChats | NotifyPeer.notifyBroadcasts | NotifyPeer.notifyForumTopic;

export namespace NotifyPeer {
  export type notifyPeer = {
    _: 'notifyPeer',
    peer: Peer
  };

  export type notifyUsers = {
    _: 'notifyUsers'
  };

  export type notifyChats = {
    _: 'notifyChats'
  };

  export type notifyBroadcasts = {
    _: 'notifyBroadcasts'
  };

  export type notifyForumTopic = {
    _: 'notifyForumTopic',
    peer: Peer,
    top_msg_id: number
  };
}

/**
 * @link https://core.telegram.org/type/SendMessageAction
 */
export type SendMessageAction = SendMessageAction.sendMessageTypingAction | SendMessageAction.sendMessageCancelAction | SendMessageAction.sendMessageRecordVideoAction | SendMessageAction.sendMessageUploadVideoAction | SendMessageAction.sendMessageRecordAudioAction | SendMessageAction.sendMessageUploadAudioAction | SendMessageAction.sendMessageUploadPhotoAction | SendMessageAction.sendMessageUploadDocumentAction | SendMessageAction.sendMessageGeoLocationAction | SendMessageAction.sendMessageChooseContactAction | SendMessageAction.sendMessageGamePlayAction | SendMessageAction.sendMessageRecordRoundAction | SendMessageAction.sendMessageUploadRoundAction | SendMessageAction.speakingInGroupCallAction | SendMessageAction.sendMessageHistoryImportAction | SendMessageAction.sendMessageChooseStickerAction | SendMessageAction.sendMessageEmojiInteraction | SendMessageAction.sendMessageEmojiInteractionSeen;

export namespace SendMessageAction {
  export type sendMessageTypingAction = {
    _: 'sendMessageTypingAction'
  };

  export type sendMessageCancelAction = {
    _: 'sendMessageCancelAction'
  };

  export type sendMessageRecordVideoAction = {
    _: 'sendMessageRecordVideoAction'
  };

  export type sendMessageUploadVideoAction = {
    _: 'sendMessageUploadVideoAction',
    progress: number
  };

  export type sendMessageRecordAudioAction = {
    _: 'sendMessageRecordAudioAction'
  };

  export type sendMessageUploadAudioAction = {
    _: 'sendMessageUploadAudioAction',
    progress: number
  };

  export type sendMessageUploadPhotoAction = {
    _: 'sendMessageUploadPhotoAction',
    progress: number
  };

  export type sendMessageUploadDocumentAction = {
    _: 'sendMessageUploadDocumentAction',
    progress: number
  };

  export type sendMessageGeoLocationAction = {
    _: 'sendMessageGeoLocationAction'
  };

  export type sendMessageChooseContactAction = {
    _: 'sendMessageChooseContactAction'
  };

  export type sendMessageGamePlayAction = {
    _: 'sendMessageGamePlayAction'
  };

  export type sendMessageRecordRoundAction = {
    _: 'sendMessageRecordRoundAction'
  };

  export type sendMessageUploadRoundAction = {
    _: 'sendMessageUploadRoundAction',
    progress: number
  };

  export type speakingInGroupCallAction = {
    _: 'speakingInGroupCallAction'
  };

  export type sendMessageHistoryImportAction = {
    _: 'sendMessageHistoryImportAction',
    progress: number
  };

  export type sendMessageChooseStickerAction = {
    _: 'sendMessageChooseStickerAction'
  };

  export type sendMessageEmojiInteraction = {
    _: 'sendMessageEmojiInteraction',
    emoticon: string,
    msg_id: number,
    interaction: DataJSON
  };

  export type sendMessageEmojiInteractionSeen = {
    _: 'sendMessageEmojiInteractionSeen',
    emoticon: string
  };
}

/**
 * @link https://core.telegram.org/type/contacts.Found
 */
export type ContactsFound = ContactsFound.contactsFound;

export namespace ContactsFound {
  export type contactsFound = {
    _: 'contacts.found',
    my_results: Array<Peer>,
    results: Array<Peer>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/InputPrivacyKey
 */
export type InputPrivacyKey = InputPrivacyKey.inputPrivacyKeyStatusTimestamp | InputPrivacyKey.inputPrivacyKeyChatInvite | InputPrivacyKey.inputPrivacyKeyPhoneCall | InputPrivacyKey.inputPrivacyKeyPhoneP2P | InputPrivacyKey.inputPrivacyKeyForwards | InputPrivacyKey.inputPrivacyKeyProfilePhoto | InputPrivacyKey.inputPrivacyKeyPhoneNumber | InputPrivacyKey.inputPrivacyKeyAddedByPhone | InputPrivacyKey.inputPrivacyKeyVoiceMessages;

export namespace InputPrivacyKey {
  export type inputPrivacyKeyStatusTimestamp = {
    _: 'inputPrivacyKeyStatusTimestamp'
  };

  export type inputPrivacyKeyChatInvite = {
    _: 'inputPrivacyKeyChatInvite'
  };

  export type inputPrivacyKeyPhoneCall = {
    _: 'inputPrivacyKeyPhoneCall'
  };

  export type inputPrivacyKeyPhoneP2P = {
    _: 'inputPrivacyKeyPhoneP2P'
  };

  export type inputPrivacyKeyForwards = {
    _: 'inputPrivacyKeyForwards'
  };

  export type inputPrivacyKeyProfilePhoto = {
    _: 'inputPrivacyKeyProfilePhoto'
  };

  export type inputPrivacyKeyPhoneNumber = {
    _: 'inputPrivacyKeyPhoneNumber'
  };

  export type inputPrivacyKeyAddedByPhone = {
    _: 'inputPrivacyKeyAddedByPhone'
  };

  export type inputPrivacyKeyVoiceMessages = {
    _: 'inputPrivacyKeyVoiceMessages'
  };
}

/**
 * @link https://core.telegram.org/type/PrivacyKey
 */
export type PrivacyKey = PrivacyKey.privacyKeyStatusTimestamp | PrivacyKey.privacyKeyChatInvite | PrivacyKey.privacyKeyPhoneCall | PrivacyKey.privacyKeyPhoneP2P | PrivacyKey.privacyKeyForwards | PrivacyKey.privacyKeyProfilePhoto | PrivacyKey.privacyKeyPhoneNumber | PrivacyKey.privacyKeyAddedByPhone | PrivacyKey.privacyKeyVoiceMessages;

export namespace PrivacyKey {
  export type privacyKeyStatusTimestamp = {
    _: 'privacyKeyStatusTimestamp'
  };

  export type privacyKeyChatInvite = {
    _: 'privacyKeyChatInvite'
  };

  export type privacyKeyPhoneCall = {
    _: 'privacyKeyPhoneCall'
  };

  export type privacyKeyPhoneP2P = {
    _: 'privacyKeyPhoneP2P'
  };

  export type privacyKeyForwards = {
    _: 'privacyKeyForwards'
  };

  export type privacyKeyProfilePhoto = {
    _: 'privacyKeyProfilePhoto'
  };

  export type privacyKeyPhoneNumber = {
    _: 'privacyKeyPhoneNumber'
  };

  export type privacyKeyAddedByPhone = {
    _: 'privacyKeyAddedByPhone'
  };

  export type privacyKeyVoiceMessages = {
    _: 'privacyKeyVoiceMessages'
  };
}

/**
 * @link https://core.telegram.org/type/InputPrivacyRule
 */
export type InputPrivacyRule = InputPrivacyRule.inputPrivacyValueAllowContacts | InputPrivacyRule.inputPrivacyValueAllowAll | InputPrivacyRule.inputPrivacyValueAllowUsers | InputPrivacyRule.inputPrivacyValueDisallowContacts | InputPrivacyRule.inputPrivacyValueDisallowAll | InputPrivacyRule.inputPrivacyValueDisallowUsers | InputPrivacyRule.inputPrivacyValueAllowChatParticipants | InputPrivacyRule.inputPrivacyValueDisallowChatParticipants;

export namespace InputPrivacyRule {
  export type inputPrivacyValueAllowContacts = {
    _: 'inputPrivacyValueAllowContacts'
  };

  export type inputPrivacyValueAllowAll = {
    _: 'inputPrivacyValueAllowAll'
  };

  export type inputPrivacyValueAllowUsers = {
    _: 'inputPrivacyValueAllowUsers',
    users: Array<InputUser>
  };

  export type inputPrivacyValueDisallowContacts = {
    _: 'inputPrivacyValueDisallowContacts'
  };

  export type inputPrivacyValueDisallowAll = {
    _: 'inputPrivacyValueDisallowAll'
  };

  export type inputPrivacyValueDisallowUsers = {
    _: 'inputPrivacyValueDisallowUsers',
    users: Array<InputUser>
  };

  export type inputPrivacyValueAllowChatParticipants = {
    _: 'inputPrivacyValueAllowChatParticipants',
    chats: Array<string | number>
  };

  export type inputPrivacyValueDisallowChatParticipants = {
    _: 'inputPrivacyValueDisallowChatParticipants',
    chats: Array<string | number>
  };
}

/**
 * @link https://core.telegram.org/type/PrivacyRule
 */
export type PrivacyRule = PrivacyRule.privacyValueAllowContacts | PrivacyRule.privacyValueAllowAll | PrivacyRule.privacyValueAllowUsers | PrivacyRule.privacyValueDisallowContacts | PrivacyRule.privacyValueDisallowAll | PrivacyRule.privacyValueDisallowUsers | PrivacyRule.privacyValueAllowChatParticipants | PrivacyRule.privacyValueDisallowChatParticipants;

export namespace PrivacyRule {
  export type privacyValueAllowContacts = {
    _: 'privacyValueAllowContacts'
  };

  export type privacyValueAllowAll = {
    _: 'privacyValueAllowAll'
  };

  export type privacyValueAllowUsers = {
    _: 'privacyValueAllowUsers',
    users: Array<string | number>
  };

  export type privacyValueDisallowContacts = {
    _: 'privacyValueDisallowContacts'
  };

  export type privacyValueDisallowAll = {
    _: 'privacyValueDisallowAll'
  };

  export type privacyValueDisallowUsers = {
    _: 'privacyValueDisallowUsers',
    users: Array<string | number>
  };

  export type privacyValueAllowChatParticipants = {
    _: 'privacyValueAllowChatParticipants',
    chats: Array<string | number>
  };

  export type privacyValueDisallowChatParticipants = {
    _: 'privacyValueDisallowChatParticipants',
    chats: Array<string | number>
  };
}

/**
 * @link https://core.telegram.org/type/account.PrivacyRules
 */
export type AccountPrivacyRules = AccountPrivacyRules.accountPrivacyRules;

export namespace AccountPrivacyRules {
  export type accountPrivacyRules = {
    _: 'account.privacyRules',
    rules: Array<PrivacyRule>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/AccountDaysTTL
 */
export type AccountDaysTTL = AccountDaysTTL.accountDaysTTL;

export namespace AccountDaysTTL {
  export type accountDaysTTL = {
    _: 'accountDaysTTL',
    days: number
  };
}

/**
 * @link https://core.telegram.org/type/DocumentAttribute
 */
export type DocumentAttribute = DocumentAttribute.documentAttributeImageSize | DocumentAttribute.documentAttributeAnimated | DocumentAttribute.documentAttributeSticker | DocumentAttribute.documentAttributeVideo | DocumentAttribute.documentAttributeAudio | DocumentAttribute.documentAttributeFilename | DocumentAttribute.documentAttributeHasStickers | DocumentAttribute.documentAttributeCustomEmoji;

export namespace DocumentAttribute {
  export type documentAttributeImageSize = {
    _: 'documentAttributeImageSize',
    w: number,
    h: number
  };

  export type documentAttributeAnimated = {
    _: 'documentAttributeAnimated'
  };

  export type documentAttributeSticker = {
    _: 'documentAttributeSticker',
    flags?: number,
    pFlags: Partial<{
      mask?: true,
    }>,
    alt: string,
    stickerset: InputStickerSet,
    mask_coords?: MaskCoords
  };

  export type documentAttributeVideo = {
    _: 'documentAttributeVideo',
    flags?: number,
    pFlags: Partial<{
      round_message?: true,
      supports_streaming?: true,
    }>,
    duration: number,
    w: number,
    h: number
  };

  export type documentAttributeAudio = {
    _: 'documentAttributeAudio',
    flags?: number,
    pFlags: Partial<{
      voice?: true,
    }>,
    duration: number,
    title?: string,
    performer?: string,
    waveform?: Uint8Array
  };

  export type documentAttributeFilename = {
    _: 'documentAttributeFilename',
    file_name: string
  };

  export type documentAttributeHasStickers = {
    _: 'documentAttributeHasStickers'
  };

  export type documentAttributeCustomEmoji = {
    _: 'documentAttributeCustomEmoji',
    flags?: number,
    pFlags: Partial<{
      free?: true,
      text_color?: true,
    }>,
    alt: string,
    stickerset: InputStickerSet
  };
}

/**
 * @link https://core.telegram.org/type/messages.Stickers
 */
export type MessagesStickers = MessagesStickers.messagesStickersNotModified | MessagesStickers.messagesStickers;

export namespace MessagesStickers {
  export type messagesStickersNotModified = {
    _: 'messages.stickersNotModified'
  };

  export type messagesStickers = {
    _: 'messages.stickers',
    hash: string | number,
    stickers: Array<Document>
  };
}

/**
 * @link https://core.telegram.org/type/StickerPack
 */
export type StickerPack = StickerPack.stickerPack;

export namespace StickerPack {
  export type stickerPack = {
    _: 'stickerPack',
    emoticon: string,
    documents: Array<string | number>
  };
}

/**
 * @link https://core.telegram.org/type/messages.AllStickers
 */
export type MessagesAllStickers = MessagesAllStickers.messagesAllStickersNotModified | MessagesAllStickers.messagesAllStickers;

export namespace MessagesAllStickers {
  export type messagesAllStickersNotModified = {
    _: 'messages.allStickersNotModified'
  };

  export type messagesAllStickers = {
    _: 'messages.allStickers',
    hash: string | number,
    sets: Array<StickerSet>
  };
}

/**
 * @link https://core.telegram.org/type/messages.AffectedMessages
 */
export type MessagesAffectedMessages = MessagesAffectedMessages.messagesAffectedMessages;

export namespace MessagesAffectedMessages {
  export type messagesAffectedMessages = {
    _: 'messages.affectedMessages',
    pts: number,
    pts_count: number
  };
}

/**
 * @link https://core.telegram.org/type/WebPage
 */
export type WebPage = WebPage.webPageEmpty | WebPage.webPagePending | WebPage.webPage | WebPage.webPageNotModified;

export namespace WebPage {
  export type webPageEmpty = {
    _: 'webPageEmpty',
    id: string | number
  };

  export type webPagePending = {
    _: 'webPagePending',
    id: string | number,
    date: number
  };

  export type webPage = {
    _: 'webPage',
    flags?: number,
    id: string | number,
    url: string,
    display_url: string,
    hash: number,
    type?: string,
    site_name?: string,
    title?: string,
    description?: string,
    photo?: Photo,
    embed_url?: string,
    embed_type?: string,
    embed_width?: number,
    embed_height?: number,
    duration?: number,
    author?: string,
    document?: Document,
    cached_page?: Page,
    attributes?: Array<WebPageAttribute>
  };

  export type webPageNotModified = {
    _: 'webPageNotModified',
    flags?: number,
    cached_page_views?: number
  };
}

/**
 * @link https://core.telegram.org/type/Authorization
 */
export type Authorization = Authorization.authorization;

export namespace Authorization {
  export type authorization = {
    _: 'authorization',
    flags?: number,
    pFlags: Partial<{
      current?: true,
      official_app?: true,
      password_pending?: true,
      encrypted_requests_disabled?: true,
      call_requests_disabled?: true,
    }>,
    hash: string | number,
    device_model: string,
    platform: string,
    system_version: string,
    api_id: number,
    app_name: string,
    app_version: string,
    date_created: number,
    date_active: number,
    ip: string,
    country: string,
    region: string
  };
}

/**
 * @link https://core.telegram.org/type/account.Authorizations
 */
export type AccountAuthorizations = AccountAuthorizations.accountAuthorizations;

export namespace AccountAuthorizations {
  export type accountAuthorizations = {
    _: 'account.authorizations',
    authorization_ttl_days: number,
    authorizations: Array<Authorization>
  };
}

/**
 * @link https://core.telegram.org/type/account.Password
 */
export type AccountPassword = AccountPassword.accountPassword;

export namespace AccountPassword {
  export type accountPassword = {
    _: 'account.password',
    flags?: number,
    pFlags: Partial<{
      has_recovery?: true,
      has_secure_values?: true,
      has_password?: true,
    }>,
    current_algo?: PasswordKdfAlgo,
    srp_B?: Uint8Array,
    srp_id?: string | number,
    hint?: string,
    email_unconfirmed_pattern?: string,
    new_algo: PasswordKdfAlgo,
    new_secure_algo: SecurePasswordKdfAlgo,
    secure_random: Uint8Array,
    pending_reset_date?: number,
    login_email_pattern?: string
  };
}

/**
 * @link https://core.telegram.org/type/account.PasswordSettings
 */
export type AccountPasswordSettings = AccountPasswordSettings.accountPasswordSettings;

export namespace AccountPasswordSettings {
  export type accountPasswordSettings = {
    _: 'account.passwordSettings',
    flags?: number,
    email?: string,
    secure_settings?: SecureSecretSettings
  };
}

/**
 * @link https://core.telegram.org/type/account.PasswordInputSettings
 */
export type AccountPasswordInputSettings = AccountPasswordInputSettings.accountPasswordInputSettings;

export namespace AccountPasswordInputSettings {
  export type accountPasswordInputSettings = {
    _: 'account.passwordInputSettings',
    flags?: number,
    new_algo?: PasswordKdfAlgo,
    new_password_hash?: Uint8Array,
    hint?: string,
    email?: string,
    new_secure_settings?: SecureSecretSettings
  };
}

/**
 * @link https://core.telegram.org/type/auth.PasswordRecovery
 */
export type AuthPasswordRecovery = AuthPasswordRecovery.authPasswordRecovery;

export namespace AuthPasswordRecovery {
  export type authPasswordRecovery = {
    _: 'auth.passwordRecovery',
    email_pattern: string
  };
}

/**
 * @link https://core.telegram.org/type/ReceivedNotifyMessage
 */
export type ReceivedNotifyMessage = ReceivedNotifyMessage.receivedNotifyMessage;

export namespace ReceivedNotifyMessage {
  export type receivedNotifyMessage = {
    _: 'receivedNotifyMessage',
    id: number,
    flags?: number
  };
}

/**
 * @link https://core.telegram.org/type/ExportedChatInvite
 */
export type ExportedChatInvite = ExportedChatInvite.chatInviteExported | ExportedChatInvite.chatInvitePublicJoinRequests;

export namespace ExportedChatInvite {
  export type chatInviteExported = {
    _: 'chatInviteExported',
    flags?: number,
    pFlags: Partial<{
      revoked?: true,
      permanent?: true,
      request_needed?: true,
    }>,
    link: string,
    admin_id: string | number,
    date: number,
    start_date?: number,
    expire_date?: number,
    usage_limit?: number,
    usage?: number,
    requested?: number,
    title?: string
  };

  export type chatInvitePublicJoinRequests = {
    _: 'chatInvitePublicJoinRequests'
  };
}

/**
 * @link https://core.telegram.org/type/ChatInvite
 */
export type ChatInvite = ChatInvite.chatInviteAlready | ChatInvite.chatInvite | ChatInvite.chatInvitePeek;

export namespace ChatInvite {
  export type chatInviteAlready = {
    _: 'chatInviteAlready',
    chat: Chat
  };

  export type chatInvite = {
    _: 'chatInvite',
    flags?: number,
    pFlags: Partial<{
      channel?: true,
      broadcast?: true,
      public?: true,
      megagroup?: true,
      request_needed?: true,
    }>,
    title: string,
    about?: string,
    photo: Photo,
    participants_count: number,
    participants?: Array<User>
  };

  export type chatInvitePeek = {
    _: 'chatInvitePeek',
    chat: Chat,
    expires: number
  };
}

/**
 * @link https://core.telegram.org/type/InputStickerSet
 */
export type InputStickerSet = InputStickerSet.inputStickerSetEmpty | InputStickerSet.inputStickerSetID | InputStickerSet.inputStickerSetShortName | InputStickerSet.inputStickerSetAnimatedEmoji | InputStickerSet.inputStickerSetDice | InputStickerSet.inputStickerSetAnimatedEmojiAnimations | InputStickerSet.inputStickerSetPremiumGifts | InputStickerSet.inputStickerSetEmojiGenericAnimations | InputStickerSet.inputStickerSetEmojiDefaultStatuses | InputStickerSet.inputStickerSetEmojiDefaultTopicIcons;

export namespace InputStickerSet {
  export type inputStickerSetEmpty = {
    _: 'inputStickerSetEmpty'
  };

  export type inputStickerSetID = {
    _: 'inputStickerSetID',
    id: string | number,
    access_hash: string | number
  };

  export type inputStickerSetShortName = {
    _: 'inputStickerSetShortName',
    short_name: string
  };

  export type inputStickerSetAnimatedEmoji = {
    _: 'inputStickerSetAnimatedEmoji'
  };

  export type inputStickerSetDice = {
    _: 'inputStickerSetDice',
    emoticon: string
  };

  export type inputStickerSetAnimatedEmojiAnimations = {
    _: 'inputStickerSetAnimatedEmojiAnimations'
  };

  export type inputStickerSetPremiumGifts = {
    _: 'inputStickerSetPremiumGifts'
  };

  export type inputStickerSetEmojiGenericAnimations = {
    _: 'inputStickerSetEmojiGenericAnimations'
  };

  export type inputStickerSetEmojiDefaultStatuses = {
    _: 'inputStickerSetEmojiDefaultStatuses'
  };

  export type inputStickerSetEmojiDefaultTopicIcons = {
    _: 'inputStickerSetEmojiDefaultTopicIcons'
  };
}

/**
 * @link https://core.telegram.org/type/StickerSet
 */
export type StickerSet = StickerSet.stickerSet;

export namespace StickerSet {
  export type stickerSet = {
    _: 'stickerSet',
    flags?: number,
    pFlags: Partial<{
      archived?: true,
      official?: true,
      masks?: true,
      animated?: true,
      videos?: true,
      emojis?: true,
    }>,
    installed_date?: number,
    id: string | number,
    access_hash: string | number,
    title: string,
    short_name: string,
    thumbs?: Array<PhotoSize>,
    thumb_dc_id?: number,
    thumb_version?: number,
    thumb_document_id?: string | number,
    count: number,
    hash: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.StickerSet
 */
export type MessagesStickerSet = MessagesStickerSet.messagesStickerSet | MessagesStickerSet.messagesStickerSetNotModified;

export namespace MessagesStickerSet {
  export type messagesStickerSet = {
    _: 'messages.stickerSet',
    set: StickerSet,
    packs: Array<StickerPack>,
    keywords: Array<StickerKeyword>,
    documents: Array<Document>,
    refreshTime?: number
  };

  export type messagesStickerSetNotModified = {
    _: 'messages.stickerSetNotModified'
  };
}

/**
 * @link https://core.telegram.org/type/BotCommand
 */
export type BotCommand = BotCommand.botCommand;

export namespace BotCommand {
  export type botCommand = {
    _: 'botCommand',
    command: string,
    description: string
  };
}

/**
 * @link https://core.telegram.org/type/BotInfo
 */
export type BotInfo = BotInfo.botInfo;

export namespace BotInfo {
  export type botInfo = {
    _: 'botInfo',
    flags?: number,
    user_id?: string | number,
    description?: string,
    description_photo?: Photo,
    description_document?: Document,
    commands?: Array<BotCommand>,
    menu_button?: BotMenuButton
  };
}

/**
 * @link https://core.telegram.org/type/KeyboardButton
 */
export type KeyboardButton = KeyboardButton.keyboardButton | KeyboardButton.keyboardButtonUrl | KeyboardButton.keyboardButtonCallback | KeyboardButton.keyboardButtonRequestPhone | KeyboardButton.keyboardButtonRequestGeoLocation | KeyboardButton.keyboardButtonSwitchInline | KeyboardButton.keyboardButtonGame | KeyboardButton.keyboardButtonBuy | KeyboardButton.keyboardButtonUrlAuth | KeyboardButton.inputKeyboardButtonUrlAuth | KeyboardButton.keyboardButtonRequestPoll | KeyboardButton.inputKeyboardButtonUserProfile | KeyboardButton.keyboardButtonUserProfile | KeyboardButton.keyboardButtonWebView | KeyboardButton.keyboardButtonSimpleWebView | KeyboardButton.keyboardButtonRequestPeer;

export namespace KeyboardButton {
  export type keyboardButton = {
    _: 'keyboardButton',
    text: string
  };

  export type keyboardButtonUrl = {
    _: 'keyboardButtonUrl',
    text: string,
    url: string
  };

  export type keyboardButtonCallback = {
    _: 'keyboardButtonCallback',
    flags?: number,
    pFlags: Partial<{
      requires_password?: true,
    }>,
    text: string,
    data: Uint8Array
  };

  export type keyboardButtonRequestPhone = {
    _: 'keyboardButtonRequestPhone',
    text: string
  };

  export type keyboardButtonRequestGeoLocation = {
    _: 'keyboardButtonRequestGeoLocation',
    text: string
  };

  export type keyboardButtonSwitchInline = {
    _: 'keyboardButtonSwitchInline',
    flags?: number,
    pFlags: Partial<{
      same_peer?: true,
    }>,
    text: string,
    query: string,
    peer_types?: Array<InlineQueryPeerType>
  };

  export type keyboardButtonGame = {
    _: 'keyboardButtonGame',
    text: string
  };

  export type keyboardButtonBuy = {
    _: 'keyboardButtonBuy',
    text: string
  };

  export type keyboardButtonUrlAuth = {
    _: 'keyboardButtonUrlAuth',
    flags?: number,
    text: string,
    fwd_text?: string,
    url: string,
    button_id: number
  };

  export type inputKeyboardButtonUrlAuth = {
    _: 'inputKeyboardButtonUrlAuth',
    flags?: number,
    pFlags: Partial<{
      request_write_access?: true,
    }>,
    text: string,
    fwd_text?: string,
    url: string,
    bot: InputUser
  };

  export type keyboardButtonRequestPoll = {
    _: 'keyboardButtonRequestPoll',
    flags?: number,
    quiz?: boolean,
    text: string
  };

  export type inputKeyboardButtonUserProfile = {
    _: 'inputKeyboardButtonUserProfile',
    text: string,
    user_id: InputUser
  };

  export type keyboardButtonUserProfile = {
    _: 'keyboardButtonUserProfile',
    text: string,
    user_id: string | number
  };

  export type keyboardButtonWebView = {
    _: 'keyboardButtonWebView',
    text: string,
    url: string
  };

  export type keyboardButtonSimpleWebView = {
    _: 'keyboardButtonSimpleWebView',
    text: string,
    url: string
  };

  export type keyboardButtonRequestPeer = {
    _: 'keyboardButtonRequestPeer',
    text: string,
    button_id: number,
    peer_type: RequestPeerType
  };
}

/**
 * @link https://core.telegram.org/type/KeyboardButtonRow
 */
export type KeyboardButtonRow = KeyboardButtonRow.keyboardButtonRow;

export namespace KeyboardButtonRow {
  export type keyboardButtonRow = {
    _: 'keyboardButtonRow',
    buttons: Array<KeyboardButton>
  };
}

/**
 * @link https://core.telegram.org/type/ReplyMarkup
 */
export type ReplyMarkup = ReplyMarkup.replyKeyboardHide | ReplyMarkup.replyKeyboardForceReply | ReplyMarkup.replyKeyboardMarkup | ReplyMarkup.replyInlineMarkup;

export namespace ReplyMarkup {
  export type replyKeyboardHide = {
    _: 'replyKeyboardHide',
    flags?: number,
    pFlags: Partial<{
      selective?: true,
    }>,
    mid?: number
  };

  export type replyKeyboardForceReply = {
    _: 'replyKeyboardForceReply',
    flags?: number,
    pFlags: Partial<{
      single_use?: true,
      selective?: true,
      hidden?: true,
      used?: true,
    }>,
    placeholder?: string,
    mid?: number,
    fromId?: PeerId
  };

  export type replyKeyboardMarkup = {
    _: 'replyKeyboardMarkup',
    flags?: number,
    pFlags: Partial<{
      resize?: true,
      single_use?: true,
      selective?: true,
      persistent?: true,
      hidden?: true,
    }>,
    rows: Array<KeyboardButtonRow>,
    placeholder?: string,
    mid?: number,
    fromId?: PeerId
  };

  export type replyInlineMarkup = {
    _: 'replyInlineMarkup',
    rows: Array<KeyboardButtonRow>
  };
}

/**
 * @link https://core.telegram.org/type/MessageEntity
 */
export type MessageEntity = MessageEntity.messageEntityUnknown | MessageEntity.messageEntityMention | MessageEntity.messageEntityHashtag | MessageEntity.messageEntityBotCommand | MessageEntity.messageEntityUrl | MessageEntity.messageEntityEmail | MessageEntity.messageEntityBold | MessageEntity.messageEntityItalic | MessageEntity.messageEntityCode | MessageEntity.messageEntityPre | MessageEntity.messageEntityTextUrl | MessageEntity.messageEntityMentionName | MessageEntity.inputMessageEntityMentionName | MessageEntity.messageEntityPhone | MessageEntity.messageEntityCashtag | MessageEntity.messageEntityUnderline | MessageEntity.messageEntityStrike | MessageEntity.messageEntityBlockquote | MessageEntity.messageEntityBankCard | MessageEntity.messageEntitySpoiler | MessageEntity.messageEntityCustomEmoji | MessageEntity.messageEntityEmoji | MessageEntity.messageEntityHighlight | MessageEntity.messageEntityLinebreak | MessageEntity.messageEntityCaret | MessageEntity.messageEntityTimestamp;

export namespace MessageEntity {
  export type messageEntityUnknown = {
    _: 'messageEntityUnknown',
    offset: number,
    length: number
  };

  export type messageEntityMention = {
    _: 'messageEntityMention',
    offset: number,
    length: number
  };

  export type messageEntityHashtag = {
    _: 'messageEntityHashtag',
    offset: number,
    length: number
  };

  export type messageEntityBotCommand = {
    _: 'messageEntityBotCommand',
    offset: number,
    length: number,
    unsafe?: boolean
  };

  export type messageEntityUrl = {
    _: 'messageEntityUrl',
    offset: number,
    length: number
  };

  export type messageEntityEmail = {
    _: 'messageEntityEmail',
    offset: number,
    length: number
  };

  export type messageEntityBold = {
    _: 'messageEntityBold',
    offset: number,
    length: number
  };

  export type messageEntityItalic = {
    _: 'messageEntityItalic',
    offset: number,
    length: number
  };

  export type messageEntityCode = {
    _: 'messageEntityCode',
    offset: number,
    length: number
  };

  export type messageEntityPre = {
    _: 'messageEntityPre',
    offset: number,
    length: number,
    language: string
  };

  export type messageEntityTextUrl = {
    _: 'messageEntityTextUrl',
    offset: number,
    length: number,
    url: string
  };

  export type messageEntityMentionName = {
    _: 'messageEntityMentionName',
    offset: number,
    length: number,
    user_id: string | number
  };

  export type inputMessageEntityMentionName = {
    _: 'inputMessageEntityMentionName',
    offset: number,
    length: number,
    user_id: InputUser
  };

  export type messageEntityPhone = {
    _: 'messageEntityPhone',
    offset: number,
    length: number
  };

  export type messageEntityCashtag = {
    _: 'messageEntityCashtag',
    offset: number,
    length: number
  };

  export type messageEntityUnderline = {
    _: 'messageEntityUnderline',
    offset: number,
    length: number
  };

  export type messageEntityStrike = {
    _: 'messageEntityStrike',
    offset: number,
    length: number
  };

  export type messageEntityBlockquote = {
    _: 'messageEntityBlockquote',
    offset: number,
    length: number
  };

  export type messageEntityBankCard = {
    _: 'messageEntityBankCard',
    offset: number,
    length: number
  };

  export type messageEntitySpoiler = {
    _: 'messageEntitySpoiler',
    offset: number,
    length: number
  };

  export type messageEntityCustomEmoji = {
    _: 'messageEntityCustomEmoji',
    offset: number,
    length: number,
    document_id: string | number
  };

  export type messageEntityEmoji = {
    _: 'messageEntityEmoji',
    offset?: number,
    length?: number,
    unicode?: string
  };

  export type messageEntityHighlight = {
    _: 'messageEntityHighlight',
    offset?: number,
    length?: number
  };

  export type messageEntityLinebreak = {
    _: 'messageEntityLinebreak',
    offset?: number,
    length?: number
  };

  export type messageEntityCaret = {
    _: 'messageEntityCaret',
    offset?: number,
    length?: number
  };

  export type messageEntityTimestamp = {
    _: 'messageEntityTimestamp',
    offset?: number,
    length?: number,
    time?: number,
    raw?: string
  };
}

/**
 * @link https://core.telegram.org/type/InputChannel
 */
export type InputChannel = InputChannel.inputChannelEmpty | InputChannel.inputChannel | InputChannel.inputChannelFromMessage;

export namespace InputChannel {
  export type inputChannelEmpty = {
    _: 'inputChannelEmpty'
  };

  export type inputChannel = {
    _: 'inputChannel',
    channel_id: string | number,
    access_hash: string | number
  };

  export type inputChannelFromMessage = {
    _: 'inputChannelFromMessage',
    peer: InputPeer,
    msg_id: number,
    channel_id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/contacts.ResolvedPeer
 */
export type ContactsResolvedPeer = ContactsResolvedPeer.contactsResolvedPeer;

export namespace ContactsResolvedPeer {
  export type contactsResolvedPeer = {
    _: 'contacts.resolvedPeer',
    peer: Peer,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/MessageRange
 */
export type MessageRange = MessageRange.messageRange;

export namespace MessageRange {
  export type messageRange = {
    _: 'messageRange',
    min_id: number,
    max_id: number
  };
}

/**
 * @link https://core.telegram.org/type/updates.ChannelDifference
 */
export type UpdatesChannelDifference = UpdatesChannelDifference.updatesChannelDifferenceEmpty | UpdatesChannelDifference.updatesChannelDifferenceTooLong | UpdatesChannelDifference.updatesChannelDifference;

export namespace UpdatesChannelDifference {
  export type updatesChannelDifferenceEmpty = {
    _: 'updates.channelDifferenceEmpty',
    flags?: number,
    pFlags: Partial<{
      final?: true,
    }>,
    pts: number,
    timeout?: number
  };

  export type updatesChannelDifferenceTooLong = {
    _: 'updates.channelDifferenceTooLong',
    flags?: number,
    pFlags: Partial<{
      final?: true,
    }>,
    timeout?: number,
    dialog: Dialog,
    messages: Array<Message>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type updatesChannelDifference = {
    _: 'updates.channelDifference',
    flags?: number,
    pFlags: Partial<{
      final?: true,
    }>,
    pts: number,
    timeout?: number,
    new_messages: Array<Message>,
    other_updates: Array<Update>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/ChannelMessagesFilter
 */
export type ChannelMessagesFilter = ChannelMessagesFilter.channelMessagesFilterEmpty | ChannelMessagesFilter.channelMessagesFilter;

export namespace ChannelMessagesFilter {
  export type channelMessagesFilterEmpty = {
    _: 'channelMessagesFilterEmpty'
  };

  export type channelMessagesFilter = {
    _: 'channelMessagesFilter',
    flags?: number,
    pFlags: Partial<{
      exclude_new_messages?: true,
    }>,
    ranges: Array<MessageRange>
  };
}

/**
 * @link https://core.telegram.org/type/ChannelParticipant
 */
export type ChannelParticipant = ChannelParticipant.channelParticipant | ChannelParticipant.channelParticipantSelf | ChannelParticipant.channelParticipantCreator | ChannelParticipant.channelParticipantAdmin | ChannelParticipant.channelParticipantBanned | ChannelParticipant.channelParticipantLeft;

export namespace ChannelParticipant {
  export type channelParticipant = {
    _: 'channelParticipant',
    user_id: string | number,
    date: number
  };

  export type channelParticipantSelf = {
    _: 'channelParticipantSelf',
    flags?: number,
    pFlags: Partial<{
      via_request?: true,
    }>,
    user_id: string | number,
    inviter_id: string | number,
    date: number
  };

  export type channelParticipantCreator = {
    _: 'channelParticipantCreator',
    flags?: number,
    user_id: string | number,
    admin_rights: ChatAdminRights,
    rank?: string
  };

  export type channelParticipantAdmin = {
    _: 'channelParticipantAdmin',
    flags?: number,
    pFlags: Partial<{
      can_edit?: true,
      self?: true,
    }>,
    user_id: string | number,
    inviter_id?: string | number,
    promoted_by: string | number,
    date: number,
    admin_rights: ChatAdminRights,
    rank?: string
  };

  export type channelParticipantBanned = {
    _: 'channelParticipantBanned',
    flags?: number,
    pFlags: Partial<{
      left?: true,
    }>,
    peer: Peer,
    kicked_by: string | number,
    date: number,
    banned_rights: ChatBannedRights
  };

  export type channelParticipantLeft = {
    _: 'channelParticipantLeft',
    peer: Peer
  };
}

/**
 * @link https://core.telegram.org/type/ChannelParticipantsFilter
 */
export type ChannelParticipantsFilter = ChannelParticipantsFilter.channelParticipantsRecent | ChannelParticipantsFilter.channelParticipantsAdmins | ChannelParticipantsFilter.channelParticipantsKicked | ChannelParticipantsFilter.channelParticipantsBots | ChannelParticipantsFilter.channelParticipantsBanned | ChannelParticipantsFilter.channelParticipantsSearch | ChannelParticipantsFilter.channelParticipantsContacts | ChannelParticipantsFilter.channelParticipantsMentions;

export namespace ChannelParticipantsFilter {
  export type channelParticipantsRecent = {
    _: 'channelParticipantsRecent'
  };

  export type channelParticipantsAdmins = {
    _: 'channelParticipantsAdmins',
    q?: string
  };

  export type channelParticipantsKicked = {
    _: 'channelParticipantsKicked',
    q: string
  };

  export type channelParticipantsBots = {
    _: 'channelParticipantsBots'
  };

  export type channelParticipantsBanned = {
    _: 'channelParticipantsBanned',
    q: string
  };

  export type channelParticipantsSearch = {
    _: 'channelParticipantsSearch',
    q: string
  };

  export type channelParticipantsContacts = {
    _: 'channelParticipantsContacts',
    q: string
  };

  export type channelParticipantsMentions = {
    _: 'channelParticipantsMentions',
    flags?: number,
    q?: string,
    top_msg_id?: number
  };
}

/**
 * @link https://core.telegram.org/type/channels.ChannelParticipants
 */
export type ChannelsChannelParticipants = ChannelsChannelParticipants.channelsChannelParticipants | ChannelsChannelParticipants.channelsChannelParticipantsNotModified;

export namespace ChannelsChannelParticipants {
  export type channelsChannelParticipants = {
    _: 'channels.channelParticipants',
    count: number,
    participants: Array<ChannelParticipant>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type channelsChannelParticipantsNotModified = {
    _: 'channels.channelParticipantsNotModified'
  };
}

/**
 * @link https://core.telegram.org/type/channels.ChannelParticipant
 */
export type ChannelsChannelParticipant = ChannelsChannelParticipant.channelsChannelParticipant;

export namespace ChannelsChannelParticipant {
  export type channelsChannelParticipant = {
    _: 'channels.channelParticipant',
    participant: ChannelParticipant,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/help.TermsOfService
 */
export type HelpTermsOfService = HelpTermsOfService.helpTermsOfService;

export namespace HelpTermsOfService {
  export type helpTermsOfService = {
    _: 'help.termsOfService',
    flags?: number,
    pFlags: Partial<{
      popup?: true,
    }>,
    id: DataJSON,
    text: string,
    entities: Array<MessageEntity>,
    min_age_confirm?: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.SavedGifs
 */
export type MessagesSavedGifs = MessagesSavedGifs.messagesSavedGifsNotModified | MessagesSavedGifs.messagesSavedGifs;

export namespace MessagesSavedGifs {
  export type messagesSavedGifsNotModified = {
    _: 'messages.savedGifsNotModified'
  };

  export type messagesSavedGifs = {
    _: 'messages.savedGifs',
    hash: string | number,
    gifs: Array<Document>
  };
}

/**
 * @link https://core.telegram.org/type/InputBotInlineMessage
 */
export type InputBotInlineMessage = InputBotInlineMessage.inputBotInlineMessageMediaAuto | InputBotInlineMessage.inputBotInlineMessageText | InputBotInlineMessage.inputBotInlineMessageMediaGeo | InputBotInlineMessage.inputBotInlineMessageMediaVenue | InputBotInlineMessage.inputBotInlineMessageMediaContact | InputBotInlineMessage.inputBotInlineMessageGame | InputBotInlineMessage.inputBotInlineMessageMediaInvoice;

export namespace InputBotInlineMessage {
  export type inputBotInlineMessageMediaAuto = {
    _: 'inputBotInlineMessageMediaAuto',
    flags?: number,
    message: string,
    entities?: Array<MessageEntity>,
    reply_markup?: ReplyMarkup
  };

  export type inputBotInlineMessageText = {
    _: 'inputBotInlineMessageText',
    flags?: number,
    pFlags: Partial<{
      no_webpage?: true,
    }>,
    message: string,
    entities?: Array<MessageEntity>,
    reply_markup?: ReplyMarkup
  };

  export type inputBotInlineMessageMediaGeo = {
    _: 'inputBotInlineMessageMediaGeo',
    flags?: number,
    geo_point: InputGeoPoint,
    heading?: number,
    period?: number,
    proximity_notification_radius?: number,
    reply_markup?: ReplyMarkup
  };

  export type inputBotInlineMessageMediaVenue = {
    _: 'inputBotInlineMessageMediaVenue',
    flags?: number,
    geo_point: InputGeoPoint,
    title: string,
    address: string,
    provider: string,
    venue_id: string,
    venue_type: string,
    reply_markup?: ReplyMarkup
  };

  export type inputBotInlineMessageMediaContact = {
    _: 'inputBotInlineMessageMediaContact',
    flags?: number,
    phone_number: string,
    first_name: string,
    last_name: string,
    vcard: string,
    reply_markup?: ReplyMarkup
  };

  export type inputBotInlineMessageGame = {
    _: 'inputBotInlineMessageGame',
    flags?: number,
    reply_markup?: ReplyMarkup
  };

  export type inputBotInlineMessageMediaInvoice = {
    _: 'inputBotInlineMessageMediaInvoice',
    flags?: number,
    title: string,
    description: string,
    photo?: InputWebDocument,
    invoice: Invoice,
    payload: Uint8Array,
    provider: string,
    provider_data: DataJSON,
    reply_markup?: ReplyMarkup
  };
}

/**
 * @link https://core.telegram.org/type/InputBotInlineResult
 */
export type InputBotInlineResult = InputBotInlineResult.inputBotInlineResult | InputBotInlineResult.inputBotInlineResultPhoto | InputBotInlineResult.inputBotInlineResultDocument | InputBotInlineResult.inputBotInlineResultGame;

export namespace InputBotInlineResult {
  export type inputBotInlineResult = {
    _: 'inputBotInlineResult',
    flags?: number,
    id: string,
    type: string,
    title?: string,
    description?: string,
    url?: string,
    thumb?: InputWebDocument,
    content?: InputWebDocument,
    send_message: InputBotInlineMessage
  };

  export type inputBotInlineResultPhoto = {
    _: 'inputBotInlineResultPhoto',
    id: string,
    type: string,
    photo: InputPhoto,
    send_message: InputBotInlineMessage
  };

  export type inputBotInlineResultDocument = {
    _: 'inputBotInlineResultDocument',
    flags?: number,
    id: string,
    type: string,
    title?: string,
    description?: string,
    document: InputDocument,
    send_message: InputBotInlineMessage
  };

  export type inputBotInlineResultGame = {
    _: 'inputBotInlineResultGame',
    id: string,
    short_name: string,
    send_message: InputBotInlineMessage
  };
}

/**
 * @link https://core.telegram.org/type/BotInlineMessage
 */
export type BotInlineMessage = BotInlineMessage.botInlineMessageMediaAuto | BotInlineMessage.botInlineMessageText | BotInlineMessage.botInlineMessageMediaGeo | BotInlineMessage.botInlineMessageMediaVenue | BotInlineMessage.botInlineMessageMediaContact | BotInlineMessage.botInlineMessageMediaInvoice;

export namespace BotInlineMessage {
  export type botInlineMessageMediaAuto = {
    _: 'botInlineMessageMediaAuto',
    flags?: number,
    message: string,
    entities?: Array<MessageEntity>,
    reply_markup?: ReplyMarkup
  };

  export type botInlineMessageText = {
    _: 'botInlineMessageText',
    flags?: number,
    pFlags: Partial<{
      no_webpage?: true,
    }>,
    message: string,
    entities?: Array<MessageEntity>,
    reply_markup?: ReplyMarkup
  };

  export type botInlineMessageMediaGeo = {
    _: 'botInlineMessageMediaGeo',
    flags?: number,
    geo: GeoPoint,
    heading?: number,
    period?: number,
    proximity_notification_radius?: number,
    reply_markup?: ReplyMarkup
  };

  export type botInlineMessageMediaVenue = {
    _: 'botInlineMessageMediaVenue',
    flags?: number,
    geo: GeoPoint,
    title: string,
    address: string,
    provider: string,
    venue_id: string,
    venue_type: string,
    reply_markup?: ReplyMarkup
  };

  export type botInlineMessageMediaContact = {
    _: 'botInlineMessageMediaContact',
    flags?: number,
    phone_number: string,
    first_name: string,
    last_name: string,
    vcard: string,
    reply_markup?: ReplyMarkup
  };

  export type botInlineMessageMediaInvoice = {
    _: 'botInlineMessageMediaInvoice',
    flags?: number,
    pFlags: Partial<{
      shipping_address_requested?: true,
      test?: true,
    }>,
    title: string,
    description: string,
    photo?: WebDocument,
    currency: string,
    total_amount: string | number,
    reply_markup?: ReplyMarkup
  };
}

/**
 * @link https://core.telegram.org/type/BotInlineResult
 */
export type BotInlineResult = BotInlineResult.botInlineResult | BotInlineResult.botInlineMediaResult;

export namespace BotInlineResult {
  export type botInlineResult = {
    _: 'botInlineResult',
    flags?: number,
    id: string,
    type: string,
    title?: string,
    description?: string,
    url?: string,
    thumb?: WebDocument,
    content?: WebDocument,
    send_message: BotInlineMessage
  };

  export type botInlineMediaResult = {
    _: 'botInlineMediaResult',
    flags?: number,
    id: string,
    type: string,
    photo?: Photo,
    document?: Document,
    title?: string,
    description?: string,
    send_message: BotInlineMessage
  };
}

/**
 * @link https://core.telegram.org/type/messages.BotResults
 */
export type MessagesBotResults = MessagesBotResults.messagesBotResults;

export namespace MessagesBotResults {
  export type messagesBotResults = {
    _: 'messages.botResults',
    flags?: number,
    pFlags: Partial<{
      gallery?: true,
    }>,
    query_id: string | number,
    next_offset?: string,
    switch_pm?: InlineBotSwitchPM,
    switch_webview?: InlineBotWebView,
    results: Array<BotInlineResult>,
    cache_time: number,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/ExportedMessageLink
 */
export type ExportedMessageLink = ExportedMessageLink.exportedMessageLink;

export namespace ExportedMessageLink {
  export type exportedMessageLink = {
    _: 'exportedMessageLink',
    link: string,
    html: string
  };
}

/**
 * @link https://core.telegram.org/type/MessageFwdHeader
 */
export type MessageFwdHeader = MessageFwdHeader.messageFwdHeader;

export namespace MessageFwdHeader {
  export type messageFwdHeader = {
    _: 'messageFwdHeader',
    flags?: number,
    pFlags: Partial<{
      imported?: true,
    }>,
    from_id?: Peer,
    from_name?: string,
    date: number,
    channel_post?: number,
    post_author?: string,
    saved_from_peer?: Peer,
    saved_from_msg_id?: number,
    psa_type?: string
  };
}

/**
 * @link https://core.telegram.org/type/auth.CodeType
 */
export type AuthCodeType = AuthCodeType.authCodeTypeSms | AuthCodeType.authCodeTypeCall | AuthCodeType.authCodeTypeFlashCall | AuthCodeType.authCodeTypeMissedCall | AuthCodeType.authCodeTypeFragmentSms;

export namespace AuthCodeType {
  export type authCodeTypeSms = {
    _: 'auth.codeTypeSms'
  };

  export type authCodeTypeCall = {
    _: 'auth.codeTypeCall'
  };

  export type authCodeTypeFlashCall = {
    _: 'auth.codeTypeFlashCall'
  };

  export type authCodeTypeMissedCall = {
    _: 'auth.codeTypeMissedCall'
  };

  export type authCodeTypeFragmentSms = {
    _: 'auth.codeTypeFragmentSms'
  };
}

/**
 * @link https://core.telegram.org/type/auth.SentCodeType
 */
export type AuthSentCodeType = AuthSentCodeType.authSentCodeTypeApp | AuthSentCodeType.authSentCodeTypeSms | AuthSentCodeType.authSentCodeTypeCall | AuthSentCodeType.authSentCodeTypeFlashCall | AuthSentCodeType.authSentCodeTypeMissedCall | AuthSentCodeType.authSentCodeTypeEmailCode | AuthSentCodeType.authSentCodeTypeSetUpEmailRequired | AuthSentCodeType.authSentCodeTypeFragmentSms | AuthSentCodeType.authSentCodeTypeFirebaseSms;

export namespace AuthSentCodeType {
  export type authSentCodeTypeApp = {
    _: 'auth.sentCodeTypeApp',
    length: number
  };

  export type authSentCodeTypeSms = {
    _: 'auth.sentCodeTypeSms',
    length: number
  };

  export type authSentCodeTypeCall = {
    _: 'auth.sentCodeTypeCall',
    length: number
  };

  export type authSentCodeTypeFlashCall = {
    _: 'auth.sentCodeTypeFlashCall',
    pattern: string
  };

  export type authSentCodeTypeMissedCall = {
    _: 'auth.sentCodeTypeMissedCall',
    prefix: string,
    length: number
  };

  export type authSentCodeTypeEmailCode = {
    _: 'auth.sentCodeTypeEmailCode',
    flags?: number,
    pFlags: Partial<{
      apple_signin_allowed?: true,
      google_signin_allowed?: true,
    }>,
    email_pattern: string,
    length: number,
    reset_available_period?: number,
    reset_pending_date?: number
  };

  export type authSentCodeTypeSetUpEmailRequired = {
    _: 'auth.sentCodeTypeSetUpEmailRequired',
    flags?: number,
    pFlags: Partial<{
      apple_signin_allowed?: true,
      google_signin_allowed?: true,
    }>
  };

  export type authSentCodeTypeFragmentSms = {
    _: 'auth.sentCodeTypeFragmentSms',
    url: string,
    length: number
  };

  export type authSentCodeTypeFirebaseSms = {
    _: 'auth.sentCodeTypeFirebaseSms',
    flags?: number,
    nonce?: Uint8Array,
    receipt?: string,
    push_timeout?: number,
    length: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.BotCallbackAnswer
 */
export type MessagesBotCallbackAnswer = MessagesBotCallbackAnswer.messagesBotCallbackAnswer;

export namespace MessagesBotCallbackAnswer {
  export type messagesBotCallbackAnswer = {
    _: 'messages.botCallbackAnswer',
    flags?: number,
    pFlags: Partial<{
      alert?: true,
      has_url?: true,
      native_ui?: true,
    }>,
    message?: string,
    url?: string,
    cache_time: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.MessageEditData
 */
export type MessagesMessageEditData = MessagesMessageEditData.messagesMessageEditData;

export namespace MessagesMessageEditData {
  export type messagesMessageEditData = {
    _: 'messages.messageEditData',
    flags?: number,
    pFlags: Partial<{
      caption?: true,
    }>
  };
}

/**
 * @link https://core.telegram.org/type/InputBotInlineMessageID
 */
export type InputBotInlineMessageID = InputBotInlineMessageID.inputBotInlineMessageID | InputBotInlineMessageID.inputBotInlineMessageID64;

export namespace InputBotInlineMessageID {
  export type inputBotInlineMessageID = {
    _: 'inputBotInlineMessageID',
    dc_id: number,
    id: string | number,
    access_hash: string | number
  };

  export type inputBotInlineMessageID64 = {
    _: 'inputBotInlineMessageID64',
    dc_id: number,
    owner_id: string | number,
    id: number,
    access_hash: string | number
  };
}

/**
 * @link https://core.telegram.org/type/InlineBotSwitchPM
 */
export type InlineBotSwitchPM = InlineBotSwitchPM.inlineBotSwitchPM;

export namespace InlineBotSwitchPM {
  export type inlineBotSwitchPM = {
    _: 'inlineBotSwitchPM',
    text: string,
    start_param: string
  };
}

/**
 * @link https://core.telegram.org/type/messages.PeerDialogs
 */
export type MessagesPeerDialogs = MessagesPeerDialogs.messagesPeerDialogs;

export namespace MessagesPeerDialogs {
  export type messagesPeerDialogs = {
    _: 'messages.peerDialogs',
    dialogs: Array<Dialog>,
    messages: Array<Message>,
    chats: Array<Chat>,
    users: Array<User>,
    state: UpdatesState
  };
}

/**
 * @link https://core.telegram.org/type/TopPeer
 */
export type TopPeer = TopPeer.topPeer;

export namespace TopPeer {
  export type topPeer = {
    _: 'topPeer',
    peer: Peer,
    rating: number
  };
}

/**
 * @link https://core.telegram.org/type/TopPeerCategory
 */
export type TopPeerCategory = TopPeerCategory.topPeerCategoryBotsPM | TopPeerCategory.topPeerCategoryBotsInline | TopPeerCategory.topPeerCategoryCorrespondents | TopPeerCategory.topPeerCategoryGroups | TopPeerCategory.topPeerCategoryChannels | TopPeerCategory.topPeerCategoryPhoneCalls | TopPeerCategory.topPeerCategoryForwardUsers | TopPeerCategory.topPeerCategoryForwardChats;

export namespace TopPeerCategory {
  export type topPeerCategoryBotsPM = {
    _: 'topPeerCategoryBotsPM'
  };

  export type topPeerCategoryBotsInline = {
    _: 'topPeerCategoryBotsInline'
  };

  export type topPeerCategoryCorrespondents = {
    _: 'topPeerCategoryCorrespondents'
  };

  export type topPeerCategoryGroups = {
    _: 'topPeerCategoryGroups'
  };

  export type topPeerCategoryChannels = {
    _: 'topPeerCategoryChannels'
  };

  export type topPeerCategoryPhoneCalls = {
    _: 'topPeerCategoryPhoneCalls'
  };

  export type topPeerCategoryForwardUsers = {
    _: 'topPeerCategoryForwardUsers'
  };

  export type topPeerCategoryForwardChats = {
    _: 'topPeerCategoryForwardChats'
  };
}

/**
 * @link https://core.telegram.org/type/TopPeerCategoryPeers
 */
export type TopPeerCategoryPeers = TopPeerCategoryPeers.topPeerCategoryPeers;

export namespace TopPeerCategoryPeers {
  export type topPeerCategoryPeers = {
    _: 'topPeerCategoryPeers',
    category: TopPeerCategory,
    count: number,
    peers: Array<TopPeer>
  };
}

/**
 * @link https://core.telegram.org/type/contacts.TopPeers
 */
export type ContactsTopPeers = ContactsTopPeers.contactsTopPeersNotModified | ContactsTopPeers.contactsTopPeers | ContactsTopPeers.contactsTopPeersDisabled;

export namespace ContactsTopPeers {
  export type contactsTopPeersNotModified = {
    _: 'contacts.topPeersNotModified'
  };

  export type contactsTopPeers = {
    _: 'contacts.topPeers',
    categories: Array<TopPeerCategoryPeers>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type contactsTopPeersDisabled = {
    _: 'contacts.topPeersDisabled'
  };
}

/**
 * @link https://core.telegram.org/type/DraftMessage
 */
export type DraftMessage = DraftMessage.draftMessageEmpty | DraftMessage.draftMessage;

export namespace DraftMessage {
  export type draftMessageEmpty = {
    _: 'draftMessageEmpty',
    flags?: number,
    date?: number
  };

  export type draftMessage = {
    _: 'draftMessage',
    flags?: number,
    pFlags: Partial<{
      no_webpage?: true,
    }>,
    reply_to_msg_id?: number,
    message: string,
    entities?: Array<MessageEntity>,
    date: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.FeaturedStickers
 */
export type MessagesFeaturedStickers = MessagesFeaturedStickers.messagesFeaturedStickersNotModified | MessagesFeaturedStickers.messagesFeaturedStickers;

export namespace MessagesFeaturedStickers {
  export type messagesFeaturedStickersNotModified = {
    _: 'messages.featuredStickersNotModified',
    count: number
  };

  export type messagesFeaturedStickers = {
    _: 'messages.featuredStickers',
    flags?: number,
    pFlags: Partial<{
      premium?: true,
    }>,
    hash: string | number,
    count: number,
    sets: Array<StickerSetCovered>,
    unread: Array<string | number>
  };
}

/**
 * @link https://core.telegram.org/type/messages.RecentStickers
 */
export type MessagesRecentStickers = MessagesRecentStickers.messagesRecentStickersNotModified | MessagesRecentStickers.messagesRecentStickers;

export namespace MessagesRecentStickers {
  export type messagesRecentStickersNotModified = {
    _: 'messages.recentStickersNotModified'
  };

  export type messagesRecentStickers = {
    _: 'messages.recentStickers',
    hash: string | number,
    packs: Array<StickerPack>,
    stickers: Array<Document>,
    dates: Array<number>
  };
}

/**
 * @link https://core.telegram.org/type/messages.ArchivedStickers
 */
export type MessagesArchivedStickers = MessagesArchivedStickers.messagesArchivedStickers;

export namespace MessagesArchivedStickers {
  export type messagesArchivedStickers = {
    _: 'messages.archivedStickers',
    count: number,
    sets: Array<StickerSetCovered>
  };
}

/**
 * @link https://core.telegram.org/type/messages.StickerSetInstallResult
 */
export type MessagesStickerSetInstallResult = MessagesStickerSetInstallResult.messagesStickerSetInstallResultSuccess | MessagesStickerSetInstallResult.messagesStickerSetInstallResultArchive;

export namespace MessagesStickerSetInstallResult {
  export type messagesStickerSetInstallResultSuccess = {
    _: 'messages.stickerSetInstallResultSuccess'
  };

  export type messagesStickerSetInstallResultArchive = {
    _: 'messages.stickerSetInstallResultArchive',
    sets: Array<StickerSetCovered>
  };
}

/**
 * @link https://core.telegram.org/type/StickerSetCovered
 */
export type StickerSetCovered = StickerSetCovered.stickerSetCovered | StickerSetCovered.stickerSetMultiCovered | StickerSetCovered.stickerSetFullCovered | StickerSetCovered.stickerSetNoCovered;

export namespace StickerSetCovered {
  export type stickerSetCovered = {
    _: 'stickerSetCovered',
    set: StickerSet,
    cover: Document
  };

  export type stickerSetMultiCovered = {
    _: 'stickerSetMultiCovered',
    set: StickerSet,
    covers: Array<Document>
  };

  export type stickerSetFullCovered = {
    _: 'stickerSetFullCovered',
    set: StickerSet,
    packs: Array<StickerPack>,
    keywords: Array<StickerKeyword>,
    documents: Array<Document>
  };

  export type stickerSetNoCovered = {
    _: 'stickerSetNoCovered',
    set: StickerSet
  };
}

/**
 * @link https://core.telegram.org/type/MaskCoords
 */
export type MaskCoords = MaskCoords.maskCoords;

export namespace MaskCoords {
  export type maskCoords = {
    _: 'maskCoords',
    n: number,
    x: number,
    y: number,
    zoom: number
  };
}

/**
 * @link https://core.telegram.org/type/InputStickeredMedia
 */
export type InputStickeredMedia = InputStickeredMedia.inputStickeredMediaPhoto | InputStickeredMedia.inputStickeredMediaDocument;

export namespace InputStickeredMedia {
  export type inputStickeredMediaPhoto = {
    _: 'inputStickeredMediaPhoto',
    id: InputPhoto
  };

  export type inputStickeredMediaDocument = {
    _: 'inputStickeredMediaDocument',
    id: InputDocument
  };
}

/**
 * @link https://core.telegram.org/type/Game
 */
export type Game = Game.game;

export namespace Game {
  export type game = {
    _: 'game',
    flags?: number,
    id: string | number,
    access_hash: string | number,
    short_name: string,
    title: string,
    description: string,
    photo: Photo,
    document?: Document
  };
}

/**
 * @link https://core.telegram.org/type/InputGame
 */
export type InputGame = InputGame.inputGameID | InputGame.inputGameShortName;

export namespace InputGame {
  export type inputGameID = {
    _: 'inputGameID',
    id: string | number,
    access_hash: string | number
  };

  export type inputGameShortName = {
    _: 'inputGameShortName',
    bot_id: InputUser,
    short_name: string
  };
}

/**
 * @link https://core.telegram.org/type/HighScore
 */
export type HighScore = HighScore.highScore;

export namespace HighScore {
  export type highScore = {
    _: 'highScore',
    pos: number,
    user_id: string | number,
    score: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.HighScores
 */
export type MessagesHighScores = MessagesHighScores.messagesHighScores;

export namespace MessagesHighScores {
  export type messagesHighScores = {
    _: 'messages.highScores',
    scores: Array<HighScore>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/RichText
 */
export type RichText = RichText.textEmpty | RichText.textPlain | RichText.textBold | RichText.textItalic | RichText.textUnderline | RichText.textStrike | RichText.textFixed | RichText.textUrl | RichText.textEmail | RichText.textConcat | RichText.textSubscript | RichText.textSuperscript | RichText.textMarked | RichText.textPhone | RichText.textImage | RichText.textAnchor;

export namespace RichText {
  export type textEmpty = {
    _: 'textEmpty'
  };

  export type textPlain = {
    _: 'textPlain',
    text: string
  };

  export type textBold = {
    _: 'textBold',
    text: RichText
  };

  export type textItalic = {
    _: 'textItalic',
    text: RichText
  };

  export type textUnderline = {
    _: 'textUnderline',
    text: RichText
  };

  export type textStrike = {
    _: 'textStrike',
    text: RichText
  };

  export type textFixed = {
    _: 'textFixed',
    text: RichText
  };

  export type textUrl = {
    _: 'textUrl',
    text: RichText,
    url: string,
    webpage_id: string | number
  };

  export type textEmail = {
    _: 'textEmail',
    text: RichText,
    email: string
  };

  export type textConcat = {
    _: 'textConcat',
    texts: Array<RichText>
  };

  export type textSubscript = {
    _: 'textSubscript',
    text: RichText
  };

  export type textSuperscript = {
    _: 'textSuperscript',
    text: RichText
  };

  export type textMarked = {
    _: 'textMarked',
    text: RichText
  };

  export type textPhone = {
    _: 'textPhone',
    text: RichText,
    phone: string
  };

  export type textImage = {
    _: 'textImage',
    document_id: string | number,
    w: number,
    h: number
  };

  export type textAnchor = {
    _: 'textAnchor',
    text: RichText,
    name: string
  };
}

/**
 * @link https://core.telegram.org/type/PageBlock
 */
export type PageBlock = PageBlock.pageBlockUnsupported | PageBlock.pageBlockTitle | PageBlock.pageBlockSubtitle | PageBlock.pageBlockAuthorDate | PageBlock.pageBlockHeader | PageBlock.pageBlockSubheader | PageBlock.pageBlockParagraph | PageBlock.pageBlockPreformatted | PageBlock.pageBlockFooter | PageBlock.pageBlockDivider | PageBlock.pageBlockAnchor | PageBlock.pageBlockList | PageBlock.pageBlockBlockquote | PageBlock.pageBlockPullquote | PageBlock.pageBlockPhoto | PageBlock.pageBlockVideo | PageBlock.pageBlockCover | PageBlock.pageBlockEmbed | PageBlock.pageBlockEmbedPost | PageBlock.pageBlockCollage | PageBlock.pageBlockSlideshow | PageBlock.pageBlockChannel | PageBlock.pageBlockAudio | PageBlock.pageBlockKicker | PageBlock.pageBlockTable | PageBlock.pageBlockOrderedList | PageBlock.pageBlockDetails | PageBlock.pageBlockRelatedArticles | PageBlock.pageBlockMap;

export namespace PageBlock {
  export type pageBlockUnsupported = {
    _: 'pageBlockUnsupported'
  };

  export type pageBlockTitle = {
    _: 'pageBlockTitle',
    text: RichText
  };

  export type pageBlockSubtitle = {
    _: 'pageBlockSubtitle',
    text: RichText
  };

  export type pageBlockAuthorDate = {
    _: 'pageBlockAuthorDate',
    author: RichText,
    published_date: number
  };

  export type pageBlockHeader = {
    _: 'pageBlockHeader',
    text: RichText
  };

  export type pageBlockSubheader = {
    _: 'pageBlockSubheader',
    text: RichText
  };

  export type pageBlockParagraph = {
    _: 'pageBlockParagraph',
    text: RichText
  };

  export type pageBlockPreformatted = {
    _: 'pageBlockPreformatted',
    text: RichText,
    language: string
  };

  export type pageBlockFooter = {
    _: 'pageBlockFooter',
    text: RichText
  };

  export type pageBlockDivider = {
    _: 'pageBlockDivider'
  };

  export type pageBlockAnchor = {
    _: 'pageBlockAnchor',
    name: string
  };

  export type pageBlockList = {
    _: 'pageBlockList',
    items: Array<PageListItem>
  };

  export type pageBlockBlockquote = {
    _: 'pageBlockBlockquote',
    text: RichText,
    caption: RichText
  };

  export type pageBlockPullquote = {
    _: 'pageBlockPullquote',
    text: RichText,
    caption: RichText
  };

  export type pageBlockPhoto = {
    _: 'pageBlockPhoto',
    flags?: number,
    photo_id: string | number,
    caption: PageCaption,
    url?: string,
    webpage_id?: string | number
  };

  export type pageBlockVideo = {
    _: 'pageBlockVideo',
    flags?: number,
    pFlags: Partial<{
      autoplay?: true,
      loop?: true,
    }>,
    video_id: string | number,
    caption: PageCaption
  };

  export type pageBlockCover = {
    _: 'pageBlockCover',
    cover: PageBlock
  };

  export type pageBlockEmbed = {
    _: 'pageBlockEmbed',
    flags?: number,
    pFlags: Partial<{
      full_width?: true,
      allow_scrolling?: true,
    }>,
    url?: string,
    html?: string,
    poster_photo_id?: string | number,
    w?: number,
    h?: number,
    caption: PageCaption
  };

  export type pageBlockEmbedPost = {
    _: 'pageBlockEmbedPost',
    url: string,
    webpage_id: string | number,
    author_photo_id: string | number,
    author: string,
    date: number,
    blocks: Array<PageBlock>,
    caption: PageCaption
  };

  export type pageBlockCollage = {
    _: 'pageBlockCollage',
    items: Array<PageBlock>,
    caption: PageCaption
  };

  export type pageBlockSlideshow = {
    _: 'pageBlockSlideshow',
    items: Array<PageBlock>,
    caption: PageCaption
  };

  export type pageBlockChannel = {
    _: 'pageBlockChannel',
    channel: Chat
  };

  export type pageBlockAudio = {
    _: 'pageBlockAudio',
    audio_id: string | number,
    caption: PageCaption
  };

  export type pageBlockKicker = {
    _: 'pageBlockKicker',
    text: RichText
  };

  export type pageBlockTable = {
    _: 'pageBlockTable',
    flags?: number,
    pFlags: Partial<{
      bordered?: true,
      striped?: true,
    }>,
    title: RichText,
    rows: Array<PageTableRow>
  };

  export type pageBlockOrderedList = {
    _: 'pageBlockOrderedList',
    items: Array<PageListOrderedItem>
  };

  export type pageBlockDetails = {
    _: 'pageBlockDetails',
    flags?: number,
    pFlags: Partial<{
      open?: true,
    }>,
    blocks: Array<PageBlock>,
    title: RichText
  };

  export type pageBlockRelatedArticles = {
    _: 'pageBlockRelatedArticles',
    title: RichText,
    articles: Array<PageRelatedArticle>
  };

  export type pageBlockMap = {
    _: 'pageBlockMap',
    geo: GeoPoint,
    zoom: number,
    w: number,
    h: number,
    caption: PageCaption
  };
}

/**
 * @link https://core.telegram.org/type/PhoneCallDiscardReason
 */
export type PhoneCallDiscardReason = PhoneCallDiscardReason.phoneCallDiscardReasonMissed | PhoneCallDiscardReason.phoneCallDiscardReasonDisconnect | PhoneCallDiscardReason.phoneCallDiscardReasonHangup | PhoneCallDiscardReason.phoneCallDiscardReasonBusy;

export namespace PhoneCallDiscardReason {
  export type phoneCallDiscardReasonMissed = {
    _: 'phoneCallDiscardReasonMissed'
  };

  export type phoneCallDiscardReasonDisconnect = {
    _: 'phoneCallDiscardReasonDisconnect'
  };

  export type phoneCallDiscardReasonHangup = {
    _: 'phoneCallDiscardReasonHangup'
  };

  export type phoneCallDiscardReasonBusy = {
    _: 'phoneCallDiscardReasonBusy'
  };
}

/**
 * @link https://core.telegram.org/type/DataJSON
 */
export type DataJSON = DataJSON.dataJSON;

export namespace DataJSON {
  export type dataJSON = {
    _: 'dataJSON',
    data: string
  };
}

/**
 * @link https://core.telegram.org/type/LabeledPrice
 */
export type LabeledPrice = LabeledPrice.labeledPrice;

export namespace LabeledPrice {
  export type labeledPrice = {
    _: 'labeledPrice',
    label: string,
    amount: string | number
  };
}

/**
 * @link https://core.telegram.org/type/Invoice
 */
export type Invoice = Invoice.invoice;

export namespace Invoice {
  export type invoice = {
    _: 'invoice',
    flags?: number,
    pFlags: Partial<{
      test?: true,
      name_requested?: true,
      phone_requested?: true,
      email_requested?: true,
      shipping_address_requested?: true,
      flexible?: true,
      phone_to_provider?: true,
      email_to_provider?: true,
      recurring?: true,
    }>,
    currency: string,
    prices: Array<LabeledPrice>,
    max_tip_amount?: string | number,
    suggested_tip_amounts?: Array<string | number>,
    recurring_terms_url?: string
  };
}

/**
 * @link https://core.telegram.org/type/PaymentCharge
 */
export type PaymentCharge = PaymentCharge.paymentCharge;

export namespace PaymentCharge {
  export type paymentCharge = {
    _: 'paymentCharge',
    id: string,
    provider_charge_id: string
  };
}

/**
 * @link https://core.telegram.org/type/PostAddress
 */
export type PostAddress = PostAddress.postAddress;

export namespace PostAddress {
  export type postAddress = {
    _: 'postAddress',
    street_line1: string,
    street_line2: string,
    city: string,
    state: string,
    country_iso2: string,
    post_code: string
  };
}

/**
 * @link https://core.telegram.org/type/PaymentRequestedInfo
 */
export type PaymentRequestedInfo = PaymentRequestedInfo.paymentRequestedInfo;

export namespace PaymentRequestedInfo {
  export type paymentRequestedInfo = {
    _: 'paymentRequestedInfo',
    flags?: number,
    name?: string,
    phone?: string,
    email?: string,
    shipping_address?: PostAddress
  };
}

/**
 * @link https://core.telegram.org/type/PaymentSavedCredentials
 */
export type PaymentSavedCredentials = PaymentSavedCredentials.paymentSavedCredentialsCard;

export namespace PaymentSavedCredentials {
  export type paymentSavedCredentialsCard = {
    _: 'paymentSavedCredentialsCard',
    id: string,
    title: string
  };
}

/**
 * @link https://core.telegram.org/type/WebDocument
 */
export type WebDocument = WebDocument.webDocument | WebDocument.webDocumentNoProxy;

export namespace WebDocument {
  export type webDocument = {
    _: 'webDocument',
    url: string,
    access_hash: string | number,
    size: number,
    attributes: Array<DocumentAttribute>,
    h?: number,
    w?: number,
    mime_type?: MTMimeType
  };

  export type webDocumentNoProxy = {
    _: 'webDocumentNoProxy',
    url: string,
    size: number,
    attributes: Array<DocumentAttribute>,
    h?: number,
    w?: number,
    mime_type?: MTMimeType
  };
}

/**
 * @link https://core.telegram.org/type/InputWebDocument
 */
export type InputWebDocument = InputWebDocument.inputWebDocument;

export namespace InputWebDocument {
  export type inputWebDocument = {
    _: 'inputWebDocument',
    url: string,
    size: number,
    mime_type: string,
    attributes: Array<DocumentAttribute>
  };
}

/**
 * @link https://core.telegram.org/type/InputWebFileLocation
 */
export type InputWebFileLocation = InputWebFileLocation.inputWebFileLocation | InputWebFileLocation.inputWebFileGeoPointLocation | InputWebFileLocation.inputWebFileAudioAlbumThumbLocation;

export namespace InputWebFileLocation {
  export type inputWebFileLocation = {
    _: 'inputWebFileLocation',
    url: string,
    access_hash: string | number
  };

  export type inputWebFileGeoPointLocation = {
    _: 'inputWebFileGeoPointLocation',
    geo_point: InputGeoPoint,
    access_hash: string | number,
    w: number,
    h: number,
    zoom: number,
    scale: number
  };

  export type inputWebFileAudioAlbumThumbLocation = {
    _: 'inputWebFileAudioAlbumThumbLocation',
    flags?: number,
    pFlags: Partial<{
      small?: true,
    }>,
    document?: InputDocument,
    title?: string,
    performer?: string
  };
}

/**
 * @link https://core.telegram.org/type/upload.WebFile
 */
export type UploadWebFile = UploadWebFile.uploadWebFile;

export namespace UploadWebFile {
  export type uploadWebFile = {
    _: 'upload.webFile',
    size: number,
    mime_type: string,
    file_type: StorageFileType,
    mtime: number,
    bytes: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/payments.PaymentForm
 */
export type PaymentsPaymentForm = PaymentsPaymentForm.paymentsPaymentForm;

export namespace PaymentsPaymentForm {
  export type paymentsPaymentForm = {
    _: 'payments.paymentForm',
    flags?: number,
    pFlags: Partial<{
      can_save_credentials?: true,
      password_missing?: true,
    }>,
    form_id: string | number,
    bot_id: string | number,
    title: string,
    description: string,
    photo?: WebDocument,
    invoice: Invoice,
    provider_id: string | number,
    url: string,
    native_provider?: string,
    native_params?: DataJSON,
    additional_methods?: Array<PaymentFormMethod>,
    saved_info?: PaymentRequestedInfo,
    saved_credentials?: Array<PaymentSavedCredentials>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/payments.ValidatedRequestedInfo
 */
export type PaymentsValidatedRequestedInfo = PaymentsValidatedRequestedInfo.paymentsValidatedRequestedInfo;

export namespace PaymentsValidatedRequestedInfo {
  export type paymentsValidatedRequestedInfo = {
    _: 'payments.validatedRequestedInfo',
    flags?: number,
    id?: string,
    shipping_options?: Array<ShippingOption>
  };
}

/**
 * @link https://core.telegram.org/type/payments.PaymentResult
 */
export type PaymentsPaymentResult = PaymentsPaymentResult.paymentsPaymentResult | PaymentsPaymentResult.paymentsPaymentVerificationNeeded;

export namespace PaymentsPaymentResult {
  export type paymentsPaymentResult = {
    _: 'payments.paymentResult',
    updates: Updates
  };

  export type paymentsPaymentVerificationNeeded = {
    _: 'payments.paymentVerificationNeeded',
    url: string
  };
}

/**
 * @link https://core.telegram.org/type/payments.PaymentReceipt
 */
export type PaymentsPaymentReceipt = PaymentsPaymentReceipt.paymentsPaymentReceipt;

export namespace PaymentsPaymentReceipt {
  export type paymentsPaymentReceipt = {
    _: 'payments.paymentReceipt',
    flags?: number,
    date: number,
    bot_id: string | number,
    provider_id: string | number,
    title: string,
    description: string,
    photo?: WebDocument,
    invoice: Invoice,
    info?: PaymentRequestedInfo,
    shipping?: ShippingOption,
    tip_amount?: string | number,
    currency: string,
    total_amount: string | number,
    credentials_title: string,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/payments.SavedInfo
 */
export type PaymentsSavedInfo = PaymentsSavedInfo.paymentsSavedInfo;

export namespace PaymentsSavedInfo {
  export type paymentsSavedInfo = {
    _: 'payments.savedInfo',
    flags?: number,
    pFlags: Partial<{
      has_saved_credentials?: true,
    }>,
    saved_info?: PaymentRequestedInfo
  };
}

/**
 * @link https://core.telegram.org/type/InputPaymentCredentials
 */
export type InputPaymentCredentials = InputPaymentCredentials.inputPaymentCredentialsSaved | InputPaymentCredentials.inputPaymentCredentials | InputPaymentCredentials.inputPaymentCredentialsApplePay | InputPaymentCredentials.inputPaymentCredentialsGooglePay;

export namespace InputPaymentCredentials {
  export type inputPaymentCredentialsSaved = {
    _: 'inputPaymentCredentialsSaved',
    id: string,
    tmp_password: Uint8Array
  };

  export type inputPaymentCredentials = {
    _: 'inputPaymentCredentials',
    flags?: number,
    pFlags: Partial<{
      save?: true,
    }>,
    data: DataJSON
  };

  export type inputPaymentCredentialsApplePay = {
    _: 'inputPaymentCredentialsApplePay',
    payment_data: DataJSON
  };

  export type inputPaymentCredentialsGooglePay = {
    _: 'inputPaymentCredentialsGooglePay',
    payment_token: DataJSON
  };
}

/**
 * @link https://core.telegram.org/type/account.TmpPassword
 */
export type AccountTmpPassword = AccountTmpPassword.accountTmpPassword;

export namespace AccountTmpPassword {
  export type accountTmpPassword = {
    _: 'account.tmpPassword',
    tmp_password: Uint8Array,
    valid_until: number
  };
}

/**
 * @link https://core.telegram.org/type/ShippingOption
 */
export type ShippingOption = ShippingOption.shippingOption;

export namespace ShippingOption {
  export type shippingOption = {
    _: 'shippingOption',
    id: string,
    title: string,
    prices: Array<LabeledPrice>
  };
}

/**
 * @link https://core.telegram.org/type/InputStickerSetItem
 */
export type InputStickerSetItem = InputStickerSetItem.inputStickerSetItem;

export namespace InputStickerSetItem {
  export type inputStickerSetItem = {
    _: 'inputStickerSetItem',
    flags?: number,
    document: InputDocument,
    emoji: string,
    mask_coords?: MaskCoords,
    keywords?: string
  };
}

/**
 * @link https://core.telegram.org/type/InputPhoneCall
 */
export type InputPhoneCall = InputPhoneCall.inputPhoneCall;

export namespace InputPhoneCall {
  export type inputPhoneCall = {
    _: 'inputPhoneCall',
    id: string | number,
    access_hash: string | number
  };
}

/**
 * @link https://core.telegram.org/type/PhoneCall
 */
export type PhoneCall = PhoneCall.phoneCallEmpty | PhoneCall.phoneCallWaiting | PhoneCall.phoneCallRequested | PhoneCall.phoneCallAccepted | PhoneCall.phoneCall | PhoneCall.phoneCallDiscarded;

export namespace PhoneCall {
  export type phoneCallEmpty = {
    _: 'phoneCallEmpty',
    id: string | number
  };

  export type phoneCallWaiting = {
    _: 'phoneCallWaiting',
    flags?: number,
    pFlags: Partial<{
      video?: true,
    }>,
    id: string | number,
    access_hash: string | number,
    date: number,
    admin_id: string | number,
    participant_id: string | number,
    protocol: PhoneCallProtocol,
    receive_date?: number
  };

  export type phoneCallRequested = {
    _: 'phoneCallRequested',
    flags?: number,
    pFlags: Partial<{
      video?: true,
    }>,
    id: string | number,
    access_hash: string | number,
    date: number,
    admin_id: string | number,
    participant_id: string | number,
    g_a_hash: Uint8Array,
    protocol: PhoneCallProtocol
  };

  export type phoneCallAccepted = {
    _: 'phoneCallAccepted',
    flags?: number,
    pFlags: Partial<{
      video?: true,
    }>,
    id: string | number,
    access_hash: string | number,
    date: number,
    admin_id: string | number,
    participant_id: string | number,
    g_b: Uint8Array,
    protocol: PhoneCallProtocol
  };

  export type phoneCall = {
    _: 'phoneCall',
    flags?: number,
    pFlags: Partial<{
      p2p_allowed?: true,
      video?: true,
    }>,
    id: string | number,
    access_hash: string | number,
    date: number,
    admin_id: string | number,
    participant_id: string | number,
    g_a_or_b: Uint8Array,
    key_fingerprint: string | number,
    protocol: PhoneCallProtocol,
    connections: Array<PhoneConnection>,
    start_date: number
  };

  export type phoneCallDiscarded = {
    _: 'phoneCallDiscarded',
    flags?: number,
    pFlags: Partial<{
      need_rating?: true,
      need_debug?: true,
      video?: true,
    }>,
    id: string | number,
    reason?: PhoneCallDiscardReason,
    duration?: number
  };
}

/**
 * @link https://core.telegram.org/type/PhoneConnection
 */
export type PhoneConnection = PhoneConnection.phoneConnection | PhoneConnection.phoneConnectionWebrtc;

export namespace PhoneConnection {
  export type phoneConnection = {
    _: 'phoneConnection',
    flags?: number,
    pFlags: Partial<{
      tcp?: true,
    }>,
    id: string | number,
    ip: string,
    ipv6: string,
    port: number,
    peer_tag: Uint8Array
  };

  export type phoneConnectionWebrtc = {
    _: 'phoneConnectionWebrtc',
    flags?: number,
    pFlags: Partial<{
      turn?: true,
      stun?: true,
    }>,
    id: string | number,
    ip: string,
    ipv6: string,
    port: number,
    username: string,
    password: string
  };
}

/**
 * @link https://core.telegram.org/type/PhoneCallProtocol
 */
export type PhoneCallProtocol = PhoneCallProtocol.phoneCallProtocol;

export namespace PhoneCallProtocol {
  export type phoneCallProtocol = {
    _: 'phoneCallProtocol',
    flags?: number,
    pFlags: Partial<{
      udp_p2p?: true,
      udp_reflector?: true,
    }>,
    min_layer: number,
    max_layer: number,
    library_versions: Array<string>
  };
}

/**
 * @link https://core.telegram.org/type/phone.PhoneCall
 */
export type PhonePhoneCall = PhonePhoneCall.phonePhoneCall;

export namespace PhonePhoneCall {
  export type phonePhoneCall = {
    _: 'phone.phoneCall',
    phone_call: PhoneCall,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/upload.CdnFile
 */
export type UploadCdnFile = UploadCdnFile.uploadCdnFileReuploadNeeded | UploadCdnFile.uploadCdnFile;

export namespace UploadCdnFile {
  export type uploadCdnFileReuploadNeeded = {
    _: 'upload.cdnFileReuploadNeeded',
    request_token: Uint8Array
  };

  export type uploadCdnFile = {
    _: 'upload.cdnFile',
    bytes: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/CdnPublicKey
 */
export type CdnPublicKey = CdnPublicKey.cdnPublicKey;

export namespace CdnPublicKey {
  export type cdnPublicKey = {
    _: 'cdnPublicKey',
    dc_id: number,
    public_key: string
  };
}

/**
 * @link https://core.telegram.org/type/CdnConfig
 */
export type CdnConfig = CdnConfig.cdnConfig;

export namespace CdnConfig {
  export type cdnConfig = {
    _: 'cdnConfig',
    public_keys: Array<CdnPublicKey>
  };
}

/**
 * @link https://core.telegram.org/type/LangPackString
 */
export type LangPackString = LangPackString.langPackString | LangPackString.langPackStringPluralized | LangPackString.langPackStringDeleted;

export namespace LangPackString {
  export type langPackString = {
    _: 'langPackString',
    key: string,
    value: string
  };

  export type langPackStringPluralized = {
    _: 'langPackStringPluralized',
    flags?: number,
    key: string,
    zero_value?: string,
    one_value?: string,
    two_value?: string,
    few_value?: string,
    many_value?: string,
    other_value: string
  };

  export type langPackStringDeleted = {
    _: 'langPackStringDeleted',
    key: string
  };
}

/**
 * @link https://core.telegram.org/type/LangPackDifference
 */
export type LangPackDifference = LangPackDifference.langPackDifference;

export namespace LangPackDifference {
  export type langPackDifference = {
    _: 'langPackDifference',
    lang_code: string,
    from_version: number,
    version: number,
    strings: Array<LangPackString>,
    local?: boolean,
    appVersion?: string,
    countries?: HelpCountriesList.helpCountriesList
  };
}

/**
 * @link https://core.telegram.org/type/LangPackLanguage
 */
export type LangPackLanguage = LangPackLanguage.langPackLanguage;

export namespace LangPackLanguage {
  export type langPackLanguage = {
    _: 'langPackLanguage',
    flags?: number,
    pFlags: Partial<{
      official?: true,
      rtl?: true,
      beta?: true,
    }>,
    name: string,
    native_name: string,
    lang_code: string,
    base_lang_code?: string,
    plural_code: string,
    strings_count: number,
    translated_count: number,
    translations_url: string
  };
}

/**
 * @link https://core.telegram.org/type/ChannelAdminLogEventAction
 */
export type ChannelAdminLogEventAction = ChannelAdminLogEventAction.channelAdminLogEventActionChangeTitle | ChannelAdminLogEventAction.channelAdminLogEventActionChangeAbout | ChannelAdminLogEventAction.channelAdminLogEventActionChangeUsername | ChannelAdminLogEventAction.channelAdminLogEventActionChangePhoto | ChannelAdminLogEventAction.channelAdminLogEventActionToggleInvites | ChannelAdminLogEventAction.channelAdminLogEventActionToggleSignatures | ChannelAdminLogEventAction.channelAdminLogEventActionUpdatePinned | ChannelAdminLogEventAction.channelAdminLogEventActionEditMessage | ChannelAdminLogEventAction.channelAdminLogEventActionDeleteMessage | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantJoin | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantLeave | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantInvite | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantToggleBan | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantToggleAdmin | ChannelAdminLogEventAction.channelAdminLogEventActionChangeStickerSet | ChannelAdminLogEventAction.channelAdminLogEventActionTogglePreHistoryHidden | ChannelAdminLogEventAction.channelAdminLogEventActionDefaultBannedRights | ChannelAdminLogEventAction.channelAdminLogEventActionStopPoll | ChannelAdminLogEventAction.channelAdminLogEventActionChangeLinkedChat | ChannelAdminLogEventAction.channelAdminLogEventActionChangeLocation | ChannelAdminLogEventAction.channelAdminLogEventActionToggleSlowMode | ChannelAdminLogEventAction.channelAdminLogEventActionStartGroupCall | ChannelAdminLogEventAction.channelAdminLogEventActionDiscardGroupCall | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantMute | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantUnmute | ChannelAdminLogEventAction.channelAdminLogEventActionToggleGroupCallSetting | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantJoinByInvite | ChannelAdminLogEventAction.channelAdminLogEventActionExportedInviteDelete | ChannelAdminLogEventAction.channelAdminLogEventActionExportedInviteRevoke | ChannelAdminLogEventAction.channelAdminLogEventActionExportedInviteEdit | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantVolume | ChannelAdminLogEventAction.channelAdminLogEventActionChangeHistoryTTL | ChannelAdminLogEventAction.channelAdminLogEventActionParticipantJoinByRequest | ChannelAdminLogEventAction.channelAdminLogEventActionToggleNoForwards | ChannelAdminLogEventAction.channelAdminLogEventActionSendMessage | ChannelAdminLogEventAction.channelAdminLogEventActionChangeAvailableReactions | ChannelAdminLogEventAction.channelAdminLogEventActionChangeUsernames | ChannelAdminLogEventAction.channelAdminLogEventActionToggleForum | ChannelAdminLogEventAction.channelAdminLogEventActionCreateTopic | ChannelAdminLogEventAction.channelAdminLogEventActionEditTopic | ChannelAdminLogEventAction.channelAdminLogEventActionDeleteTopic | ChannelAdminLogEventAction.channelAdminLogEventActionPinTopic | ChannelAdminLogEventAction.channelAdminLogEventActionToggleAntiSpam;

export namespace ChannelAdminLogEventAction {
  export type channelAdminLogEventActionChangeTitle = {
    _: 'channelAdminLogEventActionChangeTitle',
    prev_value: string,
    new_value: string
  };

  export type channelAdminLogEventActionChangeAbout = {
    _: 'channelAdminLogEventActionChangeAbout',
    prev_value: string,
    new_value: string
  };

  export type channelAdminLogEventActionChangeUsername = {
    _: 'channelAdminLogEventActionChangeUsername',
    prev_value: string,
    new_value: string
  };

  export type channelAdminLogEventActionChangePhoto = {
    _: 'channelAdminLogEventActionChangePhoto',
    prev_photo: Photo,
    new_photo: Photo
  };

  export type channelAdminLogEventActionToggleInvites = {
    _: 'channelAdminLogEventActionToggleInvites',
    new_value: boolean
  };

  export type channelAdminLogEventActionToggleSignatures = {
    _: 'channelAdminLogEventActionToggleSignatures',
    new_value: boolean
  };

  export type channelAdminLogEventActionUpdatePinned = {
    _: 'channelAdminLogEventActionUpdatePinned',
    message: Message
  };

  export type channelAdminLogEventActionEditMessage = {
    _: 'channelAdminLogEventActionEditMessage',
    prev_message: Message,
    new_message: Message
  };

  export type channelAdminLogEventActionDeleteMessage = {
    _: 'channelAdminLogEventActionDeleteMessage',
    message: Message
  };

  export type channelAdminLogEventActionParticipantJoin = {
    _: 'channelAdminLogEventActionParticipantJoin'
  };

  export type channelAdminLogEventActionParticipantLeave = {
    _: 'channelAdminLogEventActionParticipantLeave'
  };

  export type channelAdminLogEventActionParticipantInvite = {
    _: 'channelAdminLogEventActionParticipantInvite',
    participant: ChannelParticipant
  };

  export type channelAdminLogEventActionParticipantToggleBan = {
    _: 'channelAdminLogEventActionParticipantToggleBan',
    prev_participant: ChannelParticipant,
    new_participant: ChannelParticipant
  };

  export type channelAdminLogEventActionParticipantToggleAdmin = {
    _: 'channelAdminLogEventActionParticipantToggleAdmin',
    prev_participant: ChannelParticipant,
    new_participant: ChannelParticipant
  };

  export type channelAdminLogEventActionChangeStickerSet = {
    _: 'channelAdminLogEventActionChangeStickerSet',
    prev_stickerset: InputStickerSet,
    new_stickerset: InputStickerSet
  };

  export type channelAdminLogEventActionTogglePreHistoryHidden = {
    _: 'channelAdminLogEventActionTogglePreHistoryHidden',
    new_value: boolean
  };

  export type channelAdminLogEventActionDefaultBannedRights = {
    _: 'channelAdminLogEventActionDefaultBannedRights',
    prev_banned_rights: ChatBannedRights,
    new_banned_rights: ChatBannedRights
  };

  export type channelAdminLogEventActionStopPoll = {
    _: 'channelAdminLogEventActionStopPoll',
    message: Message
  };

  export type channelAdminLogEventActionChangeLinkedChat = {
    _: 'channelAdminLogEventActionChangeLinkedChat',
    prev_value: string | number,
    new_value: string | number
  };

  export type channelAdminLogEventActionChangeLocation = {
    _: 'channelAdminLogEventActionChangeLocation',
    prev_value: ChannelLocation,
    new_value: ChannelLocation
  };

  export type channelAdminLogEventActionToggleSlowMode = {
    _: 'channelAdminLogEventActionToggleSlowMode',
    prev_value: number,
    new_value: number
  };

  export type channelAdminLogEventActionStartGroupCall = {
    _: 'channelAdminLogEventActionStartGroupCall',
    call: InputGroupCall
  };

  export type channelAdminLogEventActionDiscardGroupCall = {
    _: 'channelAdminLogEventActionDiscardGroupCall',
    call: InputGroupCall
  };

  export type channelAdminLogEventActionParticipantMute = {
    _: 'channelAdminLogEventActionParticipantMute',
    participant: GroupCallParticipant
  };

  export type channelAdminLogEventActionParticipantUnmute = {
    _: 'channelAdminLogEventActionParticipantUnmute',
    participant: GroupCallParticipant
  };

  export type channelAdminLogEventActionToggleGroupCallSetting = {
    _: 'channelAdminLogEventActionToggleGroupCallSetting',
    join_muted: boolean
  };

  export type channelAdminLogEventActionParticipantJoinByInvite = {
    _: 'channelAdminLogEventActionParticipantJoinByInvite',
    flags?: number,
    pFlags: Partial<{
      via_chatlist?: true,
    }>,
    invite: ExportedChatInvite
  };

  export type channelAdminLogEventActionExportedInviteDelete = {
    _: 'channelAdminLogEventActionExportedInviteDelete',
    invite: ExportedChatInvite
  };

  export type channelAdminLogEventActionExportedInviteRevoke = {
    _: 'channelAdminLogEventActionExportedInviteRevoke',
    invite: ExportedChatInvite
  };

  export type channelAdminLogEventActionExportedInviteEdit = {
    _: 'channelAdminLogEventActionExportedInviteEdit',
    prev_invite: ExportedChatInvite,
    new_invite: ExportedChatInvite
  };

  export type channelAdminLogEventActionParticipantVolume = {
    _: 'channelAdminLogEventActionParticipantVolume',
    participant: GroupCallParticipant
  };

  export type channelAdminLogEventActionChangeHistoryTTL = {
    _: 'channelAdminLogEventActionChangeHistoryTTL',
    prev_value: number,
    new_value: number
  };

  export type channelAdminLogEventActionParticipantJoinByRequest = {
    _: 'channelAdminLogEventActionParticipantJoinByRequest',
    invite: ExportedChatInvite,
    approved_by: string | number
  };

  export type channelAdminLogEventActionToggleNoForwards = {
    _: 'channelAdminLogEventActionToggleNoForwards',
    new_value: boolean
  };

  export type channelAdminLogEventActionSendMessage = {
    _: 'channelAdminLogEventActionSendMessage',
    message: Message
  };

  export type channelAdminLogEventActionChangeAvailableReactions = {
    _: 'channelAdminLogEventActionChangeAvailableReactions',
    prev_value: ChatReactions,
    new_value: ChatReactions
  };

  export type channelAdminLogEventActionChangeUsernames = {
    _: 'channelAdminLogEventActionChangeUsernames',
    prev_value: Array<string>,
    new_value: Array<string>
  };

  export type channelAdminLogEventActionToggleForum = {
    _: 'channelAdminLogEventActionToggleForum',
    new_value: boolean
  };

  export type channelAdminLogEventActionCreateTopic = {
    _: 'channelAdminLogEventActionCreateTopic',
    topic: ForumTopic
  };

  export type channelAdminLogEventActionEditTopic = {
    _: 'channelAdminLogEventActionEditTopic',
    prev_topic: ForumTopic,
    new_topic: ForumTopic
  };

  export type channelAdminLogEventActionDeleteTopic = {
    _: 'channelAdminLogEventActionDeleteTopic',
    topic: ForumTopic
  };

  export type channelAdminLogEventActionPinTopic = {
    _: 'channelAdminLogEventActionPinTopic',
    flags?: number,
    prev_topic?: ForumTopic,
    new_topic?: ForumTopic
  };

  export type channelAdminLogEventActionToggleAntiSpam = {
    _: 'channelAdminLogEventActionToggleAntiSpam',
    new_value: boolean
  };
}

/**
 * @link https://core.telegram.org/type/ChannelAdminLogEvent
 */
export type ChannelAdminLogEvent = ChannelAdminLogEvent.channelAdminLogEvent;

export namespace ChannelAdminLogEvent {
  export type channelAdminLogEvent = {
    _: 'channelAdminLogEvent',
    id: string | number,
    date: number,
    user_id: string | number,
    action: ChannelAdminLogEventAction
  };
}

/**
 * @link https://core.telegram.org/type/channels.AdminLogResults
 */
export type ChannelsAdminLogResults = ChannelsAdminLogResults.channelsAdminLogResults;

export namespace ChannelsAdminLogResults {
  export type channelsAdminLogResults = {
    _: 'channels.adminLogResults',
    events: Array<ChannelAdminLogEvent>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/ChannelAdminLogEventsFilter
 */
export type ChannelAdminLogEventsFilter = ChannelAdminLogEventsFilter.channelAdminLogEventsFilter;

export namespace ChannelAdminLogEventsFilter {
  export type channelAdminLogEventsFilter = {
    _: 'channelAdminLogEventsFilter',
    flags?: number,
    pFlags: Partial<{
      join?: true,
      leave?: true,
      invite?: true,
      ban?: true,
      unban?: true,
      kick?: true,
      unkick?: true,
      promote?: true,
      demote?: true,
      info?: true,
      settings?: true,
      pinned?: true,
      edit?: true,
      delete?: true,
      group_call?: true,
      invites?: true,
      send?: true,
      forums?: true,
    }>
  };
}

/**
 * @link https://core.telegram.org/type/PopularContact
 */
export type PopularContact = PopularContact.popularContact;

export namespace PopularContact {
  export type popularContact = {
    _: 'popularContact',
    client_id: string | number,
    importers: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.FavedStickers
 */
export type MessagesFavedStickers = MessagesFavedStickers.messagesFavedStickersNotModified | MessagesFavedStickers.messagesFavedStickers;

export namespace MessagesFavedStickers {
  export type messagesFavedStickersNotModified = {
    _: 'messages.favedStickersNotModified'
  };

  export type messagesFavedStickers = {
    _: 'messages.favedStickers',
    hash: string | number,
    packs: Array<StickerPack>,
    stickers: Array<Document>
  };
}

/**
 * @link https://core.telegram.org/type/RecentMeUrl
 */
export type RecentMeUrl = RecentMeUrl.recentMeUrlUnknown | RecentMeUrl.recentMeUrlUser | RecentMeUrl.recentMeUrlChat | RecentMeUrl.recentMeUrlChatInvite | RecentMeUrl.recentMeUrlStickerSet;

export namespace RecentMeUrl {
  export type recentMeUrlUnknown = {
    _: 'recentMeUrlUnknown',
    url: string
  };

  export type recentMeUrlUser = {
    _: 'recentMeUrlUser',
    url: string,
    user_id: string | number
  };

  export type recentMeUrlChat = {
    _: 'recentMeUrlChat',
    url: string,
    chat_id: string | number
  };

  export type recentMeUrlChatInvite = {
    _: 'recentMeUrlChatInvite',
    url: string,
    chat_invite: ChatInvite
  };

  export type recentMeUrlStickerSet = {
    _: 'recentMeUrlStickerSet',
    url: string,
    set: StickerSetCovered
  };
}

/**
 * @link https://core.telegram.org/type/help.RecentMeUrls
 */
export type HelpRecentMeUrls = HelpRecentMeUrls.helpRecentMeUrls;

export namespace HelpRecentMeUrls {
  export type helpRecentMeUrls = {
    _: 'help.recentMeUrls',
    urls: Array<RecentMeUrl>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/InputSingleMedia
 */
export type InputSingleMedia = InputSingleMedia.inputSingleMedia;

export namespace InputSingleMedia {
  export type inputSingleMedia = {
    _: 'inputSingleMedia',
    flags?: number,
    media: InputMedia,
    random_id: string | number,
    message: string,
    entities?: Array<MessageEntity>
  };
}

/**
 * @link https://core.telegram.org/type/WebAuthorization
 */
export type WebAuthorization = WebAuthorization.webAuthorization;

export namespace WebAuthorization {
  export type webAuthorization = {
    _: 'webAuthorization',
    hash: string | number,
    bot_id: string | number,
    domain: string,
    browser: string,
    platform: string,
    date_created: number,
    date_active: number,
    ip: string,
    region: string
  };
}

/**
 * @link https://core.telegram.org/type/account.WebAuthorizations
 */
export type AccountWebAuthorizations = AccountWebAuthorizations.accountWebAuthorizations;

export namespace AccountWebAuthorizations {
  export type accountWebAuthorizations = {
    _: 'account.webAuthorizations',
    authorizations: Array<WebAuthorization>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/InputMessage
 */
export type InputMessage = InputMessage.inputMessageID | InputMessage.inputMessageReplyTo | InputMessage.inputMessagePinned | InputMessage.inputMessageCallbackQuery;

export namespace InputMessage {
  export type inputMessageID = {
    _: 'inputMessageID',
    id: number
  };

  export type inputMessageReplyTo = {
    _: 'inputMessageReplyTo',
    id: number
  };

  export type inputMessagePinned = {
    _: 'inputMessagePinned'
  };

  export type inputMessageCallbackQuery = {
    _: 'inputMessageCallbackQuery',
    id: number,
    query_id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/InputDialogPeer
 */
export type InputDialogPeer = InputDialogPeer.inputDialogPeer | InputDialogPeer.inputDialogPeerFolder;

export namespace InputDialogPeer {
  export type inputDialogPeer = {
    _: 'inputDialogPeer',
    peer: InputPeer
  };

  export type inputDialogPeerFolder = {
    _: 'inputDialogPeerFolder',
    folder_id: number
  };
}

/**
 * @link https://core.telegram.org/type/DialogPeer
 */
export type DialogPeer = DialogPeer.dialogPeer | DialogPeer.dialogPeerFolder;

export namespace DialogPeer {
  export type dialogPeer = {
    _: 'dialogPeer',
    peer: Peer
  };

  export type dialogPeerFolder = {
    _: 'dialogPeerFolder',
    folder_id: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.FoundStickerSets
 */
export type MessagesFoundStickerSets = MessagesFoundStickerSets.messagesFoundStickerSetsNotModified | MessagesFoundStickerSets.messagesFoundStickerSets;

export namespace MessagesFoundStickerSets {
  export type messagesFoundStickerSetsNotModified = {
    _: 'messages.foundStickerSetsNotModified'
  };

  export type messagesFoundStickerSets = {
    _: 'messages.foundStickerSets',
    hash: string | number,
    sets: Array<StickerSetCovered>
  };
}

/**
 * @link https://core.telegram.org/type/FileHash
 */
export type FileHash = FileHash.fileHash;

export namespace FileHash {
  export type fileHash = {
    _: 'fileHash',
    offset: string | number,
    limit: number,
    hash: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/InputClientProxy
 */
export type InputClientProxy = InputClientProxy.inputClientProxy;

export namespace InputClientProxy {
  export type inputClientProxy = {
    _: 'inputClientProxy',
    address: string,
    port: number
  };
}

/**
 * @link https://core.telegram.org/type/help.TermsOfServiceUpdate
 */
export type HelpTermsOfServiceUpdate = HelpTermsOfServiceUpdate.helpTermsOfServiceUpdateEmpty | HelpTermsOfServiceUpdate.helpTermsOfServiceUpdate;

export namespace HelpTermsOfServiceUpdate {
  export type helpTermsOfServiceUpdateEmpty = {
    _: 'help.termsOfServiceUpdateEmpty',
    expires: number
  };

  export type helpTermsOfServiceUpdate = {
    _: 'help.termsOfServiceUpdate',
    expires: number,
    terms_of_service: HelpTermsOfService
  };
}

/**
 * @link https://core.telegram.org/type/InputSecureFile
 */
export type InputSecureFile = InputSecureFile.inputSecureFileUploaded | InputSecureFile.inputSecureFile;

export namespace InputSecureFile {
  export type inputSecureFileUploaded = {
    _: 'inputSecureFileUploaded',
    id: string | number,
    parts: number,
    md5_checksum: string,
    file_hash: Uint8Array,
    secret: Uint8Array
  };

  export type inputSecureFile = {
    _: 'inputSecureFile',
    id: string | number,
    access_hash: string | number
  };
}

/**
 * @link https://core.telegram.org/type/SecureFile
 */
export type SecureFile = SecureFile.secureFileEmpty | SecureFile.secureFile;

export namespace SecureFile {
  export type secureFileEmpty = {
    _: 'secureFileEmpty'
  };

  export type secureFile = {
    _: 'secureFile',
    id: string | number,
    access_hash: string | number,
    size: string | number,
    dc_id: number,
    date: number,
    file_hash: Uint8Array,
    secret: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/SecureData
 */
export type SecureData = SecureData.secureData;

export namespace SecureData {
  export type secureData = {
    _: 'secureData',
    data: Uint8Array,
    data_hash: Uint8Array,
    secret: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/SecurePlainData
 */
export type SecurePlainData = SecurePlainData.securePlainPhone | SecurePlainData.securePlainEmail;

export namespace SecurePlainData {
  export type securePlainPhone = {
    _: 'securePlainPhone',
    phone: string
  };

  export type securePlainEmail = {
    _: 'securePlainEmail',
    email: string
  };
}

/**
 * @link https://core.telegram.org/type/SecureValueType
 */
export type SecureValueType = SecureValueType.secureValueTypePersonalDetails | SecureValueType.secureValueTypePassport | SecureValueType.secureValueTypeDriverLicense | SecureValueType.secureValueTypeIdentityCard | SecureValueType.secureValueTypeInternalPassport | SecureValueType.secureValueTypeAddress | SecureValueType.secureValueTypeUtilityBill | SecureValueType.secureValueTypeBankStatement | SecureValueType.secureValueTypeRentalAgreement | SecureValueType.secureValueTypePassportRegistration | SecureValueType.secureValueTypeTemporaryRegistration | SecureValueType.secureValueTypePhone | SecureValueType.secureValueTypeEmail;

export namespace SecureValueType {
  export type secureValueTypePersonalDetails = {
    _: 'secureValueTypePersonalDetails'
  };

  export type secureValueTypePassport = {
    _: 'secureValueTypePassport'
  };

  export type secureValueTypeDriverLicense = {
    _: 'secureValueTypeDriverLicense'
  };

  export type secureValueTypeIdentityCard = {
    _: 'secureValueTypeIdentityCard'
  };

  export type secureValueTypeInternalPassport = {
    _: 'secureValueTypeInternalPassport'
  };

  export type secureValueTypeAddress = {
    _: 'secureValueTypeAddress'
  };

  export type secureValueTypeUtilityBill = {
    _: 'secureValueTypeUtilityBill'
  };

  export type secureValueTypeBankStatement = {
    _: 'secureValueTypeBankStatement'
  };

  export type secureValueTypeRentalAgreement = {
    _: 'secureValueTypeRentalAgreement'
  };

  export type secureValueTypePassportRegistration = {
    _: 'secureValueTypePassportRegistration'
  };

  export type secureValueTypeTemporaryRegistration = {
    _: 'secureValueTypeTemporaryRegistration'
  };

  export type secureValueTypePhone = {
    _: 'secureValueTypePhone'
  };

  export type secureValueTypeEmail = {
    _: 'secureValueTypeEmail'
  };
}

/**
 * @link https://core.telegram.org/type/SecureValue
 */
export type SecureValue = SecureValue.secureValue;

export namespace SecureValue {
  export type secureValue = {
    _: 'secureValue',
    flags?: number,
    type: SecureValueType,
    data?: SecureData,
    front_side?: SecureFile,
    reverse_side?: SecureFile,
    selfie?: SecureFile,
    translation?: Array<SecureFile>,
    files?: Array<SecureFile>,
    plain_data?: SecurePlainData,
    hash: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/InputSecureValue
 */
export type InputSecureValue = InputSecureValue.inputSecureValue;

export namespace InputSecureValue {
  export type inputSecureValue = {
    _: 'inputSecureValue',
    flags?: number,
    type: SecureValueType,
    data?: SecureData,
    front_side?: InputSecureFile,
    reverse_side?: InputSecureFile,
    selfie?: InputSecureFile,
    translation?: Array<InputSecureFile>,
    files?: Array<InputSecureFile>,
    plain_data?: SecurePlainData
  };
}

/**
 * @link https://core.telegram.org/type/SecureValueHash
 */
export type SecureValueHash = SecureValueHash.secureValueHash;

export namespace SecureValueHash {
  export type secureValueHash = {
    _: 'secureValueHash',
    type: SecureValueType,
    hash: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/SecureValueError
 */
export type SecureValueError = SecureValueError.secureValueErrorData | SecureValueError.secureValueErrorFrontSide | SecureValueError.secureValueErrorReverseSide | SecureValueError.secureValueErrorSelfie | SecureValueError.secureValueErrorFile | SecureValueError.secureValueErrorFiles | SecureValueError.secureValueError | SecureValueError.secureValueErrorTranslationFile | SecureValueError.secureValueErrorTranslationFiles;

export namespace SecureValueError {
  export type secureValueErrorData = {
    _: 'secureValueErrorData',
    type: SecureValueType,
    data_hash: Uint8Array,
    field: string,
    text: string
  };

  export type secureValueErrorFrontSide = {
    _: 'secureValueErrorFrontSide',
    type: SecureValueType,
    file_hash: Uint8Array,
    text: string
  };

  export type secureValueErrorReverseSide = {
    _: 'secureValueErrorReverseSide',
    type: SecureValueType,
    file_hash: Uint8Array,
    text: string
  };

  export type secureValueErrorSelfie = {
    _: 'secureValueErrorSelfie',
    type: SecureValueType,
    file_hash: Uint8Array,
    text: string
  };

  export type secureValueErrorFile = {
    _: 'secureValueErrorFile',
    type: SecureValueType,
    file_hash: Uint8Array,
    text: string
  };

  export type secureValueErrorFiles = {
    _: 'secureValueErrorFiles',
    type: SecureValueType,
    file_hash: Array<Uint8Array>,
    text: string
  };

  export type secureValueError = {
    _: 'secureValueError',
    type: SecureValueType,
    hash: Uint8Array,
    text: string
  };

  export type secureValueErrorTranslationFile = {
    _: 'secureValueErrorTranslationFile',
    type: SecureValueType,
    file_hash: Uint8Array,
    text: string
  };

  export type secureValueErrorTranslationFiles = {
    _: 'secureValueErrorTranslationFiles',
    type: SecureValueType,
    file_hash: Array<Uint8Array>,
    text: string
  };
}

/**
 * @link https://core.telegram.org/type/SecureCredentialsEncrypted
 */
export type SecureCredentialsEncrypted = SecureCredentialsEncrypted.secureCredentialsEncrypted;

export namespace SecureCredentialsEncrypted {
  export type secureCredentialsEncrypted = {
    _: 'secureCredentialsEncrypted',
    data: Uint8Array,
    hash: Uint8Array,
    secret: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/account.AuthorizationForm
 */
export type AccountAuthorizationForm = AccountAuthorizationForm.accountAuthorizationForm;

export namespace AccountAuthorizationForm {
  export type accountAuthorizationForm = {
    _: 'account.authorizationForm',
    flags?: number,
    required_types: Array<SecureRequiredType>,
    values: Array<SecureValue>,
    errors: Array<SecureValueError>,
    users: Array<User>,
    privacy_policy_url?: string
  };
}

/**
 * @link https://core.telegram.org/type/account.SentEmailCode
 */
export type AccountSentEmailCode = AccountSentEmailCode.accountSentEmailCode;

export namespace AccountSentEmailCode {
  export type accountSentEmailCode = {
    _: 'account.sentEmailCode',
    email_pattern: string,
    length: number
  };
}

/**
 * @link https://core.telegram.org/type/help.DeepLinkInfo
 */
export type HelpDeepLinkInfo = HelpDeepLinkInfo.helpDeepLinkInfoEmpty | HelpDeepLinkInfo.helpDeepLinkInfo;

export namespace HelpDeepLinkInfo {
  export type helpDeepLinkInfoEmpty = {
    _: 'help.deepLinkInfoEmpty'
  };

  export type helpDeepLinkInfo = {
    _: 'help.deepLinkInfo',
    flags?: number,
    pFlags: Partial<{
      update_app?: true,
    }>,
    message: string,
    entities?: Array<MessageEntity>
  };
}

/**
 * @link https://core.telegram.org/type/SavedContact
 */
export type SavedContact = SavedContact.savedPhoneContact;

export namespace SavedContact {
  export type savedPhoneContact = {
    _: 'savedPhoneContact',
    phone: string,
    first_name: string,
    last_name: string,
    date: number
  };
}

/**
 * @link https://core.telegram.org/type/account.Takeout
 */
export type AccountTakeout = AccountTakeout.accountTakeout;

export namespace AccountTakeout {
  export type accountTakeout = {
    _: 'account.takeout',
    id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/PasswordKdfAlgo
 */
export type PasswordKdfAlgo = PasswordKdfAlgo.passwordKdfAlgoUnknown | PasswordKdfAlgo.passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow;

export namespace PasswordKdfAlgo {
  export type passwordKdfAlgoUnknown = {
    _: 'passwordKdfAlgoUnknown'
  };

  export type passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow = {
    _: 'passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow',
    salt1: Uint8Array,
    salt2: Uint8Array,
    g: number,
    p: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/SecurePasswordKdfAlgo
 */
export type SecurePasswordKdfAlgo = SecurePasswordKdfAlgo.securePasswordKdfAlgoUnknown | SecurePasswordKdfAlgo.securePasswordKdfAlgoPBKDF2HMACSHA512iter100000 | SecurePasswordKdfAlgo.securePasswordKdfAlgoSHA512;

export namespace SecurePasswordKdfAlgo {
  export type securePasswordKdfAlgoUnknown = {
    _: 'securePasswordKdfAlgoUnknown'
  };

  export type securePasswordKdfAlgoPBKDF2HMACSHA512iter100000 = {
    _: 'securePasswordKdfAlgoPBKDF2HMACSHA512iter100000',
    salt: Uint8Array
  };

  export type securePasswordKdfAlgoSHA512 = {
    _: 'securePasswordKdfAlgoSHA512',
    salt: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/SecureSecretSettings
 */
export type SecureSecretSettings = SecureSecretSettings.secureSecretSettings;

export namespace SecureSecretSettings {
  export type secureSecretSettings = {
    _: 'secureSecretSettings',
    secure_algo: SecurePasswordKdfAlgo,
    secure_secret: Uint8Array,
    secure_secret_id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/InputCheckPasswordSRP
 */
export type InputCheckPasswordSRP = InputCheckPasswordSRP.inputCheckPasswordEmpty | InputCheckPasswordSRP.inputCheckPasswordSRP;

export namespace InputCheckPasswordSRP {
  export type inputCheckPasswordEmpty = {
    _: 'inputCheckPasswordEmpty'
  };

  export type inputCheckPasswordSRP = {
    _: 'inputCheckPasswordSRP',
    srp_id: string | number,
    A: Uint8Array,
    M1: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/SecureRequiredType
 */
export type SecureRequiredType = SecureRequiredType.secureRequiredType | SecureRequiredType.secureRequiredTypeOneOf;

export namespace SecureRequiredType {
  export type secureRequiredType = {
    _: 'secureRequiredType',
    flags?: number,
    pFlags: Partial<{
      native_names?: true,
      selfie_required?: true,
      translation_required?: true,
    }>,
    type: SecureValueType
  };

  export type secureRequiredTypeOneOf = {
    _: 'secureRequiredTypeOneOf',
    types: Array<SecureRequiredType>
  };
}

/**
 * @link https://core.telegram.org/type/help.PassportConfig
 */
export type HelpPassportConfig = HelpPassportConfig.helpPassportConfigNotModified | HelpPassportConfig.helpPassportConfig;

export namespace HelpPassportConfig {
  export type helpPassportConfigNotModified = {
    _: 'help.passportConfigNotModified'
  };

  export type helpPassportConfig = {
    _: 'help.passportConfig',
    hash: number,
    countries_langs: DataJSON
  };
}

/**
 * @link https://core.telegram.org/type/InputAppEvent
 */
export type InputAppEvent = InputAppEvent.inputAppEvent;

export namespace InputAppEvent {
  export type inputAppEvent = {
    _: 'inputAppEvent',
    time: number,
    type: string,
    peer: string | number,
    data: JSONValue
  };
}

/**
 * @link https://core.telegram.org/type/JSONObjectValue
 */
export type JSONObjectValue = JSONObjectValue.jsonObjectValue;

export namespace JSONObjectValue {
  export type jsonObjectValue = {
    _: 'jsonObjectValue',
    key: string,
    value: JSONValue
  };
}

/**
 * @link https://core.telegram.org/type/JSONValue
 */
export type JSONValue = JSONValue.jsonNull | JSONValue.jsonBool | JSONValue.jsonNumber | JSONValue.jsonString | JSONValue.jsonArray | JSONValue.jsonObject;

export namespace JSONValue {
  export type jsonNull = {
    _: 'jsonNull'
  };

  export type jsonBool = {
    _: 'jsonBool',
    value: boolean
  };

  export type jsonNumber = {
    _: 'jsonNumber',
    value: number
  };

  export type jsonString = {
    _: 'jsonString',
    value: string
  };

  export type jsonArray = {
    _: 'jsonArray',
    value: Array<JSONValue>
  };

  export type jsonObject = {
    _: 'jsonObject',
    value: Array<JSONObjectValue>
  };
}

/**
 * @link https://core.telegram.org/type/PageTableCell
 */
export type PageTableCell = PageTableCell.pageTableCell;

export namespace PageTableCell {
  export type pageTableCell = {
    _: 'pageTableCell',
    flags?: number,
    pFlags: Partial<{
      header?: true,
      align_center?: true,
      align_right?: true,
      valign_middle?: true,
      valign_bottom?: true,
    }>,
    text?: RichText,
    colspan?: number,
    rowspan?: number
  };
}

/**
 * @link https://core.telegram.org/type/PageTableRow
 */
export type PageTableRow = PageTableRow.pageTableRow;

export namespace PageTableRow {
  export type pageTableRow = {
    _: 'pageTableRow',
    cells: Array<PageTableCell>
  };
}

/**
 * @link https://core.telegram.org/type/PageCaption
 */
export type PageCaption = PageCaption.pageCaption;

export namespace PageCaption {
  export type pageCaption = {
    _: 'pageCaption',
    text: RichText,
    credit: RichText
  };
}

/**
 * @link https://core.telegram.org/type/PageListItem
 */
export type PageListItem = PageListItem.pageListItemText | PageListItem.pageListItemBlocks;

export namespace PageListItem {
  export type pageListItemText = {
    _: 'pageListItemText',
    text: RichText
  };

  export type pageListItemBlocks = {
    _: 'pageListItemBlocks',
    blocks: Array<PageBlock>
  };
}

/**
 * @link https://core.telegram.org/type/PageListOrderedItem
 */
export type PageListOrderedItem = PageListOrderedItem.pageListOrderedItemText | PageListOrderedItem.pageListOrderedItemBlocks;

export namespace PageListOrderedItem {
  export type pageListOrderedItemText = {
    _: 'pageListOrderedItemText',
    num: string,
    text: RichText
  };

  export type pageListOrderedItemBlocks = {
    _: 'pageListOrderedItemBlocks',
    num: string,
    blocks: Array<PageBlock>
  };
}

/**
 * @link https://core.telegram.org/type/PageRelatedArticle
 */
export type PageRelatedArticle = PageRelatedArticle.pageRelatedArticle;

export namespace PageRelatedArticle {
  export type pageRelatedArticle = {
    _: 'pageRelatedArticle',
    flags?: number,
    url: string,
    webpage_id: string | number,
    title?: string,
    description?: string,
    photo_id?: string | number,
    author?: string,
    published_date?: number
  };
}

/**
 * @link https://core.telegram.org/type/Page
 */
export type Page = Page.page;

export namespace Page {
  export type page = {
    _: 'page',
    flags?: number,
    pFlags: Partial<{
      part?: true,
      rtl?: true,
      v2?: true,
    }>,
    url: string,
    blocks: Array<PageBlock>,
    photos: Array<Photo>,
    documents: Array<Document>,
    views?: number
  };
}

/**
 * @link https://core.telegram.org/type/help.SupportName
 */
export type HelpSupportName = HelpSupportName.helpSupportName;

export namespace HelpSupportName {
  export type helpSupportName = {
    _: 'help.supportName',
    name: string
  };
}

/**
 * @link https://core.telegram.org/type/help.UserInfo
 */
export type HelpUserInfo = HelpUserInfo.helpUserInfoEmpty | HelpUserInfo.helpUserInfo;

export namespace HelpUserInfo {
  export type helpUserInfoEmpty = {
    _: 'help.userInfoEmpty'
  };

  export type helpUserInfo = {
    _: 'help.userInfo',
    message: string,
    entities: Array<MessageEntity>,
    author: string,
    date: number
  };
}

/**
 * @link https://core.telegram.org/type/PollAnswer
 */
export type PollAnswer = PollAnswer.pollAnswer;

export namespace PollAnswer {
  export type pollAnswer = {
    _: 'pollAnswer',
    text: string,
    option: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/Poll
 */
export type Poll = Poll.poll;

export namespace Poll {
  export type poll = {
    _: 'poll',
    id: string | number,
    flags?: number,
    pFlags: Partial<{
      closed?: true,
      public_voters?: true,
      multiple_choice?: true,
      quiz?: true,
    }>,
    question: string,
    answers: Array<PollAnswer>,
    close_period?: number,
    close_date?: number,
    chosenIndexes?: number[]
  };
}

/**
 * @link https://core.telegram.org/type/PollAnswerVoters
 */
export type PollAnswerVoters = PollAnswerVoters.pollAnswerVoters;

export namespace PollAnswerVoters {
  export type pollAnswerVoters = {
    _: 'pollAnswerVoters',
    flags?: number,
    pFlags: Partial<{
      chosen?: true,
      correct?: true,
    }>,
    option: Uint8Array,
    voters: number
  };
}

/**
 * @link https://core.telegram.org/type/PollResults
 */
export type PollResults = PollResults.pollResults;

export namespace PollResults {
  export type pollResults = {
    _: 'pollResults',
    flags?: number,
    pFlags: Partial<{
      min?: true,
    }>,
    results?: Array<PollAnswerVoters>,
    total_voters?: number,
    recent_voters?: Array<string | number>,
    solution?: string,
    solution_entities?: Array<MessageEntity>
  };
}

/**
 * @link https://core.telegram.org/type/ChatOnlines
 */
export type ChatOnlines = ChatOnlines.chatOnlines;

export namespace ChatOnlines {
  export type chatOnlines = {
    _: 'chatOnlines',
    onlines: number
  };
}

/**
 * @link https://core.telegram.org/type/StatsURL
 */
export type StatsURL = StatsURL.statsURL;

export namespace StatsURL {
  export type statsURL = {
    _: 'statsURL',
    url: string
  };
}

/**
 * @link https://core.telegram.org/type/ChatAdminRights
 */
export type ChatAdminRights = ChatAdminRights.chatAdminRights;

export namespace ChatAdminRights {
  export type chatAdminRights = {
    _: 'chatAdminRights',
    flags?: number,
    pFlags: Partial<{
      change_info?: true,
      post_messages?: true,
      edit_messages?: true,
      delete_messages?: true,
      ban_users?: true,
      invite_users?: true,
      pin_messages?: true,
      add_admins?: true,
      anonymous?: true,
      manage_call?: true,
      other?: true,
      manage_topics?: true,
    }>
  };
}

/**
 * @link https://core.telegram.org/type/ChatBannedRights
 */
export type ChatBannedRights = ChatBannedRights.chatBannedRights;

export namespace ChatBannedRights {
  export type chatBannedRights = {
    _: 'chatBannedRights',
    flags?: number,
    pFlags: Partial<{
      view_messages?: true,
      send_messages?: true,
      send_media?: true,
      send_stickers?: true,
      send_gifs?: true,
      send_games?: true,
      send_inline?: true,
      embed_links?: true,
      send_polls?: true,
      change_info?: true,
      invite_users?: true,
      pin_messages?: true,
      manage_topics?: true,
      send_photos?: true,
      send_videos?: true,
      send_roundvideos?: true,
      send_audios?: true,
      send_voices?: true,
      send_docs?: true,
      send_plain?: true,
    }>,
    until_date: number
  };
}

/**
 * @link https://core.telegram.org/type/InputWallPaper
 */
export type InputWallPaper = InputWallPaper.inputWallPaper | InputWallPaper.inputWallPaperSlug | InputWallPaper.inputWallPaperNoFile;

export namespace InputWallPaper {
  export type inputWallPaper = {
    _: 'inputWallPaper',
    id: string | number,
    access_hash: string | number
  };

  export type inputWallPaperSlug = {
    _: 'inputWallPaperSlug',
    slug: string
  };

  export type inputWallPaperNoFile = {
    _: 'inputWallPaperNoFile',
    id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/account.WallPapers
 */
export type AccountWallPapers = AccountWallPapers.accountWallPapersNotModified | AccountWallPapers.accountWallPapers;

export namespace AccountWallPapers {
  export type accountWallPapersNotModified = {
    _: 'account.wallPapersNotModified'
  };

  export type accountWallPapers = {
    _: 'account.wallPapers',
    hash: string | number,
    wallpapers: Array<WallPaper>
  };
}

/**
 * @link https://core.telegram.org/type/CodeSettings
 */
export type CodeSettings = CodeSettings.codeSettings;

export namespace CodeSettings {
  export type codeSettings = {
    _: 'codeSettings',
    flags?: number,
    pFlags: Partial<{
      allow_flashcall?: true,
      current_number?: true,
      allow_app_hash?: true,
      allow_missed_call?: true,
      allow_firebase?: true,
    }>,
    logout_tokens?: Array<Uint8Array>,
    token?: string,
    app_sandbox?: boolean
  };
}

/**
 * @link https://core.telegram.org/type/WallPaperSettings
 */
export type WallPaperSettings = WallPaperSettings.wallPaperSettings;

export namespace WallPaperSettings {
  export type wallPaperSettings = {
    _: 'wallPaperSettings',
    flags?: number,
    pFlags: Partial<{
      blur?: true,
      motion?: true,
    }>,
    background_color?: number,
    second_background_color?: number,
    third_background_color?: number,
    fourth_background_color?: number,
    intensity?: number,
    rotation?: number
  };
}

/**
 * @link https://core.telegram.org/type/AutoDownloadSettings
 */
export type AutoDownloadSettings = AutoDownloadSettings.autoDownloadSettings;

export namespace AutoDownloadSettings {
  export type autoDownloadSettings = {
    _: 'autoDownloadSettings',
    flags?: number,
    pFlags: Partial<{
      disabled?: true,
      video_preload_large?: true,
      audio_preload_next?: true,
      phonecalls_less_data?: true,
    }>,
    photo_size_max: number,
    video_upload_maxbitrate: number,
    file_size_max?: number,
    video_size_max?: number
  };
}

/**
 * @link https://core.telegram.org/type/account.AutoDownloadSettings
 */
export type AccountAutoDownloadSettings = AccountAutoDownloadSettings.accountAutoDownloadSettings;

export namespace AccountAutoDownloadSettings {
  export type accountAutoDownloadSettings = {
    _: 'account.autoDownloadSettings',
    low: AutoDownloadSettings,
    medium: AutoDownloadSettings,
    high: AutoDownloadSettings
  };
}

/**
 * @link https://core.telegram.org/type/EmojiKeyword
 */
export type EmojiKeyword = EmojiKeyword.emojiKeyword | EmojiKeyword.emojiKeywordDeleted;

export namespace EmojiKeyword {
  export type emojiKeyword = {
    _: 'emojiKeyword',
    keyword: string,
    emoticons: Array<string>
  };

  export type emojiKeywordDeleted = {
    _: 'emojiKeywordDeleted',
    keyword: string,
    emoticons: Array<string>
  };
}

/**
 * @link https://core.telegram.org/type/EmojiKeywordsDifference
 */
export type EmojiKeywordsDifference = EmojiKeywordsDifference.emojiKeywordsDifference;

export namespace EmojiKeywordsDifference {
  export type emojiKeywordsDifference = {
    _: 'emojiKeywordsDifference',
    lang_code: string,
    from_version: number,
    version: number,
    keywords: Array<EmojiKeyword>
  };
}

/**
 * @link https://core.telegram.org/type/EmojiURL
 */
export type EmojiURL = EmojiURL.emojiURL;

export namespace EmojiURL {
  export type emojiURL = {
    _: 'emojiURL',
    url: string
  };
}

/**
 * @link https://core.telegram.org/type/EmojiLanguage
 */
export type EmojiLanguage = EmojiLanguage.emojiLanguage;

export namespace EmojiLanguage {
  export type emojiLanguage = {
    _: 'emojiLanguage',
    lang_code: string
  };
}

/**
 * @link https://core.telegram.org/type/Folder
 */
export type Folder = Folder.folder;

export namespace Folder {
  export type folder = {
    _: 'folder',
    flags?: number,
    pFlags: Partial<{
      autofill_new_broadcasts?: true,
      autofill_public_groups?: true,
      autofill_new_correspondents?: true,
    }>,
    id: number,
    title: string,
    photo?: ChatPhoto
  };
}

/**
 * @link https://core.telegram.org/type/InputFolderPeer
 */
export type InputFolderPeer = InputFolderPeer.inputFolderPeer;

export namespace InputFolderPeer {
  export type inputFolderPeer = {
    _: 'inputFolderPeer',
    peer: InputPeer,
    folder_id: number
  };
}

/**
 * @link https://core.telegram.org/type/FolderPeer
 */
export type FolderPeer = FolderPeer.folderPeer;

export namespace FolderPeer {
  export type folderPeer = {
    _: 'folderPeer',
    peer: Peer,
    folder_id: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.SearchCounter
 */
export type MessagesSearchCounter = MessagesSearchCounter.messagesSearchCounter;

export namespace MessagesSearchCounter {
  export type messagesSearchCounter = {
    _: 'messages.searchCounter',
    flags?: number,
    pFlags: Partial<{
      inexact?: true,
    }>,
    filter: MessagesFilter,
    count: number
  };
}

/**
 * @link https://core.telegram.org/type/UrlAuthResult
 */
export type UrlAuthResult = UrlAuthResult.urlAuthResultRequest | UrlAuthResult.urlAuthResultAccepted | UrlAuthResult.urlAuthResultDefault;

export namespace UrlAuthResult {
  export type urlAuthResultRequest = {
    _: 'urlAuthResultRequest',
    flags?: number,
    pFlags: Partial<{
      request_write_access?: true,
    }>,
    bot: User,
    domain: string
  };

  export type urlAuthResultAccepted = {
    _: 'urlAuthResultAccepted',
    url: string
  };

  export type urlAuthResultDefault = {
    _: 'urlAuthResultDefault'
  };
}

/**
 * @link https://core.telegram.org/type/ChannelLocation
 */
export type ChannelLocation = ChannelLocation.channelLocationEmpty | ChannelLocation.channelLocation;

export namespace ChannelLocation {
  export type channelLocationEmpty = {
    _: 'channelLocationEmpty'
  };

  export type channelLocation = {
    _: 'channelLocation',
    geo_point: GeoPoint,
    address: string
  };
}

/**
 * @link https://core.telegram.org/type/PeerLocated
 */
export type PeerLocated = PeerLocated.peerLocated | PeerLocated.peerSelfLocated;

export namespace PeerLocated {
  export type peerLocated = {
    _: 'peerLocated',
    peer: Peer,
    expires: number,
    distance: number
  };

  export type peerSelfLocated = {
    _: 'peerSelfLocated',
    expires: number
  };
}

/**
 * @link https://core.telegram.org/type/RestrictionReason
 */
export type RestrictionReason = RestrictionReason.restrictionReason;

export namespace RestrictionReason {
  export type restrictionReason = {
    _: 'restrictionReason',
    platform: string,
    reason: string,
    text: string
  };
}

/**
 * @link https://core.telegram.org/type/InputTheme
 */
export type InputTheme = InputTheme.inputTheme | InputTheme.inputThemeSlug;

export namespace InputTheme {
  export type inputTheme = {
    _: 'inputTheme',
    id: string | number,
    access_hash: string | number
  };

  export type inputThemeSlug = {
    _: 'inputThemeSlug',
    slug: string
  };
}

/**
 * @link https://core.telegram.org/type/Theme
 */
export type Theme = Theme.theme;

export namespace Theme {
  export type theme = {
    _: 'theme',
    flags?: number,
    pFlags: Partial<{
      creator?: true,
      default?: true,
      for_chat?: true,
    }>,
    id: string | number,
    access_hash: string | number,
    slug: string,
    title: string,
    document?: Document,
    settings?: Array<ThemeSettings>,
    emoticon?: string,
    installs_count?: number
  };
}

/**
 * @link https://core.telegram.org/type/account.Themes
 */
export type AccountThemes = AccountThemes.accountThemesNotModified | AccountThemes.accountThemes;

export namespace AccountThemes {
  export type accountThemesNotModified = {
    _: 'account.themesNotModified'
  };

  export type accountThemes = {
    _: 'account.themes',
    hash: string | number,
    themes: Array<Theme>
  };
}

/**
 * @link https://core.telegram.org/type/auth.LoginToken
 */
export type AuthLoginToken = AuthLoginToken.authLoginToken | AuthLoginToken.authLoginTokenMigrateTo | AuthLoginToken.authLoginTokenSuccess;

export namespace AuthLoginToken {
  export type authLoginToken = {
    _: 'auth.loginToken',
    expires: number,
    token: Uint8Array
  };

  export type authLoginTokenMigrateTo = {
    _: 'auth.loginTokenMigrateTo',
    dc_id: number,
    token: Uint8Array
  };

  export type authLoginTokenSuccess = {
    _: 'auth.loginTokenSuccess',
    authorization: AuthAuthorization
  };
}

/**
 * @link https://core.telegram.org/type/account.ContentSettings
 */
export type AccountContentSettings = AccountContentSettings.accountContentSettings;

export namespace AccountContentSettings {
  export type accountContentSettings = {
    _: 'account.contentSettings',
    flags?: number,
    pFlags: Partial<{
      sensitive_enabled?: true,
      sensitive_can_change?: true,
    }>
  };
}

/**
 * @link https://core.telegram.org/type/messages.InactiveChats
 */
export type MessagesInactiveChats = MessagesInactiveChats.messagesInactiveChats;

export namespace MessagesInactiveChats {
  export type messagesInactiveChats = {
    _: 'messages.inactiveChats',
    dates: Array<number>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/BaseTheme
 */
export type BaseTheme = BaseTheme.baseThemeClassic | BaseTheme.baseThemeDay | BaseTheme.baseThemeNight | BaseTheme.baseThemeTinted | BaseTheme.baseThemeArctic;

export namespace BaseTheme {
  export type baseThemeClassic = {
    _: 'baseThemeClassic'
  };

  export type baseThemeDay = {
    _: 'baseThemeDay'
  };

  export type baseThemeNight = {
    _: 'baseThemeNight'
  };

  export type baseThemeTinted = {
    _: 'baseThemeTinted'
  };

  export type baseThemeArctic = {
    _: 'baseThemeArctic'
  };
}

/**
 * @link https://core.telegram.org/type/InputThemeSettings
 */
export type InputThemeSettings = InputThemeSettings.inputThemeSettings;

export namespace InputThemeSettings {
  export type inputThemeSettings = {
    _: 'inputThemeSettings',
    flags?: number,
    pFlags: Partial<{
      message_colors_animated?: true,
    }>,
    base_theme: BaseTheme,
    accent_color: number,
    outbox_accent_color?: number,
    message_colors?: Array<number>,
    wallpaper?: InputWallPaper,
    wallpaper_settings?: WallPaperSettings
  };
}

/**
 * @link https://core.telegram.org/type/ThemeSettings
 */
export type ThemeSettings = ThemeSettings.themeSettings;

export namespace ThemeSettings {
  export type themeSettings = {
    _: 'themeSettings',
    flags?: number,
    pFlags: Partial<{
      message_colors_animated?: true,
    }>,
    base_theme: BaseTheme,
    accent_color: number,
    outbox_accent_color?: number,
    message_colors?: Array<number>,
    wallpaper?: WallPaper
  };
}

/**
 * @link https://core.telegram.org/type/WebPageAttribute
 */
export type WebPageAttribute = WebPageAttribute.webPageAttributeTheme;

export namespace WebPageAttribute {
  export type webPageAttributeTheme = {
    _: 'webPageAttributeTheme',
    flags?: number,
    documents?: Array<Document>,
    settings?: ThemeSettings
  };
}

/**
 * @link https://core.telegram.org/type/MessageUserVote
 */
export type MessageUserVote = MessageUserVote.messageUserVote | MessageUserVote.messageUserVoteInputOption | MessageUserVote.messageUserVoteMultiple;

export namespace MessageUserVote {
  export type messageUserVote = {
    _: 'messageUserVote',
    user_id: string | number,
    option: Uint8Array,
    date: number
  };

  export type messageUserVoteInputOption = {
    _: 'messageUserVoteInputOption',
    user_id: string | number,
    date: number
  };

  export type messageUserVoteMultiple = {
    _: 'messageUserVoteMultiple',
    user_id: string | number,
    options: Array<Uint8Array>,
    date: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.VotesList
 */
export type MessagesVotesList = MessagesVotesList.messagesVotesList;

export namespace MessagesVotesList {
  export type messagesVotesList = {
    _: 'messages.votesList',
    flags?: number,
    count: number,
    votes: Array<MessageUserVote>,
    users: Array<User>,
    next_offset?: string
  };
}

/**
 * @link https://core.telegram.org/type/BankCardOpenUrl
 */
export type BankCardOpenUrl = BankCardOpenUrl.bankCardOpenUrl;

export namespace BankCardOpenUrl {
  export type bankCardOpenUrl = {
    _: 'bankCardOpenUrl',
    url: string,
    name: string
  };
}

/**
 * @link https://core.telegram.org/type/payments.BankCardData
 */
export type PaymentsBankCardData = PaymentsBankCardData.paymentsBankCardData;

export namespace PaymentsBankCardData {
  export type paymentsBankCardData = {
    _: 'payments.bankCardData',
    title: string,
    open_urls: Array<BankCardOpenUrl>
  };
}

/**
 * @link https://core.telegram.org/type/DialogFilter
 */
export type DialogFilter = DialogFilter.dialogFilter | DialogFilter.dialogFilterDefault | DialogFilter.dialogFilterChatlist;

export namespace DialogFilter {
  export type dialogFilter = {
    _: 'dialogFilter',
    flags?: number,
    pFlags: Partial<{
      contacts?: true,
      non_contacts?: true,
      groups?: true,
      broadcasts?: true,
      bots?: true,
      exclude_muted?: true,
      exclude_read?: true,
      exclude_archived?: true,
      exclude_unarchived?: true,
    }>,
    id: number,
    title: string,
    emoticon?: string,
    pinned_peers: Array<InputPeer>,
    include_peers: Array<InputPeer>,
    exclude_peers: Array<InputPeer>,
    localId?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21,
    pinnedPeerIds?: PeerId[],
    includePeerIds?: PeerId[],
    excludePeerIds?: PeerId[]
  };

  export type dialogFilterDefault = {
    _: 'dialogFilterDefault',
    localId?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21
  };

  export type dialogFilterChatlist = {
    _: 'dialogFilterChatlist',
    flags?: number,
    pFlags: Partial<{
      has_my_invites?: true,
    }>,
    id: number,
    title: string,
    emoticon?: string,
    pinned_peers: Array<InputPeer>,
    include_peers: Array<InputPeer>,
    localId?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21,
    pinnedPeerIds?: PeerId[],
    includePeerIds?: PeerId[],
    updatedTime?: number
  };
}

/**
 * @link https://core.telegram.org/type/DialogFilterSuggested
 */
export type DialogFilterSuggested = DialogFilterSuggested.dialogFilterSuggested;

export namespace DialogFilterSuggested {
  export type dialogFilterSuggested = {
    _: 'dialogFilterSuggested',
    filter: DialogFilter,
    description: string
  };
}

/**
 * @link https://core.telegram.org/type/StatsDateRangeDays
 */
export type StatsDateRangeDays = StatsDateRangeDays.statsDateRangeDays;

export namespace StatsDateRangeDays {
  export type statsDateRangeDays = {
    _: 'statsDateRangeDays',
    min_date: number,
    max_date: number
  };
}

/**
 * @link https://core.telegram.org/type/StatsAbsValueAndPrev
 */
export type StatsAbsValueAndPrev = StatsAbsValueAndPrev.statsAbsValueAndPrev;

export namespace StatsAbsValueAndPrev {
  export type statsAbsValueAndPrev = {
    _: 'statsAbsValueAndPrev',
    current: number,
    previous: number
  };
}

/**
 * @link https://core.telegram.org/type/StatsPercentValue
 */
export type StatsPercentValue = StatsPercentValue.statsPercentValue;

export namespace StatsPercentValue {
  export type statsPercentValue = {
    _: 'statsPercentValue',
    part: number,
    total: number
  };
}

/**
 * @link https://core.telegram.org/type/StatsGraph
 */
export type StatsGraph = StatsGraph.statsGraphAsync | StatsGraph.statsGraphError | StatsGraph.statsGraph;

export namespace StatsGraph {
  export type statsGraphAsync = {
    _: 'statsGraphAsync',
    token: string
  };

  export type statsGraphError = {
    _: 'statsGraphError',
    error: string
  };

  export type statsGraph = {
    _: 'statsGraph',
    flags?: number,
    json: DataJSON,
    zoom_token?: string
  };
}

/**
 * @link https://core.telegram.org/type/MessageInteractionCounters
 */
export type MessageInteractionCounters = MessageInteractionCounters.messageInteractionCounters;

export namespace MessageInteractionCounters {
  export type messageInteractionCounters = {
    _: 'messageInteractionCounters',
    msg_id: number,
    views: number,
    forwards: number
  };
}

/**
 * @link https://core.telegram.org/type/stats.BroadcastStats
 */
export type StatsBroadcastStats = StatsBroadcastStats.statsBroadcastStats;

export namespace StatsBroadcastStats {
  export type statsBroadcastStats = {
    _: 'stats.broadcastStats',
    period: StatsDateRangeDays,
    followers: StatsAbsValueAndPrev,
    views_per_post: StatsAbsValueAndPrev,
    shares_per_post: StatsAbsValueAndPrev,
    enabled_notifications: StatsPercentValue,
    growth_graph: StatsGraph,
    followers_graph: StatsGraph,
    mute_graph: StatsGraph,
    top_hours_graph: StatsGraph,
    interactions_graph: StatsGraph,
    iv_interactions_graph: StatsGraph,
    views_by_source_graph: StatsGraph,
    new_followers_by_source_graph: StatsGraph,
    languages_graph: StatsGraph,
    recent_message_interactions: Array<MessageInteractionCounters>
  };
}

/**
 * @link https://core.telegram.org/type/help.PromoData
 */
export type HelpPromoData = HelpPromoData.helpPromoDataEmpty | HelpPromoData.helpPromoData;

export namespace HelpPromoData {
  export type helpPromoDataEmpty = {
    _: 'help.promoDataEmpty',
    expires: number
  };

  export type helpPromoData = {
    _: 'help.promoData',
    flags?: number,
    pFlags: Partial<{
      proxy?: true,
    }>,
    expires: number,
    peer: Peer,
    chats: Array<Chat>,
    users: Array<User>,
    psa_type?: string,
    psa_message?: string
  };
}

/**
 * @link https://core.telegram.org/type/VideoSize
 */
export type VideoSize = VideoSize.videoSize | VideoSize.videoSizeEmojiMarkup | VideoSize.videoSizeStickerMarkup;

export namespace VideoSize {
  export type videoSize = {
    _: 'videoSize',
    flags?: number,
    type: string,
    w: number,
    h: number,
    size: number,
    video_start_ts?: number
  };

  export type videoSizeEmojiMarkup = {
    _: 'videoSizeEmojiMarkup',
    emoji_id: string | number,
    background_colors: Array<number>
  };

  export type videoSizeStickerMarkup = {
    _: 'videoSizeStickerMarkup',
    stickerset: InputStickerSet,
    sticker_id: string | number,
    background_colors: Array<number>
  };
}

/**
 * @link https://core.telegram.org/type/StatsGroupTopPoster
 */
export type StatsGroupTopPoster = StatsGroupTopPoster.statsGroupTopPoster;

export namespace StatsGroupTopPoster {
  export type statsGroupTopPoster = {
    _: 'statsGroupTopPoster',
    user_id: string | number,
    messages: number,
    avg_chars: number
  };
}

/**
 * @link https://core.telegram.org/type/StatsGroupTopAdmin
 */
export type StatsGroupTopAdmin = StatsGroupTopAdmin.statsGroupTopAdmin;

export namespace StatsGroupTopAdmin {
  export type statsGroupTopAdmin = {
    _: 'statsGroupTopAdmin',
    user_id: string | number,
    deleted: number,
    kicked: number,
    banned: number
  };
}

/**
 * @link https://core.telegram.org/type/StatsGroupTopInviter
 */
export type StatsGroupTopInviter = StatsGroupTopInviter.statsGroupTopInviter;

export namespace StatsGroupTopInviter {
  export type statsGroupTopInviter = {
    _: 'statsGroupTopInviter',
    user_id: string | number,
    invitations: number
  };
}

/**
 * @link https://core.telegram.org/type/stats.MegagroupStats
 */
export type StatsMegagroupStats = StatsMegagroupStats.statsMegagroupStats;

export namespace StatsMegagroupStats {
  export type statsMegagroupStats = {
    _: 'stats.megagroupStats',
    period: StatsDateRangeDays,
    members: StatsAbsValueAndPrev,
    messages: StatsAbsValueAndPrev,
    viewers: StatsAbsValueAndPrev,
    posters: StatsAbsValueAndPrev,
    growth_graph: StatsGraph,
    members_graph: StatsGraph,
    new_members_by_source_graph: StatsGraph,
    languages_graph: StatsGraph,
    messages_graph: StatsGraph,
    actions_graph: StatsGraph,
    top_hours_graph: StatsGraph,
    weekdays_graph: StatsGraph,
    top_posters: Array<StatsGroupTopPoster>,
    top_admins: Array<StatsGroupTopAdmin>,
    top_inviters: Array<StatsGroupTopInviter>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/GlobalPrivacySettings
 */
export type GlobalPrivacySettings = GlobalPrivacySettings.globalPrivacySettings;

export namespace GlobalPrivacySettings {
  export type globalPrivacySettings = {
    _: 'globalPrivacySettings',
    flags?: number,
    archive_and_mute_new_noncontact_peers?: boolean
  };
}

/**
 * @link https://core.telegram.org/type/help.CountryCode
 */
export type HelpCountryCode = HelpCountryCode.helpCountryCode;

export namespace HelpCountryCode {
  export type helpCountryCode = {
    _: 'help.countryCode',
    flags?: number,
    country_code: string,
    prefixes?: Array<string>,
    patterns?: Array<string>
  };
}

/**
 * @link https://core.telegram.org/type/help.Country
 */
export type HelpCountry = HelpCountry.helpCountry;

export namespace HelpCountry {
  export type helpCountry = {
    _: 'help.country',
    flags?: number,
    pFlags: Partial<{
      hidden?: true,
    }>,
    iso2: string,
    default_name: string,
    name?: string,
    country_codes: Array<HelpCountryCode>
  };
}

/**
 * @link https://core.telegram.org/type/help.CountriesList
 */
export type HelpCountriesList = HelpCountriesList.helpCountriesListNotModified | HelpCountriesList.helpCountriesList;

export namespace HelpCountriesList {
  export type helpCountriesListNotModified = {
    _: 'help.countriesListNotModified'
  };

  export type helpCountriesList = {
    _: 'help.countriesList',
    countries: Array<HelpCountry>,
    hash: number
  };
}

/**
 * @link https://core.telegram.org/type/MessageViews
 */
export type MessageViews = MessageViews.messageViews;

export namespace MessageViews {
  export type messageViews = {
    _: 'messageViews',
    flags?: number,
    views?: number,
    forwards?: number,
    replies?: MessageReplies
  };
}

/**
 * @link https://core.telegram.org/type/messages.MessageViews
 */
export type MessagesMessageViews = MessagesMessageViews.messagesMessageViews;

export namespace MessagesMessageViews {
  export type messagesMessageViews = {
    _: 'messages.messageViews',
    views: Array<MessageViews>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/messages.DiscussionMessage
 */
export type MessagesDiscussionMessage = MessagesDiscussionMessage.messagesDiscussionMessage;

export namespace MessagesDiscussionMessage {
  export type messagesDiscussionMessage = {
    _: 'messages.discussionMessage',
    flags?: number,
    messages: Array<Message>,
    max_id?: number,
    read_inbox_max_id?: number,
    read_outbox_max_id?: number,
    unread_count: number,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/MessageReplyHeader
 */
export type MessageReplyHeader = MessageReplyHeader.messageReplyHeader;

export namespace MessageReplyHeader {
  export type messageReplyHeader = {
    _: 'messageReplyHeader',
    flags?: number,
    pFlags: Partial<{
      reply_to_scheduled?: true,
      forum_topic?: true,
    }>,
    reply_to_msg_id: number,
    reply_to_peer_id?: Peer,
    reply_to_top_id?: number
  };
}

/**
 * @link https://core.telegram.org/type/MessageReplies
 */
export type MessageReplies = MessageReplies.messageReplies;

export namespace MessageReplies {
  export type messageReplies = {
    _: 'messageReplies',
    flags?: number,
    pFlags: Partial<{
      comments?: true,
    }>,
    replies: number,
    replies_pts: number,
    recent_repliers?: Array<Peer>,
    channel_id?: string | number,
    max_id?: number,
    read_max_id?: number
  };
}

/**
 * @link https://core.telegram.org/type/PeerBlocked
 */
export type PeerBlocked = PeerBlocked.peerBlocked;

export namespace PeerBlocked {
  export type peerBlocked = {
    _: 'peerBlocked',
    peer_id: Peer,
    date: number
  };
}

/**
 * @link https://core.telegram.org/type/stats.MessageStats
 */
export type StatsMessageStats = StatsMessageStats.statsMessageStats;

export namespace StatsMessageStats {
  export type statsMessageStats = {
    _: 'stats.messageStats',
    views_graph: StatsGraph
  };
}

/**
 * @link https://core.telegram.org/type/GroupCall
 */
export type GroupCall = GroupCall.groupCallDiscarded | GroupCall.groupCall;

export namespace GroupCall {
  export type groupCallDiscarded = {
    _: 'groupCallDiscarded',
    id: string | number,
    access_hash: string | number,
    duration: number
  };

  export type groupCall = {
    _: 'groupCall',
    flags?: number,
    pFlags: Partial<{
      join_muted?: true,
      can_change_join_muted?: true,
      join_date_asc?: true,
      schedule_start_subscribed?: true,
      can_start_video?: true,
      record_video_active?: true,
      rtmp_stream?: true,
      listeners_hidden?: true,
    }>,
    id: string | number,
    access_hash: string | number,
    participants_count: number,
    title?: string,
    stream_dc_id?: number,
    record_start_date?: number,
    schedule_date?: number,
    unmuted_video_count?: number,
    unmuted_video_limit: number,
    version: number
  };
}

/**
 * @link https://core.telegram.org/type/InputGroupCall
 */
export type InputGroupCall = InputGroupCall.inputGroupCall;

export namespace InputGroupCall {
  export type inputGroupCall = {
    _: 'inputGroupCall',
    id: string | number,
    access_hash: string | number
  };
}

/**
 * @link https://core.telegram.org/type/GroupCallParticipant
 */
export type GroupCallParticipant = GroupCallParticipant.groupCallParticipant;

export namespace GroupCallParticipant {
  export type groupCallParticipant = {
    _: 'groupCallParticipant',
    flags?: number,
    pFlags: Partial<{
      muted?: true,
      left?: true,
      can_self_unmute?: true,
      just_joined?: true,
      versioned?: true,
      min?: true,
      muted_by_you?: true,
      volume_by_admin?: true,
      self?: true,
      video_joined?: true,
    }>,
    peer: Peer,
    date: number,
    active_date?: number,
    source: number,
    volume?: number,
    about?: string,
    raise_hand_rating?: string | number,
    video?: GroupCallParticipantVideo,
    presentation?: GroupCallParticipantVideo
  };
}

/**
 * @link https://core.telegram.org/type/phone.GroupCall
 */
export type PhoneGroupCall = PhoneGroupCall.phoneGroupCall;

export namespace PhoneGroupCall {
  export type phoneGroupCall = {
    _: 'phone.groupCall',
    call: GroupCall,
    participants: Array<GroupCallParticipant>,
    participants_next_offset: string,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/phone.GroupParticipants
 */
export type PhoneGroupParticipants = PhoneGroupParticipants.phoneGroupParticipants;

export namespace PhoneGroupParticipants {
  export type phoneGroupParticipants = {
    _: 'phone.groupParticipants',
    count: number,
    participants: Array<GroupCallParticipant>,
    next_offset: string,
    chats: Array<Chat>,
    users: Array<User>,
    version: number
  };
}

/**
 * @link https://core.telegram.org/type/InlineQueryPeerType
 */
export type InlineQueryPeerType = InlineQueryPeerType.inlineQueryPeerTypeSameBotPM | InlineQueryPeerType.inlineQueryPeerTypePM | InlineQueryPeerType.inlineQueryPeerTypeChat | InlineQueryPeerType.inlineQueryPeerTypeMegagroup | InlineQueryPeerType.inlineQueryPeerTypeBroadcast | InlineQueryPeerType.inlineQueryPeerTypeBotPM;

export namespace InlineQueryPeerType {
  export type inlineQueryPeerTypeSameBotPM = {
    _: 'inlineQueryPeerTypeSameBotPM'
  };

  export type inlineQueryPeerTypePM = {
    _: 'inlineQueryPeerTypePM'
  };

  export type inlineQueryPeerTypeChat = {
    _: 'inlineQueryPeerTypeChat'
  };

  export type inlineQueryPeerTypeMegagroup = {
    _: 'inlineQueryPeerTypeMegagroup'
  };

  export type inlineQueryPeerTypeBroadcast = {
    _: 'inlineQueryPeerTypeBroadcast'
  };

  export type inlineQueryPeerTypeBotPM = {
    _: 'inlineQueryPeerTypeBotPM'
  };
}

/**
 * @link https://core.telegram.org/type/messages.HistoryImport
 */
export type MessagesHistoryImport = MessagesHistoryImport.messagesHistoryImport;

export namespace MessagesHistoryImport {
  export type messagesHistoryImport = {
    _: 'messages.historyImport',
    id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/messages.HistoryImportParsed
 */
export type MessagesHistoryImportParsed = MessagesHistoryImportParsed.messagesHistoryImportParsed;

export namespace MessagesHistoryImportParsed {
  export type messagesHistoryImportParsed = {
    _: 'messages.historyImportParsed',
    flags?: number,
    pFlags: Partial<{
      pm?: true,
      group?: true,
    }>,
    title?: string
  };
}

/**
 * @link https://core.telegram.org/type/messages.AffectedFoundMessages
 */
export type MessagesAffectedFoundMessages = MessagesAffectedFoundMessages.messagesAffectedFoundMessages;

export namespace MessagesAffectedFoundMessages {
  export type messagesAffectedFoundMessages = {
    _: 'messages.affectedFoundMessages',
    pts: number,
    pts_count: number,
    offset: number,
    messages: Array<number>
  };
}

/**
 * @link https://core.telegram.org/type/ChatInviteImporter
 */
export type ChatInviteImporter = ChatInviteImporter.chatInviteImporter;

export namespace ChatInviteImporter {
  export type chatInviteImporter = {
    _: 'chatInviteImporter',
    flags?: number,
    pFlags: Partial<{
      requested?: true,
      via_chatlist?: true,
    }>,
    user_id: string | number,
    date: number,
    about?: string,
    approved_by?: string | number
  };
}

/**
 * @link https://core.telegram.org/type/messages.ExportedChatInvites
 */
export type MessagesExportedChatInvites = MessagesExportedChatInvites.messagesExportedChatInvites;

export namespace MessagesExportedChatInvites {
  export type messagesExportedChatInvites = {
    _: 'messages.exportedChatInvites',
    count: number,
    invites: Array<ExportedChatInvite>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/messages.ExportedChatInvite
 */
export type MessagesExportedChatInvite = MessagesExportedChatInvite.messagesExportedChatInvite | MessagesExportedChatInvite.messagesExportedChatInviteReplaced;

export namespace MessagesExportedChatInvite {
  export type messagesExportedChatInvite = {
    _: 'messages.exportedChatInvite',
    invite: ExportedChatInvite,
    users: Array<User>
  };

  export type messagesExportedChatInviteReplaced = {
    _: 'messages.exportedChatInviteReplaced',
    invite: ExportedChatInvite,
    new_invite: ExportedChatInvite,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/messages.ChatInviteImporters
 */
export type MessagesChatInviteImporters = MessagesChatInviteImporters.messagesChatInviteImporters;

export namespace MessagesChatInviteImporters {
  export type messagesChatInviteImporters = {
    _: 'messages.chatInviteImporters',
    count: number,
    importers: Array<ChatInviteImporter>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/ChatAdminWithInvites
 */
export type ChatAdminWithInvites = ChatAdminWithInvites.chatAdminWithInvites;

export namespace ChatAdminWithInvites {
  export type chatAdminWithInvites = {
    _: 'chatAdminWithInvites',
    admin_id: string | number,
    invites_count: number,
    revoked_invites_count: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.ChatAdminsWithInvites
 */
export type MessagesChatAdminsWithInvites = MessagesChatAdminsWithInvites.messagesChatAdminsWithInvites;

export namespace MessagesChatAdminsWithInvites {
  export type messagesChatAdminsWithInvites = {
    _: 'messages.chatAdminsWithInvites',
    admins: Array<ChatAdminWithInvites>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/messages.CheckedHistoryImportPeer
 */
export type MessagesCheckedHistoryImportPeer = MessagesCheckedHistoryImportPeer.messagesCheckedHistoryImportPeer;

export namespace MessagesCheckedHistoryImportPeer {
  export type messagesCheckedHistoryImportPeer = {
    _: 'messages.checkedHistoryImportPeer',
    confirm_text: string
  };
}

/**
 * @link https://core.telegram.org/type/phone.JoinAsPeers
 */
export type PhoneJoinAsPeers = PhoneJoinAsPeers.phoneJoinAsPeers;

export namespace PhoneJoinAsPeers {
  export type phoneJoinAsPeers = {
    _: 'phone.joinAsPeers',
    peers: Array<Peer>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/phone.ExportedGroupCallInvite
 */
export type PhoneExportedGroupCallInvite = PhoneExportedGroupCallInvite.phoneExportedGroupCallInvite;

export namespace PhoneExportedGroupCallInvite {
  export type phoneExportedGroupCallInvite = {
    _: 'phone.exportedGroupCallInvite',
    link: string
  };
}

/**
 * @link https://core.telegram.org/type/GroupCallParticipantVideoSourceGroup
 */
export type GroupCallParticipantVideoSourceGroup = GroupCallParticipantVideoSourceGroup.groupCallParticipantVideoSourceGroup;

export namespace GroupCallParticipantVideoSourceGroup {
  export type groupCallParticipantVideoSourceGroup = {
    _: 'groupCallParticipantVideoSourceGroup',
    semantics: string,
    sources: Array<number>
  };
}

/**
 * @link https://core.telegram.org/type/GroupCallParticipantVideo
 */
export type GroupCallParticipantVideo = GroupCallParticipantVideo.groupCallParticipantVideo;

export namespace GroupCallParticipantVideo {
  export type groupCallParticipantVideo = {
    _: 'groupCallParticipantVideo',
    flags?: number,
    pFlags: Partial<{
      paused?: true,
    }>,
    endpoint: string,
    source_groups: Array<GroupCallParticipantVideoSourceGroup>,
    audio_source?: number
  };
}

/**
 * @link https://core.telegram.org/type/stickers.SuggestedShortName
 */
export type StickersSuggestedShortName = StickersSuggestedShortName.stickersSuggestedShortName;

export namespace StickersSuggestedShortName {
  export type stickersSuggestedShortName = {
    _: 'stickers.suggestedShortName',
    short_name: string
  };
}

/**
 * @link https://core.telegram.org/type/BotCommandScope
 */
export type BotCommandScope = BotCommandScope.botCommandScopeDefault | BotCommandScope.botCommandScopeUsers | BotCommandScope.botCommandScopeChats | BotCommandScope.botCommandScopeChatAdmins | BotCommandScope.botCommandScopePeer | BotCommandScope.botCommandScopePeerAdmins | BotCommandScope.botCommandScopePeerUser;

export namespace BotCommandScope {
  export type botCommandScopeDefault = {
    _: 'botCommandScopeDefault'
  };

  export type botCommandScopeUsers = {
    _: 'botCommandScopeUsers'
  };

  export type botCommandScopeChats = {
    _: 'botCommandScopeChats'
  };

  export type botCommandScopeChatAdmins = {
    _: 'botCommandScopeChatAdmins'
  };

  export type botCommandScopePeer = {
    _: 'botCommandScopePeer',
    peer: InputPeer
  };

  export type botCommandScopePeerAdmins = {
    _: 'botCommandScopePeerAdmins',
    peer: InputPeer
  };

  export type botCommandScopePeerUser = {
    _: 'botCommandScopePeerUser',
    peer: InputPeer,
    user_id: InputUser
  };
}

/**
 * @link https://core.telegram.org/type/account.ResetPasswordResult
 */
export type AccountResetPasswordResult = AccountResetPasswordResult.accountResetPasswordFailedWait | AccountResetPasswordResult.accountResetPasswordRequestedWait | AccountResetPasswordResult.accountResetPasswordOk;

export namespace AccountResetPasswordResult {
  export type accountResetPasswordFailedWait = {
    _: 'account.resetPasswordFailedWait',
    retry_date: number
  };

  export type accountResetPasswordRequestedWait = {
    _: 'account.resetPasswordRequestedWait',
    until_date: number
  };

  export type accountResetPasswordOk = {
    _: 'account.resetPasswordOk'
  };
}

/**
 * @link https://core.telegram.org/type/SponsoredMessage
 */
export type SponsoredMessage = SponsoredMessage.sponsoredMessage;

export namespace SponsoredMessage {
  export type sponsoredMessage = {
    _: 'sponsoredMessage',
    flags?: number,
    pFlags: Partial<{
      recommended?: true,
      show_peer_photo?: true,
    }>,
    random_id: Uint8Array,
    from_id?: Peer,
    chat_invite?: ChatInvite,
    chat_invite_hash?: string,
    channel_post?: number,
    start_param?: string,
    message: string,
    entities?: Array<MessageEntity>,
    sponsor_info?: string,
    additional_info?: string
  };
}

/**
 * @link https://core.telegram.org/type/messages.SponsoredMessages
 */
export type MessagesSponsoredMessages = MessagesSponsoredMessages.messagesSponsoredMessages | MessagesSponsoredMessages.messagesSponsoredMessagesEmpty;

export namespace MessagesSponsoredMessages {
  export type messagesSponsoredMessages = {
    _: 'messages.sponsoredMessages',
    flags?: number,
    posts_between?: number,
    messages: Array<SponsoredMessage>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type messagesSponsoredMessagesEmpty = {
    _: 'messages.sponsoredMessagesEmpty'
  };
}

/**
 * @link https://core.telegram.org/type/SearchResultsCalendarPeriod
 */
export type SearchResultsCalendarPeriod = SearchResultsCalendarPeriod.searchResultsCalendarPeriod;

export namespace SearchResultsCalendarPeriod {
  export type searchResultsCalendarPeriod = {
    _: 'searchResultsCalendarPeriod',
    date: number,
    min_msg_id: number,
    max_msg_id: number,
    count: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.SearchResultsCalendar
 */
export type MessagesSearchResultsCalendar = MessagesSearchResultsCalendar.messagesSearchResultsCalendar;

export namespace MessagesSearchResultsCalendar {
  export type messagesSearchResultsCalendar = {
    _: 'messages.searchResultsCalendar',
    flags?: number,
    pFlags: Partial<{
      inexact?: true,
    }>,
    count: number,
    min_date: number,
    min_msg_id: number,
    offset_id_offset?: number,
    periods: Array<SearchResultsCalendarPeriod>,
    messages: Array<Message>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/SearchResultsPosition
 */
export type SearchResultsPosition = SearchResultsPosition.searchResultPosition;

export namespace SearchResultsPosition {
  export type searchResultPosition = {
    _: 'searchResultPosition',
    msg_id: number,
    date: number,
    offset: number
  };
}

/**
 * @link https://core.telegram.org/type/messages.SearchResultsPositions
 */
export type MessagesSearchResultsPositions = MessagesSearchResultsPositions.messagesSearchResultsPositions;

export namespace MessagesSearchResultsPositions {
  export type messagesSearchResultsPositions = {
    _: 'messages.searchResultsPositions',
    count: number,
    positions: Array<SearchResultsPosition>
  };
}

/**
 * @link https://core.telegram.org/type/channels.SendAsPeers
 */
export type ChannelsSendAsPeers = ChannelsSendAsPeers.channelsSendAsPeers;

export namespace ChannelsSendAsPeers {
  export type channelsSendAsPeers = {
    _: 'channels.sendAsPeers',
    peers: Array<SendAsPeer>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/users.UserFull
 */
export type UsersUserFull = UsersUserFull.usersUserFull;

export namespace UsersUserFull {
  export type usersUserFull = {
    _: 'users.userFull',
    full_user: UserFull,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/messages.PeerSettings
 */
export type MessagesPeerSettings = MessagesPeerSettings.messagesPeerSettings;

export namespace MessagesPeerSettings {
  export type messagesPeerSettings = {
    _: 'messages.peerSettings',
    settings: PeerSettings,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/auth.LoggedOut
 */
export type AuthLoggedOut = AuthLoggedOut.authLoggedOut;

export namespace AuthLoggedOut {
  export type authLoggedOut = {
    _: 'auth.loggedOut',
    flags?: number,
    future_auth_token?: Uint8Array
  };
}

/**
 * @link https://core.telegram.org/type/ReactionCount
 */
export type ReactionCount = ReactionCount.reactionCount;

export namespace ReactionCount {
  export type reactionCount = {
    _: 'reactionCount',
    flags?: number,
    chosen_order?: number,
    reaction: Reaction,
    count: number
  };
}

/**
 * @link https://core.telegram.org/type/MessageReactions
 */
export type MessageReactions = MessageReactions.messageReactions;

export namespace MessageReactions {
  export type messageReactions = {
    _: 'messageReactions',
    flags?: number,
    pFlags: Partial<{
      min?: true,
      can_see_list?: true,
    }>,
    results: Array<ReactionCount>,
    recent_reactions?: Array<MessagePeerReaction>
  };
}

/**
 * @link https://core.telegram.org/type/messages.MessageReactionsList
 */
export type MessagesMessageReactionsList = MessagesMessageReactionsList.messagesMessageReactionsList;

export namespace MessagesMessageReactionsList {
  export type messagesMessageReactionsList = {
    _: 'messages.messageReactionsList',
    flags?: number,
    count: number,
    reactions: Array<MessagePeerReaction>,
    chats: Array<Chat>,
    users: Array<User>,
    next_offset?: string
  };
}

/**
 * @link https://core.telegram.org/type/AvailableReaction
 */
export type AvailableReaction = AvailableReaction.availableReaction;

export namespace AvailableReaction {
  export type availableReaction = {
    _: 'availableReaction',
    flags?: number,
    pFlags: Partial<{
      inactive?: true,
      premium?: true,
    }>,
    reaction: string,
    title: string,
    static_icon: Document.document,
    appear_animation: Document.document,
    select_animation: Document.document,
    activate_animation: Document.document,
    effect_animation: Document.document,
    around_animation: Document.document,
    center_icon: Document.document
  };
}

/**
 * @link https://core.telegram.org/type/messages.AvailableReactions
 */
export type MessagesAvailableReactions = MessagesAvailableReactions.messagesAvailableReactionsNotModified | MessagesAvailableReactions.messagesAvailableReactions;

export namespace MessagesAvailableReactions {
  export type messagesAvailableReactionsNotModified = {
    _: 'messages.availableReactionsNotModified'
  };

  export type messagesAvailableReactions = {
    _: 'messages.availableReactions',
    hash: number,
    reactions: Array<AvailableReaction>
  };
}

/**
 * @link https://core.telegram.org/type/MessagePeerReaction
 */
export type MessagePeerReaction = MessagePeerReaction.messagePeerReaction;

export namespace MessagePeerReaction {
  export type messagePeerReaction = {
    _: 'messagePeerReaction',
    flags?: number,
    pFlags: Partial<{
      big?: true,
      unread?: true,
    }>,
    peer_id: Peer,
    date: number,
    reaction: Reaction
  };
}

/**
 * @link https://core.telegram.org/type/GroupCallStreamChannel
 */
export type GroupCallStreamChannel = GroupCallStreamChannel.groupCallStreamChannel;

export namespace GroupCallStreamChannel {
  export type groupCallStreamChannel = {
    _: 'groupCallStreamChannel',
    channel: number,
    scale: number,
    last_timestamp_ms: string | number
  };
}

/**
 * @link https://core.telegram.org/type/phone.GroupCallStreamChannels
 */
export type PhoneGroupCallStreamChannels = PhoneGroupCallStreamChannels.phoneGroupCallStreamChannels;

export namespace PhoneGroupCallStreamChannels {
  export type phoneGroupCallStreamChannels = {
    _: 'phone.groupCallStreamChannels',
    channels: Array<GroupCallStreamChannel>
  };
}

/**
 * @link https://core.telegram.org/type/phone.GroupCallStreamRtmpUrl
 */
export type PhoneGroupCallStreamRtmpUrl = PhoneGroupCallStreamRtmpUrl.phoneGroupCallStreamRtmpUrl;

export namespace PhoneGroupCallStreamRtmpUrl {
  export type phoneGroupCallStreamRtmpUrl = {
    _: 'phone.groupCallStreamRtmpUrl',
    url: string,
    key: string
  };
}

/**
 * @link https://core.telegram.org/type/AttachMenuBotIconColor
 */
export type AttachMenuBotIconColor = AttachMenuBotIconColor.attachMenuBotIconColor;

export namespace AttachMenuBotIconColor {
  export type attachMenuBotIconColor = {
    _: 'attachMenuBotIconColor',
    name: string,
    color: number
  };
}

/**
 * @link https://core.telegram.org/type/AttachMenuBotIcon
 */
export type AttachMenuBotIcon = AttachMenuBotIcon.attachMenuBotIcon;

export namespace AttachMenuBotIcon {
  export type attachMenuBotIcon = {
    _: 'attachMenuBotIcon',
    flags?: number,
    name: string,
    icon: Document,
    colors?: Array<AttachMenuBotIconColor>
  };
}

/**
 * @link https://core.telegram.org/type/AttachMenuBot
 */
export type AttachMenuBot = AttachMenuBot.attachMenuBot;

export namespace AttachMenuBot {
  export type attachMenuBot = {
    _: 'attachMenuBot',
    flags?: number,
    pFlags: Partial<{
      inactive?: true,
      has_settings?: true,
      request_write_access?: true,
    }>,
    bot_id: string | number,
    short_name: string,
    peer_types: Array<AttachMenuPeerType>,
    icons: Array<AttachMenuBotIcon>
  };
}

/**
 * @link https://core.telegram.org/type/AttachMenuBots
 */
export type AttachMenuBots = AttachMenuBots.attachMenuBotsNotModified | AttachMenuBots.attachMenuBots;

export namespace AttachMenuBots {
  export type attachMenuBotsNotModified = {
    _: 'attachMenuBotsNotModified'
  };

  export type attachMenuBots = {
    _: 'attachMenuBots',
    hash: string | number,
    bots: Array<AttachMenuBot>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/AttachMenuBotsBot
 */
export type AttachMenuBotsBot = AttachMenuBotsBot.attachMenuBotsBot;

export namespace AttachMenuBotsBot {
  export type attachMenuBotsBot = {
    _: 'attachMenuBotsBot',
    bot: AttachMenuBot,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/WebViewResult
 */
export type WebViewResult = WebViewResult.webViewResultUrl;

export namespace WebViewResult {
  export type webViewResultUrl = {
    _: 'webViewResultUrl',
    query_id: string | number,
    url: string
  };
}

/**
 * @link https://core.telegram.org/type/SimpleWebViewResult
 */
export type SimpleWebViewResult = SimpleWebViewResult.simpleWebViewResultUrl;

export namespace SimpleWebViewResult {
  export type simpleWebViewResultUrl = {
    _: 'simpleWebViewResultUrl',
    url: string
  };
}

/**
 * @link https://core.telegram.org/type/WebViewMessageSent
 */
export type WebViewMessageSent = WebViewMessageSent.webViewMessageSent;

export namespace WebViewMessageSent {
  export type webViewMessageSent = {
    _: 'webViewMessageSent',
    flags?: number,
    msg_id?: InputBotInlineMessageID
  };
}

/**
 * @link https://core.telegram.org/type/BotMenuButton
 */
export type BotMenuButton = BotMenuButton.botMenuButtonDefault | BotMenuButton.botMenuButtonCommands | BotMenuButton.botMenuButton;

export namespace BotMenuButton {
  export type botMenuButtonDefault = {
    _: 'botMenuButtonDefault'
  };

  export type botMenuButtonCommands = {
    _: 'botMenuButtonCommands'
  };

  export type botMenuButton = {
    _: 'botMenuButton',
    text: string,
    url: string
  };
}

/**
 * @link https://core.telegram.org/type/account.SavedRingtones
 */
export type AccountSavedRingtones = AccountSavedRingtones.accountSavedRingtonesNotModified | AccountSavedRingtones.accountSavedRingtones;

export namespace AccountSavedRingtones {
  export type accountSavedRingtonesNotModified = {
    _: 'account.savedRingtonesNotModified'
  };

  export type accountSavedRingtones = {
    _: 'account.savedRingtones',
    hash: string | number,
    ringtones: Array<Document>
  };
}

/**
 * @link https://core.telegram.org/type/NotificationSound
 */
export type NotificationSound = NotificationSound.notificationSoundDefault | NotificationSound.notificationSoundNone | NotificationSound.notificationSoundLocal | NotificationSound.notificationSoundRingtone;

export namespace NotificationSound {
  export type notificationSoundDefault = {
    _: 'notificationSoundDefault'
  };

  export type notificationSoundNone = {
    _: 'notificationSoundNone'
  };

  export type notificationSoundLocal = {
    _: 'notificationSoundLocal',
    title: string,
    data: string
  };

  export type notificationSoundRingtone = {
    _: 'notificationSoundRingtone',
    id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/account.SavedRingtone
 */
export type AccountSavedRingtone = AccountSavedRingtone.accountSavedRingtone | AccountSavedRingtone.accountSavedRingtoneConverted;

export namespace AccountSavedRingtone {
  export type accountSavedRingtone = {
    _: 'account.savedRingtone'
  };

  export type accountSavedRingtoneConverted = {
    _: 'account.savedRingtoneConverted',
    document: Document
  };
}

/**
 * @link https://core.telegram.org/type/AttachMenuPeerType
 */
export type AttachMenuPeerType = AttachMenuPeerType.attachMenuPeerTypeSameBotPM | AttachMenuPeerType.attachMenuPeerTypeBotPM | AttachMenuPeerType.attachMenuPeerTypePM | AttachMenuPeerType.attachMenuPeerTypeChat | AttachMenuPeerType.attachMenuPeerTypeBroadcast;

export namespace AttachMenuPeerType {
  export type attachMenuPeerTypeSameBotPM = {
    _: 'attachMenuPeerTypeSameBotPM'
  };

  export type attachMenuPeerTypeBotPM = {
    _: 'attachMenuPeerTypeBotPM'
  };

  export type attachMenuPeerTypePM = {
    _: 'attachMenuPeerTypePM'
  };

  export type attachMenuPeerTypeChat = {
    _: 'attachMenuPeerTypeChat'
  };

  export type attachMenuPeerTypeBroadcast = {
    _: 'attachMenuPeerTypeBroadcast'
  };
}

/**
 * @link https://core.telegram.org/type/InputInvoice
 */
export type InputInvoice = InputInvoice.inputInvoiceMessage | InputInvoice.inputInvoiceSlug;

export namespace InputInvoice {
  export type inputInvoiceMessage = {
    _: 'inputInvoiceMessage',
    peer: InputPeer,
    msg_id: number
  };

  export type inputInvoiceSlug = {
    _: 'inputInvoiceSlug',
    slug: string
  };
}

/**
 * @link https://core.telegram.org/type/payments.ExportedInvoice
 */
export type PaymentsExportedInvoice = PaymentsExportedInvoice.paymentsExportedInvoice;

export namespace PaymentsExportedInvoice {
  export type paymentsExportedInvoice = {
    _: 'payments.exportedInvoice',
    url: string
  };
}

/**
 * @link https://core.telegram.org/type/messages.TranscribedAudio
 */
export type MessagesTranscribedAudio = MessagesTranscribedAudio.messagesTranscribedAudio;

export namespace MessagesTranscribedAudio {
  export type messagesTranscribedAudio = {
    _: 'messages.transcribedAudio',
    flags?: number,
    pFlags: Partial<{
      pending?: true,
    }>,
    transcription_id: string | number,
    text: string
  };
}

/**
 * @link https://core.telegram.org/type/help.PremiumPromo
 */
export type HelpPremiumPromo = HelpPremiumPromo.helpPremiumPromo;

export namespace HelpPremiumPromo {
  export type helpPremiumPromo = {
    _: 'help.premiumPromo',
    status_text: string,
    status_entities: Array<MessageEntity>,
    video_sections: Array<string>,
    videos: Array<Document>,
    period_options: Array<PremiumSubscriptionOption>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/InputStorePaymentPurpose
 */
export type InputStorePaymentPurpose = InputStorePaymentPurpose.inputStorePaymentPremiumSubscription | InputStorePaymentPurpose.inputStorePaymentGiftPremium;

export namespace InputStorePaymentPurpose {
  export type inputStorePaymentPremiumSubscription = {
    _: 'inputStorePaymentPremiumSubscription',
    flags?: number,
    pFlags: Partial<{
      restore?: true,
      upgrade?: true,
    }>
  };

  export type inputStorePaymentGiftPremium = {
    _: 'inputStorePaymentGiftPremium',
    user_id: InputUser,
    currency: string,
    amount: string | number
  };
}

/**
 * @link https://core.telegram.org/type/PremiumGiftOption
 */
export type PremiumGiftOption = PremiumGiftOption.premiumGiftOption;

export namespace PremiumGiftOption {
  export type premiumGiftOption = {
    _: 'premiumGiftOption',
    flags?: number,
    months: number,
    currency: string,
    amount: string | number,
    bot_url: string,
    store_product?: string
  };
}

/**
 * @link https://core.telegram.org/type/PaymentFormMethod
 */
export type PaymentFormMethod = PaymentFormMethod.paymentFormMethod;

export namespace PaymentFormMethod {
  export type paymentFormMethod = {
    _: 'paymentFormMethod',
    url: string,
    title: string
  };
}

/**
 * @link https://core.telegram.org/type/EmojiStatus
 */
export type EmojiStatus = EmojiStatus.emojiStatusEmpty | EmojiStatus.emojiStatus | EmojiStatus.emojiStatusUntil;

export namespace EmojiStatus {
  export type emojiStatusEmpty = {
    _: 'emojiStatusEmpty'
  };

  export type emojiStatus = {
    _: 'emojiStatus',
    document_id: string | number
  };

  export type emojiStatusUntil = {
    _: 'emojiStatusUntil',
    document_id: string | number,
    until: number
  };
}

/**
 * @link https://core.telegram.org/type/account.EmojiStatuses
 */
export type AccountEmojiStatuses = AccountEmojiStatuses.accountEmojiStatusesNotModified | AccountEmojiStatuses.accountEmojiStatuses;

export namespace AccountEmojiStatuses {
  export type accountEmojiStatusesNotModified = {
    _: 'account.emojiStatusesNotModified'
  };

  export type accountEmojiStatuses = {
    _: 'account.emojiStatuses',
    hash: string | number,
    statuses: Array<EmojiStatus>
  };
}

/**
 * @link https://core.telegram.org/type/Reaction
 */
export type Reaction = Reaction.reactionEmpty | Reaction.reactionEmoji | Reaction.reactionCustomEmoji;

export namespace Reaction {
  export type reactionEmpty = {
    _: 'reactionEmpty'
  };

  export type reactionEmoji = {
    _: 'reactionEmoji',
    emoticon: string
  };

  export type reactionCustomEmoji = {
    _: 'reactionCustomEmoji',
    document_id: string | number
  };
}

/**
 * @link https://core.telegram.org/type/ChatReactions
 */
export type ChatReactions = ChatReactions.chatReactionsNone | ChatReactions.chatReactionsAll | ChatReactions.chatReactionsSome;

export namespace ChatReactions {
  export type chatReactionsNone = {
    _: 'chatReactionsNone'
  };

  export type chatReactionsAll = {
    _: 'chatReactionsAll',
    flags?: number,
    pFlags: Partial<{
      allow_custom?: true,
    }>
  };

  export type chatReactionsSome = {
    _: 'chatReactionsSome',
    reactions: Array<Reaction>
  };
}

/**
 * @link https://core.telegram.org/type/messages.Reactions
 */
export type MessagesReactions = MessagesReactions.messagesReactionsNotModified | MessagesReactions.messagesReactions;

export namespace MessagesReactions {
  export type messagesReactionsNotModified = {
    _: 'messages.reactionsNotModified'
  };

  export type messagesReactions = {
    _: 'messages.reactions',
    hash: string | number,
    reactions: Array<Reaction>
  };
}

/**
 * @link https://core.telegram.org/type/EmailVerifyPurpose
 */
export type EmailVerifyPurpose = EmailVerifyPurpose.emailVerifyPurposeLoginSetup | EmailVerifyPurpose.emailVerifyPurposeLoginChange | EmailVerifyPurpose.emailVerifyPurposePassport;

export namespace EmailVerifyPurpose {
  export type emailVerifyPurposeLoginSetup = {
    _: 'emailVerifyPurposeLoginSetup',
    phone_number: string,
    phone_code_hash: string
  };

  export type emailVerifyPurposeLoginChange = {
    _: 'emailVerifyPurposeLoginChange'
  };

  export type emailVerifyPurposePassport = {
    _: 'emailVerifyPurposePassport'
  };
}

/**
 * @link https://core.telegram.org/type/EmailVerification
 */
export type EmailVerification = EmailVerification.emailVerificationCode | EmailVerification.emailVerificationGoogle | EmailVerification.emailVerificationApple;

export namespace EmailVerification {
  export type emailVerificationCode = {
    _: 'emailVerificationCode',
    code: string
  };

  export type emailVerificationGoogle = {
    _: 'emailVerificationGoogle',
    token: string
  };

  export type emailVerificationApple = {
    _: 'emailVerificationApple',
    token: string
  };
}

/**
 * @link https://core.telegram.org/type/account.EmailVerified
 */
export type AccountEmailVerified = AccountEmailVerified.accountEmailVerified | AccountEmailVerified.accountEmailVerifiedLogin;

export namespace AccountEmailVerified {
  export type accountEmailVerified = {
    _: 'account.emailVerified',
    email: string
  };

  export type accountEmailVerifiedLogin = {
    _: 'account.emailVerifiedLogin',
    email: string,
    sent_code: AuthSentCode
  };
}

/**
 * @link https://core.telegram.org/type/PremiumSubscriptionOption
 */
export type PremiumSubscriptionOption = PremiumSubscriptionOption.premiumSubscriptionOption;

export namespace PremiumSubscriptionOption {
  export type premiumSubscriptionOption = {
    _: 'premiumSubscriptionOption',
    flags?: number,
    pFlags: Partial<{
      current?: true,
      can_purchase_upgrade?: true,
    }>,
    transaction?: string,
    months: number,
    currency: string,
    amount: string | number,
    bot_url: string,
    store_product?: string
  };
}

/**
 * @link https://core.telegram.org/type/SendAsPeer
 */
export type SendAsPeer = SendAsPeer.sendAsPeer;

export namespace SendAsPeer {
  export type sendAsPeer = {
    _: 'sendAsPeer',
    flags?: number,
    pFlags: Partial<{
      premium_required?: true,
    }>,
    peer: Peer
  };
}

/**
 * @link https://core.telegram.org/type/MessageExtendedMedia
 */
export type MessageExtendedMedia = MessageExtendedMedia.messageExtendedMediaPreview | MessageExtendedMedia.messageExtendedMedia;

export namespace MessageExtendedMedia {
  export type messageExtendedMediaPreview = {
    _: 'messageExtendedMediaPreview',
    flags?: number,
    w?: number,
    h?: number,
    thumb?: PhotoSize,
    video_duration?: number
  };

  export type messageExtendedMedia = {
    _: 'messageExtendedMedia',
    media: MessageMedia
  };
}

/**
 * @link https://core.telegram.org/type/StickerKeyword
 */
export type StickerKeyword = StickerKeyword.stickerKeyword;

export namespace StickerKeyword {
  export type stickerKeyword = {
    _: 'stickerKeyword',
    document_id: string | number,
    keyword: Array<string>
  };
}

/**
 * @link https://core.telegram.org/type/Username
 */
export type Username = Username.username;

export namespace Username {
  export type username = {
    _: 'username',
    flags?: number,
    pFlags: Partial<{
      editable?: true,
      active?: true,
    }>,
    username: string
  };
}

/**
 * @link https://core.telegram.org/type/ForumTopic
 */
export type ForumTopic = ForumTopic.forumTopicDeleted | ForumTopic.forumTopic;

export namespace ForumTopic {
  export type forumTopicDeleted = {
    _: 'forumTopicDeleted',
    id: number
  };

  export type forumTopic = {
    _: 'forumTopic',
    flags?: number,
    pFlags: Partial<{
      my?: true,
      closed?: true,
      pinned?: true,
      short?: true,
      hidden?: true,
    }>,
    id: number,
    date: number,
    title: string,
    icon_color: number,
    icon_emoji_id?: string | number,
    top_message: number,
    read_inbox_max_id: number,
    read_outbox_max_id: number,
    unread_count: number,
    unread_mentions_count: number,
    unread_reactions_count: number,
    from_id: Peer,
    notify_settings: PeerNotifySettings,
    draft?: DraftMessage,
    peerId?: PeerId,
    index_0?: number,
    peer?: Peer
  };
}

/**
 * @link https://core.telegram.org/type/messages.ForumTopics
 */
export type MessagesForumTopics = MessagesForumTopics.messagesForumTopics;

export namespace MessagesForumTopics {
  export type messagesForumTopics = {
    _: 'messages.forumTopics',
    flags?: number,
    pFlags: Partial<{
      order_by_create_date?: true,
    }>,
    count: number,
    topics: Array<ForumTopic>,
    messages: Array<Message>,
    chats: Array<Chat>,
    users: Array<User>,
    pts: number
  };
}

/**
 * @link https://core.telegram.org/type/DefaultHistoryTTL
 */
export type DefaultHistoryTTL = DefaultHistoryTTL.defaultHistoryTTL;

export namespace DefaultHistoryTTL {
  export type defaultHistoryTTL = {
    _: 'defaultHistoryTTL',
    period: number
  };
}

/**
 * @link https://core.telegram.org/type/ExportedContactToken
 */
export type ExportedContactToken = ExportedContactToken.exportedContactToken;

export namespace ExportedContactToken {
  export type exportedContactToken = {
    _: 'exportedContactToken',
    url: string,
    expires: number
  };
}

/**
 * @link https://core.telegram.org/type/RequestPeerType
 */
export type RequestPeerType = RequestPeerType.requestPeerTypeUser | RequestPeerType.requestPeerTypeChat | RequestPeerType.requestPeerTypeBroadcast;

export namespace RequestPeerType {
  export type requestPeerTypeUser = {
    _: 'requestPeerTypeUser',
    flags?: number,
    bot?: boolean,
    premium?: boolean
  };

  export type requestPeerTypeChat = {
    _: 'requestPeerTypeChat',
    flags?: number,
    pFlags: Partial<{
      creator?: true,
      bot_participant?: true,
    }>,
    has_username?: boolean,
    forum?: boolean,
    user_admin_rights?: ChatAdminRights,
    bot_admin_rights?: ChatAdminRights
  };

  export type requestPeerTypeBroadcast = {
    _: 'requestPeerTypeBroadcast',
    flags?: number,
    pFlags: Partial<{
      creator?: true,
    }>,
    has_username?: boolean,
    user_admin_rights?: ChatAdminRights,
    bot_admin_rights?: ChatAdminRights
  };
}

/**
 * @link https://core.telegram.org/type/EmojiList
 */
export type EmojiList = EmojiList.emojiListNotModified | EmojiList.emojiList;

export namespace EmojiList {
  export type emojiListNotModified = {
    _: 'emojiListNotModified'
  };

  export type emojiList = {
    _: 'emojiList',
    hash: string | number,
    document_id: Array<string | number>
  };
}

/**
 * @link https://core.telegram.org/type/EmojiGroup
 */
export type EmojiGroup = EmojiGroup.emojiGroup;

export namespace EmojiGroup {
  export type emojiGroup = {
    _: 'emojiGroup',
    title: string,
    icon_emoji_id: string | number,
    emoticons: Array<string>
  };
}

/**
 * @link https://core.telegram.org/type/messages.EmojiGroups
 */
export type MessagesEmojiGroups = MessagesEmojiGroups.messagesEmojiGroupsNotModified | MessagesEmojiGroups.messagesEmojiGroups;

export namespace MessagesEmojiGroups {
  export type messagesEmojiGroupsNotModified = {
    _: 'messages.emojiGroupsNotModified'
  };

  export type messagesEmojiGroups = {
    _: 'messages.emojiGroups',
    hash: number,
    groups: Array<EmojiGroup>
  };
}

/**
 * @link https://core.telegram.org/type/TextWithEntities
 */
export type TextWithEntities = TextWithEntities.textWithEntities;

export namespace TextWithEntities {
  export type textWithEntities = {
    _: 'textWithEntities',
    text: string,
    entities: Array<MessageEntity>
  };
}

/**
 * @link https://core.telegram.org/type/messages.TranslatedText
 */
export type MessagesTranslatedText = MessagesTranslatedText.messagesTranslateResult;

export namespace MessagesTranslatedText {
  export type messagesTranslateResult = {
    _: 'messages.translateResult',
    result: Array<TextWithEntities>
  };
}

/**
 * @link https://core.telegram.org/type/AutoSaveSettings
 */
export type AutoSaveSettings = AutoSaveSettings.autoSaveSettings;

export namespace AutoSaveSettings {
  export type autoSaveSettings = {
    _: 'autoSaveSettings',
    flags?: number,
    pFlags: Partial<{
      photos?: true,
      videos?: true,
    }>,
    video_max_size?: string | number
  };
}

/**
 * @link https://core.telegram.org/type/AutoSaveException
 */
export type AutoSaveException = AutoSaveException.autoSaveException;

export namespace AutoSaveException {
  export type autoSaveException = {
    _: 'autoSaveException',
    peer: Peer,
    settings: AutoSaveSettings
  };
}

/**
 * @link https://core.telegram.org/type/account.AutoSaveSettings
 */
export type AccountAutoSaveSettings = AccountAutoSaveSettings.accountAutoSaveSettings;

export namespace AccountAutoSaveSettings {
  export type accountAutoSaveSettings = {
    _: 'account.autoSaveSettings',
    users_settings: AutoSaveSettings,
    chats_settings: AutoSaveSettings,
    broadcasts_settings: AutoSaveSettings,
    exceptions: Array<AutoSaveException>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/help.AppConfig
 */
export type HelpAppConfig = HelpAppConfig.helpAppConfigNotModified | HelpAppConfig.helpAppConfig;

export namespace HelpAppConfig {
  export type helpAppConfigNotModified = {
    _: 'help.appConfigNotModified'
  };

  export type helpAppConfig = {
    _: 'help.appConfig',
    hash: number,
    config: JSONValue
  };
}

/**
 * @link https://core.telegram.org/type/InputBotApp
 */
export type InputBotApp = InputBotApp.inputBotAppID | InputBotApp.inputBotAppShortName;

export namespace InputBotApp {
  export type inputBotAppID = {
    _: 'inputBotAppID',
    id: string | number,
    access_hash: string | number
  };

  export type inputBotAppShortName = {
    _: 'inputBotAppShortName',
    bot_id: InputUser,
    short_name: string
  };
}

/**
 * @link https://core.telegram.org/type/BotApp
 */
export type BotApp = BotApp.botAppNotModified | BotApp.botApp;

export namespace BotApp {
  export type botAppNotModified = {
    _: 'botAppNotModified'
  };

  export type botApp = {
    _: 'botApp',
    flags?: number,
    id: string | number,
    access_hash: string | number,
    short_name: string,
    title: string,
    description: string,
    photo: Photo,
    document?: Document,
    hash: string | number
  };
}

/**
 * @link https://core.telegram.org/type/messages.BotApp
 */
export type MessagesBotApp = MessagesBotApp.messagesBotApp;

export namespace MessagesBotApp {
  export type messagesBotApp = {
    _: 'messages.botApp',
    flags?: number,
    pFlags: Partial<{
      inactive?: true,
      request_write_access?: true,
    }>,
    app: BotApp
  };
}

/**
 * @link https://core.telegram.org/type/AppWebViewResult
 */
export type AppWebViewResult = AppWebViewResult.appWebViewResultUrl;

export namespace AppWebViewResult {
  export type appWebViewResultUrl = {
    _: 'appWebViewResultUrl',
    url: string
  };
}

/**
 * @link https://core.telegram.org/type/InlineBotWebView
 */
export type InlineBotWebView = InlineBotWebView.inlineBotWebView;

export namespace InlineBotWebView {
  export type inlineBotWebView = {
    _: 'inlineBotWebView',
    text: string,
    url: string
  };
}

/**
 * @link https://core.telegram.org/type/ReadParticipantDate
 */
export type ReadParticipantDate = ReadParticipantDate.readParticipantDate;

export namespace ReadParticipantDate {
  export type readParticipantDate = {
    _: 'readParticipantDate',
    user_id: string | number,
    date: number
  };
}

/**
 * @link https://core.telegram.org/type/InputChatlist
 */
export type InputChatlist = InputChatlist.inputChatlistDialogFilter;

export namespace InputChatlist {
  export type inputChatlistDialogFilter = {
    _: 'inputChatlistDialogFilter',
    filter_id: number
  };
}

/**
 * @link https://core.telegram.org/type/ExportedChatlistInvite
 */
export type ExportedChatlistInvite = ExportedChatlistInvite.exportedChatlistInvite;

export namespace ExportedChatlistInvite {
  export type exportedChatlistInvite = {
    _: 'exportedChatlistInvite',
    flags?: number,
    title: string,
    url: string,
    peers: Array<Peer>
  };
}

/**
 * @link https://core.telegram.org/type/chatlists.ExportedChatlistInvite
 */
export type ChatlistsExportedChatlistInvite = ChatlistsExportedChatlistInvite.chatlistsExportedChatlistInvite;

export namespace ChatlistsExportedChatlistInvite {
  export type chatlistsExportedChatlistInvite = {
    _: 'chatlists.exportedChatlistInvite',
    filter: DialogFilter,
    invite: ExportedChatlistInvite
  };
}

/**
 * @link https://core.telegram.org/type/chatlists.ExportedInvites
 */
export type ChatlistsExportedInvites = ChatlistsExportedInvites.chatlistsExportedInvites;

export namespace ChatlistsExportedInvites {
  export type chatlistsExportedInvites = {
    _: 'chatlists.exportedInvites',
    invites: Array<ExportedChatlistInvite>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/chatlists.ChatlistInvite
 */
export type ChatlistsChatlistInvite = ChatlistsChatlistInvite.chatlistsChatlistInviteAlready | ChatlistsChatlistInvite.chatlistsChatlistInvite;

export namespace ChatlistsChatlistInvite {
  export type chatlistsChatlistInviteAlready = {
    _: 'chatlists.chatlistInviteAlready',
    filter_id: number,
    missing_peers: Array<Peer>,
    already_peers: Array<Peer>,
    chats: Array<Chat>,
    users: Array<User>
  };

  export type chatlistsChatlistInvite = {
    _: 'chatlists.chatlistInvite',
    flags?: number,
    title: string,
    emoticon?: string,
    peers: Array<Peer>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/chatlists.ChatlistUpdates
 */
export type ChatlistsChatlistUpdates = ChatlistsChatlistUpdates.chatlistsChatlistUpdates;

export namespace ChatlistsChatlistUpdates {
  export type chatlistsChatlistUpdates = {
    _: 'chatlists.chatlistUpdates',
    missing_peers: Array<Peer>,
    chats: Array<Chat>,
    users: Array<User>
  };
}

/**
 * @link https://core.telegram.org/type/bots.BotInfo
 */
export type BotsBotInfo = BotsBotInfo.botsBotInfo;

export namespace BotsBotInfo {
  export type botsBotInfo = {
    _: 'bots.botInfo',
    name: string,
    about: string,
    description: string
  };
}

export interface ConstructorDeclMap {
  'error': Error.error,
  'inputPeerEmpty': InputPeer.inputPeerEmpty,
  'inputPeerSelf': InputPeer.inputPeerSelf,
  'inputPeerChat': InputPeer.inputPeerChat,
  'inputUserEmpty': InputUser.inputUserEmpty,
  'inputUserSelf': InputUser.inputUserSelf,
  'inputPhoneContact': InputContact.inputPhoneContact,
  'inputFile': InputFile.inputFile,
  'inputMediaEmpty': InputMedia.inputMediaEmpty,
  'inputMediaUploadedPhoto': InputMedia.inputMediaUploadedPhoto,
  'inputMediaPhoto': InputMedia.inputMediaPhoto,
  'inputMediaGeoPoint': InputMedia.inputMediaGeoPoint,
  'inputMediaContact': InputMedia.inputMediaContact,
  'inputChatPhotoEmpty': InputChatPhoto.inputChatPhotoEmpty,
  'inputChatUploadedPhoto': InputChatPhoto.inputChatUploadedPhoto,
  'inputChatPhoto': InputChatPhoto.inputChatPhoto,
  'inputGeoPointEmpty': InputGeoPoint.inputGeoPointEmpty,
  'inputGeoPoint': InputGeoPoint.inputGeoPoint,
  'inputPhotoEmpty': InputPhoto.inputPhotoEmpty,
  'inputPhoto': InputPhoto.inputPhoto,
  'inputFileLocation': InputFileLocation.inputFileLocation,
  'peerUser': Peer.peerUser,
  'peerChat': Peer.peerChat,
  'storage.fileUnknown': StorageFileType.storageFileUnknown,
  'storage.filePartial': StorageFileType.storageFilePartial,
  'storage.fileJpeg': StorageFileType.storageFileJpeg,
  'storage.fileGif': StorageFileType.storageFileGif,
  'storage.filePng': StorageFileType.storageFilePng,
  'storage.filePdf': StorageFileType.storageFilePdf,
  'storage.fileMp3': StorageFileType.storageFileMp3,
  'storage.fileMov': StorageFileType.storageFileMov,
  'storage.fileMp4': StorageFileType.storageFileMp4,
  'storage.fileWebp': StorageFileType.storageFileWebp,
  'userEmpty': User.userEmpty,
  'userProfilePhotoEmpty': UserProfilePhoto.userProfilePhotoEmpty,
  'userProfilePhoto': UserProfilePhoto.userProfilePhoto,
  'userStatusEmpty': UserStatus.userStatusEmpty,
  'userStatusOnline': UserStatus.userStatusOnline,
  'userStatusOffline': UserStatus.userStatusOffline,
  'chatEmpty': Chat.chatEmpty,
  'chat': Chat.chat,
  'chatForbidden': Chat.chatForbidden,
  'chatFull': ChatFull.chatFull,
  'chatParticipant': ChatParticipant.chatParticipant,
  'chatParticipantsForbidden': ChatParticipants.chatParticipantsForbidden,
  'chatParticipants': ChatParticipants.chatParticipants,
  'chatPhotoEmpty': ChatPhoto.chatPhotoEmpty,
  'chatPhoto': ChatPhoto.chatPhoto,
  'messageEmpty': Message.messageEmpty,
  'message': Message.message,
  'messageService': Message.messageService,
  'messageMediaEmpty': MessageMedia.messageMediaEmpty,
  'messageMediaPhoto': MessageMedia.messageMediaPhoto,
  'messageMediaGeo': MessageMedia.messageMediaGeo,
  'messageMediaContact': MessageMedia.messageMediaContact,
  'messageMediaUnsupported': MessageMedia.messageMediaUnsupported,
  'messageActionEmpty': MessageAction.messageActionEmpty,
  'messageActionChatCreate': MessageAction.messageActionChatCreate,
  'messageActionChatEditTitle': MessageAction.messageActionChatEditTitle,
  'messageActionChatEditPhoto': MessageAction.messageActionChatEditPhoto,
  'messageActionChatDeletePhoto': MessageAction.messageActionChatDeletePhoto,
  'messageActionChatAddUser': MessageAction.messageActionChatAddUser,
  'messageActionChatDeleteUser': MessageAction.messageActionChatDeleteUser,
  'dialog': Dialog.dialog,
  'photoEmpty': Photo.photoEmpty,
  'photo': Photo.photo,
  'photoSizeEmpty': PhotoSize.photoSizeEmpty,
  'photoSize': PhotoSize.photoSize,
  'photoCachedSize': PhotoSize.photoCachedSize,
  'geoPointEmpty': GeoPoint.geoPointEmpty,
  'geoPoint': GeoPoint.geoPoint,
  'auth.sentCode': AuthSentCode.authSentCode,
  'auth.authorization': AuthAuthorization.authAuthorization,
  'auth.exportedAuthorization': AuthExportedAuthorization.authExportedAuthorization,
  'inputNotifyPeer': InputNotifyPeer.inputNotifyPeer,
  'inputNotifyUsers': InputNotifyPeer.inputNotifyUsers,
  'inputNotifyChats': InputNotifyPeer.inputNotifyChats,
  'inputPeerNotifySettings': InputPeerNotifySettings.inputPeerNotifySettings,
  'peerNotifySettings': PeerNotifySettings.peerNotifySettings,
  'peerSettings': PeerSettings.peerSettings,
  'wallPaper': WallPaper.wallPaper,
  'inputReportReasonSpam': ReportReason.inputReportReasonSpam,
  'inputReportReasonViolence': ReportReason.inputReportReasonViolence,
  'inputReportReasonPornography': ReportReason.inputReportReasonPornography,
  'inputReportReasonChildAbuse': ReportReason.inputReportReasonChildAbuse,
  'inputReportReasonOther': ReportReason.inputReportReasonOther,
  'userFull': UserFull.userFull,
  'contact': Contact.contact,
  'importedContact': ImportedContact.importedContact,
  'contactStatus': ContactStatus.contactStatus,
  'contacts.contactsNotModified': ContactsContacts.contactsContactsNotModified,
  'contacts.contacts': ContactsContacts.contactsContacts,
  'contacts.importedContacts': ContactsImportedContacts.contactsImportedContacts,
  'contacts.blocked': ContactsBlocked.contactsBlocked,
  'contacts.blockedSlice': ContactsBlocked.contactsBlockedSlice,
  'messages.dialogs': MessagesDialogs.messagesDialogs,
  'messages.dialogsSlice': MessagesDialogs.messagesDialogsSlice,
  'messages.messages': MessagesMessages.messagesMessages,
  'messages.messagesSlice': MessagesMessages.messagesMessagesSlice,
  'messages.chats': MessagesChats.messagesChats,
  'messages.chatFull': MessagesChatFull.messagesChatFull,
  'messages.affectedHistory': MessagesAffectedHistory.messagesAffectedHistory,
  'inputMessagesFilterEmpty': MessagesFilter.inputMessagesFilterEmpty,
  'inputMessagesFilterPhotos': MessagesFilter.inputMessagesFilterPhotos,
  'inputMessagesFilterVideo': MessagesFilter.inputMessagesFilterVideo,
  'inputMessagesFilterPhotoVideo': MessagesFilter.inputMessagesFilterPhotoVideo,
  'inputMessagesFilterDocument': MessagesFilter.inputMessagesFilterDocument,
  'inputMessagesFilterUrl': MessagesFilter.inputMessagesFilterUrl,
  'inputMessagesFilterGif': MessagesFilter.inputMessagesFilterGif,
  'updateNewMessage': Update.updateNewMessage,
  'updateMessageID': Update.updateMessageID,
  'updateDeleteMessages': Update.updateDeleteMessages,
  'updateUserTyping': Update.updateUserTyping,
  'updateChatUserTyping': Update.updateChatUserTyping,
  'updateChatParticipants': Update.updateChatParticipants,
  'updateUserStatus': Update.updateUserStatus,
  'updateUserName': Update.updateUserName,
  'updates.state': UpdatesState.updatesState,
  'updates.differenceEmpty': UpdatesDifference.updatesDifferenceEmpty,
  'updates.difference': UpdatesDifference.updatesDifference,
  'updates.differenceSlice': UpdatesDifference.updatesDifferenceSlice,
  'updatesTooLong': Updates.updatesTooLong,
  'updateShortMessage': Updates.updateShortMessage,
  'updateShortChatMessage': Updates.updateShortChatMessage,
  'updateShort': Updates.updateShort,
  'updatesCombined': Updates.updatesCombined,
  'updates': Updates.updates,
  'photos.photos': PhotosPhotos.photosPhotos,
  'photos.photosSlice': PhotosPhotos.photosPhotosSlice,
  'photos.photo': PhotosPhoto.photosPhoto,
  'upload.file': UploadFile.uploadFile,
  'dcOption': DcOption.dcOption,
  'config': Config.config,
  'nearestDc': NearestDc.nearestDc,
  'help.appUpdate': HelpAppUpdate.helpAppUpdate,
  'help.noAppUpdate': HelpAppUpdate.helpNoAppUpdate,
  'help.inviteText': HelpInviteText.helpInviteText,
  'updateNewEncryptedMessage': Update.updateNewEncryptedMessage,
  'updateEncryptedChatTyping': Update.updateEncryptedChatTyping,
  'updateEncryption': Update.updateEncryption,
  'updateEncryptedMessagesRead': Update.updateEncryptedMessagesRead,
  'encryptedChatEmpty': EncryptedChat.encryptedChatEmpty,
  'encryptedChatWaiting': EncryptedChat.encryptedChatWaiting,
  'encryptedChatRequested': EncryptedChat.encryptedChatRequested,
  'encryptedChat': EncryptedChat.encryptedChat,
  'encryptedChatDiscarded': EncryptedChat.encryptedChatDiscarded,
  'inputEncryptedChat': InputEncryptedChat.inputEncryptedChat,
  'encryptedFileEmpty': EncryptedFile.encryptedFileEmpty,
  'encryptedFile': EncryptedFile.encryptedFile,
  'inputEncryptedFileEmpty': InputEncryptedFile.inputEncryptedFileEmpty,
  'inputEncryptedFileUploaded': InputEncryptedFile.inputEncryptedFileUploaded,
  'inputEncryptedFile': InputEncryptedFile.inputEncryptedFile,
  'inputEncryptedFileLocation': InputFileLocation.inputEncryptedFileLocation,
  'encryptedMessage': EncryptedMessage.encryptedMessage,
  'encryptedMessageService': EncryptedMessage.encryptedMessageService,
  'messages.dhConfigNotModified': MessagesDhConfig.messagesDhConfigNotModified,
  'messages.dhConfig': MessagesDhConfig.messagesDhConfig,
  'messages.sentEncryptedMessage': MessagesSentEncryptedMessage.messagesSentEncryptedMessage,
  'messages.sentEncryptedFile': MessagesSentEncryptedMessage.messagesSentEncryptedFile,
  'inputFileBig': InputFile.inputFileBig,
  'inputEncryptedFileBigUploaded': InputEncryptedFile.inputEncryptedFileBigUploaded,
  'updateChatParticipantAdd': Update.updateChatParticipantAdd,
  'updateChatParticipantDelete': Update.updateChatParticipantDelete,
  'updateDcOptions': Update.updateDcOptions,
  'inputMediaUploadedDocument': InputMedia.inputMediaUploadedDocument,
  'inputMediaDocument': InputMedia.inputMediaDocument,
  'messageMediaDocument': MessageMedia.messageMediaDocument,
  'inputDocumentEmpty': InputDocument.inputDocumentEmpty,
  'inputDocument': InputDocument.inputDocument,
  'inputDocumentFileLocation': InputFileLocation.inputDocumentFileLocation,
  'documentEmpty': Document.documentEmpty,
  'document': Document.document,
  'help.support': HelpSupport.helpSupport,
  'notifyPeer': NotifyPeer.notifyPeer,
  'notifyUsers': NotifyPeer.notifyUsers,
  'notifyChats': NotifyPeer.notifyChats,
  'updateNotifySettings': Update.updateNotifySettings,
  'sendMessageTypingAction': SendMessageAction.sendMessageTypingAction,
  'sendMessageCancelAction': SendMessageAction.sendMessageCancelAction,
  'sendMessageRecordVideoAction': SendMessageAction.sendMessageRecordVideoAction,
  'sendMessageUploadVideoAction': SendMessageAction.sendMessageUploadVideoAction,
  'sendMessageRecordAudioAction': SendMessageAction.sendMessageRecordAudioAction,
  'sendMessageUploadAudioAction': SendMessageAction.sendMessageUploadAudioAction,
  'sendMessageUploadPhotoAction': SendMessageAction.sendMessageUploadPhotoAction,
  'sendMessageUploadDocumentAction': SendMessageAction.sendMessageUploadDocumentAction,
  'sendMessageGeoLocationAction': SendMessageAction.sendMessageGeoLocationAction,
  'sendMessageChooseContactAction': SendMessageAction.sendMessageChooseContactAction,
  'contacts.found': ContactsFound.contactsFound,
  'updateServiceNotification': Update.updateServiceNotification,
  'userStatusRecently': UserStatus.userStatusRecently,
  'userStatusLastWeek': UserStatus.userStatusLastWeek,
  'userStatusLastMonth': UserStatus.userStatusLastMonth,
  'updatePrivacy': Update.updatePrivacy,
  'inputPrivacyKeyStatusTimestamp': InputPrivacyKey.inputPrivacyKeyStatusTimestamp,
  'privacyKeyStatusTimestamp': PrivacyKey.privacyKeyStatusTimestamp,
  'inputPrivacyValueAllowContacts': InputPrivacyRule.inputPrivacyValueAllowContacts,
  'inputPrivacyValueAllowAll': InputPrivacyRule.inputPrivacyValueAllowAll,
  'inputPrivacyValueAllowUsers': InputPrivacyRule.inputPrivacyValueAllowUsers,
  'inputPrivacyValueDisallowContacts': InputPrivacyRule.inputPrivacyValueDisallowContacts,
  'inputPrivacyValueDisallowAll': InputPrivacyRule.inputPrivacyValueDisallowAll,
  'inputPrivacyValueDisallowUsers': InputPrivacyRule.inputPrivacyValueDisallowUsers,
  'privacyValueAllowContacts': PrivacyRule.privacyValueAllowContacts,
  'privacyValueAllowAll': PrivacyRule.privacyValueAllowAll,
  'privacyValueAllowUsers': PrivacyRule.privacyValueAllowUsers,
  'privacyValueDisallowContacts': PrivacyRule.privacyValueDisallowContacts,
  'privacyValueDisallowAll': PrivacyRule.privacyValueDisallowAll,
  'privacyValueDisallowUsers': PrivacyRule.privacyValueDisallowUsers,
  'account.privacyRules': AccountPrivacyRules.accountPrivacyRules,
  'accountDaysTTL': AccountDaysTTL.accountDaysTTL,
  'updateUserPhone': Update.updateUserPhone,
  'documentAttributeImageSize': DocumentAttribute.documentAttributeImageSize,
  'documentAttributeAnimated': DocumentAttribute.documentAttributeAnimated,
  'documentAttributeSticker': DocumentAttribute.documentAttributeSticker,
  'documentAttributeVideo': DocumentAttribute.documentAttributeVideo,
  'documentAttributeAudio': DocumentAttribute.documentAttributeAudio,
  'documentAttributeFilename': DocumentAttribute.documentAttributeFilename,
  'messages.stickersNotModified': MessagesStickers.messagesStickersNotModified,
  'messages.stickers': MessagesStickers.messagesStickers,
  'stickerPack': StickerPack.stickerPack,
  'messages.allStickersNotModified': MessagesAllStickers.messagesAllStickersNotModified,
  'messages.allStickers': MessagesAllStickers.messagesAllStickers,
  'updateReadHistoryInbox': Update.updateReadHistoryInbox,
  'updateReadHistoryOutbox': Update.updateReadHistoryOutbox,
  'messages.affectedMessages': MessagesAffectedMessages.messagesAffectedMessages,
  'updateWebPage': Update.updateWebPage,
  'webPageEmpty': WebPage.webPageEmpty,
  'webPagePending': WebPage.webPagePending,
  'webPage': WebPage.webPage,
  'messageMediaWebPage': MessageMedia.messageMediaWebPage,
  'authorization': Authorization.authorization,
  'account.authorizations': AccountAuthorizations.accountAuthorizations,
  'account.password': AccountPassword.accountPassword,
  'account.passwordSettings': AccountPasswordSettings.accountPasswordSettings,
  'account.passwordInputSettings': AccountPasswordInputSettings.accountPasswordInputSettings,
  'auth.passwordRecovery': AuthPasswordRecovery.authPasswordRecovery,
  'inputMediaVenue': InputMedia.inputMediaVenue,
  'messageMediaVenue': MessageMedia.messageMediaVenue,
  'receivedNotifyMessage': ReceivedNotifyMessage.receivedNotifyMessage,
  'chatInviteExported': ExportedChatInvite.chatInviteExported,
  'chatInviteAlready': ChatInvite.chatInviteAlready,
  'chatInvite': ChatInvite.chatInvite,
  'messageActionChatJoinedByLink': MessageAction.messageActionChatJoinedByLink,
  'updateReadMessagesContents': Update.updateReadMessagesContents,
  'inputStickerSetEmpty': InputStickerSet.inputStickerSetEmpty,
  'inputStickerSetID': InputStickerSet.inputStickerSetID,
  'inputStickerSetShortName': InputStickerSet.inputStickerSetShortName,
  'stickerSet': StickerSet.stickerSet,
  'messages.stickerSet': MessagesStickerSet.messagesStickerSet,
  'user': User.user,
  'botCommand': BotCommand.botCommand,
  'botInfo': BotInfo.botInfo,
  'keyboardButton': KeyboardButton.keyboardButton,
  'keyboardButtonRow': KeyboardButtonRow.keyboardButtonRow,
  'replyKeyboardHide': ReplyMarkup.replyKeyboardHide,
  'replyKeyboardForceReply': ReplyMarkup.replyKeyboardForceReply,
  'replyKeyboardMarkup': ReplyMarkup.replyKeyboardMarkup,
  'inputPeerUser': InputPeer.inputPeerUser,
  'inputUser': InputUser.inputUser,
  'messageEntityUnknown': MessageEntity.messageEntityUnknown,
  'messageEntityMention': MessageEntity.messageEntityMention,
  'messageEntityHashtag': MessageEntity.messageEntityHashtag,
  'messageEntityBotCommand': MessageEntity.messageEntityBotCommand,
  'messageEntityUrl': MessageEntity.messageEntityUrl,
  'messageEntityEmail': MessageEntity.messageEntityEmail,
  'messageEntityBold': MessageEntity.messageEntityBold,
  'messageEntityItalic': MessageEntity.messageEntityItalic,
  'messageEntityCode': MessageEntity.messageEntityCode,
  'messageEntityPre': MessageEntity.messageEntityPre,
  'messageEntityTextUrl': MessageEntity.messageEntityTextUrl,
  'updateShortSentMessage': Updates.updateShortSentMessage,
  'inputChannelEmpty': InputChannel.inputChannelEmpty,
  'inputChannel': InputChannel.inputChannel,
  'peerChannel': Peer.peerChannel,
  'inputPeerChannel': InputPeer.inputPeerChannel,
  'channel': Chat.channel,
  'channelForbidden': Chat.channelForbidden,
  'contacts.resolvedPeer': ContactsResolvedPeer.contactsResolvedPeer,
  'channelFull': ChatFull.channelFull,
  'messageRange': MessageRange.messageRange,
  'messages.channelMessages': MessagesMessages.messagesChannelMessages,
  'messageActionChannelCreate': MessageAction.messageActionChannelCreate,
  'updateChannelTooLong': Update.updateChannelTooLong,
  'updateChannel': Update.updateChannel,
  'updateNewChannelMessage': Update.updateNewChannelMessage,
  'updateReadChannelInbox': Update.updateReadChannelInbox,
  'updateDeleteChannelMessages': Update.updateDeleteChannelMessages,
  'updateChannelMessageViews': Update.updateChannelMessageViews,
  'updates.channelDifferenceEmpty': UpdatesChannelDifference.updatesChannelDifferenceEmpty,
  'updates.channelDifferenceTooLong': UpdatesChannelDifference.updatesChannelDifferenceTooLong,
  'updates.channelDifference': UpdatesChannelDifference.updatesChannelDifference,
  'channelMessagesFilterEmpty': ChannelMessagesFilter.channelMessagesFilterEmpty,
  'channelMessagesFilter': ChannelMessagesFilter.channelMessagesFilter,
  'channelParticipant': ChannelParticipant.channelParticipant,
  'channelParticipantSelf': ChannelParticipant.channelParticipantSelf,
  'channelParticipantCreator': ChannelParticipant.channelParticipantCreator,
  'channelParticipantsRecent': ChannelParticipantsFilter.channelParticipantsRecent,
  'channelParticipantsAdmins': ChannelParticipantsFilter.channelParticipantsAdmins,
  'channelParticipantsKicked': ChannelParticipantsFilter.channelParticipantsKicked,
  'channels.channelParticipants': ChannelsChannelParticipants.channelsChannelParticipants,
  'channels.channelParticipant': ChannelsChannelParticipant.channelsChannelParticipant,
  'chatParticipantCreator': ChatParticipant.chatParticipantCreator,
  'chatParticipantAdmin': ChatParticipant.chatParticipantAdmin,
  'updateChatParticipantAdmin': Update.updateChatParticipantAdmin,
  'messageActionChatMigrateTo': MessageAction.messageActionChatMigrateTo,
  'messageActionChannelMigrateFrom': MessageAction.messageActionChannelMigrateFrom,
  'channelParticipantsBots': ChannelParticipantsFilter.channelParticipantsBots,
  'help.termsOfService': HelpTermsOfService.helpTermsOfService,
  'updateNewStickerSet': Update.updateNewStickerSet,
  'updateStickerSetsOrder': Update.updateStickerSetsOrder,
  'updateStickerSets': Update.updateStickerSets,
  'messages.savedGifsNotModified': MessagesSavedGifs.messagesSavedGifsNotModified,
  'messages.savedGifs': MessagesSavedGifs.messagesSavedGifs,
  'updateSavedGifs': Update.updateSavedGifs,
  'inputBotInlineMessageMediaAuto': InputBotInlineMessage.inputBotInlineMessageMediaAuto,
  'inputBotInlineMessageText': InputBotInlineMessage.inputBotInlineMessageText,
  'inputBotInlineResult': InputBotInlineResult.inputBotInlineResult,
  'botInlineMessageMediaAuto': BotInlineMessage.botInlineMessageMediaAuto,
  'botInlineMessageText': BotInlineMessage.botInlineMessageText,
  'botInlineResult': BotInlineResult.botInlineResult,
  'messages.botResults': MessagesBotResults.messagesBotResults,
  'updateBotInlineQuery': Update.updateBotInlineQuery,
  'updateBotInlineSend': Update.updateBotInlineSend,
  'inputMessagesFilterVoice': MessagesFilter.inputMessagesFilterVoice,
  'inputMessagesFilterMusic': MessagesFilter.inputMessagesFilterMusic,
  'inputPrivacyKeyChatInvite': InputPrivacyKey.inputPrivacyKeyChatInvite,
  'privacyKeyChatInvite': PrivacyKey.privacyKeyChatInvite,
  'exportedMessageLink': ExportedMessageLink.exportedMessageLink,
  'messageFwdHeader': MessageFwdHeader.messageFwdHeader,
  'updateEditChannelMessage': Update.updateEditChannelMessage,
  'messageActionPinMessage': MessageAction.messageActionPinMessage,
  'auth.codeTypeSms': AuthCodeType.authCodeTypeSms,
  'auth.codeTypeCall': AuthCodeType.authCodeTypeCall,
  'auth.codeTypeFlashCall': AuthCodeType.authCodeTypeFlashCall,
  'auth.sentCodeTypeApp': AuthSentCodeType.authSentCodeTypeApp,
  'auth.sentCodeTypeSms': AuthSentCodeType.authSentCodeTypeSms,
  'auth.sentCodeTypeCall': AuthSentCodeType.authSentCodeTypeCall,
  'auth.sentCodeTypeFlashCall': AuthSentCodeType.authSentCodeTypeFlashCall,
  'keyboardButtonUrl': KeyboardButton.keyboardButtonUrl,
  'keyboardButtonCallback': KeyboardButton.keyboardButtonCallback,
  'keyboardButtonRequestPhone': KeyboardButton.keyboardButtonRequestPhone,
  'keyboardButtonRequestGeoLocation': KeyboardButton.keyboardButtonRequestGeoLocation,
  'keyboardButtonSwitchInline': KeyboardButton.keyboardButtonSwitchInline,
  'replyInlineMarkup': ReplyMarkup.replyInlineMarkup,
  'messages.botCallbackAnswer': MessagesBotCallbackAnswer.messagesBotCallbackAnswer,
  'updateBotCallbackQuery': Update.updateBotCallbackQuery,
  'messages.messageEditData': MessagesMessageEditData.messagesMessageEditData,
  'updateEditMessage': Update.updateEditMessage,
  'inputBotInlineMessageMediaGeo': InputBotInlineMessage.inputBotInlineMessageMediaGeo,
  'inputBotInlineMessageMediaVenue': InputBotInlineMessage.inputBotInlineMessageMediaVenue,
  'inputBotInlineMessageMediaContact': InputBotInlineMessage.inputBotInlineMessageMediaContact,
  'botInlineMessageMediaGeo': BotInlineMessage.botInlineMessageMediaGeo,
  'botInlineMessageMediaVenue': BotInlineMessage.botInlineMessageMediaVenue,
  'botInlineMessageMediaContact': BotInlineMessage.botInlineMessageMediaContact,
  'inputBotInlineResultPhoto': InputBotInlineResult.inputBotInlineResultPhoto,
  'inputBotInlineResultDocument': InputBotInlineResult.inputBotInlineResultDocument,
  'botInlineMediaResult': BotInlineResult.botInlineMediaResult,
  'inputBotInlineMessageID': InputBotInlineMessageID.inputBotInlineMessageID,
  'updateInlineBotCallbackQuery': Update.updateInlineBotCallbackQuery,
  'inlineBotSwitchPM': InlineBotSwitchPM.inlineBotSwitchPM,
  'messages.peerDialogs': MessagesPeerDialogs.messagesPeerDialogs,
  'topPeer': TopPeer.topPeer,
  'topPeerCategoryBotsPM': TopPeerCategory.topPeerCategoryBotsPM,
  'topPeerCategoryBotsInline': TopPeerCategory.topPeerCategoryBotsInline,
  'topPeerCategoryCorrespondents': TopPeerCategory.topPeerCategoryCorrespondents,
  'topPeerCategoryGroups': TopPeerCategory.topPeerCategoryGroups,
  'topPeerCategoryChannels': TopPeerCategory.topPeerCategoryChannels,
  'topPeerCategoryPeers': TopPeerCategoryPeers.topPeerCategoryPeers,
  'contacts.topPeersNotModified': ContactsTopPeers.contactsTopPeersNotModified,
  'contacts.topPeers': ContactsTopPeers.contactsTopPeers,
  'messageEntityMentionName': MessageEntity.messageEntityMentionName,
  'inputMessageEntityMentionName': MessageEntity.inputMessageEntityMentionName,
  'inputMessagesFilterChatPhotos': MessagesFilter.inputMessagesFilterChatPhotos,
  'updateReadChannelOutbox': Update.updateReadChannelOutbox,
  'updateDraftMessage': Update.updateDraftMessage,
  'draftMessageEmpty': DraftMessage.draftMessageEmpty,
  'draftMessage': DraftMessage.draftMessage,
  'messageActionHistoryClear': MessageAction.messageActionHistoryClear,
  'messages.featuredStickersNotModified': MessagesFeaturedStickers.messagesFeaturedStickersNotModified,
  'messages.featuredStickers': MessagesFeaturedStickers.messagesFeaturedStickers,
  'updateReadFeaturedStickers': Update.updateReadFeaturedStickers,
  'messages.recentStickersNotModified': MessagesRecentStickers.messagesRecentStickersNotModified,
  'messages.recentStickers': MessagesRecentStickers.messagesRecentStickers,
  'updateRecentStickers': Update.updateRecentStickers,
  'messages.archivedStickers': MessagesArchivedStickers.messagesArchivedStickers,
  'messages.stickerSetInstallResultSuccess': MessagesStickerSetInstallResult.messagesStickerSetInstallResultSuccess,
  'messages.stickerSetInstallResultArchive': MessagesStickerSetInstallResult.messagesStickerSetInstallResultArchive,
  'stickerSetCovered': StickerSetCovered.stickerSetCovered,
  'updateConfig': Update.updateConfig,
  'updatePtsChanged': Update.updatePtsChanged,
  'inputMediaPhotoExternal': InputMedia.inputMediaPhotoExternal,
  'inputMediaDocumentExternal': InputMedia.inputMediaDocumentExternal,
  'stickerSetMultiCovered': StickerSetCovered.stickerSetMultiCovered,
  'maskCoords': MaskCoords.maskCoords,
  'documentAttributeHasStickers': DocumentAttribute.documentAttributeHasStickers,
  'inputStickeredMediaPhoto': InputStickeredMedia.inputStickeredMediaPhoto,
  'inputStickeredMediaDocument': InputStickeredMedia.inputStickeredMediaDocument,
  'game': Game.game,
  'inputBotInlineResultGame': InputBotInlineResult.inputBotInlineResultGame,
  'inputBotInlineMessageGame': InputBotInlineMessage.inputBotInlineMessageGame,
  'messageMediaGame': MessageMedia.messageMediaGame,
  'inputMediaGame': InputMedia.inputMediaGame,
  'inputGameID': InputGame.inputGameID,
  'inputGameShortName': InputGame.inputGameShortName,
  'keyboardButtonGame': KeyboardButton.keyboardButtonGame,
  'messageActionGameScore': MessageAction.messageActionGameScore,
  'highScore': HighScore.highScore,
  'messages.highScores': MessagesHighScores.messagesHighScores,
  'updates.differenceTooLong': UpdatesDifference.updatesDifferenceTooLong,
  'updateChannelWebPage': Update.updateChannelWebPage,
  'messages.chatsSlice': MessagesChats.messagesChatsSlice,
  'textEmpty': RichText.textEmpty,
  'textPlain': RichText.textPlain,
  'textBold': RichText.textBold,
  'textItalic': RichText.textItalic,
  'textUnderline': RichText.textUnderline,
  'textStrike': RichText.textStrike,
  'textFixed': RichText.textFixed,
  'textUrl': RichText.textUrl,
  'textEmail': RichText.textEmail,
  'textConcat': RichText.textConcat,
  'pageBlockUnsupported': PageBlock.pageBlockUnsupported,
  'pageBlockTitle': PageBlock.pageBlockTitle,
  'pageBlockSubtitle': PageBlock.pageBlockSubtitle,
  'pageBlockAuthorDate': PageBlock.pageBlockAuthorDate,
  'pageBlockHeader': PageBlock.pageBlockHeader,
  'pageBlockSubheader': PageBlock.pageBlockSubheader,
  'pageBlockParagraph': PageBlock.pageBlockParagraph,
  'pageBlockPreformatted': PageBlock.pageBlockPreformatted,
  'pageBlockFooter': PageBlock.pageBlockFooter,
  'pageBlockDivider': PageBlock.pageBlockDivider,
  'pageBlockAnchor': PageBlock.pageBlockAnchor,
  'pageBlockList': PageBlock.pageBlockList,
  'pageBlockBlockquote': PageBlock.pageBlockBlockquote,
  'pageBlockPullquote': PageBlock.pageBlockPullquote,
  'pageBlockPhoto': PageBlock.pageBlockPhoto,
  'pageBlockVideo': PageBlock.pageBlockVideo,
  'pageBlockCover': PageBlock.pageBlockCover,
  'pageBlockEmbed': PageBlock.pageBlockEmbed,
  'pageBlockEmbedPost': PageBlock.pageBlockEmbedPost,
  'pageBlockCollage': PageBlock.pageBlockCollage,
  'pageBlockSlideshow': PageBlock.pageBlockSlideshow,
  'webPageNotModified': WebPage.webPageNotModified,
  'inputPrivacyKeyPhoneCall': InputPrivacyKey.inputPrivacyKeyPhoneCall,
  'privacyKeyPhoneCall': PrivacyKey.privacyKeyPhoneCall,
  'sendMessageGamePlayAction': SendMessageAction.sendMessageGamePlayAction,
  'phoneCallDiscardReasonMissed': PhoneCallDiscardReason.phoneCallDiscardReasonMissed,
  'phoneCallDiscardReasonDisconnect': PhoneCallDiscardReason.phoneCallDiscardReasonDisconnect,
  'phoneCallDiscardReasonHangup': PhoneCallDiscardReason.phoneCallDiscardReasonHangup,
  'phoneCallDiscardReasonBusy': PhoneCallDiscardReason.phoneCallDiscardReasonBusy,
  'updateDialogPinned': Update.updateDialogPinned,
  'updatePinnedDialogs': Update.updatePinnedDialogs,
  'dataJSON': DataJSON.dataJSON,
  'updateBotWebhookJSON': Update.updateBotWebhookJSON,
  'updateBotWebhookJSONQuery': Update.updateBotWebhookJSONQuery,
  'labeledPrice': LabeledPrice.labeledPrice,
  'invoice': Invoice.invoice,
  'inputMediaInvoice': InputMedia.inputMediaInvoice,
  'paymentCharge': PaymentCharge.paymentCharge,
  'messageActionPaymentSentMe': MessageAction.messageActionPaymentSentMe,
  'messageMediaInvoice': MessageMedia.messageMediaInvoice,
  'postAddress': PostAddress.postAddress,
  'paymentRequestedInfo': PaymentRequestedInfo.paymentRequestedInfo,
  'keyboardButtonBuy': KeyboardButton.keyboardButtonBuy,
  'messageActionPaymentSent': MessageAction.messageActionPaymentSent,
  'paymentSavedCredentialsCard': PaymentSavedCredentials.paymentSavedCredentialsCard,
  'webDocument': WebDocument.webDocument,
  'inputWebDocument': InputWebDocument.inputWebDocument,
  'inputWebFileLocation': InputWebFileLocation.inputWebFileLocation,
  'upload.webFile': UploadWebFile.uploadWebFile,
  'payments.paymentForm': PaymentsPaymentForm.paymentsPaymentForm,
  'payments.validatedRequestedInfo': PaymentsValidatedRequestedInfo.paymentsValidatedRequestedInfo,
  'payments.paymentResult': PaymentsPaymentResult.paymentsPaymentResult,
  'payments.paymentReceipt': PaymentsPaymentReceipt.paymentsPaymentReceipt,
  'payments.savedInfo': PaymentsSavedInfo.paymentsSavedInfo,
  'inputPaymentCredentialsSaved': InputPaymentCredentials.inputPaymentCredentialsSaved,
  'inputPaymentCredentials': InputPaymentCredentials.inputPaymentCredentials,
  'account.tmpPassword': AccountTmpPassword.accountTmpPassword,
  'shippingOption': ShippingOption.shippingOption,
  'updateBotShippingQuery': Update.updateBotShippingQuery,
  'updateBotPrecheckoutQuery': Update.updateBotPrecheckoutQuery,
  'inputStickerSetItem': InputStickerSetItem.inputStickerSetItem,
  'updatePhoneCall': Update.updatePhoneCall,
  'inputPhoneCall': InputPhoneCall.inputPhoneCall,
  'phoneCallEmpty': PhoneCall.phoneCallEmpty,
  'phoneCallWaiting': PhoneCall.phoneCallWaiting,
  'phoneCallRequested': PhoneCall.phoneCallRequested,
  'phoneCallAccepted': PhoneCall.phoneCallAccepted,
  'phoneCall': PhoneCall.phoneCall,
  'phoneCallDiscarded': PhoneCall.phoneCallDiscarded,
  'phoneConnection': PhoneConnection.phoneConnection,
  'phoneCallProtocol': PhoneCallProtocol.phoneCallProtocol,
  'phone.phoneCall': PhonePhoneCall.phonePhoneCall,
  'inputMessagesFilterPhoneCalls': MessagesFilter.inputMessagesFilterPhoneCalls,
  'messageActionPhoneCall': MessageAction.messageActionPhoneCall,
  'inputMessagesFilterRoundVoice': MessagesFilter.inputMessagesFilterRoundVoice,
  'inputMessagesFilterRoundVideo': MessagesFilter.inputMessagesFilterRoundVideo,
  'sendMessageRecordRoundAction': SendMessageAction.sendMessageRecordRoundAction,
  'sendMessageUploadRoundAction': SendMessageAction.sendMessageUploadRoundAction,
  'upload.fileCdnRedirect': UploadFile.uploadFileCdnRedirect,
  'upload.cdnFileReuploadNeeded': UploadCdnFile.uploadCdnFileReuploadNeeded,
  'upload.cdnFile': UploadCdnFile.uploadCdnFile,
  'cdnPublicKey': CdnPublicKey.cdnPublicKey,
  'cdnConfig': CdnConfig.cdnConfig,
  'pageBlockChannel': PageBlock.pageBlockChannel,
  'langPackString': LangPackString.langPackString,
  'langPackStringPluralized': LangPackString.langPackStringPluralized,
  'langPackStringDeleted': LangPackString.langPackStringDeleted,
  'langPackDifference': LangPackDifference.langPackDifference,
  'langPackLanguage': LangPackLanguage.langPackLanguage,
  'updateLangPackTooLong': Update.updateLangPackTooLong,
  'updateLangPack': Update.updateLangPack,
  'channelParticipantAdmin': ChannelParticipant.channelParticipantAdmin,
  'channelParticipantBanned': ChannelParticipant.channelParticipantBanned,
  'channelParticipantsBanned': ChannelParticipantsFilter.channelParticipantsBanned,
  'channelParticipantsSearch': ChannelParticipantsFilter.channelParticipantsSearch,
  'channelAdminLogEventActionChangeTitle': ChannelAdminLogEventAction.channelAdminLogEventActionChangeTitle,
  'channelAdminLogEventActionChangeAbout': ChannelAdminLogEventAction.channelAdminLogEventActionChangeAbout,
  'channelAdminLogEventActionChangeUsername': ChannelAdminLogEventAction.channelAdminLogEventActionChangeUsername,
  'channelAdminLogEventActionChangePhoto': ChannelAdminLogEventAction.channelAdminLogEventActionChangePhoto,
  'channelAdminLogEventActionToggleInvites': ChannelAdminLogEventAction.channelAdminLogEventActionToggleInvites,
  'channelAdminLogEventActionToggleSignatures': ChannelAdminLogEventAction.channelAdminLogEventActionToggleSignatures,
  'channelAdminLogEventActionUpdatePinned': ChannelAdminLogEventAction.channelAdminLogEventActionUpdatePinned,
  'channelAdminLogEventActionEditMessage': ChannelAdminLogEventAction.channelAdminLogEventActionEditMessage,
  'channelAdminLogEventActionDeleteMessage': ChannelAdminLogEventAction.channelAdminLogEventActionDeleteMessage,
  'channelAdminLogEventActionParticipantJoin': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantJoin,
  'channelAdminLogEventActionParticipantLeave': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantLeave,
  'channelAdminLogEventActionParticipantInvite': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantInvite,
  'channelAdminLogEventActionParticipantToggleBan': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantToggleBan,
  'channelAdminLogEventActionParticipantToggleAdmin': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantToggleAdmin,
  'channelAdminLogEvent': ChannelAdminLogEvent.channelAdminLogEvent,
  'channels.adminLogResults': ChannelsAdminLogResults.channelsAdminLogResults,
  'channelAdminLogEventsFilter': ChannelAdminLogEventsFilter.channelAdminLogEventsFilter,
  'topPeerCategoryPhoneCalls': TopPeerCategory.topPeerCategoryPhoneCalls,
  'pageBlockAudio': PageBlock.pageBlockAudio,
  'popularContact': PopularContact.popularContact,
  'messageActionScreenshotTaken': MessageAction.messageActionScreenshotTaken,
  'messages.favedStickersNotModified': MessagesFavedStickers.messagesFavedStickersNotModified,
  'messages.favedStickers': MessagesFavedStickers.messagesFavedStickers,
  'updateFavedStickers': Update.updateFavedStickers,
  'updateChannelReadMessagesContents': Update.updateChannelReadMessagesContents,
  'inputMessagesFilterMyMentions': MessagesFilter.inputMessagesFilterMyMentions,
  'updateContactsReset': Update.updateContactsReset,
  'channelAdminLogEventActionChangeStickerSet': ChannelAdminLogEventAction.channelAdminLogEventActionChangeStickerSet,
  'messageActionCustomAction': MessageAction.messageActionCustomAction,
  'inputPaymentCredentialsApplePay': InputPaymentCredentials.inputPaymentCredentialsApplePay,
  'inputMessagesFilterGeo': MessagesFilter.inputMessagesFilterGeo,
  'inputMessagesFilterContacts': MessagesFilter.inputMessagesFilterContacts,
  'updateChannelAvailableMessages': Update.updateChannelAvailableMessages,
  'channelAdminLogEventActionTogglePreHistoryHidden': ChannelAdminLogEventAction.channelAdminLogEventActionTogglePreHistoryHidden,
  'inputMediaGeoLive': InputMedia.inputMediaGeoLive,
  'messageMediaGeoLive': MessageMedia.messageMediaGeoLive,
  'recentMeUrlUnknown': RecentMeUrl.recentMeUrlUnknown,
  'recentMeUrlUser': RecentMeUrl.recentMeUrlUser,
  'recentMeUrlChat': RecentMeUrl.recentMeUrlChat,
  'recentMeUrlChatInvite': RecentMeUrl.recentMeUrlChatInvite,
  'recentMeUrlStickerSet': RecentMeUrl.recentMeUrlStickerSet,
  'help.recentMeUrls': HelpRecentMeUrls.helpRecentMeUrls,
  'channels.channelParticipantsNotModified': ChannelsChannelParticipants.channelsChannelParticipantsNotModified,
  'messages.messagesNotModified': MessagesMessages.messagesMessagesNotModified,
  'inputSingleMedia': InputSingleMedia.inputSingleMedia,
  'webAuthorization': WebAuthorization.webAuthorization,
  'account.webAuthorizations': AccountWebAuthorizations.accountWebAuthorizations,
  'inputMessageID': InputMessage.inputMessageID,
  'inputMessageReplyTo': InputMessage.inputMessageReplyTo,
  'inputMessagePinned': InputMessage.inputMessagePinned,
  'messageEntityPhone': MessageEntity.messageEntityPhone,
  'messageEntityCashtag': MessageEntity.messageEntityCashtag,
  'messageActionBotAllowed': MessageAction.messageActionBotAllowed,
  'inputDialogPeer': InputDialogPeer.inputDialogPeer,
  'dialogPeer': DialogPeer.dialogPeer,
  'messages.foundStickerSetsNotModified': MessagesFoundStickerSets.messagesFoundStickerSetsNotModified,
  'messages.foundStickerSets': MessagesFoundStickerSets.messagesFoundStickerSets,
  'fileHash': FileHash.fileHash,
  'webDocumentNoProxy': WebDocument.webDocumentNoProxy,
  'inputClientProxy': InputClientProxy.inputClientProxy,
  'help.termsOfServiceUpdateEmpty': HelpTermsOfServiceUpdate.helpTermsOfServiceUpdateEmpty,
  'help.termsOfServiceUpdate': HelpTermsOfServiceUpdate.helpTermsOfServiceUpdate,
  'inputSecureFileUploaded': InputSecureFile.inputSecureFileUploaded,
  'inputSecureFile': InputSecureFile.inputSecureFile,
  'inputSecureFileLocation': InputFileLocation.inputSecureFileLocation,
  'secureFileEmpty': SecureFile.secureFileEmpty,
  'secureFile': SecureFile.secureFile,
  'secureData': SecureData.secureData,
  'securePlainPhone': SecurePlainData.securePlainPhone,
  'securePlainEmail': SecurePlainData.securePlainEmail,
  'secureValueTypePersonalDetails': SecureValueType.secureValueTypePersonalDetails,
  'secureValueTypePassport': SecureValueType.secureValueTypePassport,
  'secureValueTypeDriverLicense': SecureValueType.secureValueTypeDriverLicense,
  'secureValueTypeIdentityCard': SecureValueType.secureValueTypeIdentityCard,
  'secureValueTypeInternalPassport': SecureValueType.secureValueTypeInternalPassport,
  'secureValueTypeAddress': SecureValueType.secureValueTypeAddress,
  'secureValueTypeUtilityBill': SecureValueType.secureValueTypeUtilityBill,
  'secureValueTypeBankStatement': SecureValueType.secureValueTypeBankStatement,
  'secureValueTypeRentalAgreement': SecureValueType.secureValueTypeRentalAgreement,
  'secureValueTypePassportRegistration': SecureValueType.secureValueTypePassportRegistration,
  'secureValueTypeTemporaryRegistration': SecureValueType.secureValueTypeTemporaryRegistration,
  'secureValueTypePhone': SecureValueType.secureValueTypePhone,
  'secureValueTypeEmail': SecureValueType.secureValueTypeEmail,
  'secureValue': SecureValue.secureValue,
  'inputSecureValue': InputSecureValue.inputSecureValue,
  'secureValueHash': SecureValueHash.secureValueHash,
  'secureValueErrorData': SecureValueError.secureValueErrorData,
  'secureValueErrorFrontSide': SecureValueError.secureValueErrorFrontSide,
  'secureValueErrorReverseSide': SecureValueError.secureValueErrorReverseSide,
  'secureValueErrorSelfie': SecureValueError.secureValueErrorSelfie,
  'secureValueErrorFile': SecureValueError.secureValueErrorFile,
  'secureValueErrorFiles': SecureValueError.secureValueErrorFiles,
  'secureCredentialsEncrypted': SecureCredentialsEncrypted.secureCredentialsEncrypted,
  'account.authorizationForm': AccountAuthorizationForm.accountAuthorizationForm,
  'account.sentEmailCode': AccountSentEmailCode.accountSentEmailCode,
  'messageActionSecureValuesSentMe': MessageAction.messageActionSecureValuesSentMe,
  'messageActionSecureValuesSent': MessageAction.messageActionSecureValuesSent,
  'help.deepLinkInfoEmpty': HelpDeepLinkInfo.helpDeepLinkInfoEmpty,
  'help.deepLinkInfo': HelpDeepLinkInfo.helpDeepLinkInfo,
  'savedPhoneContact': SavedContact.savedPhoneContact,
  'account.takeout': AccountTakeout.accountTakeout,
  'inputTakeoutFileLocation': InputFileLocation.inputTakeoutFileLocation,
  'updateDialogUnreadMark': Update.updateDialogUnreadMark,
  'messages.dialogsNotModified': MessagesDialogs.messagesDialogsNotModified,
  'inputWebFileGeoPointLocation': InputWebFileLocation.inputWebFileGeoPointLocation,
  'contacts.topPeersDisabled': ContactsTopPeers.contactsTopPeersDisabled,
  'inputReportReasonCopyright': ReportReason.inputReportReasonCopyright,
  'passwordKdfAlgoUnknown': PasswordKdfAlgo.passwordKdfAlgoUnknown,
  'securePasswordKdfAlgoUnknown': SecurePasswordKdfAlgo.securePasswordKdfAlgoUnknown,
  'securePasswordKdfAlgoPBKDF2HMACSHA512iter100000': SecurePasswordKdfAlgo.securePasswordKdfAlgoPBKDF2HMACSHA512iter100000,
  'securePasswordKdfAlgoSHA512': SecurePasswordKdfAlgo.securePasswordKdfAlgoSHA512,
  'secureSecretSettings': SecureSecretSettings.secureSecretSettings,
  'passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow': PasswordKdfAlgo.passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow,
  'inputCheckPasswordEmpty': InputCheckPasswordSRP.inputCheckPasswordEmpty,
  'inputCheckPasswordSRP': InputCheckPasswordSRP.inputCheckPasswordSRP,
  'secureValueError': SecureValueError.secureValueError,
  'secureValueErrorTranslationFile': SecureValueError.secureValueErrorTranslationFile,
  'secureValueErrorTranslationFiles': SecureValueError.secureValueErrorTranslationFiles,
  'secureRequiredType': SecureRequiredType.secureRequiredType,
  'secureRequiredTypeOneOf': SecureRequiredType.secureRequiredTypeOneOf,
  'help.passportConfigNotModified': HelpPassportConfig.helpPassportConfigNotModified,
  'help.passportConfig': HelpPassportConfig.helpPassportConfig,
  'inputAppEvent': InputAppEvent.inputAppEvent,
  'jsonObjectValue': JSONObjectValue.jsonObjectValue,
  'jsonNull': JSONValue.jsonNull,
  'jsonBool': JSONValue.jsonBool,
  'jsonNumber': JSONValue.jsonNumber,
  'jsonString': JSONValue.jsonString,
  'jsonArray': JSONValue.jsonArray,
  'jsonObject': JSONValue.jsonObject,
  'inputNotifyBroadcasts': InputNotifyPeer.inputNotifyBroadcasts,
  'notifyBroadcasts': NotifyPeer.notifyBroadcasts,
  'textSubscript': RichText.textSubscript,
  'textSuperscript': RichText.textSuperscript,
  'textMarked': RichText.textMarked,
  'textPhone': RichText.textPhone,
  'textImage': RichText.textImage,
  'pageBlockKicker': PageBlock.pageBlockKicker,
  'pageTableCell': PageTableCell.pageTableCell,
  'pageTableRow': PageTableRow.pageTableRow,
  'pageBlockTable': PageBlock.pageBlockTable,
  'pageCaption': PageCaption.pageCaption,
  'pageListItemText': PageListItem.pageListItemText,
  'pageListItemBlocks': PageListItem.pageListItemBlocks,
  'pageListOrderedItemText': PageListOrderedItem.pageListOrderedItemText,
  'pageListOrderedItemBlocks': PageListOrderedItem.pageListOrderedItemBlocks,
  'pageBlockOrderedList': PageBlock.pageBlockOrderedList,
  'pageBlockDetails': PageBlock.pageBlockDetails,
  'pageRelatedArticle': PageRelatedArticle.pageRelatedArticle,
  'pageBlockRelatedArticles': PageBlock.pageBlockRelatedArticles,
  'pageBlockMap': PageBlock.pageBlockMap,
  'page': Page.page,
  'inputPrivacyKeyPhoneP2P': InputPrivacyKey.inputPrivacyKeyPhoneP2P,
  'privacyKeyPhoneP2P': PrivacyKey.privacyKeyPhoneP2P,
  'textAnchor': RichText.textAnchor,
  'help.supportName': HelpSupportName.helpSupportName,
  'help.userInfoEmpty': HelpUserInfo.helpUserInfoEmpty,
  'help.userInfo': HelpUserInfo.helpUserInfo,
  'messageActionContactSignUp': MessageAction.messageActionContactSignUp,
  'updateMessagePoll': Update.updateMessagePoll,
  'pollAnswer': PollAnswer.pollAnswer,
  'poll': Poll.poll,
  'pollAnswerVoters': PollAnswerVoters.pollAnswerVoters,
  'pollResults': PollResults.pollResults,
  'inputMediaPoll': InputMedia.inputMediaPoll,
  'messageMediaPoll': MessageMedia.messageMediaPoll,
  'chatOnlines': ChatOnlines.chatOnlines,
  'statsURL': StatsURL.statsURL,
  'photoStrippedSize': PhotoSize.photoStrippedSize,
  'chatAdminRights': ChatAdminRights.chatAdminRights,
  'chatBannedRights': ChatBannedRights.chatBannedRights,
  'updateChatDefaultBannedRights': Update.updateChatDefaultBannedRights,
  'inputWallPaper': InputWallPaper.inputWallPaper,
  'inputWallPaperSlug': InputWallPaper.inputWallPaperSlug,
  'channelParticipantsContacts': ChannelParticipantsFilter.channelParticipantsContacts,
  'channelAdminLogEventActionDefaultBannedRights': ChannelAdminLogEventAction.channelAdminLogEventActionDefaultBannedRights,
  'channelAdminLogEventActionStopPoll': ChannelAdminLogEventAction.channelAdminLogEventActionStopPoll,
  'account.wallPapersNotModified': AccountWallPapers.accountWallPapersNotModified,
  'account.wallPapers': AccountWallPapers.accountWallPapers,
  'codeSettings': CodeSettings.codeSettings,
  'wallPaperSettings': WallPaperSettings.wallPaperSettings,
  'autoDownloadSettings': AutoDownloadSettings.autoDownloadSettings,
  'account.autoDownloadSettings': AccountAutoDownloadSettings.accountAutoDownloadSettings,
  'emojiKeyword': EmojiKeyword.emojiKeyword,
  'emojiKeywordDeleted': EmojiKeyword.emojiKeywordDeleted,
  'emojiKeywordsDifference': EmojiKeywordsDifference.emojiKeywordsDifference,
  'emojiURL': EmojiURL.emojiURL,
  'emojiLanguage': EmojiLanguage.emojiLanguage,
  'inputPrivacyKeyForwards': InputPrivacyKey.inputPrivacyKeyForwards,
  'privacyKeyForwards': PrivacyKey.privacyKeyForwards,
  'inputPrivacyKeyProfilePhoto': InputPrivacyKey.inputPrivacyKeyProfilePhoto,
  'privacyKeyProfilePhoto': PrivacyKey.privacyKeyProfilePhoto,
  'inputPhotoFileLocation': InputFileLocation.inputPhotoFileLocation,
  'inputPhotoLegacyFileLocation': InputFileLocation.inputPhotoLegacyFileLocation,
  'inputPeerPhotoFileLocation': InputFileLocation.inputPeerPhotoFileLocation,
  'inputStickerSetThumb': InputFileLocation.inputStickerSetThumb,
  'folder': Folder.folder,
  'dialogFolder': Dialog.dialogFolder,
  'inputDialogPeerFolder': InputDialogPeer.inputDialogPeerFolder,
  'dialogPeerFolder': DialogPeer.dialogPeerFolder,
  'inputFolderPeer': InputFolderPeer.inputFolderPeer,
  'folderPeer': FolderPeer.folderPeer,
  'updateFolderPeers': Update.updateFolderPeers,
  'inputUserFromMessage': InputUser.inputUserFromMessage,
  'inputChannelFromMessage': InputChannel.inputChannelFromMessage,
  'inputPeerUserFromMessage': InputPeer.inputPeerUserFromMessage,
  'inputPeerChannelFromMessage': InputPeer.inputPeerChannelFromMessage,
  'inputPrivacyKeyPhoneNumber': InputPrivacyKey.inputPrivacyKeyPhoneNumber,
  'privacyKeyPhoneNumber': PrivacyKey.privacyKeyPhoneNumber,
  'topPeerCategoryForwardUsers': TopPeerCategory.topPeerCategoryForwardUsers,
  'topPeerCategoryForwardChats': TopPeerCategory.topPeerCategoryForwardChats,
  'channelAdminLogEventActionChangeLinkedChat': ChannelAdminLogEventAction.channelAdminLogEventActionChangeLinkedChat,
  'messages.searchCounter': MessagesSearchCounter.messagesSearchCounter,
  'keyboardButtonUrlAuth': KeyboardButton.keyboardButtonUrlAuth,
  'inputKeyboardButtonUrlAuth': KeyboardButton.inputKeyboardButtonUrlAuth,
  'urlAuthResultRequest': UrlAuthResult.urlAuthResultRequest,
  'urlAuthResultAccepted': UrlAuthResult.urlAuthResultAccepted,
  'urlAuthResultDefault': UrlAuthResult.urlAuthResultDefault,
  'inputPrivacyValueAllowChatParticipants': InputPrivacyRule.inputPrivacyValueAllowChatParticipants,
  'inputPrivacyValueDisallowChatParticipants': InputPrivacyRule.inputPrivacyValueDisallowChatParticipants,
  'privacyValueAllowChatParticipants': PrivacyRule.privacyValueAllowChatParticipants,
  'privacyValueDisallowChatParticipants': PrivacyRule.privacyValueDisallowChatParticipants,
  'messageEntityUnderline': MessageEntity.messageEntityUnderline,
  'messageEntityStrike': MessageEntity.messageEntityStrike,
  'messageEntityBlockquote': MessageEntity.messageEntityBlockquote,
  'updatePeerSettings': Update.updatePeerSettings,
  'channelLocationEmpty': ChannelLocation.channelLocationEmpty,
  'channelLocation': ChannelLocation.channelLocation,
  'peerLocated': PeerLocated.peerLocated,
  'updatePeerLocated': Update.updatePeerLocated,
  'channelAdminLogEventActionChangeLocation': ChannelAdminLogEventAction.channelAdminLogEventActionChangeLocation,
  'inputReportReasonGeoIrrelevant': ReportReason.inputReportReasonGeoIrrelevant,
  'channelAdminLogEventActionToggleSlowMode': ChannelAdminLogEventAction.channelAdminLogEventActionToggleSlowMode,
  'auth.authorizationSignUpRequired': AuthAuthorization.authAuthorizationSignUpRequired,
  'payments.paymentVerificationNeeded': PaymentsPaymentResult.paymentsPaymentVerificationNeeded,
  'inputStickerSetAnimatedEmoji': InputStickerSet.inputStickerSetAnimatedEmoji,
  'updateNewScheduledMessage': Update.updateNewScheduledMessage,
  'updateDeleteScheduledMessages': Update.updateDeleteScheduledMessages,
  'restrictionReason': RestrictionReason.restrictionReason,
  'inputTheme': InputTheme.inputTheme,
  'inputThemeSlug': InputTheme.inputThemeSlug,
  'theme': Theme.theme,
  'account.themesNotModified': AccountThemes.accountThemesNotModified,
  'account.themes': AccountThemes.accountThemes,
  'updateTheme': Update.updateTheme,
  'inputPrivacyKeyAddedByPhone': InputPrivacyKey.inputPrivacyKeyAddedByPhone,
  'privacyKeyAddedByPhone': PrivacyKey.privacyKeyAddedByPhone,
  'updateGeoLiveViewed': Update.updateGeoLiveViewed,
  'updateLoginToken': Update.updateLoginToken,
  'auth.loginToken': AuthLoginToken.authLoginToken,
  'auth.loginTokenMigrateTo': AuthLoginToken.authLoginTokenMigrateTo,
  'auth.loginTokenSuccess': AuthLoginToken.authLoginTokenSuccess,
  'account.contentSettings': AccountContentSettings.accountContentSettings,
  'messages.inactiveChats': MessagesInactiveChats.messagesInactiveChats,
  'baseThemeClassic': BaseTheme.baseThemeClassic,
  'baseThemeDay': BaseTheme.baseThemeDay,
  'baseThemeNight': BaseTheme.baseThemeNight,
  'baseThemeTinted': BaseTheme.baseThemeTinted,
  'baseThemeArctic': BaseTheme.baseThemeArctic,
  'inputWallPaperNoFile': InputWallPaper.inputWallPaperNoFile,
  'wallPaperNoFile': WallPaper.wallPaperNoFile,
  'inputThemeSettings': InputThemeSettings.inputThemeSettings,
  'themeSettings': ThemeSettings.themeSettings,
  'webPageAttributeTheme': WebPageAttribute.webPageAttributeTheme,
  'updateMessagePollVote': Update.updateMessagePollVote,
  'messageUserVote': MessageUserVote.messageUserVote,
  'messageUserVoteInputOption': MessageUserVote.messageUserVoteInputOption,
  'messageUserVoteMultiple': MessageUserVote.messageUserVoteMultiple,
  'messages.votesList': MessagesVotesList.messagesVotesList,
  'keyboardButtonRequestPoll': KeyboardButton.keyboardButtonRequestPoll,
  'messageEntityBankCard': MessageEntity.messageEntityBankCard,
  'bankCardOpenUrl': BankCardOpenUrl.bankCardOpenUrl,
  'payments.bankCardData': PaymentsBankCardData.paymentsBankCardData,
  'peerSelfLocated': PeerLocated.peerSelfLocated,
  'dialogFilter': DialogFilter.dialogFilter,
  'dialogFilterSuggested': DialogFilterSuggested.dialogFilterSuggested,
  'updateDialogFilter': Update.updateDialogFilter,
  'updateDialogFilterOrder': Update.updateDialogFilterOrder,
  'updateDialogFilters': Update.updateDialogFilters,
  'statsDateRangeDays': StatsDateRangeDays.statsDateRangeDays,
  'statsAbsValueAndPrev': StatsAbsValueAndPrev.statsAbsValueAndPrev,
  'statsPercentValue': StatsPercentValue.statsPercentValue,
  'statsGraphAsync': StatsGraph.statsGraphAsync,
  'statsGraphError': StatsGraph.statsGraphError,
  'statsGraph': StatsGraph.statsGraph,
  'messageInteractionCounters': MessageInteractionCounters.messageInteractionCounters,
  'stats.broadcastStats': StatsBroadcastStats.statsBroadcastStats,
  'inputMediaDice': InputMedia.inputMediaDice,
  'messageMediaDice': MessageMedia.messageMediaDice,
  'inputStickerSetDice': InputStickerSet.inputStickerSetDice,
  'help.promoDataEmpty': HelpPromoData.helpPromoDataEmpty,
  'help.promoData': HelpPromoData.helpPromoData,
  'videoSize': VideoSize.videoSize,
  'updatePhoneCallSignalingData': Update.updatePhoneCallSignalingData,
  'chatInvitePeek': ChatInvite.chatInvitePeek,
  'statsGroupTopPoster': StatsGroupTopPoster.statsGroupTopPoster,
  'statsGroupTopAdmin': StatsGroupTopAdmin.statsGroupTopAdmin,
  'statsGroupTopInviter': StatsGroupTopInviter.statsGroupTopInviter,
  'stats.megagroupStats': StatsMegagroupStats.statsMegagroupStats,
  'globalPrivacySettings': GlobalPrivacySettings.globalPrivacySettings,
  'phoneConnectionWebrtc': PhoneConnection.phoneConnectionWebrtc,
  'help.countryCode': HelpCountryCode.helpCountryCode,
  'help.country': HelpCountry.helpCountry,
  'help.countriesListNotModified': HelpCountriesList.helpCountriesListNotModified,
  'help.countriesList': HelpCountriesList.helpCountriesList,
  'messageViews': MessageViews.messageViews,
  'updateChannelMessageForwards': Update.updateChannelMessageForwards,
  'photoSizeProgressive': PhotoSize.photoSizeProgressive,
  'messages.messageViews': MessagesMessageViews.messagesMessageViews,
  'updateReadChannelDiscussionInbox': Update.updateReadChannelDiscussionInbox,
  'updateReadChannelDiscussionOutbox': Update.updateReadChannelDiscussionOutbox,
  'messages.discussionMessage': MessagesDiscussionMessage.messagesDiscussionMessage,
  'messageReplyHeader': MessageReplyHeader.messageReplyHeader,
  'messageReplies': MessageReplies.messageReplies,
  'updatePeerBlocked': Update.updatePeerBlocked,
  'peerBlocked': PeerBlocked.peerBlocked,
  'updateChannelUserTyping': Update.updateChannelUserTyping,
  'inputMessageCallbackQuery': InputMessage.inputMessageCallbackQuery,
  'channelParticipantLeft': ChannelParticipant.channelParticipantLeft,
  'channelParticipantsMentions': ChannelParticipantsFilter.channelParticipantsMentions,
  'updatePinnedMessages': Update.updatePinnedMessages,
  'updatePinnedChannelMessages': Update.updatePinnedChannelMessages,
  'inputMessagesFilterPinned': MessagesFilter.inputMessagesFilterPinned,
  'stats.messageStats': StatsMessageStats.statsMessageStats,
  'messageActionGeoProximityReached': MessageAction.messageActionGeoProximityReached,
  'photoPathSize': PhotoSize.photoPathSize,
  'speakingInGroupCallAction': SendMessageAction.speakingInGroupCallAction,
  'groupCallDiscarded': GroupCall.groupCallDiscarded,
  'groupCall': GroupCall.groupCall,
  'inputGroupCall': InputGroupCall.inputGroupCall,
  'messageActionGroupCall': MessageAction.messageActionGroupCall,
  'messageActionInviteToGroupCall': MessageAction.messageActionInviteToGroupCall,
  'groupCallParticipant': GroupCallParticipant.groupCallParticipant,
  'updateChat': Update.updateChat,
  'updateGroupCallParticipants': Update.updateGroupCallParticipants,
  'updateGroupCall': Update.updateGroupCall,
  'phone.groupCall': PhoneGroupCall.phoneGroupCall,
  'phone.groupParticipants': PhoneGroupParticipants.phoneGroupParticipants,
  'inlineQueryPeerTypeSameBotPM': InlineQueryPeerType.inlineQueryPeerTypeSameBotPM,
  'inlineQueryPeerTypePM': InlineQueryPeerType.inlineQueryPeerTypePM,
  'inlineQueryPeerTypeChat': InlineQueryPeerType.inlineQueryPeerTypeChat,
  'inlineQueryPeerTypeMegagroup': InlineQueryPeerType.inlineQueryPeerTypeMegagroup,
  'inlineQueryPeerTypeBroadcast': InlineQueryPeerType.inlineQueryPeerTypeBroadcast,
  'channelAdminLogEventActionStartGroupCall': ChannelAdminLogEventAction.channelAdminLogEventActionStartGroupCall,
  'channelAdminLogEventActionDiscardGroupCall': ChannelAdminLogEventAction.channelAdminLogEventActionDiscardGroupCall,
  'channelAdminLogEventActionParticipantMute': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantMute,
  'channelAdminLogEventActionParticipantUnmute': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantUnmute,
  'channelAdminLogEventActionToggleGroupCallSetting': ChannelAdminLogEventAction.channelAdminLogEventActionToggleGroupCallSetting,
  'inputPaymentCredentialsGooglePay': InputPaymentCredentials.inputPaymentCredentialsGooglePay,
  'messages.historyImport': MessagesHistoryImport.messagesHistoryImport,
  'sendMessageHistoryImportAction': SendMessageAction.sendMessageHistoryImportAction,
  'messages.historyImportParsed': MessagesHistoryImportParsed.messagesHistoryImportParsed,
  'inputReportReasonFake': ReportReason.inputReportReasonFake,
  'messages.affectedFoundMessages': MessagesAffectedFoundMessages.messagesAffectedFoundMessages,
  'messageActionSetMessagesTTL': MessageAction.messageActionSetMessagesTTL,
  'updatePeerHistoryTTL': Update.updatePeerHistoryTTL,
  'updateChatParticipant': Update.updateChatParticipant,
  'updateChannelParticipant': Update.updateChannelParticipant,
  'updateBotStopped': Update.updateBotStopped,
  'chatInviteImporter': ChatInviteImporter.chatInviteImporter,
  'messages.exportedChatInvites': MessagesExportedChatInvites.messagesExportedChatInvites,
  'messages.exportedChatInvite': MessagesExportedChatInvite.messagesExportedChatInvite,
  'messages.exportedChatInviteReplaced': MessagesExportedChatInvite.messagesExportedChatInviteReplaced,
  'messages.chatInviteImporters': MessagesChatInviteImporters.messagesChatInviteImporters,
  'chatAdminWithInvites': ChatAdminWithInvites.chatAdminWithInvites,
  'messages.chatAdminsWithInvites': MessagesChatAdminsWithInvites.messagesChatAdminsWithInvites,
  'channelAdminLogEventActionParticipantJoinByInvite': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantJoinByInvite,
  'channelAdminLogEventActionExportedInviteDelete': ChannelAdminLogEventAction.channelAdminLogEventActionExportedInviteDelete,
  'channelAdminLogEventActionExportedInviteRevoke': ChannelAdminLogEventAction.channelAdminLogEventActionExportedInviteRevoke,
  'channelAdminLogEventActionExportedInviteEdit': ChannelAdminLogEventAction.channelAdminLogEventActionExportedInviteEdit,
  'channelAdminLogEventActionParticipantVolume': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantVolume,
  'channelAdminLogEventActionChangeHistoryTTL': ChannelAdminLogEventAction.channelAdminLogEventActionChangeHistoryTTL,
  'messages.checkedHistoryImportPeer': MessagesCheckedHistoryImportPeer.messagesCheckedHistoryImportPeer,
  'inputGroupCallStream': InputFileLocation.inputGroupCallStream,
  'phone.joinAsPeers': PhoneJoinAsPeers.phoneJoinAsPeers,
  'phone.exportedGroupCallInvite': PhoneExportedGroupCallInvite.phoneExportedGroupCallInvite,
  'inputBotInlineMessageMediaInvoice': InputBotInlineMessage.inputBotInlineMessageMediaInvoice,
  'botInlineMessageMediaInvoice': BotInlineMessage.botInlineMessageMediaInvoice,
  'messageActionGroupCallScheduled': MessageAction.messageActionGroupCallScheduled,
  'groupCallParticipantVideoSourceGroup': GroupCallParticipantVideoSourceGroup.groupCallParticipantVideoSourceGroup,
  'groupCallParticipantVideo': GroupCallParticipantVideo.groupCallParticipantVideo,
  'updateGroupCallConnection': Update.updateGroupCallConnection,
  'stickers.suggestedShortName': StickersSuggestedShortName.stickersSuggestedShortName,
  'botCommandScopeDefault': BotCommandScope.botCommandScopeDefault,
  'botCommandScopeUsers': BotCommandScope.botCommandScopeUsers,
  'botCommandScopeChats': BotCommandScope.botCommandScopeChats,
  'botCommandScopeChatAdmins': BotCommandScope.botCommandScopeChatAdmins,
  'botCommandScopePeer': BotCommandScope.botCommandScopePeer,
  'botCommandScopePeerAdmins': BotCommandScope.botCommandScopePeerAdmins,
  'botCommandScopePeerUser': BotCommandScope.botCommandScopePeerUser,
  'account.resetPasswordFailedWait': AccountResetPasswordResult.accountResetPasswordFailedWait,
  'account.resetPasswordRequestedWait': AccountResetPasswordResult.accountResetPasswordRequestedWait,
  'account.resetPasswordOk': AccountResetPasswordResult.accountResetPasswordOk,
  'updateBotCommands': Update.updateBotCommands,
  'messageActionSetChatTheme': MessageAction.messageActionSetChatTheme,
  'sendMessageChooseStickerAction': SendMessageAction.sendMessageChooseStickerAction,
  'sponsoredMessage': SponsoredMessage.sponsoredMessage,
  'messages.sponsoredMessages': MessagesSponsoredMessages.messagesSponsoredMessages,
  'inputStickerSetAnimatedEmojiAnimations': InputStickerSet.inputStickerSetAnimatedEmojiAnimations,
  'sendMessageEmojiInteraction': SendMessageAction.sendMessageEmojiInteraction,
  'sendMessageEmojiInteractionSeen': SendMessageAction.sendMessageEmojiInteractionSeen,
  'inputBotInlineMessageID64': InputBotInlineMessageID.inputBotInlineMessageID64,
  'searchResultsCalendarPeriod': SearchResultsCalendarPeriod.searchResultsCalendarPeriod,
  'messages.searchResultsCalendar': MessagesSearchResultsCalendar.messagesSearchResultsCalendar,
  'searchResultPosition': SearchResultsPosition.searchResultPosition,
  'messages.searchResultsPositions': MessagesSearchResultsPositions.messagesSearchResultsPositions,
  'messageActionChatJoinedByRequest': MessageAction.messageActionChatJoinedByRequest,
  'updatePendingJoinRequests': Update.updatePendingJoinRequests,
  'updateBotChatInviteRequester': Update.updateBotChatInviteRequester,
  'channelAdminLogEventActionParticipantJoinByRequest': ChannelAdminLogEventAction.channelAdminLogEventActionParticipantJoinByRequest,
  'inputKeyboardButtonUserProfile': KeyboardButton.inputKeyboardButtonUserProfile,
  'keyboardButtonUserProfile': KeyboardButton.keyboardButtonUserProfile,
  'channels.sendAsPeers': ChannelsSendAsPeers.channelsSendAsPeers,
  'channelAdminLogEventActionToggleNoForwards': ChannelAdminLogEventAction.channelAdminLogEventActionToggleNoForwards,
  'messages.stickerSetNotModified': MessagesStickerSet.messagesStickerSetNotModified,
  'users.userFull': UsersUserFull.usersUserFull,
  'messages.peerSettings': MessagesPeerSettings.messagesPeerSettings,
  'channelAdminLogEventActionSendMessage': ChannelAdminLogEventAction.channelAdminLogEventActionSendMessage,
  'auth.codeTypeMissedCall': AuthCodeType.authCodeTypeMissedCall,
  'auth.sentCodeTypeMissedCall': AuthSentCodeType.authSentCodeTypeMissedCall,
  'auth.loggedOut': AuthLoggedOut.authLoggedOut,
  'updateMessageReactions': Update.updateMessageReactions,
  'reactionCount': ReactionCount.reactionCount,
  'messageReactions': MessageReactions.messageReactions,
  'messages.messageReactionsList': MessagesMessageReactionsList.messagesMessageReactionsList,
  'availableReaction': AvailableReaction.availableReaction,
  'messages.availableReactionsNotModified': MessagesAvailableReactions.messagesAvailableReactionsNotModified,
  'messages.availableReactions': MessagesAvailableReactions.messagesAvailableReactions,
  'messageEntitySpoiler': MessageEntity.messageEntitySpoiler,
  'channelAdminLogEventActionChangeAvailableReactions': ChannelAdminLogEventAction.channelAdminLogEventActionChangeAvailableReactions,
  'messagePeerReaction': MessagePeerReaction.messagePeerReaction,
  'groupCallStreamChannel': GroupCallStreamChannel.groupCallStreamChannel,
  'phone.groupCallStreamChannels': PhoneGroupCallStreamChannels.phoneGroupCallStreamChannels,
  'inputReportReasonIllegalDrugs': ReportReason.inputReportReasonIllegalDrugs,
  'inputReportReasonPersonalDetails': ReportReason.inputReportReasonPersonalDetails,
  'phone.groupCallStreamRtmpUrl': PhoneGroupCallStreamRtmpUrl.phoneGroupCallStreamRtmpUrl,
  'attachMenuBotIconColor': AttachMenuBotIconColor.attachMenuBotIconColor,
  'attachMenuBotIcon': AttachMenuBotIcon.attachMenuBotIcon,
  'attachMenuBot': AttachMenuBot.attachMenuBot,
  'attachMenuBotsNotModified': AttachMenuBots.attachMenuBotsNotModified,
  'attachMenuBots': AttachMenuBots.attachMenuBots,
  'attachMenuBotsBot': AttachMenuBotsBot.attachMenuBotsBot,
  'updateAttachMenuBots': Update.updateAttachMenuBots,
  'webViewResultUrl': WebViewResult.webViewResultUrl,
  'simpleWebViewResultUrl': SimpleWebViewResult.simpleWebViewResultUrl,
  'webViewMessageSent': WebViewMessageSent.webViewMessageSent,
  'updateWebViewResultSent': Update.updateWebViewResultSent,
  'keyboardButtonWebView': KeyboardButton.keyboardButtonWebView,
  'keyboardButtonSimpleWebView': KeyboardButton.keyboardButtonSimpleWebView,
  'messageActionWebViewDataSentMe': MessageAction.messageActionWebViewDataSentMe,
  'messageActionWebViewDataSent': MessageAction.messageActionWebViewDataSent,
  'updateBotMenuButton': Update.updateBotMenuButton,
  'botMenuButtonDefault': BotMenuButton.botMenuButtonDefault,
  'botMenuButtonCommands': BotMenuButton.botMenuButtonCommands,
  'botMenuButton': BotMenuButton.botMenuButton,
  'account.savedRingtonesNotModified': AccountSavedRingtones.accountSavedRingtonesNotModified,
  'account.savedRingtones': AccountSavedRingtones.accountSavedRingtones,
  'updateSavedRingtones': Update.updateSavedRingtones,
  'notificationSoundDefault': NotificationSound.notificationSoundDefault,
  'notificationSoundNone': NotificationSound.notificationSoundNone,
  'notificationSoundLocal': NotificationSound.notificationSoundLocal,
  'notificationSoundRingtone': NotificationSound.notificationSoundRingtone,
  'account.savedRingtone': AccountSavedRingtone.accountSavedRingtone,
  'account.savedRingtoneConverted': AccountSavedRingtone.accountSavedRingtoneConverted,
  'attachMenuPeerTypeSameBotPM': AttachMenuPeerType.attachMenuPeerTypeSameBotPM,
  'attachMenuPeerTypeBotPM': AttachMenuPeerType.attachMenuPeerTypeBotPM,
  'attachMenuPeerTypePM': AttachMenuPeerType.attachMenuPeerTypePM,
  'attachMenuPeerTypeChat': AttachMenuPeerType.attachMenuPeerTypeChat,
  'attachMenuPeerTypeBroadcast': AttachMenuPeerType.attachMenuPeerTypeBroadcast,
  'chatInvitePublicJoinRequests': ExportedChatInvite.chatInvitePublicJoinRequests,
  'inputInvoiceMessage': InputInvoice.inputInvoiceMessage,
  'inputInvoiceSlug': InputInvoice.inputInvoiceSlug,
  'payments.exportedInvoice': PaymentsExportedInvoice.paymentsExportedInvoice,
  'updateTranscribedAudio': Update.updateTranscribedAudio,
  'messages.transcribedAudio': MessagesTranscribedAudio.messagesTranscribedAudio,
  'dialogFilterDefault': DialogFilter.dialogFilterDefault,
  'help.premiumPromo': HelpPremiumPromo.helpPremiumPromo,
  'messageEntityCustomEmoji': MessageEntity.messageEntityCustomEmoji,
  'documentAttributeCustomEmoji': DocumentAttribute.documentAttributeCustomEmoji,
  'stickerSetFullCovered': StickerSetCovered.stickerSetFullCovered,
  'inputStorePaymentPremiumSubscription': InputStorePaymentPurpose.inputStorePaymentPremiumSubscription,
  'inputStorePaymentGiftPremium': InputStorePaymentPurpose.inputStorePaymentGiftPremium,
  'messageActionGiftPremium': MessageAction.messageActionGiftPremium,
  'premiumGiftOption': PremiumGiftOption.premiumGiftOption,
  'inputStickerSetPremiumGifts': InputStickerSet.inputStickerSetPremiumGifts,
  'updateReadFeaturedEmojiStickers': Update.updateReadFeaturedEmojiStickers,
  'inputPrivacyKeyVoiceMessages': InputPrivacyKey.inputPrivacyKeyVoiceMessages,
  'privacyKeyVoiceMessages': PrivacyKey.privacyKeyVoiceMessages,
  'paymentFormMethod': PaymentFormMethod.paymentFormMethod,
  'inputWebFileAudioAlbumThumbLocation': InputWebFileLocation.inputWebFileAudioAlbumThumbLocation,
  'emojiStatusEmpty': EmojiStatus.emojiStatusEmpty,
  'emojiStatus': EmojiStatus.emojiStatus,
  'emojiStatusUntil': EmojiStatus.emojiStatusUntil,
  'updateUserEmojiStatus': Update.updateUserEmojiStatus,
  'updateRecentEmojiStatuses': Update.updateRecentEmojiStatuses,
  'account.emojiStatusesNotModified': AccountEmojiStatuses.accountEmojiStatusesNotModified,
  'account.emojiStatuses': AccountEmojiStatuses.accountEmojiStatuses,
  'reactionEmpty': Reaction.reactionEmpty,
  'reactionEmoji': Reaction.reactionEmoji,
  'reactionCustomEmoji': Reaction.reactionCustomEmoji,
  'chatReactionsNone': ChatReactions.chatReactionsNone,
  'chatReactionsAll': ChatReactions.chatReactionsAll,
  'chatReactionsSome': ChatReactions.chatReactionsSome,
  'messages.reactionsNotModified': MessagesReactions.messagesReactionsNotModified,
  'messages.reactions': MessagesReactions.messagesReactions,
  'updateRecentReactions': Update.updateRecentReactions,
  'updateMoveStickerSetToTop': Update.updateMoveStickerSetToTop,
  'auth.sentCodeTypeEmailCode': AuthSentCodeType.authSentCodeTypeEmailCode,
  'auth.sentCodeTypeSetUpEmailRequired': AuthSentCodeType.authSentCodeTypeSetUpEmailRequired,
  'emailVerifyPurposeLoginSetup': EmailVerifyPurpose.emailVerifyPurposeLoginSetup,
  'emailVerifyPurposeLoginChange': EmailVerifyPurpose.emailVerifyPurposeLoginChange,
  'emailVerifyPurposePassport': EmailVerifyPurpose.emailVerifyPurposePassport,
  'emailVerificationCode': EmailVerification.emailVerificationCode,
  'emailVerificationGoogle': EmailVerification.emailVerificationGoogle,
  'emailVerificationApple': EmailVerification.emailVerificationApple,
  'account.emailVerified': AccountEmailVerified.accountEmailVerified,
  'account.emailVerifiedLogin': AccountEmailVerified.accountEmailVerifiedLogin,
  'premiumSubscriptionOption': PremiumSubscriptionOption.premiumSubscriptionOption,
  'inputStickerSetEmojiGenericAnimations': InputStickerSet.inputStickerSetEmojiGenericAnimations,
  'inputStickerSetEmojiDefaultStatuses': InputStickerSet.inputStickerSetEmojiDefaultStatuses,
  'sendAsPeer': SendAsPeer.sendAsPeer,
  'messageExtendedMediaPreview': MessageExtendedMedia.messageExtendedMediaPreview,
  'messageExtendedMedia': MessageExtendedMedia.messageExtendedMedia,
  'updateMessageExtendedMedia': Update.updateMessageExtendedMedia,
  'stickerKeyword': StickerKeyword.stickerKeyword,
  'username': Username.username,
  'channelAdminLogEventActionChangeUsernames': ChannelAdminLogEventAction.channelAdminLogEventActionChangeUsernames,
  'channelAdminLogEventActionToggleForum': ChannelAdminLogEventAction.channelAdminLogEventActionToggleForum,
  'channelAdminLogEventActionCreateTopic': ChannelAdminLogEventAction.channelAdminLogEventActionCreateTopic,
  'channelAdminLogEventActionEditTopic': ChannelAdminLogEventAction.channelAdminLogEventActionEditTopic,
  'channelAdminLogEventActionDeleteTopic': ChannelAdminLogEventAction.channelAdminLogEventActionDeleteTopic,
  'channelAdminLogEventActionPinTopic': ChannelAdminLogEventAction.channelAdminLogEventActionPinTopic,
  'forumTopicDeleted': ForumTopic.forumTopicDeleted,
  'forumTopic': ForumTopic.forumTopic,
  'messages.forumTopics': MessagesForumTopics.messagesForumTopics,
  'messageActionTopicCreate': MessageAction.messageActionTopicCreate,
  'messageActionTopicEdit': MessageAction.messageActionTopicEdit,
  'updateChannelPinnedTopic': Update.updateChannelPinnedTopic,
  'inputNotifyForumTopic': InputNotifyPeer.inputNotifyForumTopic,
  'notifyForumTopic': NotifyPeer.notifyForumTopic,
  'inputStickerSetEmojiDefaultTopicIcons': InputStickerSet.inputStickerSetEmojiDefaultTopicIcons,
  'messages.sponsoredMessagesEmpty': MessagesSponsoredMessages.messagesSponsoredMessagesEmpty,
  'updateChannelPinnedTopics': Update.updateChannelPinnedTopics,
  'defaultHistoryTTL': DefaultHistoryTTL.defaultHistoryTTL,
  'auth.codeTypeFragmentSms': AuthCodeType.authCodeTypeFragmentSms,
  'auth.sentCodeTypeFragmentSms': AuthSentCodeType.authSentCodeTypeFragmentSms,
  'exportedContactToken': ExportedContactToken.exportedContactToken,
  'channelAdminLogEventActionToggleAntiSpam': ChannelAdminLogEventAction.channelAdminLogEventActionToggleAntiSpam,
  'messageActionSuggestProfilePhoto': MessageAction.messageActionSuggestProfilePhoto,
  'stickerSetNoCovered': StickerSetCovered.stickerSetNoCovered,
  'updateUser': Update.updateUser,
  'auth.sentCodeSuccess': AuthSentCode.authSentCodeSuccess,
  'messageActionRequestedPeer': MessageAction.messageActionRequestedPeer,
  'requestPeerTypeUser': RequestPeerType.requestPeerTypeUser,
  'requestPeerTypeChat': RequestPeerType.requestPeerTypeChat,
  'requestPeerTypeBroadcast': RequestPeerType.requestPeerTypeBroadcast,
  'keyboardButtonRequestPeer': KeyboardButton.keyboardButtonRequestPeer,
  'emojiListNotModified': EmojiList.emojiListNotModified,
  'emojiList': EmojiList.emojiList,
  'auth.sentCodeTypeFirebaseSms': AuthSentCodeType.authSentCodeTypeFirebaseSms,
  'emojiGroup': EmojiGroup.emojiGroup,
  'messages.emojiGroupsNotModified': MessagesEmojiGroups.messagesEmojiGroupsNotModified,
  'messages.emojiGroups': MessagesEmojiGroups.messagesEmojiGroups,
  'videoSizeEmojiMarkup': VideoSize.videoSizeEmojiMarkup,
  'videoSizeStickerMarkup': VideoSize.videoSizeStickerMarkup,
  'textWithEntities': TextWithEntities.textWithEntities,
  'messages.translateResult': MessagesTranslatedText.messagesTranslateResult,
  'autoSaveSettings': AutoSaveSettings.autoSaveSettings,
  'autoSaveException': AutoSaveException.autoSaveException,
  'account.autoSaveSettings': AccountAutoSaveSettings.accountAutoSaveSettings,
  'updateAutoSaveSettings': Update.updateAutoSaveSettings,
  'help.appConfigNotModified': HelpAppConfig.helpAppConfigNotModified,
  'help.appConfig': HelpAppConfig.helpAppConfig,
  'inputBotAppID': InputBotApp.inputBotAppID,
  'inputBotAppShortName': InputBotApp.inputBotAppShortName,
  'botAppNotModified': BotApp.botAppNotModified,
  'botApp': BotApp.botApp,
  'messages.botApp': MessagesBotApp.messagesBotApp,
  'appWebViewResultUrl': AppWebViewResult.appWebViewResultUrl,
  'inlineBotWebView': InlineBotWebView.inlineBotWebView,
  'readParticipantDate': ReadParticipantDate.readParticipantDate,
  'updateGroupInvitePrivacyForbidden': Update.updateGroupInvitePrivacyForbidden,
  'dialogFilterChatlist': DialogFilter.dialogFilterChatlist,
  'inputChatlistDialogFilter': InputChatlist.inputChatlistDialogFilter,
  'exportedChatlistInvite': ExportedChatlistInvite.exportedChatlistInvite,
  'chatlists.exportedChatlistInvite': ChatlistsExportedChatlistInvite.chatlistsExportedChatlistInvite,
  'chatlists.exportedInvites': ChatlistsExportedInvites.chatlistsExportedInvites,
  'chatlists.chatlistInviteAlready': ChatlistsChatlistInvite.chatlistsChatlistInviteAlready,
  'chatlists.chatlistInvite': ChatlistsChatlistInvite.chatlistsChatlistInvite,
  'chatlists.chatlistUpdates': ChatlistsChatlistUpdates.chatlistsChatlistUpdates,
  'messageActionSetChatWallPaper': MessageAction.messageActionSetChatWallPaper,
  'messageActionSetSameChatWallPaper': MessageAction.messageActionSetSameChatWallPaper,
  'bots.botInfo': BotsBotInfo.botsBotInfo,
  'inlineQueryPeerTypeBotPM': InlineQueryPeerType.inlineQueryPeerTypeBotPM,
  'messageEntityEmoji': MessageEntity.messageEntityEmoji,
  'messageEntityHighlight': MessageEntity.messageEntityHighlight,
  'messageEntityLinebreak': MessageEntity.messageEntityLinebreak,
  'messageEntityCaret': MessageEntity.messageEntityCaret,
  'messageEntityTimestamp': MessageEntity.messageEntityTimestamp,
  'messageActionDiscussionStarted': MessageAction.messageActionDiscussionStarted,
  'messageActionChatLeave': MessageAction.messageActionChatLeave,
  'messageActionChannelDeletePhoto': MessageAction.messageActionChannelDeletePhoto,
  'messageActionChannelEditTitle': MessageAction.messageActionChannelEditTitle,
  'messageActionChannelEditPhoto': MessageAction.messageActionChannelEditPhoto,
  'messageActionChannelEditVideo': MessageAction.messageActionChannelEditVideo,
  'messageActionChatEditVideo': MessageAction.messageActionChatEditVideo,
  'messageActionChatAddUsers': MessageAction.messageActionChatAddUsers,
  'messageActionChatJoined': MessageAction.messageActionChatJoined,
  'messageActionChatReturn': MessageAction.messageActionChatReturn,
  'messageActionChatJoinedYou': MessageAction.messageActionChatJoinedYou,
  'messageActionChatReturnYou': MessageAction.messageActionChatReturnYou,
  'updateNewDiscussionMessage': Update.updateNewDiscussionMessage,
  'updateDeleteDiscussionMessages': Update.updateDeleteDiscussionMessages,
  'updateChannelReload': Update.updateChannelReload,
  'messageMediaCall': MessageMedia.messageMediaCall,
  'messageMediaPhotoExternal': MessageMedia.messageMediaPhotoExternal,
  'messageMediaDocumentExternal': MessageMedia.messageMediaDocumentExternal,
}

export type InvokeAfterMsg = {
  msg_id: string | number,
  query: any
};

export type InvokeAfterMsgs = {
  msg_ids: Array<string | number>,
  query: any
};

export type AuthSendCode = {
  phone_number: string,
  api_id: number,
  api_hash: string,
  settings: CodeSettings
};

export type AuthSignUp = {
  phone_number: string,
  phone_code_hash: string,
  first_name: string,
  last_name: string
};

export type AuthSignIn = {
  flags?: number,
  phone_number: string,
  phone_code_hash: string,
  phone_code?: string,
  email_verification?: EmailVerification
};

export type AuthLogOut = {

};

export type AuthResetAuthorizations = {

};

export type AuthExportAuthorization = {
  dc_id: number
};

export type AuthImportAuthorization = {
  id: string | number,
  bytes: Uint8Array
};

export type AuthBindTempAuthKey = {
  perm_auth_key_id: string | number,
  nonce: string | number,
  expires_at: number,
  encrypted_message: Uint8Array
};

export type AccountRegisterDevice = {
  flags?: number,
  no_muted?: boolean,
  token_type: number,
  token: string,
  app_sandbox: boolean,
  secret: Uint8Array,
  other_uids: Array<string | number>
};

export type AccountUnregisterDevice = {
  token_type: number,
  token: string,
  other_uids: Array<string | number>
};

export type AccountUpdateNotifySettings = {
  peer: InputNotifyPeer,
  settings: InputPeerNotifySettings
};

export type AccountGetNotifySettings = {
  peer: InputNotifyPeer
};

export type AccountResetNotifySettings = {

};

export type AccountUpdateProfile = {
  flags?: number,
  first_name?: string,
  last_name?: string,
  about?: string
};

export type AccountUpdateStatus = {
  offline: boolean
};

export type AccountGetWallPapers = {
  hash: string | number
};

export type AccountReportPeer = {
  peer: InputPeer,
  reason: ReportReason,
  message: string
};

export type UsersGetUsers = {
  id: Array<InputUser>
};

export type UsersGetFullUser = {
  id: InputUser
};

export type ContactsGetContactIDs = {
  hash: string | number
};

export type ContactsGetStatuses = {

};

export type ContactsGetContacts = {
  hash: string | number
};

export type ContactsImportContacts = {
  contacts: Array<InputContact>
};

export type ContactsDeleteContacts = {
  id: Array<InputUser>
};

export type ContactsDeleteByPhones = {
  phones: Array<string>
};

export type ContactsBlock = {
  id: InputPeer
};

export type ContactsUnblock = {
  id: InputPeer
};

export type ContactsGetBlocked = {
  offset: number,
  limit: number
};

export type MessagesGetMessages = {
  id: Array<InputMessage>
};

export type MessagesGetDialogs = {
  flags?: number,
  exclude_pinned?: boolean,
  folder_id?: number,
  offset_date: number,
  offset_id: number,
  offset_peer: InputPeer,
  limit: number,
  hash: string | number
};

export type MessagesGetHistory = {
  peer: InputPeer,
  offset_id: number,
  offset_date: number,
  add_offset: number,
  limit: number,
  max_id: number,
  min_id: number,
  hash: string | number
};

export type MessagesSearch = {
  flags?: number,
  peer: InputPeer,
  q: string,
  from_id?: InputPeer,
  top_msg_id?: number,
  filter: MessagesFilter,
  min_date: number,
  max_date: number,
  offset_id: number,
  add_offset: number,
  limit: number,
  max_id: number,
  min_id: number,
  hash: string | number
};

export type MessagesReadHistory = {
  peer: InputPeer,
  max_id: number
};

export type MessagesDeleteHistory = {
  flags?: number,
  just_clear?: boolean,
  revoke?: boolean,
  peer: InputPeer,
  max_id: number,
  min_date?: number,
  max_date?: number
};

export type MessagesDeleteMessages = {
  flags?: number,
  revoke?: boolean,
  id: Array<number>
};

export type MessagesReceivedMessages = {
  max_id: number
};

export type MessagesSetTyping = {
  flags?: number,
  peer: InputPeer,
  top_msg_id?: number,
  action: SendMessageAction
};

export type MessagesSendMessage = {
  flags?: number,
  no_webpage?: boolean,
  silent?: boolean,
  background?: boolean,
  clear_draft?: boolean,
  noforwards?: boolean,
  update_stickersets_order?: boolean,
  peer: InputPeer,
  reply_to_msg_id?: number,
  top_msg_id?: number,
  message: string,
  random_id: string | number,
  reply_markup?: ReplyMarkup,
  entities?: Array<MessageEntity>,
  schedule_date?: number,
  send_as?: InputPeer
};

export type MessagesSendMedia = {
  flags?: number,
  silent?: boolean,
  background?: boolean,
  clear_draft?: boolean,
  noforwards?: boolean,
  update_stickersets_order?: boolean,
  peer: InputPeer,
  reply_to_msg_id?: number,
  top_msg_id?: number,
  media: InputMedia,
  message: string,
  random_id: string | number,
  reply_markup?: ReplyMarkup,
  entities?: Array<MessageEntity>,
  schedule_date?: number,
  send_as?: InputPeer
};

export type MessagesForwardMessages = {
  flags?: number,
  silent?: boolean,
  background?: boolean,
  with_my_score?: boolean,
  drop_author?: boolean,
  drop_media_captions?: boolean,
  noforwards?: boolean,
  from_peer: InputPeer,
  id: Array<number>,
  random_id: Array<string | number>,
  to_peer: InputPeer,
  top_msg_id?: number,
  schedule_date?: number,
  send_as?: InputPeer
};

export type MessagesReportSpam = {
  peer: InputPeer
};

export type MessagesGetPeerSettings = {
  peer: InputPeer
};

export type MessagesReport = {
  peer: InputPeer,
  id: Array<number>,
  reason: ReportReason,
  message: string
};

export type MessagesGetChats = {
  id: Array<string | number>
};

export type MessagesGetFullChat = {
  chat_id: string | number
};

export type MessagesEditChatTitle = {
  chat_id: string | number,
  title: string
};

export type MessagesEditChatPhoto = {
  chat_id: string | number,
  photo: InputChatPhoto
};

export type MessagesAddChatUser = {
  chat_id: string | number,
  user_id: InputUser,
  fwd_limit: number
};

export type MessagesDeleteChatUser = {
  flags?: number,
  revoke_history?: boolean,
  chat_id: string | number,
  user_id: InputUser
};

export type MessagesCreateChat = {
  flags?: number,
  users: Array<InputUser>,
  title: string,
  ttl_period?: number
};

export type UpdatesGetState = {

};

export type UpdatesGetDifference = {
  flags?: number,
  pts: number,
  pts_total_limit?: number,
  date: number,
  qts: number
};

export type PhotosUpdateProfilePhoto = {
  flags?: number,
  fallback?: boolean,
  bot?: InputUser,
  id: InputPhoto
};

export type PhotosUploadProfilePhoto = {
  flags?: number,
  fallback?: boolean,
  bot?: InputUser,
  file?: InputFile,
  video?: InputFile,
  video_start_ts?: number,
  video_emoji_markup?: VideoSize
};

export type PhotosDeletePhotos = {
  id: Array<InputPhoto>
};

export type UploadSaveFilePart = {
  file_id: string | number,
  file_part: number,
  bytes: Uint8Array
};

export type UploadGetFile = {
  flags?: number,
  precise?: boolean,
  cdn_supported?: boolean,
  location: InputFileLocation,
  offset: string | number,
  limit: number
};

export type HelpGetConfig = {

};

export type HelpGetNearestDc = {

};

export type HelpGetAppUpdate = {
  source: string
};

export type HelpGetInviteText = {

};

export type PhotosGetUserPhotos = {
  user_id: InputUser,
  offset: number,
  max_id: string | number,
  limit: number
};

export type MessagesGetDhConfig = {
  version: number,
  random_length: number
};

export type MessagesRequestEncryption = {
  user_id: InputUser,
  random_id: number,
  g_a: Uint8Array
};

export type MessagesAcceptEncryption = {
  peer: InputEncryptedChat,
  g_b: Uint8Array,
  key_fingerprint: string | number
};

export type MessagesDiscardEncryption = {
  flags?: number,
  delete_history?: boolean,
  chat_id: number
};

export type MessagesSetEncryptedTyping = {
  peer: InputEncryptedChat,
  typing: boolean
};

export type MessagesReadEncryptedHistory = {
  peer: InputEncryptedChat,
  max_date: number
};

export type MessagesSendEncrypted = {
  flags?: number,
  silent?: boolean,
  peer: InputEncryptedChat,
  random_id: string | number,
  data: Uint8Array
};

export type MessagesSendEncryptedFile = {
  flags?: number,
  silent?: boolean,
  peer: InputEncryptedChat,
  random_id: string | number,
  data: Uint8Array,
  file: InputEncryptedFile
};

export type MessagesSendEncryptedService = {
  peer: InputEncryptedChat,
  random_id: string | number,
  data: Uint8Array
};

export type MessagesReceivedQueue = {
  max_qts: number
};

export type MessagesReportEncryptedSpam = {
  peer: InputEncryptedChat
};

export type UploadSaveBigFilePart = {
  file_id: string | number,
  file_part: number,
  file_total_parts: number,
  bytes: Uint8Array
};

export type InitConnection = {
  flags?: number,
  api_id: number,
  device_model: string,
  system_version: string,
  app_version: string,
  system_lang_code: string,
  lang_pack: string,
  lang_code: string,
  proxy?: InputClientProxy,
  params?: JSONValue,
  query: any
};

export type HelpGetSupport = {

};

export type MessagesReadMessageContents = {
  id: Array<number>
};

export type AccountCheckUsername = {
  username: string
};

export type AccountUpdateUsername = {
  username: string
};

export type ContactsSearch = {
  q: string,
  limit: number
};

export type AccountGetPrivacy = {
  key: InputPrivacyKey
};

export type AccountSetPrivacy = {
  key: InputPrivacyKey,
  rules: Array<InputPrivacyRule>
};

export type AccountDeleteAccount = {
  flags?: number,
  reason: string,
  password?: InputCheckPasswordSRP
};

export type AccountGetAccountTTL = {

};

export type AccountSetAccountTTL = {
  ttl: AccountDaysTTL
};

export type InvokeWithLayer = {
  layer: number,
  query: any
};

export type ContactsResolveUsername = {
  username: string
};

export type AccountSendChangePhoneCode = {
  phone_number: string,
  settings: CodeSettings
};

export type AccountChangePhone = {
  phone_number: string,
  phone_code_hash: string,
  phone_code: string
};

export type MessagesGetStickers = {
  emoticon: string,
  hash: string | number
};

export type MessagesGetAllStickers = {
  hash: string | number
};

export type AccountUpdateDeviceLocked = {
  period: number
};

export type AuthImportBotAuthorization = {
  flags?: number,
  api_id: number,
  api_hash: string,
  bot_auth_token: string
};

export type MessagesGetWebPagePreview = {
  flags?: number,
  message: string,
  entities?: Array<MessageEntity>
};

export type AccountGetAuthorizations = {

};

export type AccountResetAuthorization = {
  hash: string | number
};

export type AccountGetPassword = {

};

export type AccountGetPasswordSettings = {
  password: InputCheckPasswordSRP
};

export type AccountUpdatePasswordSettings = {
  password: InputCheckPasswordSRP,
  new_settings: AccountPasswordInputSettings
};

export type AuthCheckPassword = {
  password: InputCheckPasswordSRP
};

export type AuthRequestPasswordRecovery = {

};

export type AuthRecoverPassword = {
  flags?: number,
  code: string,
  new_settings?: AccountPasswordInputSettings
};

export type InvokeWithoutUpdates = {
  query: any
};

export type MessagesExportChatInvite = {
  flags?: number,
  legacy_revoke_permanent?: boolean,
  request_needed?: boolean,
  peer: InputPeer,
  expire_date?: number,
  usage_limit?: number,
  title?: string
};

export type MessagesCheckChatInvite = {
  hash: string
};

export type MessagesImportChatInvite = {
  hash: string
};

export type MessagesGetStickerSet = {
  stickerset: InputStickerSet,
  hash: number
};

export type MessagesInstallStickerSet = {
  stickerset: InputStickerSet,
  archived: boolean
};

export type MessagesUninstallStickerSet = {
  stickerset: InputStickerSet
};

export type MessagesStartBot = {
  bot: InputUser,
  peer: InputPeer,
  random_id: string | number,
  start_param: string
};

export type HelpGetAppChangelog = {
  prev_app_version: string
};

export type MessagesGetMessagesViews = {
  peer: InputPeer,
  id: Array<number>,
  increment: boolean
};

export type ChannelsReadHistory = {
  channel: InputChannel,
  max_id: number
};

export type ChannelsDeleteMessages = {
  channel: InputChannel,
  id: Array<number>
};

export type ChannelsReportSpam = {
  channel: InputChannel,
  participant: InputPeer,
  id: Array<number>
};

export type ChannelsGetMessages = {
  channel: InputChannel,
  id: Array<InputMessage>
};

export type ChannelsGetParticipants = {
  channel: InputChannel,
  filter: ChannelParticipantsFilter,
  offset: number,
  limit: number,
  hash: string | number
};

export type ChannelsGetParticipant = {
  channel: InputChannel,
  participant: InputPeer
};

export type ChannelsGetChannels = {
  id: Array<InputChannel>
};

export type ChannelsGetFullChannel = {
  channel: InputChannel
};

export type ChannelsCreateChannel = {
  flags?: number,
  broadcast?: boolean,
  megagroup?: boolean,
  for_import?: boolean,
  forum?: boolean,
  title: string,
  about: string,
  geo_point?: InputGeoPoint,
  address?: string,
  ttl_period?: number
};

export type ChannelsEditAdmin = {
  channel: InputChannel,
  user_id: InputUser,
  admin_rights: ChatAdminRights,
  rank: string
};

export type ChannelsEditTitle = {
  channel: InputChannel,
  title: string
};

export type ChannelsEditPhoto = {
  channel: InputChannel,
  photo: InputChatPhoto
};

export type ChannelsCheckUsername = {
  channel: InputChannel,
  username: string
};

export type ChannelsUpdateUsername = {
  channel: InputChannel,
  username: string
};

export type ChannelsJoinChannel = {
  channel: InputChannel
};

export type ChannelsLeaveChannel = {
  channel: InputChannel
};

export type ChannelsInviteToChannel = {
  channel: InputChannel,
  users: Array<InputUser>
};

export type ChannelsDeleteChannel = {
  channel: InputChannel
};

export type UpdatesGetChannelDifference = {
  flags?: number,
  force?: boolean,
  channel: InputChannel,
  filter: ChannelMessagesFilter,
  pts: number,
  limit: number
};

export type MessagesEditChatAdmin = {
  chat_id: string | number,
  user_id: InputUser,
  is_admin: boolean
};

export type MessagesMigrateChat = {
  chat_id: string | number
};

export type MessagesSearchGlobal = {
  flags?: number,
  folder_id?: number,
  q: string,
  filter: MessagesFilter,
  min_date: number,
  max_date: number,
  offset_rate: number,
  offset_peer: InputPeer,
  offset_id: number,
  limit: number
};

export type MessagesReorderStickerSets = {
  flags?: number,
  masks?: boolean,
  emojis?: boolean,
  order: Array<string | number>
};

export type MessagesGetDocumentByHash = {
  sha256: Uint8Array,
  size: string | number,
  mime_type: string
};

export type MessagesGetSavedGifs = {
  hash: string | number
};

export type MessagesSaveGif = {
  id: InputDocument,
  unsave: boolean
};

export type MessagesGetInlineBotResults = {
  flags?: number,
  bot: InputUser,
  peer: InputPeer,
  geo_point?: InputGeoPoint,
  query: string,
  offset: string
};

export type MessagesSetInlineBotResults = {
  flags?: number,
  gallery?: boolean,
  private?: boolean,
  query_id: string | number,
  results: Array<InputBotInlineResult>,
  cache_time: number,
  next_offset?: string,
  switch_pm?: InlineBotSwitchPM,
  switch_webview?: InlineBotWebView
};

export type MessagesSendInlineBotResult = {
  flags?: number,
  silent?: boolean,
  background?: boolean,
  clear_draft?: boolean,
  hide_via?: boolean,
  peer: InputPeer,
  reply_to_msg_id?: number,
  top_msg_id?: number,
  random_id: string | number,
  query_id: string | number,
  id: string,
  schedule_date?: number,
  send_as?: InputPeer
};

export type ChannelsExportMessageLink = {
  flags?: number,
  grouped?: boolean,
  thread?: boolean,
  channel: InputChannel,
  id: number
};

export type ChannelsToggleSignatures = {
  channel: InputChannel,
  enabled: boolean
};

export type AuthResendCode = {
  phone_number: string,
  phone_code_hash: string
};

export type AuthCancelCode = {
  phone_number: string,
  phone_code_hash: string
};

export type MessagesGetMessageEditData = {
  peer: InputPeer,
  id: number
};

export type MessagesEditMessage = {
  flags?: number,
  no_webpage?: boolean,
  peer: InputPeer,
  id: number,
  message?: string,
  media?: InputMedia,
  reply_markup?: ReplyMarkup,
  entities?: Array<MessageEntity>,
  schedule_date?: number
};

export type MessagesEditInlineBotMessage = {
  flags?: number,
  no_webpage?: boolean,
  id: InputBotInlineMessageID,
  message?: string,
  media?: InputMedia,
  reply_markup?: ReplyMarkup,
  entities?: Array<MessageEntity>
};

export type MessagesGetBotCallbackAnswer = {
  flags?: number,
  game?: boolean,
  peer: InputPeer,
  msg_id: number,
  data?: Uint8Array,
  password?: InputCheckPasswordSRP
};

export type MessagesSetBotCallbackAnswer = {
  flags?: number,
  alert?: boolean,
  query_id: string | number,
  message?: string,
  url?: string,
  cache_time: number
};

export type ContactsGetTopPeers = {
  flags?: number,
  correspondents?: boolean,
  bots_pm?: boolean,
  bots_inline?: boolean,
  phone_calls?: boolean,
  forward_users?: boolean,
  forward_chats?: boolean,
  groups?: boolean,
  channels?: boolean,
  offset: number,
  limit: number,
  hash: string | number
};

export type ContactsResetTopPeerRating = {
  category: TopPeerCategory,
  peer: InputPeer
};

export type MessagesGetPeerDialogs = {
  peers: Array<InputDialogPeer>
};

export type MessagesSaveDraft = {
  flags?: number,
  no_webpage?: boolean,
  reply_to_msg_id?: number,
  top_msg_id?: number,
  peer: InputPeer,
  message: string,
  entities?: Array<MessageEntity>
};

export type MessagesGetAllDrafts = {

};

export type MessagesGetFeaturedStickers = {
  hash: string | number
};

export type MessagesReadFeaturedStickers = {
  id: Array<string | number>
};

export type MessagesGetRecentStickers = {
  flags?: number,
  attached?: boolean,
  hash: string | number
};

export type MessagesSaveRecentSticker = {
  flags?: number,
  attached?: boolean,
  id: InputDocument,
  unsave: boolean
};

export type MessagesClearRecentStickers = {
  flags?: number,
  attached?: boolean
};

export type MessagesGetArchivedStickers = {
  flags?: number,
  masks?: boolean,
  emojis?: boolean,
  offset_id: string | number,
  limit: number
};

export type AccountSendConfirmPhoneCode = {
  hash: string,
  settings: CodeSettings
};

export type AccountConfirmPhone = {
  phone_code_hash: string,
  phone_code: string
};

export type ChannelsGetAdminedPublicChannels = {
  flags?: number,
  by_location?: boolean,
  check_limit?: boolean
};

export type MessagesGetMaskStickers = {
  hash: string | number
};

export type MessagesGetAttachedStickers = {
  media: InputStickeredMedia
};

export type AuthDropTempAuthKeys = {
  except_auth_keys: Array<string | number>
};

export type MessagesSetGameScore = {
  flags?: number,
  edit_message?: boolean,
  force?: boolean,
  peer: InputPeer,
  id: number,
  user_id: InputUser,
  score: number
};

export type MessagesSetInlineGameScore = {
  flags?: number,
  edit_message?: boolean,
  force?: boolean,
  id: InputBotInlineMessageID,
  user_id: InputUser,
  score: number
};

export type MessagesGetGameHighScores = {
  peer: InputPeer,
  id: number,
  user_id: InputUser
};

export type MessagesGetInlineGameHighScores = {
  id: InputBotInlineMessageID,
  user_id: InputUser
};

export type MessagesGetCommonChats = {
  user_id: InputUser,
  max_id: string | number,
  limit: number
};

export type MessagesGetAllChats = {
  except_ids: Array<string | number>
};

export type HelpSetBotUpdatesStatus = {
  pending_updates_count: number,
  message: string
};

export type MessagesGetWebPage = {
  url: string,
  hash: number
};

export type MessagesToggleDialogPin = {
  flags?: number,
  pinned?: boolean,
  peer: InputDialogPeer
};

export type MessagesReorderPinnedDialogs = {
  flags?: number,
  force?: boolean,
  folder_id: number,
  order: Array<InputDialogPeer>
};

export type MessagesGetPinnedDialogs = {
  folder_id: number
};

export type BotsSendCustomRequest = {
  custom_method: string,
  params: DataJSON
};

export type BotsAnswerWebhookJSONQuery = {
  query_id: string | number,
  data: DataJSON
};

export type UploadGetWebFile = {
  location: InputWebFileLocation,
  offset: number,
  limit: number
};

export type PaymentsGetPaymentForm = {
  flags?: number,
  invoice: InputInvoice,
  theme_params?: DataJSON
};

export type PaymentsGetPaymentReceipt = {
  peer: InputPeer,
  msg_id: number
};

export type PaymentsValidateRequestedInfo = {
  flags?: number,
  save?: boolean,
  invoice: InputInvoice,
  info: PaymentRequestedInfo
};

export type PaymentsSendPaymentForm = {
  flags?: number,
  form_id: string | number,
  invoice: InputInvoice,
  requested_info_id?: string,
  shipping_option_id?: string,
  credentials: InputPaymentCredentials,
  tip_amount?: string | number
};

export type AccountGetTmpPassword = {
  password: InputCheckPasswordSRP,
  period: number
};

export type PaymentsGetSavedInfo = {

};

export type PaymentsClearSavedInfo = {
  flags?: number,
  credentials?: boolean,
  info?: boolean
};

export type MessagesSetBotShippingResults = {
  flags?: number,
  query_id: string | number,
  error?: string,
  shipping_options?: Array<ShippingOption>
};

export type MessagesSetBotPrecheckoutResults = {
  flags?: number,
  success?: boolean,
  query_id: string | number,
  error?: string
};

export type StickersCreateStickerSet = {
  flags?: number,
  masks?: boolean,
  animated?: boolean,
  videos?: boolean,
  emojis?: boolean,
  text_color?: boolean,
  user_id: InputUser,
  title: string,
  short_name: string,
  thumb?: InputDocument,
  stickers: Array<InputStickerSetItem>,
  software?: string
};

export type StickersRemoveStickerFromSet = {
  sticker: InputDocument
};

export type StickersChangeStickerPosition = {
  sticker: InputDocument,
  position: number
};

export type StickersAddStickerToSet = {
  stickerset: InputStickerSet,
  sticker: InputStickerSetItem
};

export type MessagesUploadMedia = {
  peer: InputPeer,
  media: InputMedia
};

export type PhoneGetCallConfig = {

};

export type PhoneRequestCall = {
  flags?: number,
  video?: boolean,
  user_id: InputUser,
  random_id: number,
  g_a_hash: Uint8Array,
  protocol: PhoneCallProtocol
};

export type PhoneAcceptCall = {
  peer: InputPhoneCall,
  g_b: Uint8Array,
  protocol: PhoneCallProtocol
};

export type PhoneConfirmCall = {
  peer: InputPhoneCall,
  g_a: Uint8Array,
  key_fingerprint: string | number,
  protocol: PhoneCallProtocol
};

export type PhoneReceivedCall = {
  peer: InputPhoneCall
};

export type PhoneDiscardCall = {
  flags?: number,
  video?: boolean,
  peer: InputPhoneCall,
  duration: number,
  reason: PhoneCallDiscardReason,
  connection_id: string | number
};

export type PhoneSetCallRating = {
  flags?: number,
  user_initiative?: boolean,
  peer: InputPhoneCall,
  rating: number,
  comment: string
};

export type PhoneSaveCallDebug = {
  peer: InputPhoneCall,
  debug: DataJSON
};

export type UploadGetCdnFile = {
  file_token: Uint8Array,
  offset: string | number,
  limit: number
};

export type UploadReuploadCdnFile = {
  file_token: Uint8Array,
  request_token: Uint8Array
};

export type HelpGetCdnConfig = {

};

export type LangpackGetLangPack = {
  lang_pack: string,
  lang_code: string
};

export type LangpackGetStrings = {
  lang_pack: string,
  lang_code: string,
  keys: Array<string>
};

export type LangpackGetDifference = {
  lang_pack: string,
  lang_code: string,
  from_version: number
};

export type LangpackGetLanguages = {
  lang_pack: string
};

export type ChannelsEditBanned = {
  channel: InputChannel,
  participant: InputPeer,
  banned_rights: ChatBannedRights
};

export type ChannelsGetAdminLog = {
  flags?: number,
  channel: InputChannel,
  q: string,
  events_filter?: ChannelAdminLogEventsFilter,
  admins?: Array<InputUser>,
  max_id: string | number,
  min_id: string | number,
  limit: number
};

export type UploadGetCdnFileHashes = {
  file_token: Uint8Array,
  offset: string | number
};

export type MessagesSendScreenshotNotification = {
  peer: InputPeer,
  reply_to_msg_id: number,
  random_id: string | number
};

export type ChannelsSetStickers = {
  channel: InputChannel,
  stickerset: InputStickerSet
};

export type MessagesGetFavedStickers = {
  hash: string | number
};

export type MessagesFaveSticker = {
  id: InputDocument,
  unfave: boolean
};

export type ChannelsReadMessageContents = {
  channel: InputChannel,
  id: Array<number>
};

export type ContactsResetSaved = {

};

export type MessagesGetUnreadMentions = {
  flags?: number,
  peer: InputPeer,
  top_msg_id?: number,
  offset_id: number,
  add_offset: number,
  limit: number,
  max_id: number,
  min_id: number
};

export type ChannelsDeleteHistory = {
  flags?: number,
  for_everyone?: boolean,
  channel: InputChannel,
  max_id: number
};

export type HelpGetRecentMeUrls = {
  referer: string
};

export type ChannelsTogglePreHistoryHidden = {
  channel: InputChannel,
  enabled: boolean
};

export type MessagesReadMentions = {
  flags?: number,
  peer: InputPeer,
  top_msg_id?: number
};

export type MessagesGetRecentLocations = {
  peer: InputPeer,
  limit: number,
  hash: string | number
};

export type MessagesSendMultiMedia = {
  flags?: number,
  silent?: boolean,
  background?: boolean,
  clear_draft?: boolean,
  noforwards?: boolean,
  update_stickersets_order?: boolean,
  peer: InputPeer,
  reply_to_msg_id?: number,
  top_msg_id?: number,
  multi_media: Array<InputSingleMedia>,
  schedule_date?: number,
  send_as?: InputPeer
};

export type MessagesUploadEncryptedFile = {
  peer: InputEncryptedChat,
  file: InputEncryptedFile
};

export type AccountGetWebAuthorizations = {

};

export type AccountResetWebAuthorization = {
  hash: string | number
};

export type AccountResetWebAuthorizations = {

};

export type MessagesSearchStickerSets = {
  flags?: number,
  exclude_featured?: boolean,
  q: string,
  hash: string | number
};

export type UploadGetFileHashes = {
  location: InputFileLocation,
  offset: string | number
};

export type HelpGetTermsOfServiceUpdate = {

};

export type HelpAcceptTermsOfService = {
  id: DataJSON
};

export type AccountGetAllSecureValues = {

};

export type AccountGetSecureValue = {
  types: Array<SecureValueType>
};

export type AccountSaveSecureValue = {
  value: InputSecureValue,
  secure_secret_id: string | number
};

export type AccountDeleteSecureValue = {
  types: Array<SecureValueType>
};

export type UsersSetSecureValueErrors = {
  id: InputUser,
  errors: Array<SecureValueError>
};

export type AccountGetAuthorizationForm = {
  bot_id: string | number,
  scope: string,
  public_key: string
};

export type AccountAcceptAuthorization = {
  bot_id: string | number,
  scope: string,
  public_key: string,
  value_hashes: Array<SecureValueHash>,
  credentials: SecureCredentialsEncrypted
};

export type AccountSendVerifyPhoneCode = {
  phone_number: string,
  settings: CodeSettings
};

export type AccountVerifyPhone = {
  phone_number: string,
  phone_code_hash: string,
  phone_code: string
};

export type AccountSendVerifyEmailCode = {
  purpose: EmailVerifyPurpose,
  email: string
};

export type AccountVerifyEmail = {
  purpose: EmailVerifyPurpose,
  verification: EmailVerification
};

export type HelpGetDeepLinkInfo = {
  path: string
};

export type ContactsGetSaved = {

};

export type ChannelsGetLeftChannels = {
  offset: number
};

export type AccountInitTakeoutSession = {
  flags?: number,
  contacts?: boolean,
  message_users?: boolean,
  message_chats?: boolean,
  message_megagroups?: boolean,
  message_channels?: boolean,
  files?: boolean,
  file_max_size?: string | number
};

export type AccountFinishTakeoutSession = {
  flags?: number,
  success?: boolean
};

export type MessagesGetSplitRanges = {

};

export type InvokeWithMessagesRange = {
  range: MessageRange,
  query: any
};

export type InvokeWithTakeout = {
  takeout_id: string | number,
  query: any
};

export type MessagesMarkDialogUnread = {
  flags?: number,
  unread?: boolean,
  peer: InputDialogPeer
};

export type MessagesGetDialogUnreadMarks = {

};

export type ContactsToggleTopPeers = {
  enabled: boolean
};

export type MessagesClearAllDrafts = {

};

export type HelpGetAppConfig = {
  hash: number
};

export type HelpSaveAppLog = {
  events: Array<InputAppEvent>
};

export type HelpGetPassportConfig = {
  hash: number
};

export type LangpackGetLanguage = {
  lang_pack: string,
  lang_code: string
};

export type MessagesUpdatePinnedMessage = {
  flags?: number,
  silent?: boolean,
  unpin?: boolean,
  pm_oneside?: boolean,
  peer: InputPeer,
  id: number
};

export type AccountConfirmPasswordEmail = {
  code: string
};

export type AccountResendPasswordEmail = {

};

export type AccountCancelPasswordEmail = {

};

export type HelpGetSupportName = {

};

export type HelpGetUserInfo = {
  user_id: InputUser
};

export type HelpEditUserInfo = {
  user_id: InputUser,
  message: string,
  entities: Array<MessageEntity>
};

export type AccountGetContactSignUpNotification = {

};

export type AccountSetContactSignUpNotification = {
  silent: boolean
};

export type AccountGetNotifyExceptions = {
  flags?: number,
  compare_sound?: boolean,
  peer?: InputNotifyPeer
};

export type MessagesSendVote = {
  peer: InputPeer,
  msg_id: number,
  options: Array<Uint8Array>
};

export type MessagesGetPollResults = {
  peer: InputPeer,
  msg_id: number
};

export type MessagesGetOnlines = {
  peer: InputPeer
};

export type MessagesEditChatAbout = {
  peer: InputPeer,
  about: string
};

export type MessagesEditChatDefaultBannedRights = {
  peer: InputPeer,
  banned_rights: ChatBannedRights
};

export type AccountGetWallPaper = {
  wallpaper: InputWallPaper
};

export type AccountUploadWallPaper = {
  flags?: number,
  for_chat?: boolean,
  file: InputFile,
  mime_type: string,
  settings: WallPaperSettings
};

export type AccountSaveWallPaper = {
  wallpaper: InputWallPaper,
  unsave: boolean,
  settings: WallPaperSettings
};

export type AccountInstallWallPaper = {
  wallpaper: InputWallPaper,
  settings: WallPaperSettings
};

export type AccountResetWallPapers = {

};

export type AccountGetAutoDownloadSettings = {

};

export type AccountSaveAutoDownloadSettings = {
  flags?: number,
  low?: boolean,
  high?: boolean,
  settings: AutoDownloadSettings
};

export type MessagesGetEmojiKeywords = {
  lang_code: string
};

export type MessagesGetEmojiKeywordsDifference = {
  lang_code: string,
  from_version: number
};

export type MessagesGetEmojiKeywordsLanguages = {
  lang_codes: Array<string>
};

export type MessagesGetEmojiURL = {
  lang_code: string
};

export type FoldersEditPeerFolders = {
  folder_peers: Array<InputFolderPeer>
};

export type MessagesGetSearchCounters = {
  flags?: number,
  peer: InputPeer,
  top_msg_id?: number,
  filters: Array<MessagesFilter>
};

export type ChannelsGetGroupsForDiscussion = {

};

export type ChannelsSetDiscussionGroup = {
  broadcast: InputChannel,
  group: InputChannel
};

export type MessagesRequestUrlAuth = {
  flags?: number,
  peer?: InputPeer,
  msg_id?: number,
  button_id?: number,
  url?: string
};

export type MessagesAcceptUrlAuth = {
  flags?: number,
  write_allowed?: boolean,
  peer?: InputPeer,
  msg_id?: number,
  button_id?: number,
  url?: string
};

export type MessagesHidePeerSettingsBar = {
  peer: InputPeer
};

export type ContactsAddContact = {
  flags?: number,
  add_phone_privacy_exception?: boolean,
  id: InputUser,
  first_name: string,
  last_name: string,
  phone: string
};

export type ContactsAcceptContact = {
  id: InputUser
};

export type ChannelsEditCreator = {
  channel: InputChannel,
  user_id: InputUser,
  password: InputCheckPasswordSRP
};

export type ContactsGetLocated = {
  flags?: number,
  background?: boolean,
  geo_point: InputGeoPoint,
  self_expires?: number
};

export type ChannelsEditLocation = {
  channel: InputChannel,
  geo_point: InputGeoPoint,
  address: string
};

export type ChannelsToggleSlowMode = {
  channel: InputChannel,
  seconds: number
};

export type MessagesGetScheduledHistory = {
  peer: InputPeer,
  hash: string | number
};

export type MessagesGetScheduledMessages = {
  peer: InputPeer,
  id: Array<number>
};

export type MessagesSendScheduledMessages = {
  peer: InputPeer,
  id: Array<number>
};

export type MessagesDeleteScheduledMessages = {
  peer: InputPeer,
  id: Array<number>
};

export type AccountUploadTheme = {
  flags?: number,
  file: InputFile,
  thumb?: InputFile,
  file_name: string,
  mime_type: string
};

export type AccountCreateTheme = {
  flags?: number,
  slug: string,
  title: string,
  document?: InputDocument,
  settings?: Array<InputThemeSettings>
};

export type AccountUpdateTheme = {
  flags?: number,
  format: string,
  theme: InputTheme,
  slug?: string,
  title?: string,
  document?: InputDocument,
  settings?: Array<InputThemeSettings>
};

export type AccountSaveTheme = {
  theme: InputTheme,
  unsave: boolean
};

export type AccountInstallTheme = {
  flags?: number,
  dark?: boolean,
  theme?: InputTheme,
  format?: string,
  base_theme?: BaseTheme
};

export type AccountGetTheme = {
  format: string,
  theme: InputTheme
};

export type AccountGetThemes = {
  format: string,
  hash: string | number
};

export type AuthExportLoginToken = {
  api_id: number,
  api_hash: string,
  except_ids: Array<string | number>
};

export type AuthImportLoginToken = {
  token: Uint8Array
};

export type AuthAcceptLoginToken = {
  token: Uint8Array
};

export type AccountSetContentSettings = {
  flags?: number,
  sensitive_enabled?: boolean
};

export type AccountGetContentSettings = {

};

export type ChannelsGetInactiveChannels = {

};

export type AccountGetMultiWallPapers = {
  wallpapers: Array<InputWallPaper>
};

export type MessagesGetPollVotes = {
  flags?: number,
  peer: InputPeer,
  id: number,
  option?: Uint8Array,
  offset?: string,
  limit: number
};

export type MessagesToggleStickerSets = {
  flags?: number,
  uninstall?: boolean,
  archive?: boolean,
  unarchive?: boolean,
  stickersets: Array<InputStickerSet>
};

export type PaymentsGetBankCardData = {
  number: string
};

export type MessagesGetDialogFilters = {

};

export type MessagesGetSuggestedDialogFilters = {

};

export type MessagesUpdateDialogFilter = {
  flags?: number,
  id: number,
  filter?: DialogFilter
};

export type MessagesUpdateDialogFiltersOrder = {
  order: Array<number>
};

export type StatsGetBroadcastStats = {
  flags?: number,
  dark?: boolean,
  channel: InputChannel
};

export type StatsLoadAsyncGraph = {
  flags?: number,
  token: string,
  x?: string | number
};

export type StickersSetStickerSetThumb = {
  flags?: number,
  stickerset: InputStickerSet,
  thumb?: InputDocument,
  thumb_document_id?: string | number
};

export type BotsSetBotCommands = {
  scope: BotCommandScope,
  lang_code: string,
  commands: Array<BotCommand>
};

export type MessagesGetOldFeaturedStickers = {
  offset: number,
  limit: number,
  hash: string | number
};

export type HelpGetPromoData = {

};

export type HelpHidePromoData = {
  peer: InputPeer
};

export type PhoneSendSignalingData = {
  peer: InputPhoneCall,
  data: Uint8Array
};

export type StatsGetMegagroupStats = {
  flags?: number,
  dark?: boolean,
  channel: InputChannel
};

export type AccountGetGlobalPrivacySettings = {

};

export type AccountSetGlobalPrivacySettings = {
  settings: GlobalPrivacySettings
};

export type HelpDismissSuggestion = {
  peer: InputPeer,
  suggestion: string
};

export type HelpGetCountriesList = {
  lang_code: string,
  hash: number
};

export type MessagesGetReplies = {
  peer: InputPeer,
  msg_id: number,
  offset_id: number,
  offset_date: number,
  add_offset: number,
  limit: number,
  max_id: number,
  min_id: number,
  hash: string | number
};

export type MessagesGetDiscussionMessage = {
  peer: InputPeer,
  msg_id: number
};

export type MessagesReadDiscussion = {
  peer: InputPeer,
  msg_id: number,
  read_max_id: number
};

export type ContactsBlockFromReplies = {
  flags?: number,
  delete_message?: boolean,
  delete_history?: boolean,
  report_spam?: boolean,
  msg_id: number
};

export type StatsGetMessagePublicForwards = {
  channel: InputChannel,
  msg_id: number,
  offset_rate: number,
  offset_peer: InputPeer,
  offset_id: number,
  limit: number
};

export type StatsGetMessageStats = {
  flags?: number,
  dark?: boolean,
  channel: InputChannel,
  msg_id: number
};

export type MessagesUnpinAllMessages = {
  flags?: number,
  peer: InputPeer,
  top_msg_id?: number
};

export type PhoneCreateGroupCall = {
  flags?: number,
  rtmp_stream?: boolean,
  peer: InputPeer,
  random_id: number,
  title?: string,
  schedule_date?: number
};

export type PhoneJoinGroupCall = {
  flags?: number,
  muted?: boolean,
  video_stopped?: boolean,
  call: InputGroupCall,
  join_as: InputPeer,
  invite_hash?: string,
  params: DataJSON
};

export type PhoneLeaveGroupCall = {
  call: InputGroupCall,
  source: number
};

export type PhoneInviteToGroupCall = {
  call: InputGroupCall,
  users: Array<InputUser>
};

export type PhoneDiscardGroupCall = {
  call: InputGroupCall
};

export type PhoneToggleGroupCallSettings = {
  flags?: number,
  reset_invite_hash?: boolean,
  call: InputGroupCall,
  join_muted?: boolean
};

export type PhoneGetGroupCall = {
  call: InputGroupCall,
  limit: number
};

export type PhoneGetGroupParticipants = {
  call: InputGroupCall,
  ids: Array<InputPeer>,
  sources: Array<number>,
  offset: string,
  limit: number
};

export type PhoneCheckGroupCall = {
  call: InputGroupCall,
  sources: Array<number>
};

export type MessagesDeleteChat = {
  chat_id: string | number
};

export type MessagesDeletePhoneCallHistory = {
  flags?: number,
  revoke?: boolean
};

export type MessagesCheckHistoryImport = {
  import_head: string
};

export type MessagesInitHistoryImport = {
  peer: InputPeer,
  file: InputFile,
  media_count: number
};

export type MessagesUploadImportedMedia = {
  peer: InputPeer,
  import_id: string | number,
  file_name: string,
  media: InputMedia
};

export type MessagesStartHistoryImport = {
  peer: InputPeer,
  import_id: string | number
};

export type MessagesGetExportedChatInvites = {
  flags?: number,
  revoked?: boolean,
  peer: InputPeer,
  admin_id: InputUser,
  offset_date?: number,
  offset_link?: string,
  limit: number
};

export type MessagesGetExportedChatInvite = {
  peer: InputPeer,
  link: string
};

export type MessagesEditExportedChatInvite = {
  flags?: number,
  revoked?: boolean,
  peer: InputPeer,
  link: string,
  expire_date?: number,
  usage_limit?: number,
  request_needed?: boolean,
  title?: string
};

export type MessagesDeleteRevokedExportedChatInvites = {
  peer: InputPeer,
  admin_id: InputUser
};

export type MessagesDeleteExportedChatInvite = {
  peer: InputPeer,
  link: string
};

export type MessagesGetAdminsWithInvites = {
  peer: InputPeer
};

export type MessagesGetChatInviteImporters = {
  flags?: number,
  requested?: boolean,
  peer: InputPeer,
  link?: string,
  q?: string,
  offset_date: number,
  offset_user: InputUser,
  limit: number
};

export type MessagesSetHistoryTTL = {
  peer: InputPeer,
  period: number
};

export type AccountReportProfilePhoto = {
  peer: InputPeer,
  photo_id: InputPhoto,
  reason: ReportReason,
  message: string
};

export type ChannelsConvertToGigagroup = {
  channel: InputChannel
};

export type MessagesCheckHistoryImportPeer = {
  peer: InputPeer
};

export type PhoneToggleGroupCallRecord = {
  flags?: number,
  start?: boolean,
  video?: boolean,
  call: InputGroupCall,
  title?: string,
  video_portrait?: boolean
};

export type PhoneEditGroupCallParticipant = {
  flags?: number,
  call: InputGroupCall,
  participant: InputPeer,
  muted?: boolean,
  volume?: number,
  raise_hand?: boolean,
  video_stopped?: boolean,
  video_paused?: boolean,
  presentation_paused?: boolean
};

export type PhoneEditGroupCallTitle = {
  call: InputGroupCall,
  title: string
};

export type PhoneGetGroupCallJoinAs = {
  peer: InputPeer
};

export type PhoneExportGroupCallInvite = {
  flags?: number,
  can_self_unmute?: boolean,
  call: InputGroupCall
};

export type PhoneToggleGroupCallStartSubscription = {
  call: InputGroupCall,
  subscribed: boolean
};

export type PhoneStartScheduledGroupCall = {
  call: InputGroupCall
};

export type PhoneSaveDefaultGroupCallJoinAs = {
  peer: InputPeer,
  join_as: InputPeer
};

export type PhoneJoinGroupCallPresentation = {
  call: InputGroupCall,
  params: DataJSON
};

export type PhoneLeaveGroupCallPresentation = {
  call: InputGroupCall
};

export type StickersCheckShortName = {
  short_name: string
};

export type StickersSuggestShortName = {
  title: string
};

export type BotsResetBotCommands = {
  scope: BotCommandScope,
  lang_code: string
};

export type BotsGetBotCommands = {
  scope: BotCommandScope,
  lang_code: string
};

export type AccountResetPassword = {

};

export type AccountDeclinePasswordReset = {

};

export type AuthCheckRecoveryPassword = {
  code: string
};

export type AccountGetChatThemes = {
  hash: string | number
};

export type MessagesSetChatTheme = {
  peer: InputPeer,
  emoticon: string
};

export type ChannelsViewSponsoredMessage = {
  channel: InputChannel,
  random_id: Uint8Array
};

export type ChannelsGetSponsoredMessages = {
  channel: InputChannel
};

export type MessagesGetMessageReadParticipants = {
  peer: InputPeer,
  msg_id: number
};

export type MessagesGetSearchResultsCalendar = {
  peer: InputPeer,
  filter: MessagesFilter,
  offset_id: number,
  offset_date: number
};

export type MessagesGetSearchResultsPositions = {
  peer: InputPeer,
  filter: MessagesFilter,
  offset_id: number,
  limit: number
};

export type MessagesHideChatJoinRequest = {
  flags?: number,
  approved?: boolean,
  peer: InputPeer,
  user_id: InputUser
};

export type MessagesHideAllChatJoinRequests = {
  flags?: number,
  approved?: boolean,
  peer: InputPeer,
  link?: string
};

export type MessagesToggleNoForwards = {
  peer: InputPeer,
  enabled: boolean
};

export type MessagesSaveDefaultSendAs = {
  peer: InputPeer,
  send_as: InputPeer
};

export type ChannelsGetSendAs = {
  peer: InputPeer
};

export type AccountSetAuthorizationTTL = {
  authorization_ttl_days: number
};

export type AccountChangeAuthorizationSettings = {
  flags?: number,
  hash: string | number,
  encrypted_requests_disabled?: boolean,
  call_requests_disabled?: boolean
};

export type ChannelsDeleteParticipantHistory = {
  channel: InputChannel,
  participant: InputPeer
};

export type MessagesSendReaction = {
  flags?: number,
  big?: boolean,
  add_to_recent?: boolean,
  peer: InputPeer,
  msg_id: number,
  reaction?: Array<Reaction>
};

export type MessagesGetMessagesReactions = {
  peer: InputPeer,
  id: Array<number>
};

export type MessagesGetMessageReactionsList = {
  flags?: number,
  peer: InputPeer,
  id: number,
  reaction?: Reaction,
  offset?: string,
  limit: number
};

export type MessagesSetChatAvailableReactions = {
  peer: InputPeer,
  available_reactions: ChatReactions
};

export type MessagesGetAvailableReactions = {
  hash: number
};

export type MessagesSetDefaultReaction = {
  reaction: Reaction
};

export type MessagesTranslateText = {
  flags?: number,
  peer?: InputPeer,
  id?: Array<number>,
  text?: Array<TextWithEntities>,
  to_lang: string
};

export type MessagesGetUnreadReactions = {
  flags?: number,
  peer: InputPeer,
  top_msg_id?: number,
  offset_id: number,
  add_offset: number,
  limit: number,
  max_id: number,
  min_id: number
};

export type MessagesReadReactions = {
  flags?: number,
  peer: InputPeer,
  top_msg_id?: number
};

export type ContactsResolvePhone = {
  phone: string
};

export type PhoneGetGroupCallStreamChannels = {
  call: InputGroupCall
};

export type PhoneGetGroupCallStreamRtmpUrl = {
  peer: InputPeer,
  revoke: boolean
};

export type MessagesSearchSentMedia = {
  q: string,
  filter: MessagesFilter,
  limit: number
};

export type MessagesGetAttachMenuBots = {
  hash: string | number
};

export type MessagesGetAttachMenuBot = {
  bot: InputUser
};

export type MessagesToggleBotInAttachMenu = {
  flags?: number,
  write_allowed?: boolean,
  bot: InputUser,
  enabled: boolean
};

export type MessagesRequestWebView = {
  flags?: number,
  from_bot_menu?: boolean,
  silent?: boolean,
  peer: InputPeer,
  bot: InputUser,
  url?: string,
  start_param?: string,
  theme_params?: DataJSON,
  platform: string,
  reply_to_msg_id?: number,
  top_msg_id?: number,
  send_as?: InputPeer
};

export type MessagesProlongWebView = {
  flags?: number,
  silent?: boolean,
  peer: InputPeer,
  bot: InputUser,
  query_id: string | number,
  reply_to_msg_id?: number,
  top_msg_id?: number,
  send_as?: InputPeer
};

export type MessagesRequestSimpleWebView = {
  flags?: number,
  from_switch_webview?: boolean,
  bot: InputUser,
  url: string,
  theme_params?: DataJSON,
  platform: string
};

export type MessagesSendWebViewResultMessage = {
  bot_query_id: string,
  result: InputBotInlineResult
};

export type MessagesSendWebViewData = {
  bot: InputUser,
  random_id: string | number,
  button_text: string,
  data: string
};

export type BotsSetBotMenuButton = {
  user_id: InputUser,
  button: BotMenuButton
};

export type BotsGetBotMenuButton = {
  user_id: InputUser
};

export type AccountGetSavedRingtones = {
  hash: string | number
};

export type AccountSaveRingtone = {
  id: InputDocument,
  unsave: boolean
};

export type AccountUploadRingtone = {
  file: InputFile,
  file_name: string,
  mime_type: string
};

export type BotsSetBotBroadcastDefaultAdminRights = {
  admin_rights: ChatAdminRights
};

export type BotsSetBotGroupDefaultAdminRights = {
  admin_rights: ChatAdminRights
};

export type PhoneSaveCallLog = {
  peer: InputPhoneCall,
  file: InputFile
};

export type ChannelsToggleJoinToSend = {
  channel: InputChannel,
  enabled: boolean
};

export type ChannelsToggleJoinRequest = {
  channel: InputChannel,
  enabled: boolean
};

export type PaymentsExportInvoice = {
  invoice_media: InputMedia
};

export type MessagesTranscribeAudio = {
  peer: InputPeer,
  msg_id: number
};

export type MessagesRateTranscribedAudio = {
  peer: InputPeer,
  msg_id: number,
  transcription_id: string | number,
  good: boolean
};

export type PaymentsAssignAppStoreTransaction = {
  receipt: Uint8Array,
  purpose: InputStorePaymentPurpose
};

export type PaymentsAssignPlayMarketTransaction = {
  receipt: DataJSON,
  purpose: InputStorePaymentPurpose
};

export type PaymentsCanPurchasePremium = {
  purpose: InputStorePaymentPurpose
};

export type HelpGetPremiumPromo = {

};

export type MessagesGetCustomEmojiDocuments = {
  document_id: Array<string | number>
};

export type MessagesGetEmojiStickers = {
  hash: string | number
};

export type MessagesGetFeaturedEmojiStickers = {
  hash: string | number
};

export type AccountUpdateEmojiStatus = {
  emoji_status: EmojiStatus
};

export type AccountGetDefaultEmojiStatuses = {
  hash: string | number
};

export type AccountGetRecentEmojiStatuses = {
  hash: string | number
};

export type AccountClearRecentEmojiStatuses = {

};

export type MessagesReportReaction = {
  peer: InputPeer,
  id: number,
  reaction_peer: InputPeer
};

export type MessagesGetTopReactions = {
  limit: number,
  hash: string | number
};

export type MessagesGetRecentReactions = {
  limit: number,
  hash: string | number
};

export type MessagesClearRecentReactions = {

};

export type MessagesGetExtendedMedia = {
  peer: InputPeer,
  id: Array<number>
};

export type AuthImportWebTokenAuthorization = {
  api_id: number,
  api_hash: string,
  web_auth_token: string
};

export type AccountReorderUsernames = {
  order: Array<string>
};

export type AccountToggleUsername = {
  username: string,
  active: boolean
};

export type ChannelsReorderUsernames = {
  channel: InputChannel,
  order: Array<string>
};

export type ChannelsToggleUsername = {
  channel: InputChannel,
  username: string,
  active: boolean
};

export type ChannelsDeactivateAllUsernames = {
  channel: InputChannel
};

export type ChannelsToggleForum = {
  channel: InputChannel,
  enabled: boolean
};

export type ChannelsCreateForumTopic = {
  flags?: number,
  channel: InputChannel,
  title: string,
  icon_color?: number,
  icon_emoji_id?: string | number,
  random_id: string | number,
  send_as?: InputPeer
};

export type ChannelsGetForumTopics = {
  flags?: number,
  channel: InputChannel,
  q?: string,
  offset_date: number,
  offset_id: number,
  offset_topic: number,
  limit: number
};

export type ChannelsGetForumTopicsByID = {
  channel: InputChannel,
  topics: Array<number>
};

export type ChannelsEditForumTopic = {
  flags?: number,
  channel: InputChannel,
  topic_id: number,
  title?: string,
  icon_emoji_id?: string | number,
  closed?: boolean,
  hidden?: boolean
};

export type ChannelsUpdatePinnedForumTopic = {
  channel: InputChannel,
  topic_id: number,
  pinned: boolean
};

export type ChannelsDeleteTopicHistory = {
  channel: InputChannel,
  top_msg_id: number
};

export type ChannelsReorderPinnedForumTopics = {
  flags?: number,
  force?: boolean,
  channel: InputChannel,
  order: Array<number>
};

export type ChannelsToggleAntiSpam = {
  channel: InputChannel,
  enabled: boolean
};

export type ChannelsReportAntiSpamFalsePositive = {
  channel: InputChannel,
  msg_id: number
};

export type MessagesSetDefaultHistoryTTL = {
  period: number
};

export type MessagesGetDefaultHistoryTTL = {

};

export type ContactsExportContactToken = {

};

export type ContactsImportContactToken = {
  token: string
};

export type PhotosUploadContactProfilePhoto = {
  flags?: number,
  suggest?: boolean,
  save?: boolean,
  user_id: InputUser,
  file?: InputFile,
  video?: InputFile,
  video_start_ts?: number,
  video_emoji_markup?: VideoSize
};

export type ChannelsToggleParticipantsHidden = {
  channel: InputChannel,
  enabled: boolean
};

export type MessagesSendBotRequestedPeer = {
  peer: InputPeer,
  msg_id: number,
  button_id: number,
  requested_peer: InputPeer
};

export type AccountGetDefaultProfilePhotoEmojis = {
  hash: string | number
};

export type AccountGetDefaultGroupPhotoEmojis = {
  hash: string | number
};

export type AuthRequestFirebaseSms = {
  flags?: number,
  phone_number: string,
  phone_code_hash: string,
  safety_net_token?: string,
  ios_push_secret?: string
};

export type MessagesGetEmojiGroups = {
  hash: number
};

export type MessagesGetEmojiStatusGroups = {
  hash: number
};

export type MessagesGetEmojiProfilePhotoGroups = {
  hash: number
};

export type MessagesSearchCustomEmoji = {
  emoticon: string,
  hash: string | number
};

export type MessagesTogglePeerTranslations = {
  flags?: number,
  disabled?: boolean,
  peer: InputPeer
};

export type AccountGetAutoSaveSettings = {

};

export type AccountSaveAutoSaveSettings = {
  flags?: number,
  users?: boolean,
  chats?: boolean,
  broadcasts?: boolean,
  peer?: InputPeer,
  settings: AutoSaveSettings
};

export type AccountDeleteAutoSaveExceptions = {

};

export type StickersChangeSticker = {
  flags?: number,
  sticker: InputDocument,
  emoji?: string,
  mask_coords?: MaskCoords,
  keywords?: string
};

export type StickersRenameStickerSet = {
  stickerset: InputStickerSet,
  title: string
};

export type StickersDeleteStickerSet = {
  stickerset: InputStickerSet
};

export type MessagesGetBotApp = {
  app: InputBotApp,
  hash: string | number
};

export type MessagesRequestAppWebView = {
  flags?: number,
  write_allowed?: boolean,
  peer: InputPeer,
  app: InputBotApp,
  start_param?: string,
  theme_params?: DataJSON,
  platform: string
};

export type BotsSetBotInfo = {
  flags?: number,
  bot?: InputUser,
  lang_code: string,
  name?: string,
  about?: string,
  description?: string
};

export type BotsGetBotInfo = {
  flags?: number,
  bot?: InputUser,
  lang_code: string
};

export type AuthResetLoginEmail = {
  phone_number: string,
  phone_code_hash: string
};

export type ChatlistsExportChatlistInvite = {
  chatlist: InputChatlist,
  title: string,
  peers: Array<InputPeer>
};

export type ChatlistsDeleteExportedInvite = {
  chatlist: InputChatlist,
  slug: string
};

export type ChatlistsEditExportedInvite = {
  flags?: number,
  chatlist: InputChatlist,
  slug: string,
  title?: string,
  peers?: Array<InputPeer>
};

export type ChatlistsGetExportedInvites = {
  chatlist: InputChatlist
};

export type ChatlistsCheckChatlistInvite = {
  slug: string
};

export type ChatlistsJoinChatlistInvite = {
  slug: string,
  peers: Array<InputPeer>
};

export type ChatlistsGetChatlistUpdates = {
  chatlist: InputChatlist
};

export type ChatlistsJoinChatlistUpdates = {
  chatlist: InputChatlist,
  peers: Array<InputPeer>
};

export type ChatlistsHideChatlistUpdates = {
  chatlist: InputChatlist
};

export type ChatlistsGetLeaveChatlistSuggestions = {
  chatlist: InputChatlist
};

export type ChatlistsLeaveChatlist = {
  chatlist: InputChatlist,
  peers: Array<InputPeer>
};

export type BotsReorderUsernames = {
  bot: InputUser,
  order: Array<string>
};

export type BotsToggleUsername = {
  bot: InputUser,
  username: string,
  active: boolean
};

export type MessagesSetChatWallPaper = {
  flags?: number,
  peer: InputPeer,
  wallpaper?: InputWallPaper,
  settings?: WallPaperSettings,
  id?: number
};

export interface MethodDeclMap {
  'invokeAfterMsg': {req: InvokeAfterMsg, res: any},
  'invokeAfterMsgs': {req: InvokeAfterMsgs, res: any},
  'auth.sendCode': {req: AuthSendCode, res: AuthSentCode},
  'auth.signUp': {req: AuthSignUp, res: AuthAuthorization},
  'auth.signIn': {req: AuthSignIn, res: AuthAuthorization},
  'auth.logOut': {req: AuthLogOut, res: AuthLoggedOut},
  'auth.resetAuthorizations': {req: AuthResetAuthorizations, res: boolean},
  'auth.exportAuthorization': {req: AuthExportAuthorization, res: AuthExportedAuthorization},
  'auth.importAuthorization': {req: AuthImportAuthorization, res: AuthAuthorization},
  'auth.bindTempAuthKey': {req: AuthBindTempAuthKey, res: boolean},
  'account.registerDevice': {req: AccountRegisterDevice, res: boolean},
  'account.unregisterDevice': {req: AccountUnregisterDevice, res: boolean},
  'account.updateNotifySettings': {req: AccountUpdateNotifySettings, res: boolean},
  'account.getNotifySettings': {req: AccountGetNotifySettings, res: PeerNotifySettings},
  'account.resetNotifySettings': {req: AccountResetNotifySettings, res: boolean},
  'account.updateProfile': {req: AccountUpdateProfile, res: User},
  'account.updateStatus': {req: AccountUpdateStatus, res: boolean},
  'account.getWallPapers': {req: AccountGetWallPapers, res: AccountWallPapers},
  'account.reportPeer': {req: AccountReportPeer, res: boolean},
  'users.getUsers': {req: UsersGetUsers, res: Array<User>},
  'users.getFullUser': {req: UsersGetFullUser, res: UsersUserFull},
  'contacts.getContactIDs': {req: ContactsGetContactIDs, res: Array<number>},
  'contacts.getStatuses': {req: ContactsGetStatuses, res: Array<ContactStatus>},
  'contacts.getContacts': {req: ContactsGetContacts, res: ContactsContacts},
  'contacts.importContacts': {req: ContactsImportContacts, res: ContactsImportedContacts},
  'contacts.deleteContacts': {req: ContactsDeleteContacts, res: Updates},
  'contacts.deleteByPhones': {req: ContactsDeleteByPhones, res: boolean},
  'contacts.block': {req: ContactsBlock, res: boolean},
  'contacts.unblock': {req: ContactsUnblock, res: boolean},
  'contacts.getBlocked': {req: ContactsGetBlocked, res: ContactsBlocked},
  'messages.getMessages': {req: MessagesGetMessages, res: MessagesMessages},
  'messages.getDialogs': {req: MessagesGetDialogs, res: MessagesDialogs},
  'messages.getHistory': {req: MessagesGetHistory, res: MessagesMessages},
  'messages.search': {req: MessagesSearch, res: MessagesMessages},
  'messages.readHistory': {req: MessagesReadHistory, res: MessagesAffectedMessages},
  'messages.deleteHistory': {req: MessagesDeleteHistory, res: MessagesAffectedHistory},
  'messages.deleteMessages': {req: MessagesDeleteMessages, res: MessagesAffectedMessages},
  'messages.receivedMessages': {req: MessagesReceivedMessages, res: Array<ReceivedNotifyMessage>},
  'messages.setTyping': {req: MessagesSetTyping, res: boolean},
  'messages.sendMessage': {req: MessagesSendMessage, res: Updates},
  'messages.sendMedia': {req: MessagesSendMedia, res: Updates},
  'messages.forwardMessages': {req: MessagesForwardMessages, res: Updates},
  'messages.reportSpam': {req: MessagesReportSpam, res: boolean},
  'messages.getPeerSettings': {req: MessagesGetPeerSettings, res: MessagesPeerSettings},
  'messages.report': {req: MessagesReport, res: boolean},
  'messages.getChats': {req: MessagesGetChats, res: MessagesChats},
  'messages.getFullChat': {req: MessagesGetFullChat, res: MessagesChatFull},
  'messages.editChatTitle': {req: MessagesEditChatTitle, res: Updates},
  'messages.editChatPhoto': {req: MessagesEditChatPhoto, res: Updates},
  'messages.addChatUser': {req: MessagesAddChatUser, res: Updates},
  'messages.deleteChatUser': {req: MessagesDeleteChatUser, res: Updates},
  'messages.createChat': {req: MessagesCreateChat, res: Updates},
  'updates.getState': {req: UpdatesGetState, res: UpdatesState},
  'updates.getDifference': {req: UpdatesGetDifference, res: UpdatesDifference},
  'photos.updateProfilePhoto': {req: PhotosUpdateProfilePhoto, res: PhotosPhoto},
  'photos.uploadProfilePhoto': {req: PhotosUploadProfilePhoto, res: PhotosPhoto},
  'photos.deletePhotos': {req: PhotosDeletePhotos, res: Array<string | number>},
  'upload.saveFilePart': {req: UploadSaveFilePart, res: boolean},
  'upload.getFile': {req: UploadGetFile, res: UploadFile},
  'help.getConfig': {req: HelpGetConfig, res: Config},
  'help.getNearestDc': {req: HelpGetNearestDc, res: NearestDc},
  'help.getAppUpdate': {req: HelpGetAppUpdate, res: HelpAppUpdate},
  'help.getInviteText': {req: HelpGetInviteText, res: HelpInviteText},
  'photos.getUserPhotos': {req: PhotosGetUserPhotos, res: PhotosPhotos},
  'messages.getDhConfig': {req: MessagesGetDhConfig, res: MessagesDhConfig},
  'messages.requestEncryption': {req: MessagesRequestEncryption, res: EncryptedChat},
  'messages.acceptEncryption': {req: MessagesAcceptEncryption, res: EncryptedChat},
  'messages.discardEncryption': {req: MessagesDiscardEncryption, res: boolean},
  'messages.setEncryptedTyping': {req: MessagesSetEncryptedTyping, res: boolean},
  'messages.readEncryptedHistory': {req: MessagesReadEncryptedHistory, res: boolean},
  'messages.sendEncrypted': {req: MessagesSendEncrypted, res: MessagesSentEncryptedMessage},
  'messages.sendEncryptedFile': {req: MessagesSendEncryptedFile, res: MessagesSentEncryptedMessage},
  'messages.sendEncryptedService': {req: MessagesSendEncryptedService, res: MessagesSentEncryptedMessage},
  'messages.receivedQueue': {req: MessagesReceivedQueue, res: Array<string | number>},
  'messages.reportEncryptedSpam': {req: MessagesReportEncryptedSpam, res: boolean},
  'upload.saveBigFilePart': {req: UploadSaveBigFilePart, res: boolean},
  'initConnection': {req: InitConnection, res: any},
  'help.getSupport': {req: HelpGetSupport, res: HelpSupport},
  'messages.readMessageContents': {req: MessagesReadMessageContents, res: MessagesAffectedMessages},
  'account.checkUsername': {req: AccountCheckUsername, res: boolean},
  'account.updateUsername': {req: AccountUpdateUsername, res: User},
  'contacts.search': {req: ContactsSearch, res: ContactsFound},
  'account.getPrivacy': {req: AccountGetPrivacy, res: AccountPrivacyRules},
  'account.setPrivacy': {req: AccountSetPrivacy, res: AccountPrivacyRules},
  'account.deleteAccount': {req: AccountDeleteAccount, res: boolean},
  'account.getAccountTTL': {req: AccountGetAccountTTL, res: AccountDaysTTL},
  'account.setAccountTTL': {req: AccountSetAccountTTL, res: boolean},
  'invokeWithLayer': {req: InvokeWithLayer, res: any},
  'contacts.resolveUsername': {req: ContactsResolveUsername, res: ContactsResolvedPeer},
  'account.sendChangePhoneCode': {req: AccountSendChangePhoneCode, res: AuthSentCode},
  'account.changePhone': {req: AccountChangePhone, res: User},
  'messages.getStickers': {req: MessagesGetStickers, res: MessagesStickers},
  'messages.getAllStickers': {req: MessagesGetAllStickers, res: MessagesAllStickers},
  'account.updateDeviceLocked': {req: AccountUpdateDeviceLocked, res: boolean},
  'auth.importBotAuthorization': {req: AuthImportBotAuthorization, res: AuthAuthorization},
  'messages.getWebPagePreview': {req: MessagesGetWebPagePreview, res: MessageMedia},
  'account.getAuthorizations': {req: AccountGetAuthorizations, res: AccountAuthorizations},
  'account.resetAuthorization': {req: AccountResetAuthorization, res: boolean},
  'account.getPassword': {req: AccountGetPassword, res: AccountPassword},
  'account.getPasswordSettings': {req: AccountGetPasswordSettings, res: AccountPasswordSettings},
  'account.updatePasswordSettings': {req: AccountUpdatePasswordSettings, res: boolean},
  'auth.checkPassword': {req: AuthCheckPassword, res: AuthAuthorization},
  'auth.requestPasswordRecovery': {req: AuthRequestPasswordRecovery, res: AuthPasswordRecovery},
  'auth.recoverPassword': {req: AuthRecoverPassword, res: AuthAuthorization},
  'invokeWithoutUpdates': {req: InvokeWithoutUpdates, res: any},
  'messages.exportChatInvite': {req: MessagesExportChatInvite, res: ExportedChatInvite},
  'messages.checkChatInvite': {req: MessagesCheckChatInvite, res: ChatInvite},
  'messages.importChatInvite': {req: MessagesImportChatInvite, res: Updates},
  'messages.getStickerSet': {req: MessagesGetStickerSet, res: MessagesStickerSet},
  'messages.installStickerSet': {req: MessagesInstallStickerSet, res: MessagesStickerSetInstallResult},
  'messages.uninstallStickerSet': {req: MessagesUninstallStickerSet, res: boolean},
  'messages.startBot': {req: MessagesStartBot, res: Updates},
  'help.getAppChangelog': {req: HelpGetAppChangelog, res: Updates},
  'messages.getMessagesViews': {req: MessagesGetMessagesViews, res: MessagesMessageViews},
  'channels.readHistory': {req: ChannelsReadHistory, res: boolean},
  'channels.deleteMessages': {req: ChannelsDeleteMessages, res: MessagesAffectedMessages},
  'channels.reportSpam': {req: ChannelsReportSpam, res: boolean},
  'channels.getMessages': {req: ChannelsGetMessages, res: MessagesMessages},
  'channels.getParticipants': {req: ChannelsGetParticipants, res: ChannelsChannelParticipants},
  'channels.getParticipant': {req: ChannelsGetParticipant, res: ChannelsChannelParticipant},
  'channels.getChannels': {req: ChannelsGetChannels, res: MessagesChats},
  'channels.getFullChannel': {req: ChannelsGetFullChannel, res: MessagesChatFull},
  'channels.createChannel': {req: ChannelsCreateChannel, res: Updates},
  'channels.editAdmin': {req: ChannelsEditAdmin, res: Updates},
  'channels.editTitle': {req: ChannelsEditTitle, res: Updates},
  'channels.editPhoto': {req: ChannelsEditPhoto, res: Updates},
  'channels.checkUsername': {req: ChannelsCheckUsername, res: boolean},
  'channels.updateUsername': {req: ChannelsUpdateUsername, res: boolean},
  'channels.joinChannel': {req: ChannelsJoinChannel, res: Updates},
  'channels.leaveChannel': {req: ChannelsLeaveChannel, res: Updates},
  'channels.inviteToChannel': {req: ChannelsInviteToChannel, res: Updates},
  'channels.deleteChannel': {req: ChannelsDeleteChannel, res: Updates},
  'updates.getChannelDifference': {req: UpdatesGetChannelDifference, res: UpdatesChannelDifference},
  'messages.editChatAdmin': {req: MessagesEditChatAdmin, res: boolean},
  'messages.migrateChat': {req: MessagesMigrateChat, res: Updates},
  'messages.searchGlobal': {req: MessagesSearchGlobal, res: MessagesMessages},
  'messages.reorderStickerSets': {req: MessagesReorderStickerSets, res: boolean},
  'messages.getDocumentByHash': {req: MessagesGetDocumentByHash, res: Document},
  'messages.getSavedGifs': {req: MessagesGetSavedGifs, res: MessagesSavedGifs},
  'messages.saveGif': {req: MessagesSaveGif, res: boolean},
  'messages.getInlineBotResults': {req: MessagesGetInlineBotResults, res: MessagesBotResults},
  'messages.setInlineBotResults': {req: MessagesSetInlineBotResults, res: boolean},
  'messages.sendInlineBotResult': {req: MessagesSendInlineBotResult, res: Updates},
  'channels.exportMessageLink': {req: ChannelsExportMessageLink, res: ExportedMessageLink},
  'channels.toggleSignatures': {req: ChannelsToggleSignatures, res: Updates},
  'auth.resendCode': {req: AuthResendCode, res: AuthSentCode},
  'auth.cancelCode': {req: AuthCancelCode, res: boolean},
  'messages.getMessageEditData': {req: MessagesGetMessageEditData, res: MessagesMessageEditData},
  'messages.editMessage': {req: MessagesEditMessage, res: Updates},
  'messages.editInlineBotMessage': {req: MessagesEditInlineBotMessage, res: boolean},
  'messages.getBotCallbackAnswer': {req: MessagesGetBotCallbackAnswer, res: MessagesBotCallbackAnswer},
  'messages.setBotCallbackAnswer': {req: MessagesSetBotCallbackAnswer, res: boolean},
  'contacts.getTopPeers': {req: ContactsGetTopPeers, res: ContactsTopPeers},
  'contacts.resetTopPeerRating': {req: ContactsResetTopPeerRating, res: boolean},
  'messages.getPeerDialogs': {req: MessagesGetPeerDialogs, res: MessagesPeerDialogs},
  'messages.saveDraft': {req: MessagesSaveDraft, res: boolean},
  'messages.getAllDrafts': {req: MessagesGetAllDrafts, res: Updates},
  'messages.getFeaturedStickers': {req: MessagesGetFeaturedStickers, res: MessagesFeaturedStickers},
  'messages.readFeaturedStickers': {req: MessagesReadFeaturedStickers, res: boolean},
  'messages.getRecentStickers': {req: MessagesGetRecentStickers, res: MessagesRecentStickers},
  'messages.saveRecentSticker': {req: MessagesSaveRecentSticker, res: boolean},
  'messages.clearRecentStickers': {req: MessagesClearRecentStickers, res: boolean},
  'messages.getArchivedStickers': {req: MessagesGetArchivedStickers, res: MessagesArchivedStickers},
  'account.sendConfirmPhoneCode': {req: AccountSendConfirmPhoneCode, res: AuthSentCode},
  'account.confirmPhone': {req: AccountConfirmPhone, res: boolean},
  'channels.getAdminedPublicChannels': {req: ChannelsGetAdminedPublicChannels, res: MessagesChats},
  'messages.getMaskStickers': {req: MessagesGetMaskStickers, res: MessagesAllStickers},
  'messages.getAttachedStickers': {req: MessagesGetAttachedStickers, res: Array<StickerSetCovered>},
  'auth.dropTempAuthKeys': {req: AuthDropTempAuthKeys, res: boolean},
  'messages.setGameScore': {req: MessagesSetGameScore, res: Updates},
  'messages.setInlineGameScore': {req: MessagesSetInlineGameScore, res: boolean},
  'messages.getGameHighScores': {req: MessagesGetGameHighScores, res: MessagesHighScores},
  'messages.getInlineGameHighScores': {req: MessagesGetInlineGameHighScores, res: MessagesHighScores},
  'messages.getCommonChats': {req: MessagesGetCommonChats, res: MessagesChats},
  'messages.getAllChats': {req: MessagesGetAllChats, res: MessagesChats},
  'help.setBotUpdatesStatus': {req: HelpSetBotUpdatesStatus, res: boolean},
  'messages.getWebPage': {req: MessagesGetWebPage, res: WebPage},
  'messages.toggleDialogPin': {req: MessagesToggleDialogPin, res: boolean},
  'messages.reorderPinnedDialogs': {req: MessagesReorderPinnedDialogs, res: boolean},
  'messages.getPinnedDialogs': {req: MessagesGetPinnedDialogs, res: MessagesPeerDialogs},
  'bots.sendCustomRequest': {req: BotsSendCustomRequest, res: DataJSON},
  'bots.answerWebhookJSONQuery': {req: BotsAnswerWebhookJSONQuery, res: boolean},
  'upload.getWebFile': {req: UploadGetWebFile, res: UploadWebFile},
  'payments.getPaymentForm': {req: PaymentsGetPaymentForm, res: PaymentsPaymentForm},
  'payments.getPaymentReceipt': {req: PaymentsGetPaymentReceipt, res: PaymentsPaymentReceipt},
  'payments.validateRequestedInfo': {req: PaymentsValidateRequestedInfo, res: PaymentsValidatedRequestedInfo},
  'payments.sendPaymentForm': {req: PaymentsSendPaymentForm, res: PaymentsPaymentResult},
  'account.getTmpPassword': {req: AccountGetTmpPassword, res: AccountTmpPassword},
  'payments.getSavedInfo': {req: PaymentsGetSavedInfo, res: PaymentsSavedInfo},
  'payments.clearSavedInfo': {req: PaymentsClearSavedInfo, res: boolean},
  'messages.setBotShippingResults': {req: MessagesSetBotShippingResults, res: boolean},
  'messages.setBotPrecheckoutResults': {req: MessagesSetBotPrecheckoutResults, res: boolean},
  'stickers.createStickerSet': {req: StickersCreateStickerSet, res: MessagesStickerSet},
  'stickers.removeStickerFromSet': {req: StickersRemoveStickerFromSet, res: MessagesStickerSet},
  'stickers.changeStickerPosition': {req: StickersChangeStickerPosition, res: MessagesStickerSet},
  'stickers.addStickerToSet': {req: StickersAddStickerToSet, res: MessagesStickerSet},
  'messages.uploadMedia': {req: MessagesUploadMedia, res: MessageMedia},
  'phone.getCallConfig': {req: PhoneGetCallConfig, res: DataJSON},
  'phone.requestCall': {req: PhoneRequestCall, res: PhonePhoneCall},
  'phone.acceptCall': {req: PhoneAcceptCall, res: PhonePhoneCall},
  'phone.confirmCall': {req: PhoneConfirmCall, res: PhonePhoneCall},
  'phone.receivedCall': {req: PhoneReceivedCall, res: boolean},
  'phone.discardCall': {req: PhoneDiscardCall, res: Updates},
  'phone.setCallRating': {req: PhoneSetCallRating, res: Updates},
  'phone.saveCallDebug': {req: PhoneSaveCallDebug, res: boolean},
  'upload.getCdnFile': {req: UploadGetCdnFile, res: UploadCdnFile},
  'upload.reuploadCdnFile': {req: UploadReuploadCdnFile, res: Array<FileHash>},
  'help.getCdnConfig': {req: HelpGetCdnConfig, res: CdnConfig},
  'langpack.getLangPack': {req: LangpackGetLangPack, res: LangPackDifference},
  'langpack.getStrings': {req: LangpackGetStrings, res: Array<LangPackString>},
  'langpack.getDifference': {req: LangpackGetDifference, res: LangPackDifference},
  'langpack.getLanguages': {req: LangpackGetLanguages, res: Array<LangPackLanguage>},
  'channels.editBanned': {req: ChannelsEditBanned, res: Updates},
  'channels.getAdminLog': {req: ChannelsGetAdminLog, res: ChannelsAdminLogResults},
  'upload.getCdnFileHashes': {req: UploadGetCdnFileHashes, res: Array<FileHash>},
  'messages.sendScreenshotNotification': {req: MessagesSendScreenshotNotification, res: Updates},
  'channels.setStickers': {req: ChannelsSetStickers, res: boolean},
  'messages.getFavedStickers': {req: MessagesGetFavedStickers, res: MessagesFavedStickers},
  'messages.faveSticker': {req: MessagesFaveSticker, res: boolean},
  'channels.readMessageContents': {req: ChannelsReadMessageContents, res: boolean},
  'contacts.resetSaved': {req: ContactsResetSaved, res: boolean},
  'messages.getUnreadMentions': {req: MessagesGetUnreadMentions, res: MessagesMessages},
  'channels.deleteHistory': {req: ChannelsDeleteHistory, res: Updates},
  'help.getRecentMeUrls': {req: HelpGetRecentMeUrls, res: HelpRecentMeUrls},
  'channels.togglePreHistoryHidden': {req: ChannelsTogglePreHistoryHidden, res: Updates},
  'messages.readMentions': {req: MessagesReadMentions, res: MessagesAffectedHistory},
  'messages.getRecentLocations': {req: MessagesGetRecentLocations, res: MessagesMessages},
  'messages.sendMultiMedia': {req: MessagesSendMultiMedia, res: Updates},
  'messages.uploadEncryptedFile': {req: MessagesUploadEncryptedFile, res: EncryptedFile},
  'account.getWebAuthorizations': {req: AccountGetWebAuthorizations, res: AccountWebAuthorizations},
  'account.resetWebAuthorization': {req: AccountResetWebAuthorization, res: boolean},
  'account.resetWebAuthorizations': {req: AccountResetWebAuthorizations, res: boolean},
  'messages.searchStickerSets': {req: MessagesSearchStickerSets, res: MessagesFoundStickerSets},
  'upload.getFileHashes': {req: UploadGetFileHashes, res: Array<FileHash>},
  'help.getTermsOfServiceUpdate': {req: HelpGetTermsOfServiceUpdate, res: HelpTermsOfServiceUpdate},
  'help.acceptTermsOfService': {req: HelpAcceptTermsOfService, res: boolean},
  'account.getAllSecureValues': {req: AccountGetAllSecureValues, res: Array<SecureValue>},
  'account.getSecureValue': {req: AccountGetSecureValue, res: Array<SecureValue>},
  'account.saveSecureValue': {req: AccountSaveSecureValue, res: SecureValue},
  'account.deleteSecureValue': {req: AccountDeleteSecureValue, res: boolean},
  'users.setSecureValueErrors': {req: UsersSetSecureValueErrors, res: boolean},
  'account.getAuthorizationForm': {req: AccountGetAuthorizationForm, res: AccountAuthorizationForm},
  'account.acceptAuthorization': {req: AccountAcceptAuthorization, res: boolean},
  'account.sendVerifyPhoneCode': {req: AccountSendVerifyPhoneCode, res: AuthSentCode},
  'account.verifyPhone': {req: AccountVerifyPhone, res: boolean},
  'account.sendVerifyEmailCode': {req: AccountSendVerifyEmailCode, res: AccountSentEmailCode},
  'account.verifyEmail': {req: AccountVerifyEmail, res: AccountEmailVerified},
  'help.getDeepLinkInfo': {req: HelpGetDeepLinkInfo, res: HelpDeepLinkInfo},
  'contacts.getSaved': {req: ContactsGetSaved, res: Array<SavedContact>},
  'channels.getLeftChannels': {req: ChannelsGetLeftChannels, res: MessagesChats},
  'account.initTakeoutSession': {req: AccountInitTakeoutSession, res: AccountTakeout},
  'account.finishTakeoutSession': {req: AccountFinishTakeoutSession, res: boolean},
  'messages.getSplitRanges': {req: MessagesGetSplitRanges, res: Array<MessageRange>},
  'invokeWithMessagesRange': {req: InvokeWithMessagesRange, res: any},
  'invokeWithTakeout': {req: InvokeWithTakeout, res: any},
  'messages.markDialogUnread': {req: MessagesMarkDialogUnread, res: boolean},
  'messages.getDialogUnreadMarks': {req: MessagesGetDialogUnreadMarks, res: Array<DialogPeer>},
  'contacts.toggleTopPeers': {req: ContactsToggleTopPeers, res: boolean},
  'messages.clearAllDrafts': {req: MessagesClearAllDrafts, res: boolean},
  'help.getAppConfig': {req: HelpGetAppConfig, res: HelpAppConfig},
  'help.saveAppLog': {req: HelpSaveAppLog, res: boolean},
  'help.getPassportConfig': {req: HelpGetPassportConfig, res: HelpPassportConfig},
  'langpack.getLanguage': {req: LangpackGetLanguage, res: LangPackLanguage},
  'messages.updatePinnedMessage': {req: MessagesUpdatePinnedMessage, res: Updates},
  'account.confirmPasswordEmail': {req: AccountConfirmPasswordEmail, res: boolean},
  'account.resendPasswordEmail': {req: AccountResendPasswordEmail, res: boolean},
  'account.cancelPasswordEmail': {req: AccountCancelPasswordEmail, res: boolean},
  'help.getSupportName': {req: HelpGetSupportName, res: HelpSupportName},
  'help.getUserInfo': {req: HelpGetUserInfo, res: HelpUserInfo},
  'help.editUserInfo': {req: HelpEditUserInfo, res: HelpUserInfo},
  'account.getContactSignUpNotification': {req: AccountGetContactSignUpNotification, res: boolean},
  'account.setContactSignUpNotification': {req: AccountSetContactSignUpNotification, res: boolean},
  'account.getNotifyExceptions': {req: AccountGetNotifyExceptions, res: Updates},
  'messages.sendVote': {req: MessagesSendVote, res: Updates},
  'messages.getPollResults': {req: MessagesGetPollResults, res: Updates},
  'messages.getOnlines': {req: MessagesGetOnlines, res: ChatOnlines},
  'messages.editChatAbout': {req: MessagesEditChatAbout, res: boolean},
  'messages.editChatDefaultBannedRights': {req: MessagesEditChatDefaultBannedRights, res: Updates},
  'account.getWallPaper': {req: AccountGetWallPaper, res: WallPaper},
  'account.uploadWallPaper': {req: AccountUploadWallPaper, res: WallPaper},
  'account.saveWallPaper': {req: AccountSaveWallPaper, res: boolean},
  'account.installWallPaper': {req: AccountInstallWallPaper, res: boolean},
  'account.resetWallPapers': {req: AccountResetWallPapers, res: boolean},
  'account.getAutoDownloadSettings': {req: AccountGetAutoDownloadSettings, res: AccountAutoDownloadSettings},
  'account.saveAutoDownloadSettings': {req: AccountSaveAutoDownloadSettings, res: boolean},
  'messages.getEmojiKeywords': {req: MessagesGetEmojiKeywords, res: EmojiKeywordsDifference},
  'messages.getEmojiKeywordsDifference': {req: MessagesGetEmojiKeywordsDifference, res: EmojiKeywordsDifference},
  'messages.getEmojiKeywordsLanguages': {req: MessagesGetEmojiKeywordsLanguages, res: Array<EmojiLanguage>},
  'messages.getEmojiURL': {req: MessagesGetEmojiURL, res: EmojiURL},
  'folders.editPeerFolders': {req: FoldersEditPeerFolders, res: Updates},
  'messages.getSearchCounters': {req: MessagesGetSearchCounters, res: Array<MessagesSearchCounter>},
  'channels.getGroupsForDiscussion': {req: ChannelsGetGroupsForDiscussion, res: MessagesChats},
  'channels.setDiscussionGroup': {req: ChannelsSetDiscussionGroup, res: boolean},
  'messages.requestUrlAuth': {req: MessagesRequestUrlAuth, res: UrlAuthResult},
  'messages.acceptUrlAuth': {req: MessagesAcceptUrlAuth, res: UrlAuthResult},
  'messages.hidePeerSettingsBar': {req: MessagesHidePeerSettingsBar, res: boolean},
  'contacts.addContact': {req: ContactsAddContact, res: Updates},
  'contacts.acceptContact': {req: ContactsAcceptContact, res: Updates},
  'channels.editCreator': {req: ChannelsEditCreator, res: Updates},
  'contacts.getLocated': {req: ContactsGetLocated, res: Updates},
  'channels.editLocation': {req: ChannelsEditLocation, res: boolean},
  'channels.toggleSlowMode': {req: ChannelsToggleSlowMode, res: Updates},
  'messages.getScheduledHistory': {req: MessagesGetScheduledHistory, res: MessagesMessages},
  'messages.getScheduledMessages': {req: MessagesGetScheduledMessages, res: MessagesMessages},
  'messages.sendScheduledMessages': {req: MessagesSendScheduledMessages, res: Updates},
  'messages.deleteScheduledMessages': {req: MessagesDeleteScheduledMessages, res: Updates},
  'account.uploadTheme': {req: AccountUploadTheme, res: Document},
  'account.createTheme': {req: AccountCreateTheme, res: Theme},
  'account.updateTheme': {req: AccountUpdateTheme, res: Theme},
  'account.saveTheme': {req: AccountSaveTheme, res: boolean},
  'account.installTheme': {req: AccountInstallTheme, res: boolean},
  'account.getTheme': {req: AccountGetTheme, res: Theme},
  'account.getThemes': {req: AccountGetThemes, res: AccountThemes},
  'auth.exportLoginToken': {req: AuthExportLoginToken, res: AuthLoginToken},
  'auth.importLoginToken': {req: AuthImportLoginToken, res: AuthLoginToken},
  'auth.acceptLoginToken': {req: AuthAcceptLoginToken, res: Authorization},
  'account.setContentSettings': {req: AccountSetContentSettings, res: boolean},
  'account.getContentSettings': {req: AccountGetContentSettings, res: AccountContentSettings},
  'channels.getInactiveChannels': {req: ChannelsGetInactiveChannels, res: MessagesInactiveChats},
  'account.getMultiWallPapers': {req: AccountGetMultiWallPapers, res: Array<WallPaper>},
  'messages.getPollVotes': {req: MessagesGetPollVotes, res: MessagesVotesList},
  'messages.toggleStickerSets': {req: MessagesToggleStickerSets, res: boolean},
  'payments.getBankCardData': {req: PaymentsGetBankCardData, res: PaymentsBankCardData},
  'messages.getDialogFilters': {req: MessagesGetDialogFilters, res: Array<DialogFilter>},
  'messages.getSuggestedDialogFilters': {req: MessagesGetSuggestedDialogFilters, res: Array<DialogFilterSuggested>},
  'messages.updateDialogFilter': {req: MessagesUpdateDialogFilter, res: boolean},
  'messages.updateDialogFiltersOrder': {req: MessagesUpdateDialogFiltersOrder, res: boolean},
  'stats.getBroadcastStats': {req: StatsGetBroadcastStats, res: StatsBroadcastStats},
  'stats.loadAsyncGraph': {req: StatsLoadAsyncGraph, res: StatsGraph},
  'stickers.setStickerSetThumb': {req: StickersSetStickerSetThumb, res: MessagesStickerSet},
  'bots.setBotCommands': {req: BotsSetBotCommands, res: boolean},
  'messages.getOldFeaturedStickers': {req: MessagesGetOldFeaturedStickers, res: MessagesFeaturedStickers},
  'help.getPromoData': {req: HelpGetPromoData, res: HelpPromoData},
  'help.hidePromoData': {req: HelpHidePromoData, res: boolean},
  'phone.sendSignalingData': {req: PhoneSendSignalingData, res: boolean},
  'stats.getMegagroupStats': {req: StatsGetMegagroupStats, res: StatsMegagroupStats},
  'account.getGlobalPrivacySettings': {req: AccountGetGlobalPrivacySettings, res: GlobalPrivacySettings},
  'account.setGlobalPrivacySettings': {req: AccountSetGlobalPrivacySettings, res: GlobalPrivacySettings},
  'help.dismissSuggestion': {req: HelpDismissSuggestion, res: boolean},
  'help.getCountriesList': {req: HelpGetCountriesList, res: HelpCountriesList},
  'messages.getReplies': {req: MessagesGetReplies, res: MessagesMessages},
  'messages.getDiscussionMessage': {req: MessagesGetDiscussionMessage, res: MessagesDiscussionMessage},
  'messages.readDiscussion': {req: MessagesReadDiscussion, res: boolean},
  'contacts.blockFromReplies': {req: ContactsBlockFromReplies, res: Updates},
  'stats.getMessagePublicForwards': {req: StatsGetMessagePublicForwards, res: MessagesMessages},
  'stats.getMessageStats': {req: StatsGetMessageStats, res: StatsMessageStats},
  'messages.unpinAllMessages': {req: MessagesUnpinAllMessages, res: MessagesAffectedHistory},
  'phone.createGroupCall': {req: PhoneCreateGroupCall, res: Updates},
  'phone.joinGroupCall': {req: PhoneJoinGroupCall, res: Updates},
  'phone.leaveGroupCall': {req: PhoneLeaveGroupCall, res: Updates},
  'phone.inviteToGroupCall': {req: PhoneInviteToGroupCall, res: Updates},
  'phone.discardGroupCall': {req: PhoneDiscardGroupCall, res: Updates},
  'phone.toggleGroupCallSettings': {req: PhoneToggleGroupCallSettings, res: Updates},
  'phone.getGroupCall': {req: PhoneGetGroupCall, res: PhoneGroupCall},
  'phone.getGroupParticipants': {req: PhoneGetGroupParticipants, res: PhoneGroupParticipants},
  'phone.checkGroupCall': {req: PhoneCheckGroupCall, res: Array<number>},
  'messages.deleteChat': {req: MessagesDeleteChat, res: boolean},
  'messages.deletePhoneCallHistory': {req: MessagesDeletePhoneCallHistory, res: MessagesAffectedFoundMessages},
  'messages.checkHistoryImport': {req: MessagesCheckHistoryImport, res: MessagesHistoryImportParsed},
  'messages.initHistoryImport': {req: MessagesInitHistoryImport, res: MessagesHistoryImport},
  'messages.uploadImportedMedia': {req: MessagesUploadImportedMedia, res: MessageMedia},
  'messages.startHistoryImport': {req: MessagesStartHistoryImport, res: boolean},
  'messages.getExportedChatInvites': {req: MessagesGetExportedChatInvites, res: MessagesExportedChatInvites},
  'messages.getExportedChatInvite': {req: MessagesGetExportedChatInvite, res: MessagesExportedChatInvite},
  'messages.editExportedChatInvite': {req: MessagesEditExportedChatInvite, res: MessagesExportedChatInvite},
  'messages.deleteRevokedExportedChatInvites': {req: MessagesDeleteRevokedExportedChatInvites, res: boolean},
  'messages.deleteExportedChatInvite': {req: MessagesDeleteExportedChatInvite, res: boolean},
  'messages.getAdminsWithInvites': {req: MessagesGetAdminsWithInvites, res: MessagesChatAdminsWithInvites},
  'messages.getChatInviteImporters': {req: MessagesGetChatInviteImporters, res: MessagesChatInviteImporters},
  'messages.setHistoryTTL': {req: MessagesSetHistoryTTL, res: Updates},
  'account.reportProfilePhoto': {req: AccountReportProfilePhoto, res: boolean},
  'channels.convertToGigagroup': {req: ChannelsConvertToGigagroup, res: Updates},
  'messages.checkHistoryImportPeer': {req: MessagesCheckHistoryImportPeer, res: MessagesCheckedHistoryImportPeer},
  'phone.toggleGroupCallRecord': {req: PhoneToggleGroupCallRecord, res: Updates},
  'phone.editGroupCallParticipant': {req: PhoneEditGroupCallParticipant, res: Updates},
  'phone.editGroupCallTitle': {req: PhoneEditGroupCallTitle, res: Updates},
  'phone.getGroupCallJoinAs': {req: PhoneGetGroupCallJoinAs, res: PhoneJoinAsPeers},
  'phone.exportGroupCallInvite': {req: PhoneExportGroupCallInvite, res: PhoneExportedGroupCallInvite},
  'phone.toggleGroupCallStartSubscription': {req: PhoneToggleGroupCallStartSubscription, res: Updates},
  'phone.startScheduledGroupCall': {req: PhoneStartScheduledGroupCall, res: Updates},
  'phone.saveDefaultGroupCallJoinAs': {req: PhoneSaveDefaultGroupCallJoinAs, res: boolean},
  'phone.joinGroupCallPresentation': {req: PhoneJoinGroupCallPresentation, res: Updates},
  'phone.leaveGroupCallPresentation': {req: PhoneLeaveGroupCallPresentation, res: Updates},
  'stickers.checkShortName': {req: StickersCheckShortName, res: boolean},
  'stickers.suggestShortName': {req: StickersSuggestShortName, res: StickersSuggestedShortName},
  'bots.resetBotCommands': {req: BotsResetBotCommands, res: boolean},
  'bots.getBotCommands': {req: BotsGetBotCommands, res: Array<BotCommand>},
  'account.resetPassword': {req: AccountResetPassword, res: AccountResetPasswordResult},
  'account.declinePasswordReset': {req: AccountDeclinePasswordReset, res: boolean},
  'auth.checkRecoveryPassword': {req: AuthCheckRecoveryPassword, res: boolean},
  'account.getChatThemes': {req: AccountGetChatThemes, res: AccountThemes},
  'messages.setChatTheme': {req: MessagesSetChatTheme, res: Updates},
  'channels.viewSponsoredMessage': {req: ChannelsViewSponsoredMessage, res: boolean},
  'channels.getSponsoredMessages': {req: ChannelsGetSponsoredMessages, res: MessagesSponsoredMessages},
  'messages.getMessageReadParticipants': {req: MessagesGetMessageReadParticipants, res: Array<ReadParticipantDate>},
  'messages.getSearchResultsCalendar': {req: MessagesGetSearchResultsCalendar, res: MessagesSearchResultsCalendar},
  'messages.getSearchResultsPositions': {req: MessagesGetSearchResultsPositions, res: MessagesSearchResultsPositions},
  'messages.hideChatJoinRequest': {req: MessagesHideChatJoinRequest, res: Updates},
  'messages.hideAllChatJoinRequests': {req: MessagesHideAllChatJoinRequests, res: Updates},
  'messages.toggleNoForwards': {req: MessagesToggleNoForwards, res: Updates},
  'messages.saveDefaultSendAs': {req: MessagesSaveDefaultSendAs, res: boolean},
  'channels.getSendAs': {req: ChannelsGetSendAs, res: ChannelsSendAsPeers},
  'account.setAuthorizationTTL': {req: AccountSetAuthorizationTTL, res: boolean},
  'account.changeAuthorizationSettings': {req: AccountChangeAuthorizationSettings, res: boolean},
  'channels.deleteParticipantHistory': {req: ChannelsDeleteParticipantHistory, res: MessagesAffectedHistory},
  'messages.sendReaction': {req: MessagesSendReaction, res: Updates},
  'messages.getMessagesReactions': {req: MessagesGetMessagesReactions, res: Updates},
  'messages.getMessageReactionsList': {req: MessagesGetMessageReactionsList, res: MessagesMessageReactionsList},
  'messages.setChatAvailableReactions': {req: MessagesSetChatAvailableReactions, res: Updates},
  'messages.getAvailableReactions': {req: MessagesGetAvailableReactions, res: MessagesAvailableReactions},
  'messages.setDefaultReaction': {req: MessagesSetDefaultReaction, res: boolean},
  'messages.translateText': {req: MessagesTranslateText, res: MessagesTranslatedText},
  'messages.getUnreadReactions': {req: MessagesGetUnreadReactions, res: MessagesMessages},
  'messages.readReactions': {req: MessagesReadReactions, res: MessagesAffectedHistory},
  'contacts.resolvePhone': {req: ContactsResolvePhone, res: ContactsResolvedPeer},
  'phone.getGroupCallStreamChannels': {req: PhoneGetGroupCallStreamChannels, res: PhoneGroupCallStreamChannels},
  'phone.getGroupCallStreamRtmpUrl': {req: PhoneGetGroupCallStreamRtmpUrl, res: PhoneGroupCallStreamRtmpUrl},
  'messages.searchSentMedia': {req: MessagesSearchSentMedia, res: MessagesMessages},
  'messages.getAttachMenuBots': {req: MessagesGetAttachMenuBots, res: AttachMenuBots},
  'messages.getAttachMenuBot': {req: MessagesGetAttachMenuBot, res: AttachMenuBotsBot},
  'messages.toggleBotInAttachMenu': {req: MessagesToggleBotInAttachMenu, res: boolean},
  'messages.requestWebView': {req: MessagesRequestWebView, res: WebViewResult},
  'messages.prolongWebView': {req: MessagesProlongWebView, res: boolean},
  'messages.requestSimpleWebView': {req: MessagesRequestSimpleWebView, res: SimpleWebViewResult},
  'messages.sendWebViewResultMessage': {req: MessagesSendWebViewResultMessage, res: WebViewMessageSent},
  'messages.sendWebViewData': {req: MessagesSendWebViewData, res: Updates},
  'bots.setBotMenuButton': {req: BotsSetBotMenuButton, res: boolean},
  'bots.getBotMenuButton': {req: BotsGetBotMenuButton, res: BotMenuButton},
  'account.getSavedRingtones': {req: AccountGetSavedRingtones, res: AccountSavedRingtones},
  'account.saveRingtone': {req: AccountSaveRingtone, res: AccountSavedRingtone},
  'account.uploadRingtone': {req: AccountUploadRingtone, res: Document},
  'bots.setBotBroadcastDefaultAdminRights': {req: BotsSetBotBroadcastDefaultAdminRights, res: boolean},
  'bots.setBotGroupDefaultAdminRights': {req: BotsSetBotGroupDefaultAdminRights, res: boolean},
  'phone.saveCallLog': {req: PhoneSaveCallLog, res: boolean},
  'channels.toggleJoinToSend': {req: ChannelsToggleJoinToSend, res: Updates},
  'channels.toggleJoinRequest': {req: ChannelsToggleJoinRequest, res: Updates},
  'payments.exportInvoice': {req: PaymentsExportInvoice, res: PaymentsExportedInvoice},
  'messages.transcribeAudio': {req: MessagesTranscribeAudio, res: MessagesTranscribedAudio},
  'messages.rateTranscribedAudio': {req: MessagesRateTranscribedAudio, res: boolean},
  'payments.assignAppStoreTransaction': {req: PaymentsAssignAppStoreTransaction, res: Updates},
  'payments.assignPlayMarketTransaction': {req: PaymentsAssignPlayMarketTransaction, res: Updates},
  'payments.canPurchasePremium': {req: PaymentsCanPurchasePremium, res: boolean},
  'help.getPremiumPromo': {req: HelpGetPremiumPromo, res: HelpPremiumPromo},
  'messages.getCustomEmojiDocuments': {req: MessagesGetCustomEmojiDocuments, res: Array<Document>},
  'messages.getEmojiStickers': {req: MessagesGetEmojiStickers, res: MessagesAllStickers},
  'messages.getFeaturedEmojiStickers': {req: MessagesGetFeaturedEmojiStickers, res: MessagesFeaturedStickers},
  'account.updateEmojiStatus': {req: AccountUpdateEmojiStatus, res: boolean},
  'account.getDefaultEmojiStatuses': {req: AccountGetDefaultEmojiStatuses, res: AccountEmojiStatuses},
  'account.getRecentEmojiStatuses': {req: AccountGetRecentEmojiStatuses, res: AccountEmojiStatuses},
  'account.clearRecentEmojiStatuses': {req: AccountClearRecentEmojiStatuses, res: boolean},
  'messages.reportReaction': {req: MessagesReportReaction, res: boolean},
  'messages.getTopReactions': {req: MessagesGetTopReactions, res: MessagesReactions},
  'messages.getRecentReactions': {req: MessagesGetRecentReactions, res: MessagesReactions},
  'messages.clearRecentReactions': {req: MessagesClearRecentReactions, res: boolean},
  'messages.getExtendedMedia': {req: MessagesGetExtendedMedia, res: Updates},
  'auth.importWebTokenAuthorization': {req: AuthImportWebTokenAuthorization, res: AuthAuthorization},
  'account.reorderUsernames': {req: AccountReorderUsernames, res: boolean},
  'account.toggleUsername': {req: AccountToggleUsername, res: boolean},
  'channels.reorderUsernames': {req: ChannelsReorderUsernames, res: boolean},
  'channels.toggleUsername': {req: ChannelsToggleUsername, res: boolean},
  'channels.deactivateAllUsernames': {req: ChannelsDeactivateAllUsernames, res: boolean},
  'channels.toggleForum': {req: ChannelsToggleForum, res: Updates},
  'channels.createForumTopic': {req: ChannelsCreateForumTopic, res: Updates},
  'channels.getForumTopics': {req: ChannelsGetForumTopics, res: MessagesForumTopics},
  'channels.getForumTopicsByID': {req: ChannelsGetForumTopicsByID, res: MessagesForumTopics},
  'channels.editForumTopic': {req: ChannelsEditForumTopic, res: Updates},
  'channels.updatePinnedForumTopic': {req: ChannelsUpdatePinnedForumTopic, res: Updates},
  'channels.deleteTopicHistory': {req: ChannelsDeleteTopicHistory, res: MessagesAffectedHistory},
  'channels.reorderPinnedForumTopics': {req: ChannelsReorderPinnedForumTopics, res: Updates},
  'channels.toggleAntiSpam': {req: ChannelsToggleAntiSpam, res: Updates},
  'channels.reportAntiSpamFalsePositive': {req: ChannelsReportAntiSpamFalsePositive, res: boolean},
  'messages.setDefaultHistoryTTL': {req: MessagesSetDefaultHistoryTTL, res: boolean},
  'messages.getDefaultHistoryTTL': {req: MessagesGetDefaultHistoryTTL, res: DefaultHistoryTTL},
  'contacts.exportContactToken': {req: ContactsExportContactToken, res: ExportedContactToken},
  'contacts.importContactToken': {req: ContactsImportContactToken, res: User},
  'photos.uploadContactProfilePhoto': {req: PhotosUploadContactProfilePhoto, res: PhotosPhoto},
  'channels.toggleParticipantsHidden': {req: ChannelsToggleParticipantsHidden, res: Updates},
  'messages.sendBotRequestedPeer': {req: MessagesSendBotRequestedPeer, res: Updates},
  'account.getDefaultProfilePhotoEmojis': {req: AccountGetDefaultProfilePhotoEmojis, res: EmojiList},
  'account.getDefaultGroupPhotoEmojis': {req: AccountGetDefaultGroupPhotoEmojis, res: EmojiList},
  'auth.requestFirebaseSms': {req: AuthRequestFirebaseSms, res: boolean},
  'messages.getEmojiGroups': {req: MessagesGetEmojiGroups, res: MessagesEmojiGroups},
  'messages.getEmojiStatusGroups': {req: MessagesGetEmojiStatusGroups, res: MessagesEmojiGroups},
  'messages.getEmojiProfilePhotoGroups': {req: MessagesGetEmojiProfilePhotoGroups, res: MessagesEmojiGroups},
  'messages.searchCustomEmoji': {req: MessagesSearchCustomEmoji, res: EmojiList},
  'messages.togglePeerTranslations': {req: MessagesTogglePeerTranslations, res: boolean},
  'account.getAutoSaveSettings': {req: AccountGetAutoSaveSettings, res: AccountAutoSaveSettings},
  'account.saveAutoSaveSettings': {req: AccountSaveAutoSaveSettings, res: boolean},
  'account.deleteAutoSaveExceptions': {req: AccountDeleteAutoSaveExceptions, res: boolean},
  'stickers.changeSticker': {req: StickersChangeSticker, res: MessagesStickerSet},
  'stickers.renameStickerSet': {req: StickersRenameStickerSet, res: MessagesStickerSet},
  'stickers.deleteStickerSet': {req: StickersDeleteStickerSet, res: boolean},
  'messages.getBotApp': {req: MessagesGetBotApp, res: MessagesBotApp},
  'messages.requestAppWebView': {req: MessagesRequestAppWebView, res: AppWebViewResult},
  'bots.setBotInfo': {req: BotsSetBotInfo, res: boolean},
  'bots.getBotInfo': {req: BotsGetBotInfo, res: BotsBotInfo},
  'auth.resetLoginEmail': {req: AuthResetLoginEmail, res: AuthSentCode},
  'chatlists.exportChatlistInvite': {req: ChatlistsExportChatlistInvite, res: ChatlistsExportedChatlistInvite},
  'chatlists.deleteExportedInvite': {req: ChatlistsDeleteExportedInvite, res: boolean},
  'chatlists.editExportedInvite': {req: ChatlistsEditExportedInvite, res: ExportedChatlistInvite},
  'chatlists.getExportedInvites': {req: ChatlistsGetExportedInvites, res: ChatlistsExportedInvites},
  'chatlists.checkChatlistInvite': {req: ChatlistsCheckChatlistInvite, res: ChatlistsChatlistInvite},
  'chatlists.joinChatlistInvite': {req: ChatlistsJoinChatlistInvite, res: Updates},
  'chatlists.getChatlistUpdates': {req: ChatlistsGetChatlistUpdates, res: ChatlistsChatlistUpdates},
  'chatlists.joinChatlistUpdates': {req: ChatlistsJoinChatlistUpdates, res: Updates},
  'chatlists.hideChatlistUpdates': {req: ChatlistsHideChatlistUpdates, res: boolean},
  'chatlists.getLeaveChatlistSuggestions': {req: ChatlistsGetLeaveChatlistSuggestions, res: Array<Peer>},
  'chatlists.leaveChatlist': {req: ChatlistsLeaveChatlist, res: Updates},
  'bots.reorderUsernames': {req: BotsReorderUsernames, res: boolean},
  'bots.toggleUsername': {req: BotsToggleUsername, res: boolean},
  'messages.setChatWallPaper': {req: MessagesSetChatWallPaper, res: Updates},
}

