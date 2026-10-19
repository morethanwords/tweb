import rootScope from '@lib/rootScope';
// import { generatePathData } from '@helpers/dom';
import {MyMessage} from '@appManagers/appMessagesManager';
import type Chat from '@components/chat/chat';
import indexOfAndSplice from '@helpers/array/indexOfAndSplice';
import insertInDescendSortedArray from '@helpers/array/insertInDescendSortedArray';
import positionElementByIndex from '@helpers/dom/positionElementByIndex';
import {Message, ReplyMarkup} from '@layer';
import {NULL_PEER_ID, REPLIES_PEER_ID, VERIFICATION_CODES_BOT_ID} from '@appManagers/constants';
import ChatBubbles, {SERVICE_AS_REGULAR, STICKY_OFFSET} from '@components/chat/bubbles';
import forEachReverse from '@helpers/array/forEachReverse';
import partition from '@helpers/array/partition';
import getMessageThreadId from '@appManagers/utils/messages/getMessageThreadId';
import {avatarNew} from '@components/avatarNew';
import {MiddlewareHelper} from '@helpers/middleware';
import {ChatType} from './chatType';
import getFwdFromName from '@appManagers/utils/messages/getFwdFromName';
import {getGuestChatViaFromId, getMid, isMessage, isMessageForVerificationBot} from '@components/chat/utils';
import {canHaveSuggestedPostReplyMarkup} from '@components/chat/bubbleParts/suggestedPostReplyMarkup';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import type {BubbleElementAddons} from '@components/chat/types';
import {AdminLog} from '@appManagers/appChatsManager';
import isEphemeralMessage from '@appManagers/utils/messages/isEphemeralMessage';
import isAnchoredEphemeralMessage from '@appManagers/utils/messages/isAnchoredEphemeralMessage';
import {BubbleTimelineKey, compareBubbleTimelineKeys, isPendingTimelineMessage, makeBubbleTimelineKey} from '@components/chat/bubbleTimelineOrder';
import filterReplyMarkupRows from '@components/chat/bubbleParts/filterReplyMarkupRows';
import updateChatThreadSeparators from '@components/chat/bubbleParts/updateChatThreadSeparators';

/**
 * Where the sends still on their way stand behind an earlier send that has taken its server id: one place
 * for all of them, so among themselves they go by date and id — in the order they were sent, whichever
 * bubble came in first (`compareBubbleTimelineKeys`). Below the temporary id a send made after them takes
 * from that server id (+0.0001, `generateTempMessageId`), which so comes after them.
 */
const BEHIND_SENT = 0.00005;

type GroupItem = {
  bubble: HTMLElement,
  fromId: PeerId,
  mid: number,
  groupMid?: number,
  timestamp: number,
  dateTimestamp: number,
  mounted: boolean,
  single: boolean,
  group?: BubbleGroup,
  message: Message.message | Message.messageService | AdminLog, // use it only to set avatar
  reverse?: boolean,
  timelineKey: BubbleTimelineKey
};

function insertSomething<T>(
  to: Array<T>,
  what: T,
  sortKey: keyof T,
  reverse: boolean,
  compare?: (item1: T, item2: T) => number
) {
  if(!sortKey) {
    indexOfAndSplice(to, what);
    return (reverse ? to.push(what) : to.unshift(what)) - 1;
  } else if(compare) {
    indexOfAndSplice(to, what);

    let left = 0;
    let right = to.length;
    while(left < right) {
      const middle = (left + right) >> 1;
      if(compare(what, to[middle]) > 0) {
        right = middle;
      } else {
        left = middle + 1;
      }
    }

    to.splice(left, 0, what);
    return left;
  } else {
    // @ts-ignore
    return insertInDescendSortedArray(to, what, sortKey);
  }
}

function compareTimelineItems(item1: GroupItem, item2: GroupItem) {
  return compareBubbleTimelineKeys(item1.timelineKey, item2.timelineKey);
}

function getReplyMarkupRows(message: Message.message) {
  const replyMarkup = message.reply_markup;
  return replyMarkup?._ === 'replyInlineMarkup' ? filterReplyMarkupRows(replyMarkup.rows) : [];
}

export class BubbleGroup {
  container: HTMLElement;
  chat: Chat;
  groups: BubbleGroups;
  items: GroupItem[]; // descend sorted
  avatarContainer: HTMLElement;
  avatarLoadPromise: Promise<void>;
  avatar: ReturnType<typeof avatarNew>;
  mounted: boolean;
  dateTimestamp: number;
  offset: number;
  middlewareHelper: MiddlewareHelper;
  dateContainer: ReturnType<ChatBubbles['getDateContainerByTimestamp']>;

