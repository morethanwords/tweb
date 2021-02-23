/**
 * Descend sorted storage
 */

type ItemType = number;

export class Slice extends Array<ItemType> {
  constructor(protected slicedArray: SlicedArray, items: ItemType[] = []) {
    super(...items);

    
  }
}

// TODO: Clear empty arrays after deleting items
export default class SlicedArray {
  private slices: Slice[]/*  = [[7,6,5],[4,3,2],[1,0,-1]] */;

  constructor() {
    this.slices = [new Slice(this)];
  }

  public insertSlice(slice: ItemType[]) {
    if(!this.slices[0].length) {
      this.slices[0].push(...slice);
      return;
    }

    const lowerBound = slice[slice.length - 1];
    const upperBound = slice[0];

    let foundSlice: Slice, lowerIndex = -1, upperIndex = -1;
    for(let i = 0; i < this.slices.length; ++i) {
      foundSlice = this.slices[i];
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
        if(slice[0] > s[0]) {
          break;
        }
      }

      this.slices.splice(insertIndex, 0, new Slice(this, slice));
    }

    this.flatten();
  }

  private flatten() {
    if(this.slices.length < 2) {
      return;
    }

    for(let i = 0, length = this.slices.length; i < (length - 1); ++i) {
      const prevSlice = this.slices[i];
      const nextSlice = this.slices[i + 1];

      const upperIndex = prevSlice.indexOf(nextSlice[0]);
      if(upperIndex !== -1) {
        this.slices.splice(i + 1, 1);
        length--;

        this.insertSlice(nextSlice);
      }
    }
  }

  // * 

  get slice() {
    return this.slices[0];
  }

  get length() {
    return this.slice.length;
  }

  public findSlice(item: ItemType) {
    for(let i = 0; i < this.slices.length; ++i) {
      const slice = this.slices[i];
      const index = slice.indexOf(item);
      if(index !== -1) {
        return {slice, index};
      }
    }
    
    return undefined;
  }

  public findSliceOffset(maxId: number) {
    for(let i = 0; i < this.slices.length; ++i) {
      let offset = 0;
      const slice = this.slices[i];
      for(; offset < slice.length; offset++) {
        if(maxId > slice[offset]) {
          if(!offset) { // because can't find 3 in [[5,4], [2,1]]
            return undefined;
          }

          return {slice, offset: offset - 1};
        }
      }
    }

    return undefined;
  }

  // * https://core.telegram.org/api/offsets
  public sliceMe(offsetId: number, add_offset: number, limit: number) {
    let slice = this.slice;
    let offset = 0;

    if(offsetId) {
      const pos = this.findSliceOffset(offsetId);
      if(!pos) {
        return undefined;
      }

      slice = pos.slice;
      offset = pos.offset;

      if(slice.includes(offsetId) && add_offset < 0) {
        add_offset += 1;
      }
    }

    let sliceEnd = offset + add_offset + limit;
    //const fixHalfBackLimit = add_offset && !(limit / add_offset % 2) && (sliceEnd % 2) ? 1 : 0;
    //sliceEnd += fixHalfBackLimit;

    return {
      slice: slice.slice(Math.max(offset + add_offset, 0), sliceEnd), 
      offsetIdOffset: offset
    };
  }

  public unshift(item: ItemType) {
    this.slice.unshift(item);
  }

  /* public push(item: ItemType) {
    this.slice.push(item);
  } */

  public delete(item: ItemType) {
    const found = this.findSlice(item);
    if(found) {
      found.slice.splice(found.index, 1);
    }
  }
}

(window as any).slicedArray = new SlicedArray();
