import rootScope from '../../lib/rootScope';
import wrapSticker from './sticker';

export function wrapAdaptiveCustomEmoji(options: {
  as?: string
  docId: DocId,
  size: number
  wrapOptions?: WrapSomethingOptions
}) {
  const {docId, size, wrapOptions, as} = options;
  const container = document.createElement(as || 'div');
  container.classList.add('custom-emoji');

  if(wrapOptions?.textColor) {
    container.classList.add('emoji-status-text-color')
  }

  const loadPromise = (async() => {
    const doc = await rootScope.managers.appEmojiManager.getCustomEmojiDocument(docId);
    await wrapSticker({
      doc,
      div: container,
      width: size,
      height: size,
      play: false,
      withThumb: false,
      group: 'none',
      static: !wrapOptions?.textColor,
      middleware: wrapOptions?.middleware,
      textColor: wrapOptions?.textColor,
      lazyLoadQueue: wrapOptions?.lazyLoadQueue === false ? undefined : wrapOptions?.lazyLoadQueue,
      managers: wrapOptions?.managers
    }).then(res => res.render);
  })()

  return {container, loadPromise};
}