  constructor(chat: Chat, groups?: BubbleGroups, dateTimestamp?: number) {
    this.container = document.createElement('div');
    this.container.classList.add('bubbles-group');
    this.chat = chat;
    this.groups = groups;
    this.items = [];
    this.dateTimestamp = dateTimestamp;
    this.offset = 0;
    this.middlewareHelper = chat.bubbles.getMiddleware().create();
  }

  getAvatarOptions(message: Message.message | AdminLog) {
    const fwdFrom = isMessage(message) ? message.fwd_from : undefined;
    const fwdFromId = isMessage(message) ? message.fwdFromId : undefined;
    const fwdFromName = getFwdFromName(fwdFrom);
    const isForwardFromChannel = isMessage(message) && message.from_id && message.from_id._ === 'peerChannel' && message.fromId === fwdFromId;
    const currentPeerId = this.chat.peerId;

    const getPeerIdForLog = (log: AdminLog) => {
      const entry = this.chat.bubbles.resolveAdminLogUnsafe({log, noJsx: true});

      if(entry?.type === 'default') {
        if(entry.message._ === 'message') return getPeerId(
          entry.message.from_id ||
          entry.message.peer_id
        );
      }

      return log?.user_id?.toPeerId();
    };

    const peerId =
      (
        isMessage(message) ?
          ((fwdFrom && (/* currentPeerId === rootScope.myId ||  */currentPeerId === REPLIES_PEER_ID || currentPeerId === VERIFICATION_CODES_BOT_ID) && !fwdFromName) || isForwardFromChannel ? fwdFromId : message.fromId) :
          getPeerIdForLog(message)
      ) ||
      NULL_PEER_ID;

    return {
      // peerId: fwdFromName ? NULL_PEER_ID : peerId,
      peerId,
      // peerTitle: !fwdFromId && fwdFrom && fwdFromName && peerId === NULL_PEER_ID ? /* '🔥 FF 🔥' */fwdFromName : undefined
      peerTitle: peerId === NULL_PEER_ID ? fwdFromName : undefined
    };
  }

  destroyAvatar() {
    if(!this.avatar) {
      return;
    }

    this.avatarContainer.remove();
    this.avatarLoadPromise = this.avatar = this.avatarContainer = undefined;
    --this.offset;
  }

  createAvatar(message: Message.message | Message.messageService | AdminLog, options?: Partial<Parameters<typeof avatarNew>[0]>) {
    if(this.avatarLoadPromise) {
      return this.avatarLoadPromise;
    } else if(message._ === 'messageService') {
      return;
    }

    this.avatarContainer = document.createElement('div');
    this.avatarContainer.classList.add('bubbles-group-avatar-container');
    ++this.offset;

    this.avatar = avatarNew({
      middleware: this.middlewareHelper.get(),
      size: 40,
      lazyLoadQueue: this.chat.bubbles.lazyLoadQueue,
      ...(options || this.getAvatarOptions(message))
    });
    this.avatar.node.classList.add('bubbles-group-avatar', 'user-avatar'/* , 'can-zoom-fade' */);

    this.updateAvatarClassNames(message);

    // this.avatarLoadPromise = Promise.all([
    //   avatarLoadPromise,
    //   peerId && peerId.isUser() ? this.chat.managers.appUsersManager.getUser(peerId.toUserId()) : undefined
    // ]).then(([result, user]) => {
    //   if(user?.pFlags?.premium) {
    //     avatar.classList.add('is-premium', 'tgico-star');
    //   }

    //   return result;
    // });
    this.avatarLoadPromise = this.avatar.readyThumbPromise;

    this.avatarContainer.append(this.avatar.node);
    this.container.append(this.avatarContainer);

    return this.avatarLoadPromise;
  }

  updateAvatarClassNames(message = this.lastItem.message) {
    if(!this.avatar || message?._ !== 'message') {
      return;
    }

    const replyMarkupRows = getReplyMarkupRows(message);
    this.avatarContainer.classList.toggle('avatar-for-reply-markup', !!replyMarkupRows.length);
    if(replyMarkupRows.length) {
      this.avatarContainer.style.setProperty('--reply-markup-row-count', replyMarkupRows.length.toString());
    } else {
      this.avatarContainer.style.removeProperty('--reply-markup-row-count');
    }

    this.avatar.node.classList.toggle('avatar-for-suggested-reply-markup', canHaveSuggestedPostReplyMarkup(message));
  }

  get firstTimestamp() {
    return this.firstItem.timestamp;
  }

  get firstMid() {
    return this.firstItem.mid;
  }

  get firstItem() {
    return this.items[this.items.length - 1];
  }

