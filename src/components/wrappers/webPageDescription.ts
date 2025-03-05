/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import limitSymbols from '../../helpers/string/limitSymbols';
import {WebPage} from '../../layer';
import wrapRichText, {WrapRichTextOptions} from '../../lib/richTextProcessor/wrapRichText';
import {appState} from '../../stores/appState';
import {untrack} from 'solid-js';

export default function wrapWebPageDescription(
  webPage: WebPage.webPage,
  richTextOptions?: WrapRichTextOptions,
  isSponsored?: boolean
) {
  if(isSponsored) {
    return wrapRichText(webPage.description || '', {
      ...richTextOptions,
      entities: webPage.entities
    });
  }

  richTextOptions ??= {};
  richTextOptions.whitelistedDomains ??= untrack(() => appState.appConfig?.whitelisted_domains);

  const shortDescriptionText = limitSymbols(webPage.description || '', 150, 180);
  return wrapRichText(shortDescriptionText, richTextOptions);
}
