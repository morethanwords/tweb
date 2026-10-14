import {render} from 'solid-js/web';
import {InstantViewBlocks} from '@components/instantView';
import {instantViewStyles as styles} from '@components/instantViewFormatting';
import HotReloadGuard from '@lib/solidjs/hotReloadGuardProvider';
import {ensureMediaPlayback} from './mediaPlayback';
import type {Document, PageBlock, Photo} from '@layer';

/** A rich message's page drawn as a bubble draws it, in the app's own styles. */
export function mountRichPage(blocks: PageBlock[], documents: Document.document[] = [], photos: Photo.photo[] = []) {
  ensureMediaPlayback();
  const host = document.createElement('div');
  host.dataset.richPage = '';
  host.style.cssText = 'position:fixed;left:0;top:0;z-index:3;width:420px;padding:20px;background:var(--surface-color);';
  document.body.append(host);
  const dispose = render(() => HotReloadGuard({get children() {
    return InstantViewBlocks({
      webPageId: '0',
      page: {_: 'page', pFlags: {}, url: '', views: 0, blocks, documents, photos},
      class: styles.RichMessage,
      openNewPage: () => {},
      collapse: () => {}
    });
  }}), host);
  return () => {
    dispose();
    host.remove();
  };
}
