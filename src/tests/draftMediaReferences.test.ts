import '@helpers/peerIdPolyfill';
import {AppDraftsManager} from '@appManagers/appDraftsManager';
import {AppDocsManager} from '@appManagers/appDocsManager';
import {AppPhotosManager} from '@appManagers/appPhotosManager';
import {ReferencesStorage} from '@lib/storages/references';
import type {Document, DraftMessage, Photo, RichMessage, Update, Updates} from '@layer';

// A draft lives long, and comes back from storage after a reload: the file references of its media
// expire, and a file that cannot be downloaded can be neither played, nor shown, nor saved. They are
// renewed from the drafts, the way a message's are from the message.

const PEER_ID = (42 as UserId).toPeerId(false);
const MEDIA_ID = '7001';
const CAPTION = {_: 'pageCaption', text: {_: 'textEmpty'}, credit: {_: 'textEmpty'}} as const;

const document = (reference: number[], mimeType: string, attributes: Document.document['attributes']): Document.document => ({
  _: 'document', pFlags: {}, id: MEDIA_ID, access_hash: '1', file_reference: reference, date: 0, dc_id: 2,
  size: 1000, mime_type: mimeType as MTMimeType, attributes
});

// what a rich message holds of each kind: its media and the block that shows it
const MEDIA = {
  audio: (reference: number[]): Pick<RichMessage, 'documents' | 'photos' | 'blocks'> => ({
    documents: [document(reference, 'audio/mpeg', [{_: 'documentAttributeAudio', pFlags: {}, duration: 3}])],
    photos: [],
    blocks: [{_: 'pageBlockAudio', audio_id: MEDIA_ID, caption: CAPTION}]
  }),
  file: (reference: number[]): Pick<RichMessage, 'documents' | 'photos' | 'blocks'> => ({
    documents: [document(reference, 'application/pdf', [{_: 'documentAttributeFilename', file_name: 'report.pdf'}])],
    photos: [],
    blocks: [{_: 'pageBlockDocument', document_id: MEDIA_ID, caption: CAPTION}]
  }),
  photo: (reference: number[]): Pick<RichMessage, 'documents' | 'photos' | 'blocks'> => ({
    documents: [],
    photos: [{
      _: 'photo', pFlags: {}, id: MEDIA_ID, access_hash: '1', file_reference: reference, date: 0, dc_id: 2,
      sizes: [{_: 'photoSize', type: 'x', w: 800, h: 600, size: 1000}]
    } as Photo.photo],
    blocks: [{_: 'pageBlockPhoto', pFlags: {}, photo_id: MEDIA_ID, caption: CAPTION}]
  })
};
type Kind = keyof typeof MEDIA;

const richDraft = (kind: Kind, reference: number[]): DraftMessage.draftMessage => ({
  _: 'draftMessage', pFlags: {}, date: 0, message: '',
  rich_message: {_: 'richMessage', pFlags: {}, ...MEDIA[kind](reference)}
});

const draftUpdate = (draft: DraftMessage): Update.updateDraftMessage => ({
  _: 'updateDraftMessage',
  peer: {_: 'peerUser', user_id: 42},
  draft
});

async function setup(kind: Kind, source: 'received' | 'restored') {
  const references = new ReferencesStorage();
  const docs = new AppDocsManager();
  const photos = new AppPhotosManager();
  const drafts = new AppDraftsManager();
  const log: any = Object.assign(vi.fn(), {error: vi.fn(), warn: vi.fn(), debug: vi.fn()});
  log.bindPrefix = () => log;
  const dispatchEvent = vi.fn();
  // what the server holds now: the same draft, its media with a fresh reference
  const allDrafts: Updates.updates = {
    _: 'updates', updates: [draftUpdate(richDraft(kind, [4, 5, 6]))], users: [], chats: [], date: 0, seq: 0
  };
  const invokeApiSingleProcess = vi.fn(async({processResult}: {processResult: (updates: Updates) => unknown}) => (
    processResult(allDrafts)
  ));
  let onUpdateDraftMessage: (update: Update.updateDraftMessage) => void;

  Object.assign(references, {log, appDraftsManager: drafts, apiFileManager: {cancelDownloadByReference: vi.fn()}});
  // the stores saveDoc and savePhoto keep, without the rest of what the managers set up in a worker
  Object.assign(docs, {
    docs: {},
    altDocsByMainMediaDocument: {},
    referencesStorage: references,
    thumbsStorage: {getCacheContext: () => ({}), setCacheContextURL: vi.fn()}
  });
  Object.assign(photos, {photos: {}, referencesStorage: references});
  Object.assign(drafts, {
    apiManager: {invokeApiSingleProcess},
    apiUpdatesManager: {
      addMultipleEventsListeners: (listeners: {updateDraftMessage: typeof onUpdateDraftMessage}) => {
        onUpdateDraftMessage = listeners.updateDraftMessage;
      }
    },
    appDocsManager: docs,
    appPhotosManager: photos,
    appPeersManager: {getPeerId: () => PEER_ID, saveApiPeers: vi.fn(), isChannel: () => false},
    appStateManager: {storage: {
      get: async() => source === 'restored' ? {['' + PEER_ID]: richDraft(kind, [1, 2, 3])} : {},
      set: vi.fn()
    }},
    rootScope: {myId: (1 as UserId).toPeerId(false), dispatchEvent}
  });
  (drafts as unknown as {after(): void}).after();
  await Promise.resolve();
  if(source === 'received') onUpdateDraftMessage(draftUpdate(richDraft(kind, [1, 2, 3])));

  const getMedia = () => kind === 'photo' ? photos.getPhoto(MEDIA_ID) : docs.getDoc(MEDIA_ID);
  return {getMedia, drafts, references, dispatchEvent, invokeApiSingleProcess};
}

describe.each(['audio', 'file', 'photo'] as const)('the %s of a draft', (kind) => {
  test.each(['received', 'restored'] as const)('renews its expired file reference from the drafts, %s', async(source) => {
    const {getMedia, drafts, references, dispatchEvent, invokeApiSingleProcess} = await setup(kind, source);
    const stored = getMedia();
    expect([...stored.file_reference]).toEqual([1, 2, 3]);
    const draft = await drafts.getDraft(PEER_ID);
    const events = dispatchEvent.mock.calls.length;

    // what a download hands over when the server answers FILE_REFERENCE_EXPIRED: the bytes it used
    const renewed = await references.refreshReference([1, 2, 3]);
    expect([...renewed]).toEqual([4, 5, 6]);
    expect(invokeApiSingleProcess).toHaveBeenCalledWith(expect.objectContaining({method: 'messages.getAllDrafts'}));
    // the very object a download reads its parts by
    expect(getMedia()).toBe(stored);
    expect([...stored.file_reference]).toEqual([4, 5, 6]);

    // and nothing else: the draft is not applied again, so the composer showing it is left alone
    expect(dispatchEvent.mock.calls.length).toBe(events);
    expect(await drafts.getDraft(PEER_ID)).toBe(draft);
  });
});
