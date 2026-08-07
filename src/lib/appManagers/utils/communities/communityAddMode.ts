import {ChatBannedRights} from '@layer';

export type CommunityAddMode = 'all' | 'admins';

export function getCommunityAddMode(
  rights?: ChatBannedRights
): CommunityAddMode {
  return rights?.pFlags.manage_linked_peers ? 'admins' : 'all';
}

export function rightsWithCommunityAddMode(
  mode: CommunityAddMode,
  current?: ChatBannedRights
): ChatBannedRights {
  const pFlags = {...current?.pFlags};
  if(mode === 'admins') {
    pFlags.manage_linked_peers = true;
  } else {
    delete pFlags.manage_linked_peers;
  }

  return {
    ...current,
    _: 'chatBannedRights',
    pFlags,
    until_date: current?.until_date ?? 2147483647
  };
}
