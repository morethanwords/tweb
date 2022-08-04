import getDeepProperty from './getDeepProperty';

export default function setDeepProperty(object: any, key: string, value: any) {
  const splitted = key.split('.');
  getDeepProperty(object, splitted.slice(0, -1).join('.'))[splitted.pop()] = value;
}
