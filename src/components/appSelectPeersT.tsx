import {Middleware} from '../helpers/middleware';
import {i18n} from '../lib/langPack';
import wrapEmojiText from '../lib/richTextProcessor/wrapEmojiText';
import wrapLocalSticker from './wrappers/localSticker';
import {Accessor, createRoot, Component, JSX, onCleanup} from 'solid-js';

export default async function emptySearchPlaceholder(
  middleware: Middleware,
  query: Accessor<string>,
  hide: Accessor<boolean>
) {
  const {container, promise} = await wrapLocalSticker({
    width: 140,
    height: 140,
    assetName: 'UtyanSearch',
    middleware,
    loop: true
  });

  if(!middleware()) {
    return;
  }

  await promise;
  if(!middleware()) {
    return;
  }

  container.classList.add('selector-empty-placeholder-sticker');

  let ret: JSX.Element;
  createRoot((disposer) => {
    middleware.onClean(disposer);
    ret = (
      <div class="selector-empty-placeholder" classList={{hide: hide()}}>
        {container}
        <div class="selector-empty-placeholder-title">
          {i18n('SearchEmptyViewTitle')}
        </div>
        {query().trim() && <div class="selector-empty-placeholder-description">
          {i18n('RequestJoin.List.SearchEmpty', [wrapEmojiText(query())])}
        </div>}
      </div>
    );
  });

  return ret;
}
