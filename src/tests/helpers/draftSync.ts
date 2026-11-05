import {AppDraftsManager} from '@appManagers/appDraftsManager';
import type {DraftMessage, MessagesSaveDraft} from '@layer';

/**
 * An AppDraftsManager whose saves go to `invokeApi` and nowhere else, with what `syncDraft` asks of the managers around
 * it (`managers` puts a test's own in their place); the draft it keeps is the one it is given, as it is
 */
export function makeDraftSyncManager(managers: Record<string, unknown> = {}) {
  const manager = new AppDraftsManager();
  const invokeApi = vi.fn(async(_method: string, _params: MessagesSaveDraft): Promise<unknown> => true);
  Object.assign(manager, {
    apiManager: {invokeApi},
    appPeersManager: {getInputPeerById: () => ({_: 'inputPeerUser', user_id: 42, access_hash: '1'}), isMonoforum: () => false},
    dialogsStorage: {getDialogOnly: () => ({top_message: 1})},
    drafts: {},
    timeManager: {getServerTimeOffset: () => 0, getServerTime: () => Math.floor(Date.now() / 1000)},
    ...managers
  });
  vi.spyOn(manager, 'saveDraft').mockImplementation(({draft}) => draft as DraftMessage.draftMessage);
  return {manager, invokeApi};
}
