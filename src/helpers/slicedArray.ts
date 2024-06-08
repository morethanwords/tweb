/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MOUNT_CLASS_TO} from '../config/debug';
import indexOfAndSplice from './array/indexOfAndSplice';
import compareValue from './compareValue';

/**
 * Descend sorted storage
 */

type ItemType = number | string;

export enum SliceEnd {
  None = 0,
  Top = 1,
  Bottom = 2,
  Both = SliceEnd.Top | SliceEnd.Bottom
};

export interface Slice<T extends ItemType> extends Array<T> {
  // slicedArray: SlicedArray;
  end: SliceEnd;

  isEnd: (side: SliceEnd) => boolean;
  setEnd: (side: SliceEnd) => void;
  unsetEnd: (side: SliceEnd) => void;
  getEnds: () => {top: boolean, bottom: boolean, both: boolean};

  slice: (from?: number, to?: number) => Slice<T>;
  splice: (start: number, deleteCount: number, ...items: ItemType[]) => Slice<T>;
}

export interface SliceConstructor<T extends ItemType> {
  // new(...items: T[]): Slice<T>;
  new(length: number): Slice<T>;
}

export type SliceSerialized<T extends ItemType> = {
  values: Slice<T>,
  isEnd: {
    top: boolean,
    bottom: boolean,
    both: boolean
  }
};

export type SlicedArraySerialized<T extends ItemType> = {
  slices: SliceSerialized<T>[]
};

export default class SlicedArray<T extends ItemType> {
  public slices: Slice<T>[]/*  = [[7,6,5],[4,3,2],[1,0,-1]] */;
  private sliceConstructor: SliceConstructor<T>;
  public compareValue: (a: T, b: T) => number;

  constructor() {
    // @ts-ignore
    this.sliceConstructor = SlicedArray.getSliceConstructor(this);
    this.compareValue ??= compareValue;

    const first = this.constructSlice();
    // first.setEnd(SliceEnd.Bottom);
    this.slices = [first];
  }

  private static getSliceConstructor(slicedArray: SlicedArray<ItemType>) {
    return class Slice<T> extends Array<ItemType> implements Slice<T> {
      // slicedArray: SlicedArray;
      end: SliceEnd = SliceEnd.None;

      /* constructor(...items: ItemType[]) {
        super(...items);
        //this.slicedArray = slicedArray;
      } */

      isEnd(side: SliceEnd): boolean {
        if((this.end & side) === side) {
          return true;
        }/*  else if(!this.slicedArray) {
          return false;
        } */

        let isEnd = false;
        if(side === SliceEnd.Top) {
          const slice = slicedArray.last;
          isEnd = slice.end & side ? this.includes(slice[slice.length - 1])/*  || !slice.length */ : false;
        } else if(side === SliceEnd.Bottom) {
          const slice = slicedArray.first;
          isEnd = slice.end & side ? this.includes(slice[0])/*  || !slice.length */ : false;
        } else if(side === SliceEnd.Both) {
          return this.isEnd(SliceEnd.Top) && this.isEnd(SliceEnd.Bottom);
        }

        if(isEnd) {
          this.setEnd(side);
        }

        return isEnd;
      }

      getEnds() {
        return {
          top: this.isEnd(SliceEnd.Top),
          bottom: this.isEnd(SliceEnd.Bottom),
          both: this.isEnd(SliceEnd.Both)
        };
      }

      setEnd(side: SliceEnd) {
        this.end |= side;
      }

      unsetEnd(side: SliceEnd) {
        this.end &= ~side;
      }

      splice(start: number, deleteCount: number, ...items: ItemType[]) {
        const ret = super.splice(start, deleteCount, ...items);

        if(!this.length) {
          const slices = slicedArray.slices as ItemType[][];
          const idx = slices.indexOf(this);
          if(idx !== -1) {
            if(slices.length === 1) { // left empty slice without ends
              this.unsetEnd(SliceEnd.Both);
            } else { // delete this slice
              slices.splice(idx, 1);
            }
          }
        }

        return ret;
      }
    }
  }

