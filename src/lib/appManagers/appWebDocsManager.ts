import {DocumentAttribute, WebDocument} from '@layer';

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