  get lastTimestamp() {
    return this.lastItem.timestamp;
  }

  get lastMid() {
    return this.lastItem.mid;
  }

  get lastItem() {
    return this.items[0];
  }

  updateClassNames() {
    const items = this.items;
    const length = items.length;
    if(!length) {
      return;
    }

    // const elements = Array.from(this.container.children);
    // if(this.offset) elements.splice(0, this.offset);

    // const length = elements.length;
    // if(!length) {
    //   return;
    // }

    const first = items[length - 1].bubble;

    this.updateAvatarClassNames();

    if(items.length === 1) {
      first.classList.add('is-group-first', 'is-group-last');
      // this.setClipIfNeeded(first);
      return;
    } else {
      first.classList.remove('is-group-last');
      first.classList.add('is-group-first');
      // this.setClipIfNeeded(first, true);
    }

    for(let i = 1, _length = length - 1; i < _length; ++i) {
      const bubble = items[i].bubble;
      bubble.classList.remove('is-group-last', 'is-group-first');
      // this.setClipIfNeeded(bubble, true);
    }

    const last = items[0].bubble;
    last.classList.remove('is-group-first');
    last.classList.add('is-group-last');
    // this.setClipIfNeeded(last);
  }

  insertItem(item: GroupItem) {
    const {items} = this;
    insertSomething(
      items,
      item,
      this.groups.sortGroupItemsKey,
      this.groups.reverse = item.reverse,
      this.groups.compareGroupItems
    );

    item.group = this;
    if(items.length === 1) {
      this.groups.insertGroup(this);
    }
  }

  removeItem(item: GroupItem) {
    indexOfAndSplice(this.items, item);

    if(!this.items.length) {
      indexOfAndSplice(this.groups.groups, this);
    }

    item.group = undefined;
  }

  mount(updateClassNames?: boolean) {
    if(!this.groups.groups.includes(this) || !this.items.length) { // group can be already removed
      debugger;

      if(this.mounted) {
        this.onItemUnmount();
      }

      return;
    }

    const {offset, items} = this;
    const {length} = items;
    forEachReverse(items, (item, idx) => {
      this.mountItem(item, length - 1 - idx, offset);
    });

    if(updateClassNames) {
      this.updateClassNames();
    }

    this.onItemMount();
  }

  mountItem(item: GroupItem, idx = this.items.indexOf(item), offset = this.offset) {
    if(item.mounted) {
      return;
    }

    positionElementByIndex(item.bubble, this.container, offset + idx);
    item.mounted = true;
  }

  unmountItem(item: GroupItem) {
    if(!item.mounted) {
      return;
    }

    item.bubble.remove();
    item.mounted = false;
    this.onItemUnmount();
  }

  onItemMount() {
    if(this.mounted) {
      return;
    }

    const dateContainer = this.dateContainer = this.chat.bubbles.getDateContainerByTimestamp(this.dateTimestamp / 1000);
    // const idx = this.groups.indexOf(group);
    const dateGroups = this.groups.groups.filter((_group) => _group.dateTimestamp === this.dateTimestamp);
    const dateGroupsLength = dateGroups.length;
    const idx = dateGroups.indexOf(this);
    const unmountedLength = dateGroups.slice(idx + 1).reduce((acc, v) => acc + (v.mounted ? 0 : 1), 0);
    positionElementByIndex(this.container, dateContainer.container, STICKY_OFFSET + dateGroupsLength - 1 - idx - unmountedLength);
    ++dateContainer.groupsLength;
    this.mounted = true;
    this.groups?.updateGroupsClassNames();
  }

  onItemUnmount() {
    if(!this.mounted) {
      return;
    }

    if(!this.items.length) {
      this.container.remove();
      this.dateContainer && --this.dateContainer.groupsLength;
      this.dateContainer = undefined;
      this.chat.bubbles.deleteEmptyDateGroups();
      this.mounted = false;
      this.middlewareHelper.clean();
      this.groups?.updateGroupsClassNames();
    } else {
      this.updateClassNames();
    }
  }
}

// class BubbleGroupItem implements GroupItem {
//   bubble: HTMLElement;
//   fromId: PeerId;
//   mid: number;
//   timestamp: number;
//   dateTimestamp: number;
//   mounted: boolean;
//   single: boolean;
//   group: BubbleGroup;

//   constructor(details: GroupItem) {
//     Object.assign(this, details);
//   }
// }