  public constructSlice(...items: T[]) {
    // const slice = new Slice(this, ...items);
    // can't pass items directly to constructor because first argument is length
    const slice = new this.sliceConstructor(items.length);
    for(let i = 0, length = items.length; i < length; ++i) {
      slice[i] = items[i];
    }
    return slice;

    // ! code below will slow execution in 15 times
    /* const self = this;
    const p: Slice = new Proxy(slice, {
      get: function(target, name: any) {
        if(name === 'constructor') {
          const p = new Proxy(Slice, {
            construct: (target, args) => {
              return self.constructSlice(...args);
            }
          });

          return p;
        }

        return target[name];
      }
    });

    return p; */

    /*
    var p = slicedArray.constructSlice();
    p.length = 100000;
    p.fill(255);

    var a = new Array(100000);
    a.fill(255);

    var b = 0;
    var perf = performance.now();
    for(var i = 0; i < p.length; ++i) {
        b += p[i];
    }

    console.log('perf 1', performance.now() - perf);

    b = 0;
    perf = performance.now();
    for(var i = 0; i < a.length; ++i) {
        b += a[i];
    }

    console.log('perf 2', performance.now() - perf);
    */
  }

  public insertSlice(slice: T[], flatten = true) {
    if(!slice.length) {
      return;
    }

    const first = this.slices[0];
    if(!first.length) {
      first.push(...slice);
      return first;
    }

    const lowerBound = slice[slice.length - 1];
    const upperBound = slice[0];

    let foundSlice: Slice<T>, lowerIndex = -1, upperIndex = -1, foundSliceIndex = 0;
    for(; foundSliceIndex < this.slices.length; ++foundSliceIndex) {
      foundSlice = this.slices[foundSliceIndex];
      lowerIndex = foundSlice.indexOf(lowerBound);
      upperIndex = foundSlice.indexOf(upperBound);

      if(upperIndex !== -1 && -1 !== lowerIndex) {
        break;
      } else if(upperIndex !== -1 || -1 !== lowerIndex) {
        break;
      }
    }

    if(upperIndex !== -1 && -1 !== lowerIndex) {

    } else if(upperIndex !== -1) {  // ([1, 2, 3] | [1, 2, 3, 4, 5]) -> [1, 2, 3, 4, 5]
      const sliced = slice.slice(foundSlice.length - upperIndex);
      foundSlice.push(...sliced);
    } else if(lowerIndex !== -1) {  // ([1, 2, 3] | [-1, 0, 1]) -> [-1, 0, 1, 2, 3]
      const sliced = slice.slice(0, slice.length - lowerIndex - 1);
      foundSlice.unshift(...sliced);
    } else {
      let insertIndex = 0;
      for(const length = this.slices.length; insertIndex < length; ++insertIndex) { // * maybe should iterate from the end, could be faster ?
        const s = this.slices[insertIndex];
        if(this.compareValue(slice[0], s[0]) === 1) {
          break;
        }
      }

      this.slices.splice(insertIndex, 0, this.constructSlice(...slice));
      foundSliceIndex = insertIndex;
    }

    if(flatten) {
      return this.flatten(foundSliceIndex);
    }
  }

  private flatten(foundSliceIndex: number) {
    if(this.slices.length >= 2) {
      for(let i = 0, length = this.slices.length; i < (length - 1); ++i) {
        const prevSlice = this.slices[i];
        const nextSlice = this.slices[i + 1];

        const upperIndex = prevSlice.indexOf(nextSlice[0]);
        if(upperIndex !== -1) {
          prevSlice.setEnd(nextSlice.end);
          this.slices.splice(i + 1, 1);

          if(i < foundSliceIndex) {
            --foundSliceIndex;
          }

          --length; // respect array bounds
          --i;      // repeat from the same place

          this.insertSlice(nextSlice, false);
        }
      }
    }

    return this.slices[foundSliceIndex];
  }

  // *

  get first() {
    return this.slices[0];
  }

  get last() {
    return this.slices[this.slices.length - 1];
  }

  get slice() {
    return this.first;
  }

  get length() {
    return this.slice.length;
  }

  public findSlice(item: T) {
    for(let i = 0, length = this.slices.length; i < length; ++i) {
      const slice = this.slices[i];
      const index = slice.indexOf(item);
      if(index !== -1) {
        return {slice, index};
      }
    }

    return undefined;
  }

  // * offset will be exclusive, so if offsetId is in slice, then offset will be +1
  public findOffsetInSlice(offsetId: T, slice: Slice<T>) {
    for(let offset = 0; offset < slice.length; ++offset) {
      if(this.compareValue(offsetId, slice[offset]) >= 0) {
        /* if(!offset) { // because can't find 3 in [[5,4], [2,1]]
          return undefined;
        } */

        return {
          slice,
          offset: offsetId === slice[offset] ? offset + 1 : offset
        };
      }
    }
  }

