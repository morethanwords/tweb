/*
This file is part of Telegram Desktop,
the official desktop application for the Telegram messaging service.
For license and copyright information please follow this link:
https://github.com/telegramdesktop/tdesktop/blob/master/LEGAL
*/

import accumulate from '../helpers/array/accumulate';
import clamp from '../helpers/number/clamp';

type Size = {w: number, h: number};
export type GroupMediaLayout = {
  geometry: {
    x: number,
    y: number,
    width: number,
    height: number
  },
  sides: number
};
type Attempt = {
  lineCounts: number[],
  heights: number[]
};
export const RectPart = {
  None: 0,
  Top: 1,
  Right: 2,
  Bottom: 4,
  Left: 8
};

// https://github.com/telegramdesktop/tdesktop/blob/4669c07dc5335cbf4795bbbe5b0ab7c007b9aee2/Telegram/SourceFiles/ui/grouped_layout.cpp
export class Layouter {
  private count: number;
  private ratios: number[];
  private proportions: string;
  private averageRatio: number;
  private maxSizeRatio: number;

  constructor(private sizes: Size[], private maxWidth: number, private minWidth: number, private spacing: number, private maxHeight = maxWidth) {
    this.count = sizes.length;
    this.ratios = Layouter.countRatios(sizes);
    this.proportions = Layouter.countProportions(this.ratios);
    this.averageRatio = accumulate(this.ratios, 1) / this.count; // warn
    this.maxSizeRatio = maxWidth / this.maxHeight;
  }

  public layout(): GroupMediaLayout[] {
    if(!this.count) return [];
    else if(this.count === 1) return this.layoutOne();

    if(this.count >= 5 || this.ratios.find((r) => r > 2)) {
      return new ComplexLayouter(this.ratios, this.averageRatio, this.maxWidth, this.minWidth, this.spacing).layout();
    }

    if(this.count === 2) return this.layoutTwo();
    else if(this.count === 3) return this.layoutThree();
    return this.layoutFour();
  }

  private layoutTwo(): ReturnType<Layouter['layout']> {
    if((this.proportions === 'ww') &&
      (this.averageRatio > 1.4 * this.maxSizeRatio) &&
      (this.ratios[1] - this.ratios[0] < 0.2)) {
      return this.layoutTwoTopBottom();
    } else if(this.proportions === 'ww' || this.proportions === 'qq') {
      return this.layoutTwoLeftRightEqual();
    }
    return this.layoutTwoLeftRight();
  }

  private layoutThree(): ReturnType<Layouter['layout']> {
    if(this.proportions[0] === 'n') {
      return this.layoutThreeLeftAndOther();
    }
    return this.layoutThreeTopAndOther();
  }

  private layoutFour(): ReturnType<Layouter['layout']> {
    if(this.proportions[0] === 'w') {
      return this.layoutFourTopAndOther();
    }
    return this.layoutFourLeftAndOther();
  }

  private layoutOne(): ReturnType<Layouter['layout']> {
    const width = this.maxWidth;
    const height = (this.sizes[0].h * width) / this.sizes[0].w;

    return [
      {
        geometry: {x: 0, y: 0, width, height},
        sides: RectPart.Left | RectPart.Top | RectPart.Right | RectPart.Bottom
      }
    ];
  }

  private layoutTwoTopBottom(): ReturnType<Layouter['layout']> {
    const width = this.maxWidth;
    const height = Math.round(Math.min(
      width / this.ratios[0],
      Math.min(
        width / this.ratios[1],
        (this.maxHeight - this.spacing) / 2)));

    return [
      {
        geometry: {x: 0, y: 0, width, height},
        sides: RectPart.Left | RectPart.Top | RectPart.Right
      },
      {
        geometry: {x: 0, y: height + this.spacing, width, height},
        sides: RectPart.Left | RectPart.Bottom | RectPart.Right
      }
    ];
  }