export default class BubbleGroups {
  public itemsArr: Array<GroupItem> = []; // descend sorted
  private itemsMap: Map<HTMLElement, GroupItem> = new Map();
  /** by mid, the timeline positions that are not the message's id: ephemeral slots, sends moved up */
  private positions: Map<number, number> = new Map();
  public groups: Array<BubbleGroup> = []; // descend sorted
  private newGroupDiff = 121; // * 121 in scheduled messages
  private sortItemsKey: Extract<keyof GroupItem, 'timestamp' | 'mid'>;
  private sortGroupsKey: Extract<keyof BubbleGroup, 'lastMid' | 'lastTimestamp'>;
  public sortGroupItemsKey: Extract<keyof GroupItem, 'groupMid' | 'timestamp'>;
  public compareGroupItems?: typeof compareTimelineItems;
  private compareItems?: typeof compareTimelineItems;
  private compareGroups?: (group1: BubbleGroup, group2: BubbleGroup) => number;
  public reverse: boolean; // * used for search

  constructor(private chat: Chat) {
    if(chat.type !== ChatType.Search) {
      this.sortItemsKey = chat.type === ChatType.Scheduled ? 'timestamp' : 'mid';
      this.sortGroupsKey = chat.type === ChatType.Scheduled ? 'lastTimestamp' : 'lastMid';
      this.sortGroupItemsKey = /* chat.type === 'scheduled' ? 'timestamp' :  */'groupMid';

      // scheduled messages go by their time; everything else is a timeline
      if(chat.type !== ChatType.Scheduled) {
        this.compareItems = this.compareGroupItems = compareTimelineItems;
        this.compareGroups = (group1, group2) => compareTimelineItems(group1.lastItem, group2.lastItem);
      }
    }
  }

  removeItem(item: GroupItem) {
    item.group?.removeItem(item);
    this.removeItemFromCache(item);
  }

  removeAndUnmountBubble(bubble: HTMLElement, deferredGroups?: Set<BubbleGroup>) {
    const item = this.getItemByBubble(bubble);
    if(!item) { // * can be a placeholder
      const parentElement = bubble.parentElement;
      if(parentElement) {
        if(parentElement.classList.contains('bubbles-group')) {
          parentElement.remove();
        } else {
          bubble.remove();
        }
      }

      return false;
    }

    const items = this.itemsArr;
    const index = items.indexOf(item);
    const siblings = this.getSiblingsAtIndex(index, items);

    const group = item.group;
    this.removeItem(item);

    const modifiedGroups: Set<BubbleGroup> = new Set();
    if(group) {
      group.unmountItem(item);
      modifiedGroups.add(group);
    }

    const [previousSibling, nextSibling] = siblings;
    if(
      previousSibling &&
      nextSibling &&
      this.canItemsBeGrouped(previousSibling, nextSibling) &&
      previousSibling.group !== nextSibling.group
    ) {
      const group = nextSibling.group;
      this.f(nextSibling.group.items);
      group.onItemUnmount();
      modifiedGroups.add(previousSibling.group);
      // the items of the group taken apart do not all have to fit the previous one
      for(const group of this.groupUngrouped()) {
        modifiedGroups.add(group);
      }
    }

    if(deferredGroups) {
      for(const group of modifiedGroups) deferredGroups.add(group);
    } else {
      this.mountUnmountGroups(Array.from(modifiedGroups));
    }

    return true;
  }

  mountUnmountGroups(groups: BubbleGroup[]) {
    // groups.sort((a, b) => (b.lastItem?.mid ?? 0) - (a.lastItem?.mid ?? 0));

    const [toMount, toUnmount] = partition(groups, (group) => !!group.items.length);
    toUnmount.forEach((group) => {
      group.onItemUnmount();
    })

    toMount.forEach((group) => {
      group.mount(true);
    });

    this.addChatThreadSeparators();
    this.addContinueLastTopicReplyMarkup();
  }

  private addChatThreadSeparators() {
    updateChatThreadSeparators(this.itemsArr, this.chat);
  }

  /**
   * Makes the reply markup of the last message bubble visible
   */
  private addContinueLastTopicReplyMarkup() {
    if(!this.chat.isBotforum) return;

    let visible = true;

    this.itemsArr.forEach((item) => {
      const bubbleAddons = item.bubble as BubbleElementAddons;

      if(item.message._ !== 'message') return;
      if(!bubbleAddons.continueLastTopicReplyMarkup) return;
      if(!getMessageThreadId(item.message, {isBotforum: this.chat.isBotforum})) return;

      bubbleAddons.continueLastTopicReplyMarkup.feedProps<false>({
        visible: visible && !(item.message.reply_markup as ReplyMarkup.replyInlineMarkup)?.rows
      });

      visible = false;
    });
  }

  f(items: GroupItem[], index: number = 0, length = items.length) {
    for(; index < length; ++index) {
      const item = items[index];
      item.mounted = false;
      item.group.removeItem(item);
      --length;
      --index;
    }
  }

