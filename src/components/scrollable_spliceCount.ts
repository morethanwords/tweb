import { isElementInViewport } from "../lib/utils";

export default class Scrollable {
  public container: HTMLDivElement;
  public thumb: HTMLDivElement;

  public type: string;
  public side: string;
  public scrollType: string;
  public scrollSide: string;

  public scrollSize = -1;
  public size = 0;
  public thumbSize = 0;

  public hiddenElements: {
    up: Element[],
    down: Element[]
  } = {
    up: [],
    down: []
  };
  public paddings = {up: 0, down: 0};

  public paddingTopDiv: HTMLDivElement;
  public paddingBottomDiv: HTMLDivElement;

  public splitUp: HTMLElement;
  public spliceCount = 1;
  public useStylePadding = false;
  public useOneHeight = false;

  constructor(public el: HTMLDivElement, x = false, y = true) {
    this.container = document.createElement('div');
    this.container.classList.add('scrollable');

    if(x) {
      this.container.classList.add('scrollable-x');
      this.type = 'width';
      this.side = 'left';
      this.scrollType = 'scrollWidth';
      this.scrollSide = 'scrollLeft';
    } else if(y) {
      this.container.classList.add('scrollable-y');
      this.type = 'height';
      this.side = 'top';
      this.scrollType = 'scrollHeight';
      this.scrollSide = 'scrollTop';
    } else {
      throw new Error('no side for scroll');
    }

    this.thumb = document.createElement('div');
    this.thumb.className = 'scrollbar-thumb';
    
    // @ts-ignore
    this.thumb.style[this.type] = '30px';

    this.container.addEventListener('mouseover', this.resize.bind(this));
    window.addEventListener('resize', this.resize.bind(this));

    this.paddingTopDiv = document.createElement('div');
    this.paddingTopDiv.classList.add('scroll-padding');
    this.paddingBottomDiv = document.createElement('div');
    this.paddingBottomDiv.classList.add('scroll-padding');

    this.container.addEventListener('scroll', this.onScroll.bind(this));
    
    this.container.append(this.paddingTopDiv);
    Array.from(el.children).forEach(c => this.container.append(c));
    this.container.append(this.paddingBottomDiv);
    
    el.append(this.container);//container.append(el);
    this.container.parentElement.append(this.thumb);
    this.resize();
  }

  public resize() {
    // @ts-ignore
    this.scrollSize = this.container[this.scrollType];
    
    let rect = this.container.getBoundingClientRect();
    
    // @ts-ignore
    this.size = rect[this.type];
    
    if(!this.size || this.size == this.scrollSize) {
      this.thumbSize = 0;
      
      // @ts-ignore
      this.thumb.style[this.type] = this.thumbSize + 'px';
      return;
    }
    //if(!height) return;
    
    let divider = this.scrollSize / this.size / 0.5;
    this.thumbSize = this.size / divider;
    
    if(this.thumbSize < 20) this.thumbSize = 20;
    
    // @ts-ignore
    this.thumb.style[this.type] = this.thumbSize + 'px';
    
    // @ts-ignore
    //console.log('onresize', thumb.style[type], thumbHeight, height);
  }

  public setVirtualContainer(el: HTMLElement, spliceCount = 1, useStylePadding = false, useOneHeight = false) {
    this.splitUp = el;
    this.hiddenElements = {
      up: [],
      down: []
    };
    this.paddings = {
      up: 0,
      down: 0
    };

    this.spliceCount = spliceCount;
    this.useStylePadding = useStylePadding;
    this.useOneHeight = useOneHeight;

    if(this.paddingTopDiv.parentElement) {
      this.paddingTopDiv.style.height = '';
      this.paddingBottomDiv.style.height = '';
    }

    

    /* if(useStylePadding) {
      this.paddingTopDiv.parentElement.removeChild(this.paddingTopDiv);
      this.paddingBottomDiv.parentElement.removeChild(this.paddingBottomDiv);
    } else { */
      el.parentElement.insertBefore(this.paddingTopDiv, el);
      el.parentNode.insertBefore(this.paddingBottomDiv, el.nextSibling);
    //}

    if(useStylePadding) {
      this.paddingTopDiv.style.height = '10px';
      this.paddingBottomDiv.style.height = '10px';
    }
  }

