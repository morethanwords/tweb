import {afterEach, beforeAll, describe, expect, test, vi} from 'vitest';
import '@/tests/helpers/a11yLayer';
import {stubBrowserGlobals} from '@/tests/helpers/browserGlobals';
import I18n from '@lib/langPack';
import {getMiddleware} from '@helpers/middleware';
import type {MyDocument} from '@appManagers/appDocsManager';

/*
 * A file's button is named by what a click on it does: "Open file" when the app opens it - a Markdown file in
 * Instant View, a medium the media viewer plays - and "Download file" when it is saved to the disk, which is the
 * case of most files. It was "Open file" for all of them (tweb#710).
 */

// * the thumbnail of a medium is drawn by its own wrapper, and the worker proxy is not needed to build the file
vi.mock('@components/wrappers/photo', () => ({default: async() => ({images: {}})}));
vi.mock('@lib/apiManagerProxy', () => import('@/tests/mocks/stubModule'));

const thumbs = [{_: 'photoSize', type: 'm', w: 90, h: 90, size: 1000}];

let wrapDocument: typeof import('@components/wrappers/document').default;

beforeAll(async() => {
  stubBrowserGlobals();
  wrapDocument = (await import('@components/wrappers/document')).default;
});

async function nameOf(doc: Omit<Partial<MyDocument>, 'mime_type'> & {mime_type: string}) {
  const element = await wrapDocument({
    message: {_: 'message', mid: 1, peerId: 1, date: 0, pFlags: {}, media: {_: 'messageMediaDocument', document: doc}} as any,
    middleware: getMiddleware().get(),
    // * as a file already in the cache: nothing to download before the click
    cacheContext: {downloaded: doc.size, url: 'blob:test', type: 'full'} as any,
    managers: {apiFileManager: {isDownloading: async() => false}} as any
  });
  document.body.append(element);
  return element.querySelector('.document-ico').getAttribute('aria-label');
}

describe('the button of a file in a message', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  test('says it downloads a file the app does not open', async() => {
    expect(await nameOf({_: 'document', id: '1', file_name: 'archive.zip', mime_type: 'application/zip', size: 1000})).toBe(
      I18n.format('AccDescr.DownloadDocument', true, ['archive.zip'])
    );
  });

  test('says it opens a Markdown file, which opens in Instant View', async() => {
    expect(await nameOf({_: 'document', id: '2', file_name: 'notes.md', mime_type: 'text/markdown', size: 1000})).toBe(
      I18n.format('AccDescr.OpenDocument', true, ['notes.md'])
    );
  });

  test('says it opens a medium the viewer plays, and downloads one it does not', async() => {
    expect(await nameOf({_: 'document', id: '3', file_name: 'clip.mp4', mime_type: 'video/mp4', size: 1000, thumbs} as any)).toBe(
      I18n.format('AccDescr.OpenDocument', true, ['clip.mp4'])
    );
    // * with no thumbnail it is a plain file in the message, and a click saves it
    expect(await nameOf({_: 'document', id: '4', file_name: 'clip.mp4', mime_type: 'video/mp4', size: 1000})).toBe(
      I18n.format('AccDescr.DownloadDocument', true, ['clip.mp4'])
    );
  });
});