  public findSliceOffset(maxId: T): ReturnType<SlicedArray<T>['findOffsetInSlice']> & {sliceIndex: number} {
    let slice: Slice<T>;
    for(let i = 0; i < this.slices.length; ++i) {
      slice = this.slices[i];

      const found = this.findOffsetInSlice(maxId, slice);
      if(found) {
        return {
          ...found,
          sliceIndex: i
        };
      }
    }

    if(slice?.isEnd(SliceEnd.Top)) {
      return {
        slice,
        offset: slice.length,
        sliceIndex: this.slices.length - 1
      };
    }
  }

  // * https://core.telegram.org/api/offsets
  public sliceMe(offsetId: T, addOffset: number, limit: number) {
    let slice = this.slice;
    let offset = 0;
    let sliceOffset = 0;

    if(offsetId) {
      const pos = this.findSliceOffset(offsetId);
      if(!pos) {
        return;
      }

      slice = pos.slice;
      offset = sliceOffset = pos.offset;

      // if(slice.includes(offsetId)) {
      //   sliceOffset += 1;
      // }

      /* if(slice.includes(offsetId) && add_offset < 0) {
        add_offset += 1;
      } */
    } else if(!slice.isEnd(SliceEnd.Bottom)) {
      return;
    }

    const sliceStart = Math.max(sliceOffset + addOffset, 0);
    const sliceEnd = sliceOffset + addOffset + limit;
    // const fixHalfBackLimit = add_offset && !(limit / add_offset % 2) && (sliceEnd % 2) ? 1 : 0;
    // sliceEnd += fixHalfBackLimit;

    const sliced = slice.slice(sliceStart, sliceEnd) as Slice<T>;

    const topWasMeantToLoad = addOffset < 0 ? limit + addOffset : limit;
    const bottomWasMeantToLoad = Math.abs(addOffset);

    // can use 'slice' here to check because if it's end, then 'sliced' is out of 'slice'
    // useful when there is only 1 message in chat on its reopening
    const topFulfilled = (slice.length - sliceOffset) >= topWasMeantToLoad || (slice.isEnd(SliceEnd.Top) ? (sliced.setEnd(SliceEnd.Top), true) : false);
    const bottomFulfilled = (sliceOffset - bottomWasMeantToLoad) >= 0 || (slice.isEnd(SliceEnd.Bottom) ? (sliced.setEnd(SliceEnd.Bottom), true) : false);

    // if(topFulfilled) sliced.isEnd(SliceEnd.Top);
    // if(bottomFulfilled) sliced.isEnd(SliceEnd.Bottom);

    return {
      slice: sliced,
      offsetIdOffset: offset,
      fulfilled: SliceEnd.None | (topFulfilled && bottomFulfilled ? SliceEnd.Both : ((topFulfilled ? SliceEnd.Top : SliceEnd.None) | (bottomFulfilled ? SliceEnd.Bottom : SliceEnd.None)))
    };
  }

  public unshift(...items: T[]) {
    let slice = this.first;
    if(!slice.length) {
      slice.setEnd(SliceEnd.Bottom);
    } else if(!slice.isEnd(SliceEnd.Bottom)) {
      slice = this.constructSlice();
      slice.setEnd(SliceEnd.Bottom);
      this.slices.unshift(slice);
    }

    slice.unshift(...items);
  }

  public push(...items: T[]) {
    let slice = this.last;
    if(!slice.length) {
      slice.setEnd(SliceEnd.Top);
    } else if(!slice.isEnd(SliceEnd.Top)) {
      slice = this.constructSlice();
      slice.setEnd(SliceEnd.Top);
      this.slices.push(slice);
    }

    slice.push(...items);
  }

  public delete(item: T) {
    const found = this.findSlice(item);
    if(found) {
      found.slice.splice(found.index, 1);
      return true;
    }

    return false;
  }

  public deleteSlice(slice: Slice<T>) {
    indexOfAndSplice(this.slices, slice);
  }

  public toJSON() {
    const slices: SlicedArraySerialized<T>['slices'] = this.slices.map((slice) => {
      return {
        values: slice.slice(),
        isEnd: slice.getEnds()
      };
    });

    const serialized: SlicedArraySerialized<T> = {
      slices
    };

    return JSON.stringify(serialized);
  }

  public static fromJSON<T extends ItemType>(json: string) {
    const parsed: SlicedArraySerialized<T> = JSON.parse(json);
    const sliced = new SlicedArray<T>();
    parsed.slices.forEach((slice) => {
      const inserted = sliced.insertSlice(slice.values) || sliced.first;
      if(slice.isEnd.top) inserted.setEnd(SliceEnd.Top);
      if(slice.isEnd.bottom) inserted.setEnd(SliceEnd.Bottom);
    });

    return sliced;
  }
}

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.SlicedArray = SlicedArray);