  public onScroll() {
    // @ts-ignore
    //let st = container[scrollSide];


    if(this.container[this.scrollType] != this.scrollSize || this.thumbSize == 0) {
      this.resize();
    }

    // @ts-ignore
    let value = this.container[this.scrollSide] / (this.scrollSize - this.size) * 100;
    let maxValue = 100 - (this.thumbSize / this.size * 100);
    
    //console.log('onscroll', container.scrollHeight, thumbHeight, height, value, maxValue);
    
    // @ts-ignore
    this.thumb.style[this.side] = (value >= maxValue ? maxValue : value) + '%';

    if(!this.splitUp) {
      return;
    }

    let splitUp = this.splitUp;
    let children = Array.from(splitUp.children) as HTMLElement[];
    let firstVisible = -1, lastVisible = -1;
    let length = children.length;
    for(let i = 0; i < length; ++i) {
      let child = children[i];
      if(isElementInViewport(child)) {
        if(firstVisible < 0) firstVisible = i;
        lastVisible = i;
      }
    }

    console.log('onscroll', firstVisible, lastVisible);

    if(firstVisible > 0) {
      let sliced = children.slice(0, firstVisible);

      let height = 0, singleHeight = sliced[0].scrollHeight;
      for(let child of sliced) {
        height += child.scrollHeight;
        this.hiddenElements.up.push(child);
        child.parentElement.removeChild(child);
      }

      this.paddings.up += this.useOneHeight ? singleHeight : height;

      //console.log('sliced up', sliced.length);

      //sliced.forEach(child => child.style.display = 'none');
      if(this.useStylePadding) splitUp.style.paddingTop = this.paddings.up + 'px';
      else this.paddingTopDiv.style.height = this.paddings.up + 'px';
      //console.log('onscroll need to add padding: ', paddings.up);
    } else if(this.hiddenElements.up.length) {
      console.log('onscroll up', isElementInViewport(this.paddingTopDiv), this.paddings.up);
      while(isElementInViewport(this.paddingTopDiv) && this.paddings.up) {
        //let child = this.hiddenElements.up.pop();

        /*
        splitUp.prepend(...childs);
  
        this.paddings.up -= child.scrollHeight;
        this.paddingTopDiv.style.height = this.paddings.up + 'px';*/

        let childs = this.hiddenElements.up.splice(-this.spliceCount).reverse();

        let height = 0;
        for(let child of childs) {
          splitUp.prepend(child);
          height += child.scrollHeight;
        }
  
        this.paddings.up -= this.useOneHeight ? childs[0].scrollHeight : height;

        if(this.useStylePadding) splitUp.style.paddingTop = this.paddings.up + 'px';
        else this.paddingTopDiv.style.height = this.paddings.up + 'px';
      }
    }

    if(lastVisible < (length - 1)) {
      let sliced = children.slice(lastVisible + 1, this.useOneHeight ? lastVisible + 1 + this.spliceCount : undefined).reverse();

      let height = 0, singleHeight = sliced[0].scrollHeight;
      for(let child of sliced) {
        height += child.scrollHeight;
        this.hiddenElements.down.unshift(child);
        child.parentElement.removeChild(child);
      }

      this.paddings.down += this.useOneHeight ? singleHeight : height;

      console.log('onscroll sliced down', splitUp, sliced.length, this.paddings.down + 'px');

      //sliced.forEach(child => child.style.display = 'none');

      /* if(this.useStylePadding) splitUp.style.paddingBottom = this.paddings.down + 'px';
      else */ this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      //console.log('onscroll need to add padding: ', paddings.up);
    } else if(this.hiddenElements.down.length) {
      console.log('onscroll down', isElementInViewport(this.paddingBottomDiv), this.paddings.down, this.hiddenElements);
      while(isElementInViewport(this.paddingBottomDiv) && this.paddings.down) {
        /* let child = this.hiddenElements.down.shift();

        splitUp.append(child);
  
        this.paddings.down -= child.scrollHeight;
        this.paddingBottomDiv.style.height = this.paddings.down + 'px'; */
        let childs = this.hiddenElements.down.splice(0, this.spliceCount);

        let height = 0;
        for(let child of childs) {
          splitUp.append(child);
          height += child.scrollHeight;
        }
  
        this.paddings.down -= this.useOneHeight ? childs[0].scrollHeight : height;
        /* if(this.useStylePadding) splitUp.style.paddingBottom = this.paddings.down + 'px';
        else */ this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      }
    }

    //console.log('onscroll', container, firstVisible, lastVisible, hiddenElements);

    //lastScrollPos = st;
  }
}
