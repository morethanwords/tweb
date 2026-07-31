import getDeepProperty from '@helpers/object/getDeepProperty';
import setDeepProperty, {splitDeepPath} from '@helpers/object/setDeepProperty';
import {
  reconcileObjectURLCacheValue,
  type ObjectURLCacheValue
} from '@helpers/objectUrlUtils';
import {forgetLoadedURL} from '@helpers/dom/loadedUrlCache';

function reconcileMirrorValue<T extends ObjectURLCacheValue>(current: T, next?: T) {
  const previousUrl = current.url;
  reconcileObjectURLCacheValue(current, next);
  if(previousUrl && previousUrl !== current.url) {
    forgetLoadedURL(previousUrl);
  }

  return current;
}

export function deleteObjectURLMirrorValue(mirror: object, key: string) {
  const path = splitDeepPath(key);
  const parents: Array<{key: string, value: Record<string, any>}> = [];
  let value = mirror as Record<string, any>;

  for(let i = 0; i < path.length - 1; ++i) {
    const part = path[i];
    const next = value[part];
    if(!next) {
      return;
    }

    parents.push({key: part, value});
    value = next;
  }

  delete value[path[path.length - 1]];
  if(Object.keys(value).length) {
    return;
  }

  for(let i = parents.length - 1; i >= 0; --i) {
    const parent = parents[i];
    delete parent.value[parent.key];
    if(Object.keys(parent.value).length) {
      break;
    }
  }
}

export default function reconcileObjectURLMirrorValue<T extends ObjectURLCacheValue>(
  mirror: object,
  key: string,
  value?: T
) {
  const current = getDeepProperty(mirror, key) as T | undefined;
  const reconciled = current ?
    reconcileMirrorValue(current, value) :
    value;
  if(value) {
    setDeepProperty(mirror, key, reconciled);
  } else if(current) {
    deleteObjectURLMirrorValue(mirror, key);
  }
  return reconciled;
}

export function reconcileObjectURLMirrorSnapshot(
  current: Record<string, any>,
  next: Record<string, any> = {},
  depth: number
) {
  for(const key in current) {
    const currentValue = current[key];
    const nextValue = next[key];
    if(depth > 1) {
      reconcileObjectURLMirrorSnapshot(currentValue, nextValue, depth - 1);
      if(!nextValue) {
        delete current[key];
      }
    } else if(nextValue) {
      reconcileMirrorValue(currentValue, nextValue);
    } else {
      reconcileMirrorValue(currentValue);
      delete current[key];
    }
  }

  for(const key in next) {
    current[key] ??= next[key];
  }

  return current;
}
