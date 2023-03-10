// https://github.com/evgeny-nadymov/telegram-react/blob/master/src/Components/ColumnMiddle/PinnedMessageBorder.js

enum BAR_HEIGHTS {
  ONE = 32,
  TWO = 15,
  THREE = 10,
  FOUR = 8,
  MORE = 8
};

const GAP = 1;
const WIDTH = 2;
const BASE_CLASS = 'pinned-message-border';

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
    /* if(count === 3) {
      d = this.drawRect(0, 0, WIDTH, barHeight, radius)
        + this.drawRect(0, barHeight + GAP, WIDTH, barHeight + 1, radius)
        + this.drawRect(0, barHeight * 2 + GAP * 2 + 1, WIDTH, barHeight, radius);
    } */if(count === 2) {
      d = this.drawRect(0, 0, WIDTH, barHeight, radius) + this.drawRect(0, barHeight + GAP * 2, WIDTH, barHeight, radius);
    } else {
      for(let i = 0; i < count; ++i) {
        d += this.drawRect(0, (barHeight + GAP) * i, WIDTH, barHeight, radius);
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
    let barHeight: number;
    if(count <= 1) {
      barHeight = BAR_HEIGHTS.ONE;
    } else if(count === 2) {
      barHeight = BAR_HEIGHTS.TWO;
    } else if(count === 3) {
      barHeight = BAR_HEIGHTS.THREE;
    } else if(count === 4) {
      barHeight = BAR_HEIGHTS.FOUR;
    } else if(count > 3) {
      barHeight = BAR_HEIGHTS.MORE;
    }

    return barHeight;
  };

  private getMarkHeight = (count: number, index: number) => {
    let markHeight: number;
    if(count <= 1) {
      markHeight = BAR_HEIGHTS.ONE;
    } else if(count === 2) {
      markHeight = BAR_HEIGHTS.TWO;
    } else if(count === 3) {
      markHeight = BAR_HEIGHTS.THREE;
    } else if(count === 4) {
      markHeight = BAR_HEIGHTS.FOUR;
    } else if(count > 3) {
      markHeight = BAR_HEIGHTS.MORE;
    }

    return markHeight;
  };

  private getMarkTranslateY = (index: number, barHeight: number, count: number) => {
    if(count === 1) {
      return 0;
    } else if(count === 2) {
      return !index ? 0 : barHeight + GAP;
    }

    if(count === 3) {
      if(!index) {
        return 0;
      } else if(index === 1) {
        return barHeight + GAP;
      }

      return barHeight * 2 + GAP * 2 + 1;
    } else {
      return (barHeight + GAP) * index;
    }
  };

  private getTrackTranslateY = (index: number, count: number, barHeight: number, trackHeight: number) => {
    if(count <= 4) {
      return 0;
    }

    if(index <= 1) {
      return 0;
    } else if(index >= (count - 2)) {
      return trackHeight - BAR_HEIGHTS.ONE - barHeight;
    }

    // return (index + 1) * barHeight + index * GAP;
    return (index - 2) * barHeight + index * GAP;
    // return (barHeight + GAP * 2) / 2 + (index - 2) * (barHeight + GAP);
  };

  private getTrackHeight = (count: number, barHeight: number) => {
    return count <= 3 ? BAR_HEIGHTS.ONE : barHeight * count + GAP * (count - 1);
  };

  public render(count: number, index: number) {
    if(!this.border) {
      this.border = document.createElement('div');
      this.border.classList.add(BASE_CLASS);

      this.wrapper = document.createElement('div');
      this.border.append(this.wrapper);
    }

    if(count === 1) {
      if(this.count !== count) {
        this.wrapper.className = BASE_CLASS + '-wrapper-1';
        this.border.classList.remove(BASE_CLASS + '-mask');
        this.wrapper.replaceChildren();
        this.wrapper.style.cssText = '';
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

    this.border.classList.toggle(BASE_CLASS + '-mask', count > 4);

    if(index <= 1) {
      this.border.classList.add('mask-bottom');
      this.border.classList.remove('mask-top');
    } else if(index >= (count - 2)) {
      this.border.classList.add('mask-top');
      this.border.classList.remove('mask-bottom');
    } else {
      this.border.classList.add('mask-top', 'mask-bottom');
    }

    this.wrapper.className = BASE_CLASS + '-wrapper';
    this.wrapper.style.cssText = `clip-path: url(#${clipPathId}); width: 2px; height: ${trackHeight}px; transform: translateY(-${trackTranslateY}px);`;

    if(!this.svg) {
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttributeNS(null, 'height', '0');
      this.svg.setAttributeNS(null, 'width', '0');

      this.defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      this.defs.append(clipPath);

      this.svg.append(this.defs);

      this.mark = document.createElement('div');
      this.mark.classList.add(BASE_CLASS + '-mark');
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
