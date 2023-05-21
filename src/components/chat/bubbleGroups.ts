/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '../../lib/rootScope';
// import { generatePathData } from "../../helpers/dom";
import {MyMessage} from '../../lib/appManagers/appMessagesManager';
import type Chat from './chat';
import indexOfAndSplice from '../../helpers/array/indexOfAndSplice';
import insertInDescendSortedArray from '../../helpers/array/insertInDescendSortedArray';
import positionElementByIndex from '../../helpers/dom/positionElementByIndex';
import AvatarElement from '../avatar';
import {Message} from '../../layer';
import {NULL_PEER_ID, REPLIES_PEER_ID} from '../../lib/mtproto/mtproto_config';
import {SERVICE_AS_REGULAR, STICKY_OFFSET} from './bubbles';
import forEachReverse from '../../helpers/array/forEachReverse';
import partition from '../../helpers/array/partition';
import noop from '../../helpers/noop';
import getMessageThreadId from '../../lib/appManagers/utils/messages/getMessageThreadId';

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
  message: Message.message | Message.messageService // use it only to set avatar
};

class BubbleGroup {
  container: HTMLElement;
  chat: Chat;
  groups: BubbleGroups;
  items: GroupItem[]; // descend sorted
  avatarContainer: HTMLElement;
  avatarLoadPromise: ReturnType<AvatarElement['updateWithOptions']>;
  avatar: AvatarElement;
  mounted: boolean;
  dateTimestamp: number;
  offset: number;

  constructor(chat: Chat, groups: BubbleGroups, dateTimestamp: number) {
    this.container = document.createElement('div');
    this.container.classList.add('bubbles-group');
    this.chat = chat;
    this.groups = groups;
    this.items = [];
    this.dateTimestamp = dateTimestamp;
    this.offset = 0;
  }

  createAvatar(message: Message.message | Message.messageService) {
    if(this.avatarLoadPromise) {
      return this.avatarLoadPromise;
    } else if(message._ === 'messageService') {
      return;
    }

    this.avatarContainer = document.createElement('div');
    this.avatarContainer.classList.add('bubbles-group-avatar-container');
    ++this.offset;

    const fwdFrom = message.fwd_from;
    const fwdFromId = message.fwdFromId;
    const isForwardFromChannel = message.from_id && message.from_id._ === 'peerChannel' && message.fromId === fwdFromId;
    const currentPeerId = this.chat.peerId;
    const avatar = this.avatar = new AvatarElement();
    this.avatar.classList.add('bubbles-group-avatar', 'user-avatar', 'avatar-40'/* , 'can-zoom-fade' */);
    const peerId = ((fwdFrom && (currentPeerId === rootScope.myId || currentPeerId === REPLIES_PEER_ID)) || isForwardFromChannel ? fwdFromId : message.fromId) || NULL_PEER_ID;
    const avatarLoadPromise = this.avatar.updateWithOptions({
      lazyLoadQueue: this.chat.bubbles.lazyLoadQueue,
      peerId,
      peerTitle: !fwdFromId && fwdFrom && fwdFrom.from_name ? /* '🔥 FF 🔥' */fwdFrom.from_name : undefined
    });

    // this.avatarLoadPromise = Promise.all([
    //   avatarLoadPromise,
    //   peerId && peerId.isUser() ? this.chat.managers.appUsersManager.getUser(peerId.toUserId()) : undefined
    // ]).then(([result, user]) => {
    //   if(user?.pFlags?.premium) {
    //     avatar.classList.add('is-premium', 'tgico-star');
    //   }

    //   return result;
    // });
    this.avatarLoadPromise = avatarLoadPromise;

    this.avatarContainer.append(this.avatar);
    this.container.append(this.avatarContainer);

    return this.avatarLoadPromise;
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
    insertInDescendSortedArray(items, item, this.groups.sortGroupItemsKey);

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

    const dateContainer = this.chat.bubbles.getDateContainerByTimestamp(this.dateTimestamp / 1000);
    // const idx = this.groups.indexOf(group);
    const dateGroups = this.groups.groups.filter((_group) => _group.dateTimestamp === this.dateTimestamp);
    const dateGroupsLength = dateGroups.length;
    const idx = dateGroups.indexOf(this);
    const unmountedLength = dateGroups.slice(idx + 1).reduce((acc, v) => acc + (v.mounted ? 0 : 1), 0);
    positionElementByIndex(this.container, dateContainer.container, STICKY_OFFSET + dateGroupsLength - 1 - idx - unmountedLength);
    this.mounted = true;
  }