  getItemByBubble(bubble: HTMLElement) {
    return this.itemsMap.get(bubble);
  }

  get firstGroup() {
    return this.groups[this.groups.length - 1];
  }

  get lastGroup() {
    return this.groups[0];
  }

  /**
   * Gives an item its message's new identity (a send the server confirmed, a streamed draft made final) in
   * place, as long as the item still belongs where it stands: between the same neighbours, in the same group
   * and date. Otherwise it changes nothing and returns false, and the bubble has to be regrouped
   * (`ChatBubbles.repositionMessageBubble`): re-sorting the item in one array here would leave its group, the
   * group's place among the groups and the DOM behind.
   */
  changeBubbleMessage(bubble: HTMLElement, message: GroupItem['message']) {
    const item = this.getItemByBubble(bubble);
    if(!item) {
      return true;
    }

    const changed = this.createItem(bubble, message, item.reverse);
    if(!this.canItemStay(item, changed)) {
      return false;
    }

    item.mid = changed.mid;
    item.groupMid = changed.groupMid;
    item.fromId = changed.fromId;
    item.timestamp = changed.timestamp;
    item.single = changed.single;
    item.message = changed.message;
    item.timelineKey = changed.timelineKey;
    return true;
  }

  private canItemStay(item: GroupItem, changed: GroupItem) {
    const {group} = item;
    if(
      !group ||
      changed.dateTimestamp !== item.dateTimestamp ||
      changed.fromId !== item.fromId // the group's avatar is the sender's
    ) {
      return false;
    }

    const isInPlace = (
      items: GroupItem[],
      sortKey: keyof GroupItem,
      compare: (item1: GroupItem, item2: GroupItem) => number
    ) => {
      if(!sortKey) { // search results keep the order they came in
        return true;
      }

      const [newer, older] = this.getSiblingsAtIndex(items.indexOf(item), items);
      const compareTo = (sibling: GroupItem) => compare ?
        compare(changed, sibling) :
        (changed[sortKey] as number) - (sibling[sortKey] as number);
      return (!newer || compareTo(newer) < 0) && (!older || compareTo(older) > 0);
    };

    if(
      !isInPlace(this.itemsArr, this.sortItemsKey, this.compareItems) ||
      !isInPlace(group.items, this.sortGroupItemsKey, this.compareGroupItems)
    ) {
      return false;
    }

    // neighbours share a group exactly when they can be grouped (`groupUngrouped`)
    const siblings = this.getSiblingsAtIndex(this.itemsArr.indexOf(item), this.itemsArr);
    return siblings.every((sibling) => {
      return !sibling || (sibling.group === group) === this.canItemsBeGrouped(changed, sibling);
    });
  }

  changeItemBubble(item: GroupItem, bubble: HTMLElement) {
    this.itemsMap.delete(item.bubble);
    item.bubble = bubble;
    this.itemsMap.set(bubble, item);
  }

  changeBubbleByBubble(from: HTMLElement, to: HTMLElement) {
    const item = this.getItemByBubble(from);
    if(!item) {
      return;
    }

    this.changeItemBubble(item, to);
  }

  canItemsBeGrouped(item1: GroupItem, item2: GroupItem) {
    if(item1.message?._ === 'channelAdminLogEvent' || item2.message?._ === 'channelAdminLogEvent') return false;

    if(isMessageForVerificationBot(item1.message)) return false;

    if(isEphemeralMessage(item1.message) !== isEphemeralMessage(item2.message)) return false;

    // our own ephemeral messages say whom they went to ("Only visible to @bot"), so ones to
    // different bots stay apart (desktop groups outgoing ephemerals by receiver)
    if(
      isEphemeralMessage(item1.message) &&
      isEphemeralMessage(item2.message) &&
      item1.message.ephemeral_receiver_id !== item2.message.ephemeral_receiver_id
    ) return false;

    // a message an ephemeral one stands in for shows content of its own — desktop keeps it
    // out of its neighbours' group for the same reason (`sameAnchored`)
    if(isAnchoredEphemeralMessage(item1.message) !== isAnchoredEphemeralMessage(item2.message)) return false;

    if(
      item1.message?._ === 'message' && item1.message?.suggested_post ||
      item2.message?._ === 'message' && item2.message?.suggested_post
    ) return false;

    const isOut1 = this.chat.isOutMessage(item1.message);
    return item2.fromId === item1.fromId &&
      // * keep guest-chat messages from different visitors in separate groups (own avatar + "for <visitor>")
      getGuestChatViaFromId(item1.message) === getGuestChatViaFromId(item2.message) &&
      item1.dateTimestamp === item2.dateTimestamp &&
      // welcome messages are read in one go whenever they were written (Android and desktop)
      (this.chat.type === ChatType.Welcome || Math.abs(item2.timestamp - item1.timestamp) <= this.newGroupDiff) &&
      !item1.single &&
      !item2.single &&
      isOut1 === this.chat.isOutMessage(item2.message) &&
      (!this.chat.isAllMessagesForum || getMessageThreadId(item1.message, {isForum: true}) === getMessageThreadId(item2.message, {isForum: true})) &&
      (!this.chat.isBotforum || getMessageThreadId(item1.message, {isBotforum: true}) === getMessageThreadId(item2.message, {isBotforum: true})) &&
      (!this.chat.isMonoforum || getMessageThreadId(item1.message) === getMessageThreadId(item2.message)) &&
      (!isOut1 || item1.message.fromId === rootScope.myId || this.chat.isMonoforum) && // * group anonymous sending
      item1.message.peerId === item2.message.peerId &&
      (item1.message as Message.message).post_author === (item2.message as Message.message).post_author;
  }

