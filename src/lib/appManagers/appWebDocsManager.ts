/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {DocumentAttribute, WebDocument} from '../../layer';

export default class AppWebDocsManager {
  public saveWebDocument(webDocument: WebDocument) {
    if(!webDocument) {
      return;
    }

    const attribute: DocumentAttribute.documentAttributeImageSize = webDocument.attributes.find((attribute) => attribute._ === 'documentAttributeImageSize') as any;
    if(attribute) {
      webDocument.w = attribute.w;
      webDocument.h = attribute.h;
    }

    return webDocument;
  }
}
