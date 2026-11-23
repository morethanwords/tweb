import {vi} from 'vitest';
import type {User} from '@layer';
import {AppUsersManager} from '@appManagers/appUsersManager';
import MTProtoMessagePort from '@lib/mainWorker/mainMessagePort';

/**
 * A users manager as the contacts see it: its own state, the server behind `invokeApi`, peers kept by a stub
 */
export function makeContactsManager() {
  const manager = new AppUsersManager();
  const invokeApi = vi.fn();
  Object.assign(manager, {
    apiManager: {invokeApi},
    appStateManager: {pushToState: vi.fn()},
    peersStorage: {requestPeer: vi.fn(), releasePeer: vi.fn()},
    rootScope: {myId: (1 as UserId).toPeerId(false)}
  });
  manager.clear(true);

  return {manager, invokeApi};
}

/**
 * A contacts manager that can save users: the worker's message port, its storage and peer retention stubbed, the
 * events it dispatches caught in `dispatchEvent`
 */
export function makeUserSavingManager() {
  vi.spyOn(MTProtoMessagePort, 'getInstance').mockReturnValue({invokeVoid: vi.fn()} as any);
  const dispatchEvent = vi.fn();
  const {manager, invokeApi} = makeContactsManager();
  Object.assign(manager as any, {storage: {set: vi.fn()}});
  Object.assign((manager as any).peersStorage, {isPeerNeeded: () => false});
  Object.assign((manager as any).rootScope, {dispatchEvent});

  return {manager, invokeApi, dispatchEvent};
}

/** A user who is a contact, by their id and first name */
export function makeContactUser(id: UserId, first_name: string): User.user {
  return {
    _: 'user',
    id,
    access_hash: '1',
    first_name,
    phone: '15550001',
    pFlags: {contact: true}
  };
}