  private layoutTwoLeftRightEqual(): ReturnType<Layouter['layout']> {
    const width = (this.maxWidth - this.spacing) / 2;
    const height = Math.round(Math.min(
      width / this.ratios[0],
      Math.min(width / this.ratios[1], this.maxHeight * 1)));

    return [
      {
        geometry: {x: 0, y: 0, width, height},
        sides: RectPart.Top | RectPart.Left | RectPart.Bottom
      },
      {
        geometry: {x: width + this.spacing, y: 0, width, height},
        sides: RectPart.Top | RectPart.Right | RectPart.Bottom
      }
    ];
  }

  private layoutTwoLeftRight(): ReturnType<Layouter['layout']> {
    const minimalWidth = Math.round(this.minWidth * 1.5);
    const secondWidth = Math.min(
      Math.round(Math.max(
        0.4 * (this.maxWidth - this.spacing),
        (this.maxWidth - this.spacing) / this.ratios[0] /
          (1 / this.ratios[0] + 1 / this.ratios[1]))),
      this.maxWidth - this.spacing - minimalWidth);
    const firstWidth = this.maxWidth -
      secondWidth -
      this.spacing;
    const height = Math.min(
      this.maxHeight,
      Math.round(Math.min(
        firstWidth / this.ratios[0],
        secondWidth / this.ratios[1])));

    return [
      {
        geometry: {x: 0, y: 0, width: firstWidth, height},
        sides: RectPart.Top | RectPart.Left | RectPart.Bottom
      },
      {
        geometry: {x: firstWidth + this.spacing, y: 0, width: secondWidth, height},
        sides: RectPart.Top | RectPart.Right | RectPart.Bottom
      }
    ];
  }

  private layoutThreeLeftAndOther(): ReturnType<Layouter['layout']> {
    const firstHeight = this.maxHeight;
    const thirdHeight = Math.round(Math.min(
      (this.maxHeight - this.spacing) / 2.,
      (this.ratios[1] * (this.maxWidth - this.spacing) /
        (this.ratios[2] + this.ratios[1]))));
    const secondHeight = firstHeight -
      thirdHeight -
      this.spacing;
    const rightWidth = Math.max(
      this.minWidth,
      Math.round(Math.min(
        (this.maxWidth - this.spacing) / 2.,
        Math.min(
          thirdHeight * this.ratios[2],
          secondHeight * this.ratios[1]))));
    const leftWidth = Math.min(
      Math.round(firstHeight * this.ratios[0]),
      this.maxWidth - this.spacing - rightWidth);

    return [
      {
        geometry: {x: 0, y: 0, width: leftWidth, height: firstHeight},
        sides: RectPart.Top | RectPart.Left | RectPart.Bottom
      },
      {
        geometry: {x: leftWidth + this.spacing, y: 0, width: rightWidth, height: secondHeight},
        sides: RectPart.Top | RectPart.Right
      },
      {
        geometry: {x: leftWidth + this.spacing, y: secondHeight + this.spacing, width: rightWidth, height: thirdHeight},
        sides: RectPart.Bottom | RectPart.Right
      }
    ];
  }

  private layoutThreeTopAndOther(): ReturnType<Layouter['layout']> {
    const firstWidth = this.maxWidth;
    const firstHeight = Math.round(Math.min(
      firstWidth / this.ratios[0],
      (this.maxHeight - this.spacing) * 0.66));
    const secondWidth = (this.maxWidth - this.spacing) / 2;
    const secondHeight = Math.min(
      this.maxHeight - firstHeight - this.spacing,
      Math.round(Math.min(
        secondWidth / this.ratios[1],
        secondWidth / this.ratios[2])));
    const thirdWidth = firstWidth - secondWidth - this.spacing;

    return [
      {
        geometry: {x: 0, y: 0, width: firstWidth, height: firstHeight},
        sides: RectPart.Left | RectPart.Top | RectPart.Right
      },
      {
        geometry: {x: 0, y: firstHeight + this.spacing, width: secondWidth, height: secondHeight},
        sides: RectPart.Bottom | RectPart.Left
      },
      {
        geometry: {x: secondWidth + this.spacing, y: firstHeight + this.spacing, width: thirdWidth, height: secondHeight},
        sides: RectPart.Bottom | RectPart.Right
      }
    ];
  }

