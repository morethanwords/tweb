/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from "../../lib/rootScope";
//import { generatePathData } from "../../helpers/dom";
import { MyMessage } from "../../lib/appManagers/appMessagesManager";
import type Chat from "./chat";
import indexOfAndSplice from "../../helpers/array/indexOfAndSplice";
import insertInDescendSortedArray from "../../helpers/array/insertInDescendSortedArray";
import positionElementByIndex from "../../helpers/dom/positionElementByIndex";
import AvatarElement from "../avatar";
import { Message } from "../../layer";
import { NULL_PEER_ID, REPLIES_PEER_ID } from "../../lib/mtproto/mtproto_config";
import { SERVICE_AS_REGULAR, STICKY_OFFSET } from "./bubbles";
import forEachReverse from "../../helpers/array/forEachReverse";

type GroupItem = {
  bubble: HTMLElement, 
  fromId: PeerId, 
  mid: number, 
  timestamp: number, 
  dateTimestamp: number, 
  mounted: boolean, 
  single: boolean, 
  group?: BubbleGroup
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

  constructor(chat: Chat, groups: BubbleGroups, dateTimestamp: number) {
    this.container = document.createElement('div');
    this.container.classList.add('bubbles-group');
    this.chat = chat;
    this.groups = groups;
    this.items = [];
    this.dateTimestamp = dateTimestamp;
  }

  createAvatar(message: Message.message | Message.messageService) {
    if(this.avatarLoadPromise) {
      return this.avatarLoadPromise;
    } else if(message._ === 'messageService') {
      return;
    }

    this.avatarContainer = document.createElement('div');
    this.avatarContainer.classList.add('bubbles-group-avatar-container');

    const fwdFrom = message.fwd_from;
    const fwdFromId = message.fwdFromId;
    const isForwardFromChannel = message.from_id && message.from_id._ === 'peerChannel' && message.fromId === fwdFromId;
    const currentPeerId = this.chat.peerId;
    this.avatar = new AvatarElement();
    this.avatar.classList.add('bubbles-group-avatar', 'user-avatar', 'avatar-40'/* , 'can-zoom-fade' */);
    this.avatarLoadPromise = this.avatar.updateWithOptions({
      lazyLoadQueue: this.chat.bubbles.lazyLoadQueue,
      peerId: ((fwdFrom && (currentPeerId === rootScope.myId || currentPeerId === REPLIES_PEER_ID)) || isForwardFromChannel ? fwdFromId : message.fromId) || NULL_PEER_ID,
      peerTitle: !fwdFromId && fwdFrom && fwdFrom.from_name ? /* '🔥 FF 🔥' */fwdFrom.from_name : undefined,
    });

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

  get lastItem() {
    return this.items[0];
  }

  updateClassNames() {
    const items = this.items;
    if(!items.length) {
      return;
    }
    
    const length = items.length;
    const first = items[length - 1].bubble;

    if(items.length === 1) {
      first.classList.add('is-group-first', 'is-group-last');
      //this.setClipIfNeeded(first);
      return;
    } else {
      first.classList.remove('is-group-last');
      first.classList.add('is-group-first');
      //this.setClipIfNeeded(first, true);
    }
    
    for(let i = length - 2; i > 0; --i) {
      const bubble = items[i].bubble;
      bubble.classList.remove('is-group-last', 'is-group-first');
      //this.setClipIfNeeded(bubble, true);
    }
    
    const last = items[0].bubble;
    last.classList.remove('is-group-first');
    last.classList.add('is-group-last');
    //this.setClipIfNeeded(last);
  }

  insertItem(item: GroupItem) {
    const {items} = this;
    const {timestamp, mid} = item;
    if(this.chat.type === 'scheduled') {
      let foundMidOnSameTimestamp = 0;
      let i = 0, length = items.length;
      for(; i < length; ++i) {
        const {timestamp: _timestamp, mid: _mid} = items[i];
  
        if(timestamp < _timestamp) {
          break;
        } else if(timestamp === _timestamp) {
          foundMidOnSameTimestamp = _mid;
        } 
        
        if(foundMidOnSameTimestamp && mid < foundMidOnSameTimestamp) {
          break;
        }
      }

      items.splice(i, 0, item);
    } else {
      insertInDescendSortedArray(items, item, 'mid');
    }

    if(items.length === 1) {
      insertInDescendSortedArray(this.groups.groups, this, 'firstMid');
    }
  }

  mount() {
    if(!this.groups.groups.includes(this)) { // group can be already removed
      return;
    }

    const offset = this.avatar ? 1 : 0;
    const items = this.items;

    this.updateClassNames();

    const {length} = items;
    forEachReverse(items, (item, idx) => {
      this.mountItem(item, length - 1 - idx, offset);
    });

    this.onItemMount();
  }

  mountItem(item: GroupItem, idx = this.items.indexOf(item), offset = this.avatar ? 1 : 0) {
    if(item.mounted) {
      return;
    }

    positionElementByIndex(item.bubble, this.container, offset + idx);
    item.mounted = true;
  }

  unmountItem(item: GroupItem) {
    if(item.mounted) {
      item.bubble.remove();
      item.mounted = false;
      this.onItemUnmount();
    }
  }

  onItemMount() {
    if(this.mounted) {
      return;
    }

    const dateContainer = this.chat.bubbles.getDateContainerByTimestamp(this.firstTimestamp);
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
  private itemsArr: Array<GroupItem> = []; // descend sorted
  private itemsMap: Map<HTMLElement, GroupItem> = new Map();
  public groups: Array<BubbleGroup> = []; // descend sorted
  private newGroupDiff = 121; // * 121 in scheduled messages

  constructor(private chat: Chat) {

  }

  removeBubble(bubble: HTMLElement) {
    const item = this.getItemByBubble(bubble);
    if(!item) {
      return;
    }

    const group = item.group;
    const items = group.items;
    if(items.length) {
      indexOfAndSplice(items, item);

      if(!items.length) {
        indexOfAndSplice(this.groups, group);
      }
    }

    indexOfAndSplice(this.itemsArr, item);
    this.itemsMap.delete(bubble);
    
    return item;
  }

  removeAndUnmountBubble(bubble: HTMLElement) {
    const item = this.removeBubble(bubble);
    if(item) {
      item.group.unmountItem(item);
    }
  }

  getItemByBubble(bubble: HTMLElement) {
    return this.itemsMap.get(bubble);
  }

  getLastGroup() {
    return this.groups[0];
  }

  // changeBubbleMid(bubble: HTMLElement, mid: number) {
  //   const item = this.getItemByBubble(bubble);
  //   if(!item) {
  //     return;
  //   }

  //   item.mid = mid;

  //   // indexOfAndSplice(item.group.items, item);
  //   // item.group.insertItem(item);

  //   indexOfAndSplice(this.itemsArr, item);
  //   insertInDescendSortedArray(this.itemsArr, item, 'mid');
  // }

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

  /**
   * 
   * @param item 
   * @param items expect descend sorted array
   * @returns 
   */
  findIndexForItemInItems(item: GroupItem, items: GroupItem[]) {
    let foundAtIndex = -1;
    for(let i = 0, length = items.length; i < length; ++i) {
      const _item = items[i];
      const diff = Math.abs(_item.timestamp - item.timestamp);
      const good = _item.fromId === item.fromId 
        && diff <= this.newGroupDiff 
        && item.dateTimestamp === _item.dateTimestamp 
        && !item.single 
        && !_item.single;

      if(good) {
        foundAtIndex = i;

        if(this.chat.type === 'scheduled') {
          break;
        }
      } else {
        foundAtIndex = -1;
      }

      if(this.chat.type !== 'scheduled') {
        if(item.mid > _item.mid) {
          break;
        }
      }
    }

    return foundAtIndex;
  }

  addItemToGroup(item: GroupItem, group: BubbleGroup) {
    item.group = group;
    group.insertItem(item);
    this.addItemToCache(item);
  }

  addItemToCache(item: GroupItem) {
    insertInDescendSortedArray(this.itemsArr, item, 'mid');
    this.itemsMap.set(item.bubble, item);
  }

  getMessageFromId(message: MyMessage) {
    let fromId = message.viaBotId || message.fromId;

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
      bubble, 
      fromId: this.getMessageFromId(message), 
      mid, 
      timestamp, 
      dateTimestamp, 
      mounted: false, 
      single: single
    };

    return item;
  }

  // prepareForGrouping(bubble: HTMLElement, message: MyMessage) {
  //   const item = this.createItem(bubble, message);
  //   this.addItemToCache(item);
  // }

  // groupUngrouped() {
  //   const items = this.itemsArr;
  //   const length = items.length;
  //   for(let i = length - 1; i >= 0; --i) {
  //     const item = items[i];
  //     if(item.gr)
  //   }
  // }

  addBubble(bubble: HTMLElement, message: MyMessage, unmountIfFound?: boolean) {
    const oldItem = this.getItemByBubble(bubble);
    if(unmountIfFound) { // updating position
      this.removeAndUnmountBubble(bubble);
    } else if(oldItem) { // editing
      const group = oldItem.group;
      this.changeItemBubble(oldItem, bubble);
      oldItem.mounted = false;

      return {item: oldItem, group};
    }

    const item = this.createItem(bubble, message);

    const foundAtIndex = this.findIndexForItemInItems(item, this.itemsArr);
    const foundItem = this.itemsArr[foundAtIndex];

    const group = foundItem?.group ?? new BubbleGroup(this.chat, this, item.dateTimestamp);
    this.addItemToGroup(item, group);
    
    return {item, group};
  }

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
}
