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
import findAndSplice from "../../helpers/array/findAndSplice";

type Group = {bubble: HTMLElement, mid: number, timestamp: number}[];
type BubbleGroup = {timestamp: number, fromId: PeerId, mid: number, group: Group};
export default class BubbleGroups {
  private bubbles: Array<BubbleGroup> = []; // map to group
  private detailsMap: Map<HTMLElement, BubbleGroup> = new Map();
  private groups: Array<Group> = [];
  //updateRAFs: Map<HTMLElement[], number> = new Map();
  private newGroupDiff = 121; // * 121 in scheduled messages

  constructor(private chat: Chat) {

  }

  removeBubble(bubble: HTMLElement) {
    const details = this.detailsMap.get(bubble);
    if(details) {
      if(details.group.length) {
        findAndSplice(details.group, d => d.bubble === bubble);
        if(!details.group.length) {
          indexOfAndSplice(this.groups, details.group);
        } else {
          this.updateGroup(details.group);
        }
      }
      
      this.detailsMap.delete(bubble);
    }
  }

  changeBubbleMid(bubble: HTMLElement, mid: number) {
    const details = this.detailsMap.get(bubble);
    if(details) {
      details.mid = mid;
    }
  }
  
  addBubble(bubble: HTMLElement, message: MyMessage, reverse: boolean) {
    //return;

    const timestamp = message.date;
    const mid = message.mid;
    let fromId = message.viaBotId || message.fromId;
    let group: Group;

    // fix for saved messages forward to self
    if(fromId === rootScope.myId && message.peerId === rootScope.myId && (message as any).fwdFromId === fromId) {
      fromId = fromId.toPeerId(true);
    }
    
    // try to find added
    this.removeBubble(bubble);
    
    const insertObject = {bubble, mid, timestamp};
    if(this.bubbles.length) {
      let foundBubble: BubbleGroup;
      let foundAtIndex = -1;
      for(let i = 0; i < this.bubbles.length; ++i) {
        const bubble = this.bubbles[i];
        const diff = Math.abs(bubble.timestamp - timestamp);
        const good = bubble.fromId === fromId && diff <= this.newGroupDiff;

        if(good) {
          foundAtIndex = i;

          if(this.chat.type === 'scheduled') {
            break;
          }
        } else {
          foundAtIndex = -1;
        }

        if(this.chat.type !== 'scheduled') {
          if(mid > bubble.mid) {
            break;
          }
        }
      }

      if(foundAtIndex !== -1) {
        foundBubble = this.bubbles[foundAtIndex];
      }
      /* const foundBubble = this.bubbles.find(bubble => {
        const diff = Math.abs(bubble.timestamp - timestamp);
        return bubble.fromId === fromId && diff <= this.newGroupDiff;
      }); */

      if(!foundBubble) this.groups.push(group = [insertObject]);
      else {
        group = foundBubble.group;
        
        let i = 0, foundMidOnSameTimestamp = 0;
        for(; i < group.length; ++i) {
          const _timestamp = group[i].timestamp;
          const _mid = group[i].mid;

          if(timestamp < _timestamp) {
            break;
          } else if(timestamp === _timestamp) {
            foundMidOnSameTimestamp = _mid;
          } 
          
          if(foundMidOnSameTimestamp && mid < foundMidOnSameTimestamp) {
            break;
          }
        }

        group.splice(i, 0, insertObject);
      }
    } else {
      this.groups.push(group = [insertObject]);
    }

    //console.log('[BUBBLE]: addBubble', bubble, message.mid, fromId, reverse, group);

    const bubbleGroup = {timestamp, fromId, mid: message.mid, group};
    let insertIndex = 0;
    for(; insertIndex < this.bubbles.length; ++insertIndex) {
      if(this.bubbles[insertIndex].mid < mid) {
        break;
      }
    }
    
    this.bubbles.splice(insertIndex, 0, {timestamp, fromId, mid: message.mid, group});
    this.updateGroup(group);

    this.detailsMap.set(bubble, bubbleGroup);
  }

  /* setClipIfNeeded(bubble: HTMLDivElement, remove = false) {
    //console.log('setClipIfNeeded', bubble, remove);
    const className = bubble.className;
    if(className.includes('is-message-empty') && (className.includes('photo') || className.includes('video'))) {
      let container = bubble.querySelector('.bubble__media-container') as SVGSVGElement;
      //console.log('setClipIfNeeded', bubble, remove, container);
      if(!container) return;

      try {
        Array.from(container.children).forEach(object => {
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
  
  updateGroup(group: Group) {
    /* if(this.updateRAFs.has(group)) {
      window.cancelAnimationFrame(this.updateRAFs.get(group));
      this.updateRAFs.delete(group);
    } */
    
    //this.updateRAFs.set(group, window.requestAnimationFrame(() => {
      //this.updateRAFs.delete(group);
      
      if(!group.length) {
        return;
      }
      
      const first = group[0].bubble;

      //console.log('[BUBBLE]: updateGroup', group, first);
      
      if(group.length === 1) {
        first.classList.add('is-group-first', 'is-group-last');
        //this.setClipIfNeeded(first);
        return;
      } else {
        first.classList.remove('is-group-last');
        first.classList.add('is-group-first');
        //this.setClipIfNeeded(first, true);
      }
      
      const length = group.length - 1;
      for(let i = 1; i < length; ++i) {
        const bubble = group[i].bubble;
        bubble.classList.remove('is-group-last', 'is-group-first');
        //this.setClipIfNeeded(bubble, true);
      }
      
      const last = group[group.length - 1].bubble;
      last.classList.remove('is-group-first');
      last.classList.add('is-group-last');
      //this.setClipIfNeeded(last);
    //}));
  }

  updateGroupByMessageId(mid: number) {
    const details = this.bubbles.find(g => g.mid === mid);
    if(details) {
      this.updateGroup(details.group);
    }
  }
  
  cleanup() {
    this.bubbles = [];
    this.groups = [];
    this.detailsMap.clear();
    /* for(let value of this.updateRAFs.values()) {
      window.cancelAnimationFrame(value);
    }
    this.updateRAFs.clear(); */
  }
}