  getSiblingsAtIndex(itemIndex: number, items: GroupItem[]) {
    return [items[itemIndex - 1], items[itemIndex + 1]] as const;
  }

  // findGroupSiblingInSiblings(item: GroupItem, siblings: ReturnType<BubbleGroups['getSiblingsAtIndex']>) {
  //   return siblings.find((sibling) => sibling && this.canItemsBeGrouped(item, sibling));
  // }

  findGroupSiblingInItems(item: GroupItem, items: GroupItem[], index = items.indexOf(item), length = items.length) {
    const previousItem = items[index - 1];
    let siblingGroupedItem: GroupItem;
    if(previousItem?.group && this.canItemsBeGrouped(item, previousItem)) {
      siblingGroupedItem = previousItem;
    } else {
      for(let k = index + 1; k < length; ++k) {
        const nextItem = items[k];
        if(!this.canItemsBeGrouped(item, nextItem)) {
          break;
        }

        // the nearest group: one further away would put the item past the group in between
        if(nextItem.group) {
          siblingGroupedItem = nextItem;
          break;
        }
      }
    }

    return siblingGroupedItem;
  }

  addItemToGroup(item: GroupItem, group: BubbleGroup) {
    group.insertItem(item);
    this.addItemToCache(item);
  }

  insertItemToArray(item: GroupItem, array: GroupItem[]) {
    return insertSomething(
      array,
      item,
      this.sortItemsKey,
      this.reverse = item.reverse,
      this.compareItems
    );
  }

  insertGroup(group: BubbleGroup) {
    const idx = insertSomething(
      this.groups,
      group,
      this.sortGroupsKey,
      this.reverse,
      this.compareGroups
    );
    // this.updateGroupsClassNames();
    return idx;
  }

  updateGroupsClassNames() {
    this.groups.forEach((group, idx, arr) => {
      group.container.classList.toggle('bubbles-group-last', idx === 0);
      group.container.classList.toggle('bubbles-group-first', idx === (arr.length - 1));
    });
  }

  addItemToCache(item: GroupItem) {
    this.insertItemToArray(item, this.itemsArr);
    this.itemsMap.set(item.bubble, item);
  }

  removeItemFromCache(item: GroupItem) {
    indexOfAndSplice(this.itemsArr, item);
    this.itemsMap.delete(item.bubble);
  }

  getMessageFromId(message: MyMessage | AdminLog) {
    if(message._ === 'channelAdminLogEvent') {
      return this.chat.peerId;
    }

    let fromId = /* (this.chat.peerId.isAnyChat() && message.viaBotId) ||  */message.fromId;

    // fix for saved messages forward to self
    if(fromId === rootScope.myId && message.peerId === rootScope.myId && (message as Message.message).fwdFromId === fromId) {
      fromId = fromId.toPeerId(true);
    }

    return fromId;
  }

  generateGroupMid(message: MyMessage | AdminLog, dateTimestamp: number) {
    const {date: timestamp} = message;
    const mid = getMid(message);
    return this.chat.type === ChatType.Scheduled ? +`${(timestamp * 1000 - dateTimestamp) / 1000}.${+('' + mid).replace('.', '')}` : mid;
  }

