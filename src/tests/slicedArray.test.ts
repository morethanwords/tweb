import SlicedArray, {Slice, SliceEnd} from '../helpers/slicedArray';

test('Slicing returns new Slice', () => {
  const sliced = new SlicedArray();
  const newSlice = sliced.slice.slice();
  expect(newSlice.isEnd).toBeDefined();
});

describe('Inserting', () => {
  const sliced = new SlicedArray<typeof arr[0]>();

  // @ts-ignore
  const slices = sliced.slices;

  const toSomething = (v: number) => {
    return '' + v;
  };

  const arr = [100, 99, 98, 97, 96, 95].map(toSomething);
  const distantArr = arr.slice(-2).map((v) => toSomething(+v - 2));
  const missingArr = [arr[arr.length - 1], toSomething(+arr[arr.length - 1] - 1), distantArr[1]];

  const startValue = toSomething(90);
  const values: typeof arr = [];
  const valuesPerArray = 3;
  const totalArrays = 10;
  for(let i = 0, length = valuesPerArray * totalArrays; i < length; ++i) {
    values.push(toSomething(+startValue - i));
  }
  const arrays: (typeof values)[] = [];
  for(let i = 0; i < totalArrays; ++i) {
    arrays.push(values.slice(valuesPerArray * i, valuesPerArray * (i + 1)));
  }

  test('Insert & flatten', () => {
    const idx = 2;

    sliced.insertSlice(arr.slice(0, idx + 1));
    sliced.insertSlice(arr.slice(idx));

    expect([...sliced.first]).toEqual(arr);
  });

  test('Insert inner values', () => {
    sliced.insertSlice(arr.slice(1, -1));

    expect([...sliced.first]).toEqual(arr);
  });

  test('Insert distant slice', () => {
    const length = slices.length;
    sliced.insertSlice(distantArr);

    expect(slices.length).toEqual(length + 1);
  });

  test('Insert intersection & join them', () => {
    const length = slices.length;
    sliced.insertSlice(missingArr);

    expect(slices.length).toEqual(length - 1);
  });

  let returnedSlice: Slice<typeof arr[0]>;
  test('Insert arrays with gap & join them', () => {
    slices[0].length = 0;

    for(const arr of arrays) {
      sliced.insertSlice(arr);
    }

    expect(slices.length).toEqual(totalArrays);

    returnedSlice = sliced.insertSlice(values.slice(0, -valuesPerArray + 1));

    expect(slices.length).toEqual(1);
  });

  test('Insert slice to a single-value slice', () => {
    const sliced = new SlicedArray<number>();
    // @ts-ignore
    const slices = sliced.slices;
    sliced.insertSlice([3, 2]);
    sliced.delete(3);
    sliced.insertSlice([4, 2]);
    expect([...slices[0]]).toEqual([4, 2]);
  });

  test('Return inserted & flattened slice', () => {
    expect(slices[0]).toEqual(returnedSlice);
  });
});

describe('Slicing', () => {
  const sliced = new SlicedArray();

  // @ts-ignore
  const slices = sliced.slices;

  const VALUES_LENGTH = 100;
  const INCREMENTOR = 0xFFFF;
  const values: number[] = [];
  for(let i = 0; i < VALUES_LENGTH; ++i) {
    values[i] = i + INCREMENTOR * i;
  }
  values.sort((a, b) => b - a);
  const slice = sliced.insertSlice(values);
  slice.setEnd(SliceEnd.Bottom);

  const addOffset = 40;
  const limit = 40;

  const r = (func: (idx: number) => void) => {
    const max = VALUES_LENGTH * 3;
    for(let i = 0; i < max; ++i) {
      const idx = Math.random() * max | 0;
      func(idx);
    }
  };

  describe('Positive addOffset', () => {
    test('From the start', () => {
      const {slice} = sliced.sliceMe(0, addOffset, limit);
      expect([...slice]).toEqual(values.slice(addOffset, addOffset + limit));
    });

    test('From existing offsetId', () => {
      r((idx) => {
        const value = values[idx] || 1;
        idx += 1; // because is it inclusive
        const {slice} = sliced.sliceMe(value, addOffset, limit);
        expect([...slice]).toEqual(values.slice(idx + addOffset, idx + addOffset + limit));
      });
    });
  });

  test('Add bottom end slice and slice from it', () => {
    const value = (VALUES_LENGTH + 1) * INCREMENTOR;
    const slice = sliced.insertSlice([value]);
    slice.setEnd(SliceEnd.Bottom);

    const result = sliced.sliceMe(value, 0, limit);

    expect([...result.slice]).toEqual([]);
  });
});

