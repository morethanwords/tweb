import rootScope from '@lib/rootScope';
import wrapSticker from '@components/wrappers/sticker';
import noop from '@helpers/noop';
import markTextColorEmoji from '@components/wrappers/markTextColorEmoji';

export function wrapAdaptiveCustomEmoji(options: {
  as?: string
  docId: DocId,
  size: number
  wrapOptions?: WrapSomethingOptions
}) {
  const {docId, size, wrapOptions, as} = options;
  const container = document.createElement(as || 'div');
  container.classList.add('custom-emoji');

  const loadPromise = (async() => {
    const doc = await rootScope.managers.appEmojiManager.getCustomEmojiDocument(docId);
    // * an emoji of the text's colour is drawn in the colour it is given (wrapSticker falls back to the
    // * text's own), never as its thumbnail, which keeps the artwork's colour: black on a dark theme. It
    // * stays still all the same (`play: false`), only tinted; an emoji of its own colours keeps them
    const isTextColor = markTextColorEmoji(container, doc);

    await wrapSticker({
      doc,
      div: container,
      width: size,
      height: size,
      play: false,
      withThumb: false,
      group: 'none',
      static: !isTextColor && !wrapOptions?.textColor,
      middleware: wrapOptions?.middleware,
      textColor: wrapOptions?.textColor,
      lazyLoadQueue: wrapOptions?.lazyLoadQueue === false ? undefined : wrapOptions?.lazyLoadQueue,
      managers: wrapOptions?.managers,
      // * its one frame is drawn on a canvas of the page's, which keeps it: a frame presented from a worker
      // * while the title is not in the document yet (a top bar still preparing) can be lost, and nothing
      // * plays it again, so the icon would stay blank
      noOffscreen: true
    }).then(res => res.render);
  })();
  // * nobody has to wait for it: a row torn down mid-load (an account switch tears down all of them)
  // * rejects it with MIDDLEWARE, which is no error
  loadPromise.catch(noop);

  return {container, loadPromise};
}
