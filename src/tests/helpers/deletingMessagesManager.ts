import {vi} from 'vitest';
import '@helpers/peerIdPolyfill';
import {AppMessagesManager} from '@appManagers/appMessagesManager';

// An AppMessagesManager whose onUpdateDeleteMessages runs with nothing around it: ids are their mids, no message, dialog
// or storage is loaded, and widgets' storage is spied on. `stubs` puts what a case is about in place (the history
// storage, handleDeletedMessages' answer, the event bus).
export function makeDeletingMessagesManager(stubs: Record<string, unknown> = {}) {
  const manager = new AppMessagesManager() as any;
  const appWidgetsManager = {deleteWidgetStorage: vi.fn(), deleteWidgetStorageByLegacyMids: vi.fn()};
  Object.assign(manager, {
    appWidgetsManager,
    appMessagesIdsManager: {generateMessageId: (id: number) => id},
    rootScope: {dispatchEvent: () => {}},
    getMessageByPeer: (): undefined => undefined,
    getHistoryMessagesStorage: () => new Map(),
    getHistoryStorage: () => ({history: new Set(), count: 0}),
    getDialogOnly: (): undefined => undefined,
    clearSearchCountersCache: () => {},
    ...stubs
  });
  return {manager, appWidgetsManager};
}
