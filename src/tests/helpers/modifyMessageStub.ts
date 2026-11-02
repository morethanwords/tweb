import type {AppMessagesManager} from '@appManagers/appMessagesManager';

// * modifyMessage without its storage bookkeeping: the callback changes the message in place, or returns the one to keep
export function stubModifyMessage(manager: AppMessagesManager) {
  return vi.spyOn(manager, 'modifyMessage').mockImplementation((target: any, callback: any) => callback(target) || target);
}
