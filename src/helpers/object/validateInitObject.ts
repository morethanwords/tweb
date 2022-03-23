import copy from "./copy";
import isObject from "./isObject";

export default function validateInitObject(initObject: any, currentObject: any, onReplace?: (key: string) => void, previousKey?: string) {
  for(const key in initObject) {
    if(typeof(currentObject[key]) !== typeof(initObject[key])) {
      currentObject[key] = copy(initObject[key]);
      onReplace && onReplace(previousKey || key);
    } else if(isObject(initObject[key])) {
      validateInitObject(initObject[key], currentObject[key], onReplace, previousKey || key);
    }
  }
}
