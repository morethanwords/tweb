import type {Update} from '@layer';

type DraftUpdateListener = (update: Update.updateDraftMessage) => void;

/**
 * An apiUpdatesManager for AppDraftsManager: it keeps the updateDraftMessage listener the manager adds, `receive`
 * hands it an update as the server would, and `processUpdateMessage` hands it the draft updates of a container as they
 * are (the same objects, as ApiUpdatesManager does)
 */
export function captureDraftUpdates() {
  let listener: DraftUpdateListener;
  return {
    apiUpdatesManager: {
      addMultipleEventsListeners: (listeners: {updateDraftMessage: DraftUpdateListener}) => {
        listener = listeners.updateDraftMessage;
      },
      processUpdateMessage: vi.fn((message: {updates?: Update[]}) => {
        message?.updates?.forEach((update) => {
          if(update._ === 'updateDraftMessage') listener(update);
        });
      }),
      updatesState: {}
    },
    receive: (update: Omit<Update.updateDraftMessage, '_'>) => listener({_: 'updateDraftMessage', ...update} as Update.updateDraftMessage)
  };
}
