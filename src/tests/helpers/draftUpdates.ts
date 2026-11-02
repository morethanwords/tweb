import type {Update} from '@layer';

type DraftUpdateListener = (update: Update.updateDraftMessage) => void;

/**
 * An apiUpdatesManager for AppDraftsManager: it keeps the updateDraftMessage listener the manager adds, and
 * `receive` hands it an update as the server would.
 */
export function captureDraftUpdates() {
  let listener: DraftUpdateListener;
  return {
    apiUpdatesManager: {
      addMultipleEventsListeners: (listeners: {updateDraftMessage: DraftUpdateListener}) => {
        listener = listeners.updateDraftMessage;
      },
      processUpdateMessage: vi.fn(),
      updatesState: {}
    },
    receive: (update: Omit<Update.updateDraftMessage, '_'>) => listener({_: 'updateDraftMessage', ...update} as Update.updateDraftMessage)
  };
}
