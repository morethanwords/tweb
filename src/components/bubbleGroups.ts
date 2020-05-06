import { generatePathData } from "../lib/utils";

export default class BubbleGroups {
  bubblesByGroups: Array<{timestamp: number, fromID: number, mid: number, group: HTMLDivElement[]}> = []; // map to group
  groups: Array<HTMLDivElement[]> = [];
  //updateRAFs: Map<HTMLDivElement[], number> = new Map();
  newGroupDiff = 120;

  removeBubble(bubble: HTMLDivElement, mid: number) {
    let details = this.bubblesByGroups.findAndSplice(g => g.mid == mid);
    if(details && details.group.length) {
      details.group.findAndSplice(d => d == bubble);
      if(!details.group.length) {
        this.groups.findAndSplice(g => g == details.group);
      }
    }
  }
  
  addBubble(bubble: HTMLDivElement, message: any, reverse: boolean) {
    let timestamp = message.date;
    let fromID = message.fromID;
    let group: HTMLDivElement[];
    
    // try to find added
    //this.removeBubble(message.mid);
    
    if(this.bubblesByGroups.length) {
      if(reverse) {
        let g = this.bubblesByGroups[0];
        if(g.fromID == fromID && (g.timestamp - timestamp) < this.newGroupDiff) {
          group = g.group;
          group.unshift(bubble);
        } else {
          this.groups.unshift(group = [bubble]);
        }
      } else {
        let g = this.bubblesByGroups[this.bubblesByGroups.length - 1];
        if(g.fromID == fromID && (timestamp - g.timestamp) < this.newGroupDiff) {
          group = g.group;
          group.push(bubble);
        } else {
          this.groups.push(group = [bubble]);
        }
      }
    } else {
      this.groups.push(group = [bubble]);
    }

    //console.log('addBubble', bubble, message.mid, fromID, reverse, group);
    
    this.bubblesByGroups[reverse ? 'unshift' : 'push']({timestamp, fromID, mid: message.mid, group});
    this.updateGroup(group, reverse);
  }

  setClipIfNeeded(bubble: HTMLDivElement, remove = false) {
    //console.log('setClipIfNeeded', bubble, remove);
    if(bubble.classList.contains('is-message-empty')/*  && !bubble.classList.contains('is-reply') */ 
      && (bubble.classList.contains('photo') || bubble.classList.contains('video'))) {
      let container = bubble.querySelector('.bubble__media-container') as SVGSVGElement;
      //console.log('setClipIfNeeded', bubble, remove, container);
      if(!container) return;

      Array.from(container.children).forEach(object => {
        if(object instanceof SVGDefsElement) return;

        if(remove) {
          object.removeAttributeNS(null, 'clip-path');
        } else {
          let clipID = container.dataset.clipID;
          let path = container.firstElementChild.firstElementChild.lastElementChild as SVGPathElement;
          let width = +object.getAttributeNS(null, 'width');
          let height = +object.getAttributeNS(null, 'height');
          let isOut = bubble.classList.contains('is-out');
          let isReply = bubble.classList.contains('is-reply');
          let d = '';
  
          //console.log('setClipIfNeeded', object, width, height, isOut);
  
          let tr: number, tl: number;
          if(bubble.classList.contains('forwarded') || isReply) {
            tr = tl = 0;
          } else if(isOut) {
            tr = bubble.classList.contains('is-group-first') ? 12 : 6;
            tl = 12;
          } else {
            tr = 12;
            tl = bubble.classList.contains('is-group-first') ? 12 : 6;
          }
  
          if(isOut) {
            d = generatePathData(0, 0, width - 9, height, tl, tr, 0, 12);
          } else {
            d = generatePathData(9, 0, width - 9, height, tl, tr, 12, 0);
          }
          
          path.setAttributeNS(null, 'd', d);
          object.setAttributeNS(null, 'clip-path', 'url(#' + clipID + ')');
        }
      });
    }
  }
  
  updateGroup(group: HTMLDivElement[], reverse = false) {
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

      //appImManager.scrollPosition.prepareFor(reverse ? 'up' : 'down');

      //console.log('updateGroup', group, first);
      
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

      //appImManager.scrollPosition.restore();
    //}));
  }

  updateGroupByMessageID(mid: number) {
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