export type ObjectURLPinUpdate = {url: string, active: boolean};

export type ObjectURLCacheValue = {
  downloaded?: number,
  url: string
};

export type SharedObjectURLUpdate = {
  owner: string,
  previousUrl?: string,
  url?: string
};

export function reconcileObjectURLCacheValue<T extends ObjectURLCacheValue>(
  current: T,
  next?: T
) {
  if(next) {
    Object.assign(current, next);
  } else {
    current.url = '';
    if('downloaded' in current) {
      current.downloaded = 0;
    }
  }

  return current;
}

export function isObjectURL(url: string) {
  return url?.startsWith('blob:');
}

export function makeObjectUrlOwner(namespace: string, ...parts: unknown[]) {
  return `${namespace}:${JSON.stringify(parts)}`;
}

export function parseObjectUrlOwner(owner: string) {
  const separatorIndex = owner.indexOf(':');
  if(separatorIndex === -1) {
    return;
  }

  try {
    return {
      namespace: owner.slice(0, separatorIndex),
      parts: JSON.parse(owner.slice(separatorIndex + 1)) as unknown[]
    };
  } catch{
    return;
  }
}