  private layoutFourTopAndOther(): ReturnType<Layouter['layout']> {
    const w = this.maxWidth;
    const h0 = Math.round(Math.min(
      w / this.ratios[0],
      (this.maxHeight - this.spacing) * 0.66));
    const h = Math.round(
      (this.maxWidth - 2 * this.spacing) /
        (this.ratios[1] + this.ratios[2] + this.ratios[3]));
    const w0 = Math.max(
      this.minWidth,
      Math.round(Math.min(
        (this.maxWidth - 2 * this.spacing) * 0.4,
        h * this.ratios[1])));
    const w2 = Math.round(Math.max(
      Math.max(
        this.minWidth * 1.,
        (this.maxWidth - 2 * this.spacing) * 0.33),
      h * this.ratios[3]));
    const w1 = w - w0 - w2 - 2 * this.spacing;
    const h1 = Math.min(
      this.maxHeight - h0 - this.spacing,
      h);

    return [
      {
        geometry: {x: 0, y: 0, width: w, height: h0},
        sides: RectPart.Left | RectPart.Top | RectPart.Right
      },
      {
        geometry: {x: 0, y: h0 + this.spacing, width: w0, height: h1},
        sides: RectPart.Bottom | RectPart.Left
      },
      {
        geometry: {x: w0 + this.spacing, y: h0 + this.spacing, width: w1, height: h1},
        sides: RectPart.Bottom
      },
      {
        geometry: {x: w0 + this.spacing + w1 + this.spacing, y: h0 + this.spacing, width: w2, height: h1},
        sides: RectPart.Right | RectPart.Bottom
      }
    ];
  }

  private layoutFourLeftAndOther(): ReturnType<Layouter['layout']> {
    const h = this.maxHeight;
    const w0 = Math.round(Math.min(
      h * this.ratios[0],
      (this.maxWidth - this.spacing) * 0.6));

    const w = Math.round(
      (this.maxHeight - 2 * this.spacing) /
        (1. / this.ratios[1] + 1. / this.ratios[2] + 1. / this.ratios[3])
    );
    const h0 = Math.round(w / this.ratios[1]);
    const h1 = Math.round(w / this.ratios[2]);
    const h2 = h - h0 - h1 - 2 * this.spacing;
    const w1 = Math.max(
      this.minWidth,
      Math.min(this.maxWidth - w0 - this.spacing, w));

    return [
      {
        geometry: {x: 0, y: 0, width: w0, height: h},
        sides: RectPart.Top | RectPart.Left | RectPart.Bottom
      },
      {
        geometry: {x: w0 + this.spacing, y: 0, width: w1, height: h0},
        sides: RectPart.Top | RectPart.Right
      },
      {
        geometry: {x: w0 + this.spacing, y: h0 + this.spacing, width: w1, height: h1},
        sides: RectPart.Right
      },
      {
        geometry: {x: w0 + this.spacing, y: h0 + h1 + 2 * this.spacing, width: w1, height: h2},
        sides: RectPart.Bottom | RectPart.Right
      }
    ];
  }

  private static countRatios(sizes: Size[]) {
    return sizes.map((size) => size.w / size.h);
  }

  private static countProportions(ratios: number[]) {
    return ratios.map((ratio) => (ratio > 1.2) ? 'w' : (ratio < 0.8) ? 'n' : 'q').join('');
  }
}

class ComplexLayouter {
  private ratios: number[];
  private count: number;

  constructor(ratios: number[], private averageRatio: number, private maxWidth: number, private minWidth: number, private spacing: number, private maxHeight = maxWidth * 4 / 3) {
    this.ratios = ComplexLayouter.cropRatios(ratios, averageRatio);
    this.count = ratios.length;
  }

