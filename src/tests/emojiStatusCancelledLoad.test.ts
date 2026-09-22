import {describe, expect, it, vi} from 'vitest';
import type {Document, EmojiStatus} from '@layer';

/*
 * wrapSticker does not wait for the load it starts - it hands the promise over in `render`, and
 * with no lazyLoadQueue passed there is no queue to own it (a queue ignores a cancelled load for
 * us). wrapEmojiStatus discarded that promise, so a middleware dying mid-load left an unhandled
 * rejection on every cold load of the client. An already downloaded static custom emoji reaches
 * the same cancellation through `loadPromises`, which this function does await.
 */

const getCustomEmojiDocument = vi.fn();
const wrapSticker = vi.fn();

vi.mock('@lib/rootScope', () => ({
  default: {managers: {acknowledged: {appEmojiManager: {getCustomEmojiDocument: (id: DocId) => getCustomEmojiDocument(id)}}}}
}));

vi.mock('@components/wrappers/sticker', () => ({
  default: (options: any) => wrapSticker(options)
}));

const emojiStatus: EmojiStatus.emojiStatus = {_: 'emojiStatus', document_id: 'doc'};
const doc = {
  _: 'document',
  id: 'doc',
  mime_type: 'application/x-tgsticker',
  attributes: [] as Document.document['attributes']
};

/** Rejects a turn later, the way a load does when the middleware dies while it runs. */
function rejectsLater(error: ApiError) {
  return new Promise<never>((resolve, reject) => setTimeout(() => reject(error), 0));
}

async function wrapWith({cached, renderFails, loadFails}: {
  cached: boolean,
  renderFails?: ApiError,
  loadFails?: ApiError
}) {
  getCustomEmojiDocument.mockReturnValue(Promise.resolve({cached, result: Promise.resolve(doc)}));
  // * the load starts when wrapSticker is called, not before - a promise that is already
  // * rejected by then is reported unhandled whatever the caller does with it afterwards
  wrapSticker.mockImplementation((options: any) => {
    if(loadFails) options.loadPromises.push(rejectsLater(loadFails));
    return Promise.resolve({render: renderFails ? rejectsLater(renderFails) : Promise.resolve([])});
  });

  const {default: wrapEmojiStatus} = await import('@components/wrappers/emojiStatus');
  return wrapEmojiStatus({
    emojiStatus,
    wrapOptions: {middleware: (() => true) as any}
  });
}

/** Collects what node would report unhandled, giving every pending rejection its turn. */
async function collectUnhandledRejections(run: () => Promise<any>) {
  const unhandled: any[] = [];
  const onUnhandled = (reason: any) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    await run();
    for(let i = 0; i < 5; ++i) await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }

  return unhandled;
}

describe('an emoji status whose load was cancelled', () => {
  it('holds the load wrapSticker started, so a cancellation is not left unhandled', async() => {
    const cancelled: ApiError = {type: 'MIDDLEWARE'} as ApiError;
    const unhandled = await collectUnhandledRejections(() => wrapWith({
      cached: false,
      renderFails: cancelled
    }));

    expect(unhandled).not.toContain(cancelled);
  });

  it('renders when the cancellation arrives through loadPromises instead', async() => {
    const container = await wrapWith({
      cached: true,
      loadFails: {type: 'MIDDLEWARE'} as ApiError
    });

    expect(container.classList.contains('emoji-status')).toBe(true);
  });

  it('still surfaces a load that failed for a real reason', async() => {
    const failed: ApiError = {type: 'NO_DOC'} as ApiError;
    await expect(wrapWith({cached: true, loadFails: failed})).rejects.toBe(failed);
  });
});
