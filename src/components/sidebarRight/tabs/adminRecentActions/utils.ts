import {Message} from '../../../../layer';

export const getPhoto = (message: Message) => {
  if(message?._ !== 'message' || message?.media?._ !== 'messageMediaPhoto' || message?.media?.photo?._ !== 'photo') return;
  return message.media.photo;
};

export function diffFlags<T extends Record<string, true>>(
  prev: T | undefined,
  next: T | undefined
) {
  const prevNorm = (prev ?? {}) as Required<T>;
  const nextNorm = (next ?? {}) as Required<T>;

  const newFlags: (keyof T)[] = [];
  const oldFlags: (keyof T)[] = [];

  const allKeys = new Set<keyof T>([
    ...Object.keys(prevNorm) as (keyof T)[],
    ...Object.keys(nextNorm) as (keyof T)[]
  ]);

  for(const key of allKeys) {
    const was = prevNorm[key];
    const isNow = nextNorm[key];

    if(!was && isNow) {
      newFlags.push(key);
    } else if(was && !isNow) {
      oldFlags.push(key);
    }
  }

  return {new: newFlags, old: oldFlags};
}
