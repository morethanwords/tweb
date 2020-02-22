import { cancelEvent } from "../lib/utils";

//import {measure} from 'fastdom/fastdom.min';
import {measure} from 'fastdom';

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
    up: {element: Element, height: number}[],
    down: {element: Element, height: number}[]
  } = {
    up: [],
    down: []
  };
  public paddings = {up: 0, down: 0};

  public paddingTopDiv: HTMLDivElement;
  public paddingBottomDiv: HTMLDivElement;

  public splitUp: HTMLElement;
  public splitOffset = 1500;

  public onAddedBottom: () => void = null;

  public topObserver: IntersectionObserver;
  public isTopIntersecting: boolean;
  public bottomObserver: IntersectionObserver;
  public isBottomIntersecting: boolean;

  public splitObserver: IntersectionObserver;

  constructor(public el: HTMLDivElement, x = false, y = true) {
    this.container = document.createElement('div');
    this.container.classList.add('scrollable');

    let arr = [];
    for(let i = 0.001; i < 1; i += 0.001) arr.push(i);
    this.topObserver = new IntersectionObserver(entries => {
      let entry = entries[0];
      
      // console.log('top intersection:', entries, this.isTopIntersecting, entry.isIntersecting, entry.intersectionRatio > 0);
      if(this.isTopIntersecting = entry.isIntersecting) {
        this.onTopIntersection(entry);
      }
      // console.log('top intersection end');
    }, {threshold: arr});

    this.bottomObserver = new IntersectionObserver(entries => {
      let entry = entries[0];

      // console.log('bottom intersection:', entries, this.isBottomIntersecting, entry.isIntersecting, entry.intersectionRatio > 0);
      if(this.isBottomIntersecting = entry.isIntersecting) {
        this.onBottomIntersection(entry);
        
        if(this.onScrolledBottom) this.onScrolledBottom();
      }
    }, {threshold: arr});

    this.splitObserver = new IntersectionObserver(entries => {
      //console.log('splitObserver', entries);

      for(let entry of entries) {
        //console.log('onscroll entry', entry.target, entry.isIntersecting, entry);
        if(!entry.isIntersecting && entry.target.parentElement && entry.rootBounds) {
          let child = entry.target;
          //console.log('onscroll entry', entry.boundingClientRect, child, entry);

          let isTop = entry.boundingClientRect.top <= 0;
          let isBottom = entry.rootBounds.height <= entry.boundingClientRect.top;

          let needHeight = this.splitOffset;
          if(isTop) {
            let sliced: Element[] = [/* child */];

            do {
              if(needHeight > 0) {
                needHeight -= child.scrollHeight;
              } else {
                sliced.push(child);
              }
            } while(child = child.previousElementSibling);

            let length = sliced.length;
            for(let i = length - 1; i >= 0; --i) {
              let child = sliced[i];

              let height = child.scrollHeight;
              this.paddings.up += height;
              this.hiddenElements.up.push({element: child, height});
              child.parentElement.removeChild(child);
            }
            
            this.paddingTopDiv.style.height = this.paddings.up + 'px';
            //console.log('onscroll sliced up', sliced);
          } else if(isBottom) {
            let sliced: Element[] = [/* child */];

            do {
              if(needHeight > 0) {
                needHeight -= child.scrollHeight;
              } else {
                sliced.push(child);
              }
            } while(child = child.nextElementSibling);

            let length = sliced.length;
            for(let i = length - 1; i >= 0; --i) {
              let child = sliced[i];

              let height = child.scrollHeight;
              this.paddings.down += height;
              this.hiddenElements.down.unshift({element: child, height});
              child.parentElement.removeChild(child);
            }
            
            this.paddingBottomDiv.style.height = this.paddings.down + 'px';
            //console.log('onscroll sliced down', sliced);
          }

          //console.log('splitObserver', entry, entry.target, isTop);
        }
      }
    });

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

      // console.log('onMouseMove', e, diff);

      cancelEvent(e);
    };

    this.thumb.addEventListener('mousedown', () => {
      window.addEventListener('mousemove', onMouseMove);

      window.addEventListener('mouseup', () => {
        window.removeEventListener('mousemove', onMouseMove);
      }, {once: true});
    });

    //this.container.addEventListener('mouseover', this.resize.bind(this)); // omg
    window.addEventListener('resize', this.resize.bind(this));

    this.paddingTopDiv = document.createElement('div');
    this.paddingTopDiv.classList.add('scroll-padding');
    this.paddingBottomDiv = document.createElement('div');
    this.paddingBottomDiv.classList.add('scroll-padding');

    this.topObserver.observe(this.paddingTopDiv);
    this.bottomObserver.observe(this.paddingBottomDiv);

    this.container.addEventListener('scroll', this.onScroll.bind(this));
    
    //this.container.append(this.paddingTopDiv);
    Array.from(el.children).forEach(c => this.container.append(c));
    //this.container.append(this.paddingBottomDiv);
    
    el.append(this.container);//container.append(el);
    this.container.parentElement.append(this.thumb);
    this.resize();
  }

  public resize() {
    //console.time('scroll resize');
    // @ts-ignore
    this.scrollSize = this.container[this.scrollType];
    
    let rect = this.container.getBoundingClientRect();
    
    // @ts-ignore
    this.size = rect[this.type];
    
    if(!this.size || this.size == this.scrollSize) {
      this.thumbSize = 0;
      
      // @ts-ignore
      this.thumb.style[this.type] = this.thumbSize + 'px';
      //console.timeEnd('scroll resize');
      return;
    }
    //if(!height) return;
    
    let divider = this.scrollSize / this.size / 0.5;
    this.thumbSize = this.size / divider;
    
    if(this.thumbSize < 20) this.thumbSize = 20;
    
    // @ts-ignore
    this.thumb.style[this.type] = this.thumbSize + 'px';

    //console.timeEnd('scroll resize');
    
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

    /* this.topObserver.unobserve(this.paddingTopDiv);
    this.bottomObserver.unobserve(this.paddingBottomDiv);

    this.topObserver.observe(this.paddingTopDiv);
    this.bottomObserver.observe(this.paddingBottomDiv); */

    if(el) {
      el.parentElement.insertBefore(this.paddingTopDiv, el);
      el.parentNode.insertBefore(this.paddingBottomDiv, el.nextSibling);
    }
  }

  public onScroll() {
    // @ts-ignore
    //let st = container[scrollSide];

    //console.time('scroll onScroll');

    // @ts-ignore
    if(this.container[this.scrollType] != this.scrollSize || this.thumbSize == 0) {
      this.resize();
    }

    // @ts-ignore
    let value = this.container[this.scrollSide] / (this.scrollSize - this.size) * 100;
    let maxValue = 100 - (this.thumbSize / this.size * 100);
    
    //console.log('onscroll', container.scrollHeight, thumbHeight, height, value, maxValue);
    
    // @ts-ignore
    this.thumb.style[this.side] = (value >= maxValue ? maxValue : value) + '%';

    //console.timeEnd('scroll onScroll');
  }

  public onTopIntersection(entry: IntersectionObserverEntry) {
    // console.log('onTopIntersection');

    if(this.hiddenElements.up.length && this.paddings.up) {
      let needHeight = entry.intersectionRect.height + this.splitOffset;

      while(needHeight > 0 && this.paddings.up) {
        let child = this.hiddenElements.up.pop();
        
        // console.log('top returning from hidden', child);

        if(!child) {
          this.paddings.up = 0;
          this.paddingTopDiv.style.height = '0px';
          break;
        }

        /* await new Promise((resolve, reject) => {
          window.requestAnimationFrame(resolve);
        }); */

        this.splitUp.prepend(child.element);
        let height = child.height || child.element.scrollHeight;

        needHeight -= height;
        this.paddings.up -= height;

        this.paddingTopDiv.style.height = this.paddings.up + 'px';
      }
    } else {
      this.paddingTopDiv.style.height = '0px';
    }
  }

  public onBottomIntersection(entry: IntersectionObserverEntry) {
    // console.log('onBottomIntersection');

    if(this.hiddenElements.down.length && this.paddings.down) {
      let needHeight = entry.intersectionRect.height + this.splitOffset;

      while(needHeight > 0 && this.paddings.down) {
        let child = this.hiddenElements.down.shift();

        if(!child) {
          this.paddings.down = 0;
          this.paddingBottomDiv.style.height = '0px';
          break;
        }

        this.splitUp.append(child.element);
        let height = child.height || child.element.scrollHeight;

        needHeight -= height;
        this.paddings.down -= height;

        this.paddingBottomDiv.style.height = this.paddings.down + 'px';
      }

      if(this.onAddedBottom) this.onAddedBottom();
    } else {
      this.paddingBottomDiv.style.height = '0px';
    }
  }

  public onScrolledBottom() {

  }

  public prepend(...smth: (string | Node)[]) {
    if(this.splitUp) {
      this.splitUp.prepend(...smth);

      for(let node of smth) {
        if(typeof(node) !== 'string') {
          this.splitObserver.unobserve(node as Element);
          this.splitObserver.observe(node as Element);
        }
      }
    } else {
      this.container.prepend(...smth);
    }
  }

  public append(...smth: (string | Node)[]) {
    if(this.splitUp) {
      this.splitUp.append(...smth);

      for(let node of smth) {
        if(typeof(node) !== 'string') {
          this.splitObserver.unobserve(node as Element);
          this.splitObserver.observe(node as Element);
        }
      }
    } else {
      this.container.append(...smth);
    }
  }

  public insertBefore(newChild: Element, refChild: Element) {
    if(this.splitUp) {
      this.splitObserver.unobserve(newChild);
      return this.splitUp.insertBefore(newChild, refChild);
    }

    return this.container.insertBefore(newChild, refChild);
  }

  set scrollTop(y: number) {
    this.container.scrollTop = y;
  }

  get scrollTop() {
    return this.container.scrollTop;
  }

  get scrollHeight() {
    return this.container.scrollHeight;
  }

  get parentElement() {
    return this.container.parentElement;
  }

  get offsetHeight() {
    return this.container.offsetHeight;
  }
}