  onItemUnmount() {
    if(!this.mounted) {
      return;
    }

    if(!this.items.length) {
      this.container.remove();
      this.chat.bubbles.deleteEmptyDateGroups();
      this.mounted = false;
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
  public groups: Array<BubbleGroup> = []; // descend sorted
  private newGroupDiff = 121; // * 121 in scheduled messages
  private sortItemsKey: Extract<keyof GroupItem, 'timestamp' | 'mid'>;
  private sortGroupsKey: Extract<keyof BubbleGroup, 'lastMid' | 'lastTimestamp'>;
  public sortGroupItemsKey: Extract<keyof GroupItem, 'groupMid' | 'timestamp'>;

  constructor(private chat: Chat) {
    this.sortItemsKey = chat.type === 'scheduled' ? 'timestamp' : 'mid';
    this.sortGroupsKey = chat.type === 'scheduled' ? 'lastTimestamp' : 'lastMid';
    this.sortGroupItemsKey = /* chat.type === 'scheduled' ? 'timestamp' :  */'groupMid';
  }

  removeItem(item: GroupItem) {
    item.group?.removeItem(item);
    this.removeItemFromCache(item);
  }

  removeAndUnmountBubble(bubble: HTMLElement) {
    const item = this.getItemByBubble(bubble);
    if(!item) {
      if(bubble.parentElement) {
        bubble.remove(); // * can be a placeholder
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
      this.groupUngrouped();
    }

    this.mountUnmountGroups(Array.from(modifiedGroups));

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

    // toMount.forEach((group) => {
    //   group.updateClassNames();
    // });
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

  changeBubbleMid(bubble: HTMLElement, mid: number) {
    const item = this.getItemByBubble(bubble);
    if(!item) {
      return;
    }

    item.mid = mid;

    // indexOfAndSplice(item.group.items, item);
    // // const canChangeGroupMid = !item.group.items.length || item.group.items.every((item) => item.groupMid === item.mid);
    // // if(canChangeGroupMid) item.groupMid = mid;
    // item.group.insertItem(item);

    indexOfAndSplice(this.itemsArr, item);
    this.insertItemToArray(item, this.itemsArr);
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
    return item2.fromId === item1.fromId &&
      Math.abs(item2.timestamp - item1.timestamp) <= this.newGroupDiff &&
      item1.dateTimestamp === item2.dateTimestamp &&
      !item1.single &&
      !item2.single &&
      item1.message.pFlags.out === item2.message.pFlags.out &&
      (!this.chat.isAllMessagesForum || getMessageThreadId(item1.message, true) === getMessageThreadId(item2.message, true)) &&
      (!item1.message.pFlags.out || item1.message.fromId === rootScope.myId);
  }

  getSiblingsAtIndex(itemIndex: number, items: GroupItem[]) {
    return [items[itemIndex - 1], items[itemIndex + 1]] as const;
  }

  // findGroupSiblingInSiblings(item: GroupItem, siblings: ReturnType<BubbleGroups['getSiblingsAtIndex']>) {
  //   return siblings.find((sibling) => sibling && this.canItemsBeGrouped(item, sibling));
  // }

  findGroupSiblingByItem(item: GroupItem, items: GroupItem[]) {
    items = items.slice();
    const idx = this.insertItemToArray(item, items);
    // return this.findGroupSiblingInSiblings(item, this.getSiblingsAtIndex(idx, items));
    return this.findGroupSiblingInItems(item, items, idx);
  }

  findGroupSiblingInItems(item: GroupItem, items: GroupItem[], index = items.indexOf(item), length = items.length) {
    const previousItem = items[index - 1];
    let siblingGroupedItem: GroupItem;
    if(previousItem?.group && this.canItemsBeGrouped(item, previousItem)) {
      siblingGroupedItem = previousItem;
    } else {
      for(let k = index + 1; k < length; ++k) {
        const nextItem = items[k];
        if(this.canItemsBeGrouped(item, nextItem)) {
          if(nextItem.group) {
            siblingGroupedItem = nextItem;
          }
        } else {
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
    return insertInDescendSortedArray(array, item, this.sortItemsKey);
  }

  insertGroup(group: BubbleGroup) {
    return insertInDescendSortedArray(this.groups, group, this.sortGroupsKey);
  }

  addItemToCache(item: GroupItem) {
    this.insertItemToArray(item, this.itemsArr);
    this.itemsMap.set(item.bubble, item);
  }

  removeItemFromCache(item: GroupItem) {
    indexOfAndSplice(this.itemsArr, item);
    this.itemsMap.delete(item.bubble);
  }

  getMessageFromId(message: MyMessage) {
    let fromId = /* (this.chat.peerId.isAnyChat() && message.viaBotId) ||  */message.fromId;

    // fix for saved messages forward to self
    if(fromId === rootScope.myId && message.peerId === rootScope.myId && (message as Message.message).fwdFromId === fromId) {
      fromId = fromId.toPeerId(true);
    }

    return fromId;
  }

  createItem(bubble: HTMLElement, message: MyMessage) {
    const single = !(message._ === 'message' || (message.action && SERVICE_AS_REGULAR.has(message.action._)));
    const {mid, date: timestamp} = message;
    const {dateTimestamp} = this.chat.bubbles.getDateForDateContainer(timestamp);
    const item: GroupItem = {
      mid,
      groupMid: this.chat.type === 'scheduled' ? +`${(timestamp * 1000 - dateTimestamp) / 1000}.${+('' + mid).replace('.', '')}` : mid,
      fromId: this.getMessageFromId(message),
      bubble,
      // timestamp: this.chat.type === 'scheduled' ? +`${(timestamp * 1000 - dateTimestamp) / 1000}.${mid}` : timestamp,
      timestamp,
      dateTimestamp,
      mounted: false,
      single,
      message
    };

    return item;
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

  prepareForGrouping(bubble: HTMLElement, message: MyMessage) {
    const foundItem = this.getItemByBubble(bubble);
    if(foundItem) { // should happen only on edit
      // debugger;
      return;
    }

    const item = this.createItem(bubble, message);
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
