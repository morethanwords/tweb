/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import limitSymbols from '../../helpers/string/limitSymbols';
import {WebPage} from '../../layer';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';

export default function wrapWebPageDescription(webPage: WebPage.webPage) {
  const shortDescriptionText = limitSymbols(webPage.description || '', 150, 180);
  // const siteName = webPage.site_name;
  // let contextHashtag = '';
  // if(siteName === 'GitHub') {
  //   const matches = apiWebPage.url.match(/(https?:\/\/github\.com\/[^\/]+\/[^\/]+)/);
  //   if(matches) {
  //     contextHashtag = matches[0] + '/issues/{1}';
  //   }
  // }
  return wrapRichText(shortDescriptionText/* , {
    contextSite: siteName || 'external',
    contextHashtag: contextHashtag
  } */);
}
