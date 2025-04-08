import {Middleware} from '../../helpers/middleware';
import {TextWithEntities} from '../../layer';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import wrapTextWithEntities from '../../lib/richTextProcessor/wrapTextWithEntities';

export default function wrapFolderTitle<T extends boolean = false>(
  text: TextWithEntities,
  middleware: Middleware,
  noWait?: T
): T extends true ? DocumentFragment : Promise<DocumentFragment> {
  const loadPromises: Promise<any>[] = [];
  text = wrapTextWithEntities(text);
  const wrapped = wrapRichText(text.text, {entities: text.entities, middleware, loadPromises});
  if(noWait) {
    return wrapped as any;
  }

  return Promise.all(loadPromises).then(() => wrapped) as any;
}
