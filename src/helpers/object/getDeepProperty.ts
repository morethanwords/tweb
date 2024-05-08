import {splitDeepPath} from './setDeepProperty';

export default function getDeepProperty(object: any, key: string | Array<string>) {
  const splitted = Array.isArray(key) ? key : splitDeepPath(key);
  let o: any = object;
  for(const key of splitted) {
    o = o?.[key];
    if(!o) {
      break;
    }
  }

  return o;
}
