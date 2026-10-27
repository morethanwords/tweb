/*
 * Member tags: the popup that sets one, and the one a tag in a message opens.
 */

import {defineStories} from '../registry';
import type {PopupStoryContext} from '../context';

const editTag = async(ctx: PopupStoryContext, options: {self?: boolean, rank?: string, role: 'member' | 'admin' | 'owner'}) => {
  const {default: showEditMemberTagPopup} = await import('@components/popups/editMemberTag');
  showEditMemberTagPopup({
    chatId: ctx.peer('supergroup').toChatId(),
    peerId: ctx.peer(options.self ? 'self' : 'private'),
    rank: options.rank,
    role: options.role
  });
};

const tagInfo = async(ctx: PopupStoryContext, options: {rank: string, role: 'member' | 'admin' | 'owner'}) => {
  const {default: showMemberTagInfoPopup} = await import('@components/popups/memberTagInfo');
  await showMemberTagInfoPopup({
    chatId: ctx.peer('supergroup').toChatId(),
    peerId: ctx.peer('private'),
    rank: options.rank,
    role: options.role
  });
};

defineStories('Member tags', [
  {
    id: 'memberTag/edit/self',
    title: 'Edit tag — my own, none yet',
    open: (ctx) => editTag(ctx, {self: true, role: 'member'})
  },
  {
    id: 'memberTag/edit/member',
    title: 'Edit tag — a member\'s',
    open: (ctx) => editTag(ctx, {rank: 'designer', role: 'member'})
  },
  {
    id: 'memberTag/edit/admin',
    title: 'Edit tag — an admin without one',
    open: (ctx) => editTag(ctx, {role: 'admin'})
  },
  {
    id: 'memberTag/edit/owner',
    title: 'Edit tag — the owner\'s',
    open: (ctx) => editTag(ctx, {rank: 'founder', role: 'owner'})
  },
  {
    id: 'memberTag/info/member',
    title: 'Tag info — a member\'s, I may set mine',
    managers: {
      appChatsManager: {hasRights: () => true},
      appProfileManager: {getParticipant: (): undefined => undefined}
    },
    open: (ctx) => tagInfo(ctx, {rank: 'designer', role: 'member'})
  },
  {
    id: 'memberTag/info/admin',
    title: 'Tag info — an admin\'s, only admins set tags',
    managers: {
      appChatsManager: {hasRights: () => false}
    },
    open: (ctx) => tagInfo(ctx, {rank: 'moderator', role: 'admin'})
  },
  {
    id: 'memberTag/info/owner',
    title: 'Tag info — the owner\'s, mine is set',
    managers: {
      appChatsManager: {hasRights: () => true},
      appProfileManager: {getParticipant: () => ({_: 'channelParticipantSelf', user_id: 0, inviter_id: 0, date: 0, rank: 'mentor', pFlags: {}})}
    },
    open: (ctx) => tagInfo(ctx, {rank: 'founder', role: 'owner'})
  }
]);

// The sandbox reloads on an edit anyway (watchForEdits). Accepting here keeps an edit of a popup this story imports
// from climbing through the story to the app's root once the sandbox has been opened on the dev server.
if(import.meta.hot) import.meta.hot.accept();
