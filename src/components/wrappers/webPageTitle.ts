/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import limitSymbols from '../../helpers/string/limitSymbols';
import {WebPage} from '../../layer';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';

export default function wrapWebPageTitle(webPage: WebPage.webPage) {
  let shortTitle = webPage.title || webPage.author || '';
  shortTitle = limitSymbols(shortTitle, 80, 100);
  return wrapRichText(shortTitle, {noLinks: true, noLinebreaks: true});
}