  createItem(bubble: HTMLElement, message: MyMessage | AdminLog, reverse: boolean) {
    const single = !(message._ === 'message' || (message._ === 'messageService' && message.action && SERVICE_AS_REGULAR.has(message.action._)));
    const {date: timestamp} = message;
    const mid = getMid(message);
    const {dateTimestamp} = this.chat.bubbles.getDateForDateContainer(timestamp);
    const item: GroupItem = {
      mid,
      groupMid: this.generateGroupMid(message, dateTimestamp),
      fromId: this.getMessageFromId(message),
      bubble,
      // timestamp: this.chat.type === 'scheduled' ? +`${(timestamp * 1000 - dateTimestamp) / 1000}.${mid}` : timestamp,
      timestamp,
      dateTimestamp,
      mounted: false,
      single,
      message,
      reverse,
      timelineKey: makeBubbleTimelineKey(message, mid, dateTimestamp, this.getTimelinePosition(message, mid))
    };

    return item;
  }

  private getTimelinePosition(message: MyMessage | AdminLog, mid: number) {
    let position = this.positions.get(mid);
    if(position === undefined && this.compareItems) {
      position = isPendingTimelineMessage(message) ?
        this.getLateSendPosition(mid) :
        isEphemeralMessage(message) ? this.getEphemeralPosition(message.date) : undefined;
      if(position !== undefined) {
        this.positions.set(mid, position);
      }
    }

    return position ?? mid;
  }

  /**
   * Where a send still on its way goes when its bubble comes in after an earlier send has taken its server id
   * (`ChatBubbles.changedMids`): behind that one, where `raiseLaterSends` would have put it had the bubble been
   * in by then. Sends follow so fast that this is common: a bubble rendered at its temporary id above the
   * earlier one, then moved, made the chat jump.
   */
  private getLateSendPosition(mid: number) {
    let sentPosition: number;
    for(const [tempMid, sentMid] of this.chat.bubbles.changedMids) {
      if(tempMid < mid && sentMid > mid && (sentPosition === undefined || sentMid > sentPosition)) {
        sentPosition = sentMid;
      }
    }

    return sentPosition === undefined ? undefined : sentPosition + BEHIND_SENT;
  }

  /**
   * Where an ephemeral message dated `date` goes: right after the newest message dated no later, or right
   * before the oldest one rendered when they are all later. The place is kept once the bubble is in, so
   * history that comes later is ordered around it as it arrives, the way desktop appends it.
   */
  private getEphemeralPosition(date: number) {
    let oldest: GroupItem;
    for(const item of this.itemsArr) { // newest first
      const key = item.timelineKey;
      if(key.ephemeral) {
        continue;
      }

      if(item.timestamp <= date) {
        return key.position;
      }

      oldest = item;
    }

    return oldest ? oldest.timelineKey.position - 0.5 : 0;
  }

  /**
   * A send took its server id, `position`. The sends made after it get higher ones, so the ones still on their
   * way move behind it now rather than stay above it at their temporary ids — the screen keeps the order
   * they were sent in. Returns the items to move.
   */
  raiseLaterSends(sent: BubbleTimelineKey, position: number) {
    if(!this.compareItems) {
      return [];
    }

    const later = this.itemsArr.filter(({timelineKey: key}) => {
      return key.pending && key.mid > sent.mid && key.position < position;
    }).reverse(); // in the order they stand

    for(const item of later) {
      this.positions.set(item.timelineKey.mid, position + BEHIND_SENT);
    }

    return later;
  }

  /**
   * The ephemeral messages filed right after an item that moved from `from` to `to` keep following it while
   * it is dated no later than they are, `date` (a bot's answer stays under the command it answers). Returns
   * the items to move.
   */
  takeEphemeralFollowers(from: number, to: number, date: number) {
    if(!this.compareItems) {
      return [];
    }

    const followers = this.itemsArr.filter((item) => {
      return item.timelineKey.ephemeral && item.timelineKey.position === from && date <= item.timestamp;
    });

    for(const item of followers) {
      this.positions.set(item.timelineKey.mid, to);
    }

    return followers;
  }

  splitSiblingsOnGrouping(siblings: ReturnType<BubbleGroups['getSiblingsAtIndex']>) {
    const [previousSibling, nextSibling] = siblings;
    const previousGroup = previousSibling?.group;
    const nextGroup = nextSibling?.group;

    if(!previousGroup) {
      return;
    }

    // will refresh group
    // if(previousGroup === nextGroup) {
    const items = previousGroup.items;
    const index = items.indexOf(previousSibling) + 1;
    const length = items.length;
    if(index === length) {
      return;
    }

    const modifiedGroups: BubbleGroup[] = [previousGroup];
    // if(previousGroup !== nextGroup && nextGroup) {
    //   modifiedGroups.push(nextGroup);
    // }

    this.f(items, index, length);
    return modifiedGroups;
    // }
  }

  prepareForGrouping(bubble: HTMLElement, message: MyMessage | AdminLog, reverse: boolean) {
    const foundItem = this.getItemByBubble(bubble);
    if(foundItem) { // should happen only on edit
      // debugger;
      return;
    }

    const item = this.createItem(bubble, message, reverse);
    this.addItemToCache(item);
  }

