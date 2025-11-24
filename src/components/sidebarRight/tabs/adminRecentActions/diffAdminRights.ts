import {ChatAdminRights} from '../../../../layer';


type AdminFlags = ChatAdminRights.chatAdminRights['pFlags'];

type AdminRightsDiff = {
  granted: (keyof AdminFlags)[];
  revoked: (keyof AdminFlags)[];
};

export function diffAdminRights(
  prev: AdminFlags | undefined,
  next: AdminFlags | undefined
): AdminRightsDiff {
  const prevNorm = (prev ?? {}) as Required<AdminFlags>;
  const nextNorm = (next ?? {}) as Required<AdminFlags>;

  const granted: (keyof AdminFlags)[] = [];
  const revoked: (keyof AdminFlags)[] = [];

  const allKeys = new Set<keyof AdminFlags>([
    ...Object.keys(prevNorm) as (keyof AdminFlags)[],
    ...Object.keys(nextNorm) as (keyof AdminFlags)[]
  ]);

  for(const key of allKeys) {
    const was = prevNorm[key];
    const isNow = nextNorm[key];

    if(!was && isNow) {
      granted.push(key);
    } else if(was && !isNow) {
      revoked.push(key);
    }
  }

  return {granted, revoked};
}
