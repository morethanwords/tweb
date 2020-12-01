// https://github.com/evgeny-nadymov/telegram-react/blob/master/src/Components/ColumnMiddle/PinnedMessageBorder.js

export default class PinnedMessageBorder {
  private border: HTMLElement;
  private wrapper: HTMLElement;
  private svg: SVGSVGElement;
  private defs: SVGDefsElement;
  private clipPath: SVGClipPathElement;
  private path: SVGPathElement;
  private mark: HTMLElement;

  private count: number;
  private index: number;

  private drawRect = (x: number, y: number, width: number, height: number, radius: number) => {
    return `M${x},${y + radius}a${radius},${radius},0,0,1,${width},0v${height - 2 * radius}a${radius},${radius},0,0,1,${-width},0Z`;
  };

  private getClipPath = (id: string, barHeight: number, count: number) => {
    const radius = 1;

    let d = '';
    if(count === 3) {
      d = this.drawRect(0, 0, 2, barHeight, radius)
        + this.drawRect(0, 11, 2, barHeight + 1, radius)
        + this.drawRect(0, 23, 2, barHeight, radius);
    } else {
      for(let i = 0; i < count; i++) {
        d += this.drawRect(0, (barHeight + 2) * i, 2, barHeight, radius);
      }
    }

    if(!this.clipPath) {
      this.clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
      this.path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

      this.clipPath.append(this.path);
    }

    this.clipPath.id = id;
    this.path.setAttributeNS(null, 'd', d);

    return this.clipPath;
  };

  private getBarHeight = (count: number, index: number) => {
    let barHeight = 32;
    if(count === 1) {
      barHeight = 32;
    } else if(count === 2) {
      barHeight = 15;
    } else if(count === 3) {
      barHeight = 9;
    } else if(count === 4) {
      barHeight = 7;
    } else if(count > 3) {
      barHeight = 7;
    }

    return barHeight;
  };

  private getMarkHeight = (count: number, index: number) => {
    let barHeight = 32;
    if(count === 1) {
      barHeight = 32;
    } else if(count === 2) {
      barHeight = 15;
    } else if(count === 3) {
      barHeight = index === 1 ? 10 : 9;
    } else if(count === 4) {
      barHeight = 7;
    } else if(count > 3) {
      barHeight = 7;
    }

    return barHeight;
  };

  private getMarkTranslateY = (index: number, barHeight: number, count: number) => {
    if(count === 1) {
      return 0;
    } else if(count === 2) {
      return index === 0 ? 0 : barHeight + 2;
    }

    if(count === 3) {
      if(index === 0) {
        return 0;
      } else if (index === 1) {
        return 11;
      }

      return 23;
    } else {
      return (barHeight + 2) * index;
    }
  };

  private getTrackTranslateY = (index: number, count: number, barHeight: number, trackHeight: number) => {
    if(count <= 4) {
      return 0;
    }

    if(index <= 1) {
      return 0;
    } else if(index >= count - 2) {
      return trackHeight - 32;
    }

    return (barHeight + 4) / 2 + (index - 2) * (barHeight + 2);
  };

  private getTrackHeight = (count: number, barHeight: number) => {
    return count <= 3 ? 32 : barHeight * count + 2 * (count - 1);
  };

  public render(count: number, index: number) {
    if(!this.border) {
      this.border = document.createElement('div');
      this.border.classList.add('pinned-message-border');

      this.wrapper = document.createElement('div');
      this.border.append(this.wrapper);
    }
    
    if(count === 1) {
      if(this.count !== count) {
        this.wrapper.className = 'pinned-message-border-wrapper-1';
        this.border.classList.remove('pinned-message-border-mask');
        this.wrapper.innerHTML = this.wrapper.style.cssText = '';
      }

      return this.border;
    }

    const barHeight = this.getBarHeight(count, index);
    const markHeight = this.getMarkHeight(count, index);
    const trackHeight = this.getTrackHeight(count, barHeight);

    const clipPathId = `clipPath_${count}`;
    const clipPath = this.getClipPath(clipPathId, barHeight, count);

    const markTranslateY = this.getMarkTranslateY(index, barHeight, count);
    const trackTranslateY = this.getTrackTranslateY(index, count, barHeight, trackHeight);

    this.border.classList.toggle('pinned-message-border-mask', count > 4);

    this.wrapper.className = 'pinned-message-border-wrapper';
    this.wrapper.style.cssText = `clip-path: url(#${clipPathId}); width: 2px; height: ${trackHeight}px; transform: translateY(-${trackTranslateY}px);`;
    
    if(!this.svg) {
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttributeNS(null, 'height', '0');
      this.svg.setAttributeNS(null, 'width', '0');
  
      this.defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      this.defs.append(clipPath);

      this.svg.append(this.defs);

      this.mark = document.createElement('div');
      this.mark.classList.add('pinned-message-border-mark');
    }

    if(!this.svg.parentElement) {
      this.wrapper.append(this.svg, this.mark);
    }

    this.mark.style.cssText = `height: ${markHeight}px; transform: translateY(${markTranslateY}px);`;
    
    this.count = count;
    this.index = index;

    return this.border;
  }
}