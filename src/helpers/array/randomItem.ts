import getUnsafeRandomInt from '../number/getUnsafeRandomInt';

export function randomItem<T>(arr: T[]) {
  return arr[getUnsafeRandomInt(0, arr.length - 1)];
}

export function randomItemExcept<T>(arr: T[], except: T) {
  const idx = arr.indexOf(except);
  if(idx === -1) return randomItem(arr);

  let num = getUnsafeRandomInt(0, arr.length - 1);
  if(num === idx) {
    num = idx + (Math.random() < 0.5 ? -1 : 1)
    if(num < 0) num = arr.length - 1;
    else if(num >= arr.length) num = 0;
  }

  return arr[num];
}
