import { isElementInViewport, isScrolledIntoView, cancelEvent } from "../lib/utils";

export default class Scrollable {
  public container: HTMLDivElement;
  public thumb: HTMLDivElement;

  public type: string;
  public side: string;
  public scrollType: string;
  public scrollSide: string;
  public clientAxis: string;

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

  public onAddedBottom: () => void = null;

  /* public topObserver: IntersectionObserver;
  public isTopIntersecting: boolean;
  public bottomObserver: IntersectionObserver;
  public isBottomIntersecting: boolean; */

  constructor(public el: HTMLDivElement, x = false, y = true) {
    this.container = document.createElement('div');
    this.container.classList.add('scrollable');

    /* this.bottomObserver = new IntersectionObserver(entries => {
      let entry = entries[0];

      this.isBottomIntersecting = entry.intersectionRatio > 0;

      // @ts-ignore
      //console.log('bottom instersection:', entry, entry.isVisible, entry.intersectionRatio, entry.isIntersecting);
      console.log('bottom intersection:', this.isBottomIntersecting);
    });

    this.topObserver = new IntersectionObserver(entries => {
      let entry = entries[0];

      this.isTopIntersecting = entry.intersectionRatio > 0;

      // @ts-ignore
      //console.log('top instersection:', entry, entry.isVisible, entry.intersectionRatio, entry.isIntersecting);
      console.log('top intersection:', this.isTopIntersecting);
    }); */

    if(x) {
      this.container.classList.add('scrollable-x');
      this.type = 'width';
      this.side = 'left';
      this.scrollType = 'scrollWidth';
      this.scrollSide = 'scrollLeft';
      this.clientAxis = 'clientX';

      let scrollHorizontally = (e: any) => {
        e = window.event || e;
        var delta = Math.max(-1, Math.min(1, (e.wheelDelta || -e.detail)));
        this.container.scrollLeft -= (delta * 20);
        e.preventDefault();
      };
      if(this.container.addEventListener) {
        // IE9, Chrome, Safari, Opera
        this.container.addEventListener("mousewheel", scrollHorizontally, false);
        // Firefox
        this.container.addEventListener("DOMMouseScroll", scrollHorizontally, false);
      } else {
        // IE 6/7/8
        // @ts-ignore
        this.container.attachEvent("onmousewheel", scrollHorizontally);
      }
    } else if(y) {
      this.container.classList.add('scrollable-y');
      this.type = 'height';
      this.side = 'top';
      this.scrollType = 'scrollHeight';
      this.scrollSide = 'scrollTop';
      this.clientAxis = 'clientY';
    } else {
      throw new Error('no side for scroll');
    }

    this.thumb = document.createElement('div');
    this.thumb.className = 'scrollbar-thumb';
    
    // @ts-ignore
    this.thumb.style[this.type] = '30px';

    let onMouseMove = (e: MouseEvent) => {
      let rect = this.thumb.getBoundingClientRect();

      let diff: number;
      // @ts-ignore
      diff = e[this.clientAxis] - rect[this.side];
      // @ts-ignore
      this.container[this.scrollSide] += diff * 0.5;

      console.log('onMouseMove', e, diff);

      cancelEvent(e);
    };

    this.thumb.addEventListener('mousedown', () => {
      window.addEventListener('mousemove', onMouseMove);

      window.addEventListener('mouseup', () => {
        window.removeEventListener('mousemove', onMouseMove);
      }, {once: true});
    });

    this.container.addEventListener('mouseover', this.resize.bind(this));
    window.addEventListener('resize', this.resize.bind(this));

    this.paddingTopDiv = document.createElement('div');
    this.paddingTopDiv.classList.add('scroll-padding');
    this.paddingBottomDiv = document.createElement('div');
    this.paddingBottomDiv.classList.add('scroll-padding');

    this.container.addEventListener('scroll', this.onScroll.bind(this));
    
    //this.container.append(this.paddingTopDiv);
    Array.from(el.children).forEach(c => this.container.append(c));
    //this.container.append(this.paddingBottomDiv);
    
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

  public setVirtualContainer(el?: HTMLElement) {
    this.splitUp = el;
    
    this.hiddenElements.up.length = this.hiddenElements.down.length = 0;
    this.paddings.up = this.paddings.down = 0;

    if(this.paddingTopDiv.parentElement) {
      this.paddingTopDiv.style.height = '';
      this.paddingBottomDiv.style.height = '';
    }

    //this.topObserver.observe(this.paddingTopDiv);
    //this.bottomObserver.observe(this.paddingBottomDiv);

    if(el) {
      el.parentElement.insertBefore(this.paddingTopDiv, el);
      el.parentNode.insertBefore(this.paddingBottomDiv, el.nextSibling);
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
      if(isElementInViewport(child) || isScrolledIntoView(child)) {
        if(firstVisible < 0) firstVisible = i;
        lastVisible = i;
      }
    }

    //console.log('onscroll', firstVisible, lastVisible);

    if(firstVisible > 0) {
      let sliced = children.slice(0, firstVisible);

      for(let child of sliced) {
        this.paddings.up += child.scrollHeight;
        this.hiddenElements.up.push(child);
        child.parentElement.removeChild(child);
      }

      //console.log('onscroll sliced up', sliced.length);

      //sliced.forEach(child => child.style.display = 'none');
      this.paddingTopDiv.style.height = this.paddings.up + 'px';
      //console.log('onscroll need to add padding: ', paddings.up);
    } else if(this.hiddenElements.up.length) {
      //console.log('onscroll up', isElementInViewport(this.paddingTopDiv), isScrolledIntoView(this.paddingTopDiv), this.paddings.up);
      while((isElementInViewport(this.paddingTopDiv) || isScrolledIntoView(this.paddingTopDiv)) && this.paddings.up) {
        let child = this.hiddenElements.up.pop();

        splitUp.prepend(child);
  
        this.paddings.up -= child.scrollHeight;
        this.paddingTopDiv.style.height = this.paddings.up + 'px';
      }
    }

    if(lastVisible < (length - 1)) {
      let sliced = children.slice(lastVisible + 1).reverse();

      for(let child of sliced) {
        this.paddings.down += child.scrollHeight;
        this.hiddenElements.down.unshift(child);
        child.parentElement.removeChild(child);
      }

      //console.log('onscroll sliced down', splitUp, sliced.length, this.paddings.down + 'px');

      this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      //console.log('onscroll need to add padding: ', paddings.up);
    } else if(this.hiddenElements.down.length) {
      //console.log('onscroll down', isElementInViewport(this.paddingBottomDiv), 
        //isScrolledIntoView(this.paddingBottomDiv), this.paddings.down, this.hiddenElements);
      while((isElementInViewport(this.paddingBottomDiv) || isScrolledIntoView(this.paddingBottomDiv)) && this.paddings.down) {
        let child = this.hiddenElements.down.shift();

        if(!child) {
          this.paddings.down = 0;
          this.paddingBottomDiv.style.height = '0px';
          break;
        }

        splitUp.append(child);
  
        this.paddings.down -= child.scrollHeight;
        this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      }

      if(this.onAddedBottom) this.onAddedBottom();
    } else {
      this.paddingBottomDiv.style.height = '0px';
    }

    //console.log('onscroll', container, firstVisible, lastVisible, hiddenElements);

    //lastScrollPos = st;
  }
}
