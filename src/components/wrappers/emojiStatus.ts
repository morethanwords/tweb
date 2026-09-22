import {IS_WEBM_SUPPORTED} from '@environment/videoSupport';
import {rgbIntToHex} from '@helpers/color';
import {MediaSize} from '@helpers/mediaSize';
import mediaSizes from '@helpers/mediaSizes';
import {EmojiStatus, DocumentAttribute, Document} from '@layer';
import rootScope from '@lib/rootScope';
import {Sparkles} from '@components/sparkles';
import wrapSticker from '@components/wrappers/sticker';

const RENDER_SPARKLES = false; // performance issues

// * a load our own middleware cancelled is not a failure - it is the same "nothing to render
// * anymore" that the middleware guards below return on. Anything else still surfaces.
const ignoreCancelled = (err: ApiError) => {
  if(err?.type !== 'MIDDLEWARE') throw err;
};

export default async function wrapEmojiStatus({
  wrapOptions,
  emojiStatus,
  size = mediaSizes.active.emojiStatus
}: {
  wrapOptions: WrapSomethingOptions,
  emojiStatus: EmojiStatus.emojiStatus | EmojiStatus.emojiStatusCollectible,
  size?: MediaSize
}) {
  const {middleware, animationGroup, textColor} = wrapOptions;
  const container = document.createElement('span');
  container.classList.add('emoji-status');
  const result = await rootScope.managers.acknowledged.appEmojiManager.getCustomEmojiDocument(emojiStatus.document_id);
  const wrap = async(doc: Document.document) => {
    if(!middleware()) return;
    const loadPromises: Promise<any>[] = [];

    const attribute = doc.attributes.find((attr) => attr._ === 'documentAttributeCustomEmoji') as DocumentAttribute.documentAttributeCustomEmoji;
    if(attribute && attribute.pFlags.text_color) {
      container.classList.add('emoji-status-text-color');
    }

    const {render} = await wrapSticker({
      doc,
      div: container,
      width: size.width,
      height: size.height,
      loop: 2,
      play: true,
      group: animationGroup || 'EMOJI-STATUS',
      loadPromises,
      middleware,
      static: doc.mime_type === 'video/webm' && !IS_WEBM_SUPPORTED,
      textColor: textColor || 'primary-color'
      // group: 'none'
    });

    // * wrapSticker starts the load itself and only offers it through `render`. With no
    // * lazyLoadQueue to own it - a queue ignores a cancelled load for us - nothing else here
    // * holds that promise, so a middleware dying mid-load would leave it unhandled.
    render?.catch(ignoreCancelled);

    if(!middleware()) return;
    // * an already downloaded static custom emoji puts that same load into loadPromises, so
    // * the cancellation reaches this await too, and out through a `wrap` nobody catches
    await Promise.all(loadPromises).catch(ignoreCancelled);
  };

  if(emojiStatus._ === 'emojiStatusCollectible' && RENDER_SPARKLES) {
    container.appendChild(Sparkles({
      mode: 'button',
      isDiv: true,
      containerSize: size
    }));
    container.style.setProperty('--sparkles-color', rgbIntToHex(emojiStatus.center_color));
  }

  if(!middleware()) {
    return container;
  }

  const p = result.result.then(wrap);
  if(result.cached) {
    await p;
  }

  return container;
}