  private static cropRatios(ratios: number[], averageRatio: number) {
    const kMaxRatio = 2.75;
    const kMinRatio = 0.6667;
    return ratios.map((ratio) => {
      return averageRatio > 1.1 ?
        clamp(ratio, 1., kMaxRatio) :
        clamp(ratio, kMinRatio, 1.);
    });
  }

  public layout(): GroupMediaLayout[] {
    const result = new Array<GroupMediaLayout>(this.count);

    const attempts: Attempt[] = [];
    const multiHeight = (offset: number, count: number) => {
      const ratios = this.ratios.slice(offset, offset + count); // warn
      const sum = accumulate(ratios, 0);
      return (this.maxWidth - (count - 1) * this.spacing) / sum;
    };
    const pushAttempt = (lineCounts: number[]) => {
      const heights: number[] = [];
      let offset = 0;
      for(const count of lineCounts) {
        heights.push(multiHeight(offset, count));
        offset += count;
      }
      attempts.push({lineCounts, heights}); // warn
    };

    for(let first = 1; first !== this.count; ++first) {
      const second = this.count - first;
      if(first > 3 || second > 3) {
        continue;
      }
      pushAttempt([first, second]);
    }
    for(let first = 1; first !== this.count - 1; ++first) {
      for(let second = 1; second !== this.count - first; ++second) {
        const third = this.count - first - second;
        if((first > 3) ||
          (second > ((this.averageRatio < 0.85) ? 4 : 3)) ||
          (third > 3)) {
          continue;
        }
        pushAttempt([first, second, third]);
      }
    }
    for(let first = 1; first !== this.count - 1; ++first) {
      for(let second = 1; second !== this.count - first; ++second) {
        for(let third = 1; third !== this.count - first - second; ++third) {
          const fourth = this.count - first - second - third;
          if(first > 3 || second > 3 || third > 3 || fourth > 3) {
            continue;
          }
          pushAttempt([first, second, third, fourth]);
        }
      }
    }

    let optimalAttempt: Attempt = null;
    let optimalDiff = 0;
    for(const attempt of attempts) {
      const {heights, lineCounts: counts} = attempt;
      const lineCount = counts.length;
      const totalHeight = accumulate(heights, 0) +
        this.spacing * (lineCount - 1);
      const minLineHeight = Math.min(...heights);
      const maxLineHeight = Math.max(...heights);
      const bad1 = (minLineHeight < this.minWidth) ? 1.5 : 1;
      const bad2 = (() => {
        for(let line = 1; line !== lineCount; ++line) {
          if(counts[line - 1] > counts[line]) {
            return 1.5;
          }
        }
        return 1.;
      })();
      const diff = Math.abs(totalHeight - this.maxHeight) * bad1 * bad2;
      if(!optimalAttempt || diff < optimalDiff) {
        optimalAttempt = attempt;
        optimalDiff = diff;
      }
    }

    const optimalCounts = optimalAttempt.lineCounts;
    const optimalHeights = optimalAttempt.heights;
    const rowCount = optimalCounts.length;

    let index = 0;
    let y = 0;
    for(let row = 0; row !== rowCount; ++row) {
      const colCount = optimalCounts[row];
      const lineHeight = optimalHeights[row];
      const height = Math.round(lineHeight);

      let x = 0;
      for(let col = 0; col !== colCount; ++col) {
        const sides = RectPart.None |
          (row === 0 ? RectPart.Top : RectPart.None) |
          (row === rowCount - 1 ? RectPart.Bottom : RectPart.None) |
          (col === 0 ? RectPart.Left : RectPart.None) |
          (col === colCount - 1 ? RectPart.Right : RectPart.None);

        const ratio = this.ratios[index];
        const width = (col === colCount - 1) ?
          (this.maxWidth - x) :
          Math.round(ratio * lineHeight);
        result[index] = {
          geometry: {x, y, width, height},
          sides
        };

        x += width + this.spacing;
        ++index;
      }
      y += height + this.spacing;
    }

    return result;
  }
}
