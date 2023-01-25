import copy from './copy';
import isObject from './isObject';

export default function validateInitObject(
  initObject: any,
  currentObject: any,
  onReplace?: (key: string) => void,
  previousKey?: string,
  ignorePaths?: Set<string>,
  path?: string
) {
  for(const key in initObject) {
    const _path = path ? `${path}.${key}` : key;
    if(ignorePaths?.has(_path)) {
      continue;
    }

    if(typeof(currentObject[key]) !== typeof(initObject[key])) {
      currentObject[key] = copy(initObject[key]);
      onReplace?.(previousKey || key);
    } else if(isObject(initObject[key])) {
      validateInitObject(initObject[key], currentObject[key], onReplace, previousKey || key, ignorePaths, _path);
    }
  }
}
