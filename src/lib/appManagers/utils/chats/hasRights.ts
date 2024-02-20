/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Chat, ChatAdminRights, ChatBannedRights} from '../../../../layer';
import {ChatRights} from '../../appChatsManager';

/**
 * Check the user's ability to do an action in chat
 * @param id
 * @param action creator can still send messages to left channel. so this function shows server rights. see canSendToPeer for local rights in messages manager.
 * @param rights do not provide this parameter when checking rights for self
 * @param isThread
 * @returns
 */
export default function hasRights(
  chat: Exclude<Chat, Chat.chatEmpty>,
  action: ChatRights,
  rights?: ChatAdminRights | ChatBannedRights,
  isThread?: boolean
) {
  if(!chat) return false;

  if((chat as Chat.chat).pFlags.deactivated && action !== 'view_messages') {
    return false;
  }

  const isCheckingRightsForSelf = rights === undefined;
  if((chat as Chat.chat).pFlags.creator && isCheckingRightsForSelf/*  && action !== 'anonymous' */) {
    return true;
  }

  if(chat._ === 'chatForbidden' ||
      chat._ === 'channelForbidden' ||
      // (chat as any).pFlags.kicked ||
      (chat.pFlags.left && !(chat as Chat.channel).pFlags.megagroup)) {
    return false;
  }

  // const adminRights = chat.admin_rights;
  // const bannedRights = (chat as Chat.channel).banned_rights || chat.default_banned_rights;

  if(!rights) {
    rights = chat.admin_rights || (chat as Chat.channel).banned_rights || chat.default_banned_rights;

    if(!rights) {
      return false;
    }
  }

  let myFlags: Partial<{[flag in keyof ChatBannedRights['pFlags'] | keyof ChatAdminRights['pFlags']]: true}> = {};
  if(rights) {
    myFlags = rights.pFlags as any;
  }

  // const adminFlags = adminRights?.pFlags || {};
  // const bannedFlags = bannedRights?.pFlags || {};

  const isAdmin = rights._ === 'chatAdminRights';

  switch(action) {
    case 'embed_links':
    case 'send_games':
    case 'send_gifs':
    case 'send_inline':
    case 'send_media':
    case 'send_messages':
    case 'send_polls':
    case 'send_stickers':
    case 'send_photos':
    case 'send_videos':
    case 'send_roundvideos':
    case 'send_audios':
    case 'send_voices':
    case 'send_docs':
    case 'send_plain': {
      // if(!isThread && chat.pFlags.left) {
      //   return false;
      // }

      if(!isAdmin && myFlags[action]) {
        return false;
      }

      if(chat._ === 'channel') {
        if(!chat.pFlags.megagroup && !myFlags.post_messages) {
          return false;
        }
      }

      break;
    }

    // * revoke foreign messages
    case 'delete_messages':
    case 'manage_call': {
      return !!myFlags[action];
    }

    case 'pin_messages': {
      return isAdmin ? !!(myFlags[action] || (!(chat as Chat.channel).pFlags.megagroup && myFlags.post_messages)) : !myFlags[action];
    }

    // case 'change_info': {
    // return adminRights || isCheckingRightsForSelf ? adminFlags[action] : !myFlags[action];
    // }

    case 'invite_links': {
      if(chat._ === 'chat') {
        return false;
      }

      return isAdmin && !!myFlags['invite_users'];
    }

    // * only creator can do that
    case 'change_type':
    case 'delete_chat': {
      return false;
    }

    case 'change_info':
    case 'invite_users': {
      return isAdmin || (chat as Chat.channel).pFlags.broadcast ? !!myFlags[action] : !myFlags[action];
    }

    case 'delete_stories':
    case 'edit_stories':
    case 'post_stories':
    case 'add_admins':
    case 'anonymous':
    case 'post_messages':
    case 'edit_messages': {
      return isAdmin && !!myFlags[action];
    }

    case 'ban_users':
    case 'change_permissions': {
      return isAdmin && !!myFlags['ban_users'];
    }

    case 'view_participants': {
      return !!(chat._ === 'chat' || !chat.pFlags.broadcast || chat.pFlags.creator || chat.admin_rights);
    }

    case 'create_giveaway': {
      return isAdmin && !!myFlags['post_messages'];
    }

    // * regular user can only create a new topic and manage their own topics (so this will only say whether user is eligible to create a new topic)
    // * admin can manage all topics
    case 'manage_topics': {
      return isAdmin ? !!myFlags[action] : !myFlags[action];
    }

    // case 'view_statistics': {
    //   return isAdmin && !!myFlags['other'];
    // }
  }

  return true;
}
