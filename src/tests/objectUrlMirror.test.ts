import {joinDeepPath} from '@helpers/object/setDeepProperty';
import {hasLoadedURL, markLoadedURL} from '@helpers/dom/loadedUrlCache';
import reconcileObjectURLMirrorValue, {
  deleteObjectURLMirrorValue,
  reconcileObjectURLMirrorSnapshot
} from '@lib/apiManagerProxyUtils/reconcileObjectURLMirrorValue';

describe('object URL mirror values', () => {
  it('replaces the held reference in place and forgets the previous URL', () => {
    const saved = {downloaded: 10, type: '', url: 'blob:test/previous'};
    markLoadedURL(saved.url);
    const mirror = {
      document: {
        '': saved
      }
    };
    const next = {downloaded: 20, type: '', url: 'blob:test/next'};

    reconcileObjectURLMirrorValue(mirror, joinDeepPath('document', ''), next);

    expect(mirror.document['']).toBe(saved);
    expect(saved).toEqual(next);
    expect(hasLoadedURL('blob:test/previous')).toBe(false);
  });

  it('blanks a held reference before deleting its canonical mirror slot', () => {
    const saved = {downloaded: 10, type: '', url: 'blob:test/current'};
    markLoadedURL(saved.url);
    const mirror = {
      document: {
        '': saved
      }
    };

    reconcileObjectURLMirrorValue(mirror, joinDeepPath('document', ''));

    expect(saved).toEqual({downloaded: 0, type: '', url: ''});
    expect(mirror.document).toBeUndefined();
    expect(hasLoadedURL('blob:test/current')).toBe(false);
  });

  it('keeps a media parent while another thumb size is still cached', () => {
    const removed = {downloaded: 10, type: '', url: 'blob:test/current'};
    const retained = {downloaded: 20, type: 'x', url: 'blob:test/retained'};
    const mirror = {
      document: {
        '': removed,
        x: retained
      }
    };

    reconcileObjectURLMirrorValue(mirror, joinDeepPath('document', ''));

    expect(removed).toEqual({downloaded: 0, type: '', url: ''});
    expect(mirror.document).toEqual({x: retained});
  });

  it('clears saved sticker-thumb references without adding media fields', () => {
    const saved = {h: 100, url: 'blob:test/sticker', w: 100};
    const mirror = {sticker: saved};

    reconcileObjectURLMirrorValue(mirror, 'sticker');

    expect(saved).toEqual({h: 100, url: '', w: 100});
    expect(mirror.sticker).toBeUndefined();
  });

  it('deletes a missing mirror value without creating containers', () => {
    const mirror: Record<string, any> = {other: {x: 1}};

    deleteObjectURLMirrorValue(mirror, joinDeepPath('document', ''));

    expect(mirror).toEqual({other: {x: 1}});
  });

  it('prunes every emptied parent container after a deep delete', () => {
    const leaf = {url: 'blob:test/deep'};
    const sibling = {url: 'blob:test/sibling'};
    const mirror = {
      a: {
        b: {
          c: leaf
        }
      },
      d: sibling
    };

    deleteObjectURLMirrorValue(mirror, joinDeepPath('a', 'b', 'c'));

    expect(mirror).toEqual({d: sibling});
  });

  it('reconciles a full thumbs snapshot without stranding held leaf objects', () => {
    const updated = {downloaded: 10, type: '', url: 'blob:test/old'};
    const removed = {downloaded: 20, type: 'x', url: 'blob:test/removed'};
    markLoadedURL(updated.url);
    markLoadedURL(removed.url);
    const current: Record<string, Record<string, typeof updated>> = {
      document: {'': updated},
      removed: {x: removed}
    };
    const added = {downloaded: 30, type: 'y', url: 'blob:test/added'};

    reconcileObjectURLMirrorSnapshot(current, {
      document: {
        '': {downloaded: 40, type: '', url: 'blob:test/new'}
      },
      added: {y: added}
    }, 2);

    expect(current.document['']).toBe(updated);
    expect(updated).toEqual({downloaded: 40, type: '', url: 'blob:test/new'});
    expect(removed).toEqual({downloaded: 0, type: 'x', url: ''});
    expect(current.removed).toBeUndefined();
    expect(current.added.y).toBe(added);
    expect(hasLoadedURL('blob:test/old')).toBe(false);
    expect(hasLoadedURL('blob:test/removed')).toBe(false);
  });
});
