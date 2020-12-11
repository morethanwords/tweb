import rootScope from "../../lib/rootScope";
import { generatePathData } from "../../helpers/dom";

type BubbleGroup = {timestamp: number, fromId: number, mid: number, group: HTMLDivElement[]};
export default class BubbleGroups {
  bubblesByGroups: Array<BubbleGroup> = []; // map to group
  groups: Array<HTMLDivElement[]> = [];
  //updateRAFs: Map<HTMLDivElement[], number> = new Map();
  newGroupDiff = 120;

  removeBubble(bubble: HTMLDivElement, mid: number) {
    let details = this.bubblesByGroups.findAndSplice(g => g.mid == mid);
    if(details && details.group.length) {
      details.group.findAndSplice(d => d == bubble);
      if(!details.group.length) {
        this.groups.findAndSplice(g => g == details.group);
      } else {
        this.updateGroup(details.group);
      }
    }
  }
  
  addBubble(bubble: HTMLDivElement, message: any, reverse: boolean) {
    let timestamp = message.date;
    let fromId = message.fromId;
    let group: HTMLDivElement[];

    // fix for saved messages forward to self
    if(fromId == rootScope.myId && message.peerId == rootScope.myId && message.fwdFromId == fromId) {
      fromId = -fromId;
    }
    
    // try to find added
    //this.removeBubble(message.mid);
    
    if(this.bubblesByGroups.length) {
      if(reverse) {
        let g = this.bubblesByGroups[0];
        if(g.fromId == fromId && (g.timestamp - timestamp) < this.newGroupDiff) {
          group = g.group;
          group.unshift(bubble);
        } else {
          this.groups.unshift(group = [bubble]);
        }
      } else {
        let g = this.bubblesByGroups[this.bubblesByGroups.length - 1];
        if(g.fromId == fromId && (timestamp - g.timestamp) < this.newGroupDiff) {
          group = g.group;
          group.push(bubble);
        } else {
          this.groups.push(group = [bubble]);
        }
      }
    } else {
      this.groups.push(group = [bubble]);
    }

    //console.log('[BUBBLE]: addBubble', bubble, message.mid, fromId, reverse, group);
    
    this.bubblesByGroups[reverse ? 'unshift' : 'push']({timestamp, fromId, mid: message.mid, group});
    this.updateGroup(group);
  }

  setClipIfNeeded(bubble: HTMLDivElement, remove = false) {
    //console.log('setClipIfNeeded', bubble, remove);
    const className = bubble.className;
    if(className.includes('is-message-empty')/*  && !className.includes('is-reply') */ 
      && (className.includes('photo') || className.includes('video'))) {
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
  }
  
  updateGroup(group: HTMLDivElement[]) {
    /* if(this.updateRAFs.has(group)) {
      window.cancelAnimationFrame(this.updateRAFs.get(group));
      this.updateRAFs.delete(group);
    } */
    
    //this.updateRAFs.set(group, window.requestAnimationFrame(() => {
      //this.updateRAFs.delete(group);
      
      if(!group.length) {
        return;
      }
      
      let first = group[0];

      //console.log('[BUBBLE]: updateGroup', group, first);
      
      if(group.length == 1) {
        first.classList.add('is-group-first', 'is-group-last');
        this.setClipIfNeeded(first);
        return;
      } else {
        first.classList.remove('is-group-last');
        first.classList.add('is-group-first');
        this.setClipIfNeeded(first, true);
      }
      
      let length = group.length - 1;
      for(let i = 1; i < length; ++i) {
        let bubble = group[i];
        bubble.classList.remove('is-group-last', 'is-group-first');
        this.setClipIfNeeded(bubble, true);
      }
      
      let last = group[group.length - 1];
      last.classList.remove('is-group-first');
      last.classList.add('is-group-last');
      this.setClipIfNeeded(last);
    //}));
  }

  updateGroupByMessageId(mid: number) {
    let details = this.bubblesByGroups.find(g => g.mid == mid);
    if(details) {
      this.updateGroup(details.group);
    }
  }
  
  cleanup() {
    this.bubblesByGroups = [];
    this.groups = [];
    /* for(let value of this.updateRAFs.values()) {
      window.cancelAnimationFrame(value);
    }
    this.updateRAFs.clear(); */
  }
}