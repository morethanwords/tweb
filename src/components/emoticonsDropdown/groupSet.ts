import {Chat, ChatFull, StickerSet} from '@layer';
import ListenerSetter from '@helpers/listenerSetter';
import rootScope from '@lib/rootScope';
import getGroupStickerSet from '@appManagers/utils/chats/getGroupStickerSet';
import hasRights from '@appManagers/utils/chats/hasRights';
import type {AppManagers} from '@lib/managers';

/**
 * The category the group's own set is filed under. It is deliberately not the set's id:
 * the same set may also sit in the user's own list, and the install / delete / reorder
 * events address those by id.
 */
export const GROUP_SET_CATEGORY_ID = 'megagroup';

export type GroupSetState = {
  /** absent while the group offers nothing — the placeholder case */
  set?: StickerSet.stickerSet,
  /** whether the user may change what the group offers */
  canEdit: boolean,
  /** the user collapsed the section for this chat */
  hidden: boolean
};

/**
 * Tracks the sticker set / custom emoji pack the open group offers to everyone chatting in
 * it, so a tab can show it even when the user hasn't installed it.
 *
 * Resolving reads the chat's full info, so it is deliberately kept off the chat-open path:
 * {@link update} runs when the dropdown opens, and afterwards only when that chat's full
 * info changes.
 */
export default class GroupSetController {
  private chatId: ChatId;
  private state: GroupSetState;
  private requestId = 0;

  constructor(private options: {
    managers: AppManagers,
    listenerSetter: ListenerSetter,
    isEmoji?: boolean,
    getPeerId: () => PeerId,
    isHidden: (chatId: ChatId, set: StickerSet.stickerSet) => boolean,
    /** whether the set already sits in the user's own list of installed ones */
    isInstalled: (set: StickerSet.stickerSet) => boolean,
    render: (state: GroupSetState) => void,
    remove: () => void
  }) {
    options.listenerSetter.add(rootScope)('chat_full_update', (chatId) => {
      if(this.getChatId() === chatId) {
        this.update();
      }
    });
  }

  private getChatId() {
    const peerId = this.options.getPeerId();
    return peerId?.isAnyChat() ? peerId.toChatId() : undefined;
  }

  public getCurrentChatId() {
    return this.chatId;
  }

  public getCurrentSet() {
    return this.state?.set;
  }

  public async update() {
    const chatId = this.getChatId();
    const requestId = ++this.requestId;

    const state = chatId ? await this.resolve(chatId) : undefined;
    if(requestId !== this.requestId) {
      return;
    }

    this.chatId = chatId;
    this.setState(state);
  }

  private async resolve(chatId: ChatId): Promise<GroupSetState> {
    const [chatFull, chat] = await Promise.all([
      this.options.managers.appProfileManager.getChatFull(chatId),
      this.options.managers.appChatsManager.getChat(chatId)
    ]);

    const set = getGroupStickerSet(chatFull, this.options.isEmoji);
    // a sticker set is the server's call (it reports when the group is big enough), an emoji
    // pack follows from being able to edit the group — the same split tdesktop makes.
    // `change_info` on its own reads a plain member's default rights, so it answers true for
    // everyone the group hasn't muted: the admin-ness has to be established first, which is
    // what tdesktop's canEditEmoji() = amCreator() || (adminRights & ChangeInfo) amounts to.
    // Only a supergroup can carry a pack at all, so an admin elsewhere has nothing to set
    const canEdit = this.options.isEmoji ?
      !!(chat as Chat.channel).pFlags?.megagroup &&
        hasRights(chat, 'just_admin') &&
        hasRights(chat, 'change_info') :
      !!(chatFull as ChatFull.channelFull)?.pFlags?.can_set_stickers;

    // nothing offered and nothing to offer it with
    if(!set) {
      return canEdit ? {canEdit, hidden: false} : undefined;
    }

    // already in the user's own list and not theirs to change — a second copy is just noise
    if(!canEdit && this.options.isInstalled(set)) {
      return undefined;
    }

    // an admin always sees the section, so a stale collapsed flag never hides it from them
    const hidden = !canEdit && this.options.isHidden(chatId, set);
    return {set, canEdit, hidden};
  }

  /** Drops the section without resolving a new one — for leaving the chat it belonged to. */
  public clear() {
    ++this.requestId;
    this.chatId = undefined;
    this.setState(undefined);
  }

  private setState(state?: GroupSetState) {
    const previous = this.state;
    if(
      previous?.set?.id === state?.set?.id &&
      previous?.canEdit === state?.canEdit &&
      previous?.hidden === state?.hidden &&
      !!previous === !!state
    ) {
      return;
    }

    if(previous) {
      this.options.remove();
    }

    this.state = state;
    if(state) {
      this.options.render(state);
    }
  }
}
