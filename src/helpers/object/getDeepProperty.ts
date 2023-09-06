import {DEEP_PATH_JOINER} from './setDeepProperty';

export default function getDeepProperty(object: any, key: string | Array<string>) {
  const splitted = Array.isArray(key) ? key : key.split(DEEP_PATH_JOINER);
  let o: any = object;
  for(const key of splitted) {
    o = o?.[key];
    if(!o) {
      break;
    }
  }

  return o;
}