describe('offsetIdOffset', () => {
  const sliced = new SlicedArray<number>();
  const values = [5, 4, 3, 2, 1];
  const slice = sliced.insertSlice(values);
  slice.setEnd(SliceEnd.Both);

  describe('No addOffset', () => {
    test('Hit', () => {
      const result = sliced.sliceMe(slice[1], 0, 2);
      expect(result.offsetIdOffset).toEqual(2);
      expect([...result.slice]).toEqual(values.slice(2, 2 + 2));
    });

    test('Hit start', () => {
      const result = sliced.sliceMe(slice[0], 0, 2);
      expect(result.offsetIdOffset).toEqual(1);
      expect([...result.slice]).toEqual(values.slice(1, 1 + 2));
    });

    test('Hit end', () => {
      const result = sliced.sliceMe(slice[sliced.length - 1], 0, 2);
      expect(result.offsetIdOffset).toEqual(slice.length);
      expect([...result.slice]).toEqual(values.slice(slice.length, slice.length + 2));
    });

    test('No hit', () => {
      const result = sliced.sliceMe(slice[1] + 0.1, 0, 2);
      expect(result.offsetIdOffset).toEqual(1);
      expect([...result.slice]).toEqual(values.slice(1, 1 + 2));
    });

    test('No hit start', () => {
      const result = sliced.sliceMe(slice[0] + 0.1, 0, 2);
      expect(result.offsetIdOffset).toEqual(0);
      expect([...result.slice]).toEqual(values.slice(0, 0 + 2));
    });

    test('No hit end', () => {
      const result = sliced.sliceMe(slice[sliced.length - 1] - 0.1, 0, 2);
      expect(result.offsetIdOffset).toEqual(slice.length);
      expect([...result.slice]).toEqual(values.slice(slice.length, slice.length + 2));
    });
  });

  describe('Positive addOffset', () => {
    test('Hit', () => {
      const result = sliced.sliceMe(slice[1], 1, 2);
      expect(result.offsetIdOffset).toEqual(2);
      expect([...result.slice]).toEqual(values.slice(3, 3 + 2));
    });

    test('No hit', () => {
      const result = sliced.sliceMe(slice[1] + 0.1, 1, 2);
      expect(result.offsetIdOffset).toEqual(1);
      expect([...result.slice]).toEqual(values.slice(2, 2 + 2));
    });
  });

  describe('Negative addOffset', () => {
    test('Hit', () => {
      const result = sliced.sliceMe(slice[1], -1, 2);
      expect(result.offsetIdOffset).toEqual(2);
      expect([...result.slice]).toEqual(values.slice(1, 1 + 2));
    });

    test('Hit start', () => {
      const result = sliced.sliceMe(slice[0], -1, 2);
      expect(result.offsetIdOffset).toEqual(1);
      expect([...result.slice]).toEqual(values.slice(0, 0 + 2));
    });

    test('No hit', () => {
      const result = sliced.sliceMe(slice[1] + 0.1, -1, 2);
      expect(result.offsetIdOffset).toEqual(1);
      expect([...result.slice]).toEqual(values.slice(0, 0 + 2));
    });

    test('No hit start', () => {
      const result = sliced.sliceMe(slice[0] + 0.1, -1, 2);
      expect(result.offsetIdOffset).toEqual(0);
      expect([...result.slice]).toEqual(values.slice(0, 0 + 1));
    });
  });
});