  groupUngrouped() {
    const items = this.itemsArr;
    const length = items.length;
    const modifiedGroups: Set<BubbleGroup> = new Set();
    // for(let i = length - 1; i >= 0; --i) {
    for(let i = 0; i < length; ++i) {
      const item = items[i];
      if(item.group) {
        continue;
      }

      let hadGroup = true;
      const siblings = this.getSiblingsAtIndex(i, items);
      const siblingGroupedItem = this.findGroupSiblingInItems(item, items, i, length);

      // const foundItem = this.findGroupSiblingInSiblings(item, siblings);
      const foundItem = siblingGroupedItem;
      const group = foundItem?.group ?? (hadGroup = false, new BubbleGroup(this.chat, this, item.dateTimestamp));

      modifiedGroups.add(group);
      group.insertItem(item);

      if(!hadGroup) {
        const splittedGroups = this.splitSiblingsOnGrouping(siblings);
        if(splittedGroups) {
          splittedGroups.forEach((group) => modifiedGroups.add(group));
        }
      }
    }

    return modifiedGroups;
  }

  // addBubble(bubble: HTMLElement, message: MyMessage, unmountIfFound?: boolean) {
  //   const oldItem = this.getItemByBubble(bubble);
  //   if(unmountIfFound) { // updating position
  //     this.removeAndUnmountBubble(bubble);
  //   } else if(oldItem) { // editing
  //     const group = oldItem.group;
  //     this.changeItemBubble(oldItem, bubble);
  //     oldItem.mounted = false;

  //     return {item: oldItem, group};
  //   }

  //   const item = this.createItem(bubble, message);

  //   const foundItem = this.findSameGroupItem(item, this.itemsArr);

  //   const group = foundItem?.group ?? new BubbleGroup(this.chat, this, item.dateTimestamp);
  //   this.addItemToGroup(item, group);

  //   return {item, group};
  // }

  /* setClipIfNeeded(bubble: HTMLDivElement, remove = false) {
    //console.log('setClipIfNeeded', bubble, remove);
    const className = bubble.className;
    if(className.includes('is-message-empty') && (className.includes('photo') || className.includes('video'))) {
      let container = bubble.querySelector('.bubble__media-container') as SVGSVGElement;
      //console.log('setClipIfNeeded', bubble, remove, container);
      if(!container) return;

      try {
        Array.from(container.children).forEach((object) => {
          if(object instanceof SVGDefsElement) return;

          if(remove) {
            object.removeAttributeNS(null, 'clip-path');
          } else {
            let clipId = container.dataset.clipId;
            let path = container.firstElementChild.firstElementChild.lastElementChild as SVGPathElement;
            let width = +object.getAttributeNS(null, 'width');
            let height = +object.getAttributeNS(null, 'height');
            let isOut = className.includes('is-out');
            let isReply = className.includes('is-reply');
            let d = '';

            //console.log('setClipIfNeeded', object, width, height, isOut);

            let tr: number, tl: number;
            if(className.includes('forwarded') || isReply) {
              tr = tl = 0;
            } else if(isOut) {
              tr = className.includes('is-group-first') ? 12 : 6;
              tl = 12;
            } else {
              tr = 12;
              tl = className.includes('is-group-first') ? 12 : 6;
            }

            if(isOut) {
              d = generatePathData(0, 0, width - 9, height, tl, tr, 0, 12);
            } else {
              d = generatePathData(9, 0, width - 9, height, tl, tr, 12, 0);
            }

            path.setAttributeNS(null, 'd', d);
            object.setAttributeNS(null, 'clip-path', 'url(#' + clipId + ')');
          }
        });
      } catch(err) {}
    }
  } */

  // updateGroupByMessageId(mid: number) {
  //   const item = this.itemsArr.find((g) => g.mid === mid);
  //   if(item) {
  //     item.group.updateGroup();
  //   }
  // }

  cleanup() {
    this.itemsArr = [];
    this.groups = [];
    this.itemsMap.clear();
    this.positions.clear();
  }

  // findIncorrentPositions() {
  //   var bubbles = Array.from(this.chat.bubbles.chatInner.querySelectorAll('.bubbles-group .bubble')).reverse();
  //   var items = this.itemsArr;
  //   for(var i = 0, length = items.length; i < length; ++i) {
  //     const item = items[i];
  //     const foundBubble = bubbles[i];
  //     if(item.bubble !== foundBubble) {
  //       console.log('incorrect position', i, item, foundBubble);
  //       // debugger;
  //       // break;
  //     }
  //   }
  // }
}
