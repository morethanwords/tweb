import {getOwner, runWithOwner} from 'solid-js';

export function withCurrentOwner<Args extends Array<unknown>, Result>(fn: (...args: Args) => Result) {
  const owner = getOwner();
  return (...args: Args) => {
    return runWithOwner(owner, () => fn(...args));
  };
}
