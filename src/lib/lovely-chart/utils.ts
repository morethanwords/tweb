// https://jsperf.com/finding-maximum-element-in-an-array
export function getMaxMin(array: number[]) {
  const length = array.length;
  let max = array[0];
  let min = array[0];

  for(let i = 0; i < length; i++) {
    const value = array[i];

    if(value > max) {
      max = value;
    } else if(value < min) {
      min = value;
    }
  }

  return {max, min};
}

// https://jsperf.com/multi-array-concat/24
export function mergeArrays(arrays: Array<any>) {
  return [].concat.apply([], arrays);
}

export function sumArrays(arrays: number[][]) {
  const sums = [];
  const n = arrays.length;

  for(let i = 0, l = arrays[0].length; i < l; i++) {
    sums[i] = 0;

    for(let j = 0; j < n; j++) {
      sums[i] += arrays[j][i];
    }
  }

  return sums;
}

export function proxyMerge<T>(obj1: T, obj2: T): T {
  return new Proxy({}, {
    get: (obj, prop) => {
      // @ts-ignore
      if(obj[prop] !== undefined) {
        // @ts-ignore
        return obj[prop];
        // @ts-ignore
      } else if(obj2[prop] !== undefined) {
        // @ts-ignore
        return obj2[prop];
        // @ts-ignore
      } else {
        // @ts-ignore
        return obj1[prop];
      }
    }
  }) as T;
}

export function throttle(
  fn: (...args: any[]) => any,
  ms: number,
  shouldRunFirst = true,
  shouldRunLast?: boolean
) {
  let interval: number = null;
  let isPending: boolean;
  let args: any[];

  return (..._args: any[]) => {
    isPending = true;
    args = _args;

    if(!interval) {
      if(shouldRunFirst) {
        isPending = false;
        // @ts-ignore
        fn(...args);
      }

      interval = window.setInterval(() => {
        if(!isPending) {
          window.clearInterval(interval);
          interval = null;
          return;
        }

        isPending = false;
        // @ts-ignore
        fn(...args);
      }, ms);
    }
  };
}

export function throttleWithRaf(fn: () => any) {
  let waiting = false;
  let args: any[];

  return function(..._args: any[]) {
    args = _args;

    if(!waiting) {
      waiting = true;

      requestAnimationFrame(() => {
        waiting = false;
        // @ts-ignore
        fn(...args);
      });
    }
  };
}

export function debounce(fn: () => void, ms: number, shouldRunFirst = true, shouldRunLast = true) {
  let waitingTimeout: number = null;

  return function() {
    if(waitingTimeout) {
      clearTimeout(waitingTimeout);
      waitingTimeout = null;
    } else if(shouldRunFirst) {
      fn();
    }

    waitingTimeout = window.setTimeout(() => {
      if(shouldRunLast) {
        fn();
      }

      waitingTimeout = null;
    }, ms);
  };
}
