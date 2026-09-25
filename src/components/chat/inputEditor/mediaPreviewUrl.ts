import type {EditorState} from '@tiptap/pm/state';
import clearMediaElementSource from '@helpers/dom/clearMediaElementSource';
import {ObjectURLScope, revokeObjectURL} from '@helpers/objectUrlScope';

type RichMediaPreviewSource = HTMLImageElement | HTMLVideoElement;

type PreviewUrlLeaseRecord = {
  leases: Set<symbol>,
  poster?: HTMLImageElement,
  posterUrl?: string,
  releasePoster?: () => void,
  scope?: ObjectURLScope,
  sideFill?: HTMLImageElement,
  source?: RichMediaPreviewSource,
  url: string
};

type HistoryItemLike = {
  step?: {
    toJSON(): unknown
  }
};

type HistoryBranchLike = {
  items?: {
    forEach(callback: (item: HistoryItemLike) => void): void
  }
};

type HistoryStateLike = {
  done?: HistoryBranchLike,
  undone?: HistoryBranchLike
};

type PreviewUrlLeaseGlobal = typeof globalThis & {
  __twebRichMediaPreviewUrlLeases?: Map<string, PreviewUrlLeaseRecord>
};

const previewUrlLeaseGlobal = globalThis as PreviewUrlLeaseGlobal;
const previewUrlLeases = (
  previewUrlLeaseGlobal.__twebRichMediaPreviewUrlLeases ||= new Map()
);
const noop = () => {};

function clearPoster(record: PreviewUrlLeaseRecord) {
  if(record.poster) clearMediaElementSource(record.poster);
  if(record.releasePoster) record.releasePoster();
  else if(record.posterUrl) revokeObjectURL(record.posterUrl);
  record.poster = undefined;
  record.posterUrl = undefined;
  record.releasePoster = undefined;
}

function clearSideFill(record: PreviewUrlLeaseRecord) {
  if(record.sideFill) clearMediaElementSource(record.sideFill);
  record.sideFill = undefined;
}

function acquireLease(record: PreviewUrlLeaseRecord) {
  const token = Symbol();
  let released = false;
  record.leases.add(token);
  return () => {
    if(released) return;
    released = true;
    record.leases.delete(token);
    if(record.leases.size) return;
    previewUrlLeases.delete(record.url);
    clearPoster(record);
    clearSideFill(record);
    if(record.source) clearMediaElementSource(record.source);
    if(record.scope) record.scope.dispose();
    else revokeObjectURL(record.url);
  };
}

export function createRichMediaPreviewUrl(file: Blob) {
  const scope = new ObjectURLScope();
  const url = scope.create(file);
  const record: PreviewUrlLeaseRecord = {
    leases: new Set(),
    scope,
    url
  };
  previewUrlLeases.set(url, record);
  return {
    release: acquireLease(record),
    url
  };
}

export function retainRichMediaPreviewUrl(url: string) {
  const record = previewUrlLeases.get(url);
  return record ? acquireLease(record) : noop;
}

export function setRichMediaPreviewSource(
  url: string,
  source: RichMediaPreviewSource
) {
  const record = previewUrlLeases.get(url);
  if(!record) {
    clearMediaElementSource(source);
    return false;
  }
  if(record.source && record.source !== source) {
    clearMediaElementSource(record.source);
  }
  record.source = source;
  return true;
}

export function getRichMediaPreviewSource(url: string) {
  return previewUrlLeases.get(url)?.source;
}

export function setRichMediaPreviewPoster(
  url: string,
  poster: HTMLImageElement,
  posterUrl: string,
  releasePoster?: () => void
) {
  const record = previewUrlLeases.get(url);
  if(!record) {
    clearMediaElementSource(poster);
    if(releasePoster) releasePoster();
    else revokeObjectURL(posterUrl);
    return false;
  }
  clearPoster(record);
  record.poster = poster;
  record.posterUrl = posterUrl;
  record.releasePoster = releasePoster;
  return true;
}

export function getRichMediaPreviewPoster(url: string) {
  return previewUrlLeases.get(url)?.poster;
}

export function setRichMediaPreviewSideFill(
  url: string,
  sideFill: HTMLImageElement
) {
  const record = previewUrlLeases.get(url);
  if(!record) {
    clearMediaElementSource(sideFill);
    return false;
  }
  clearSideFill(record);
  record.sideFill = sideFill;
  return true;
}

export function getRichMediaPreviewSideFill(url: string) {
  return previewUrlLeases.get(url)?.sideFill;
}

function addPreviewUrl(urls: Set<string>, value: unknown) {
  if(typeof(value) === 'string' && previewUrlLeases.has(value)) urls.add(value);
}

function collectPreviewUrlsFromAttrs(urls: Set<string>, attrs: unknown) {
  if(!attrs || typeof(attrs) !== 'object') return;
  const record = attrs as Record<string, unknown>;
  addPreviewUrl(urls, record.previewUrl);
  [record.previewUrls, record.uploadPreviewUrls].forEach((values) => {
    if(Array.isArray(values)) values.forEach((value) => addPreviewUrl(urls, value));
  });
}

function collectMediaReferencesFromJSON(urls: Set<string>, value: unknown, uploadIds?: Set<string>) {
  if(Array.isArray(value)) {
    value.forEach((item) => collectMediaReferencesFromJSON(urls, item, uploadIds));
    return;
  }
  if(!value || typeof(value) !== 'object') return;
  const record = value as Record<string, unknown>;
  collectPreviewUrlsFromAttrs(urls, record.attrs);
  if(typeof(record.uploadId) === 'string' && record.uploadId) uploadIds?.add(record.uploadId);
  Object.values(record).forEach((item) => collectMediaReferencesFromJSON(urls, item, uploadIds));
}

function collectDocumentPreviewUrls(state: EditorState) {
  const urls = new Set<string>();
  state.doc.descendants((node) => {
    if(node.type.name === 'richMedia') collectPreviewUrlsFromAttrs(urls, node.attrs);
  });
  return urls;
}

export function retainRichMediaPreviewDocument(document: unknown) {
  const urls = new Set<string>();
  collectMediaReferencesFromJSON(urls, document);
  const releases = [...urls].map(retainRichMediaPreviewUrl);
  return () => releases.forEach((release) => release());
}

function isHistoryBranch(value: unknown): value is HistoryBranchLike {
  if(!value || typeof(value) !== 'object') return false;
  const items = (value as HistoryBranchLike).items;
  return !!items && typeof(items.forEach) === 'function';
}

function collectHistoryReferences(state: EditorState) {
  let history: HistoryStateLike | undefined;
  state.plugins.some((plugin) => {
    const candidate = plugin.getState(state) as HistoryStateLike | undefined;
    if(!isHistoryBranch(candidate?.done) || !isHistoryBranch(candidate?.undone)) {
      return false;
    }
    history = candidate;
    return true;
  });
  if(!history) return;

  const urls = new Set<string>();
  const uploadIds = new Set<string>();
  [history.done, history.undone].forEach((branch) => {
    branch?.items?.forEach((item) => {
      if(item.step) collectMediaReferencesFromJSON(urls, item.step.toJSON(), uploadIds);
    });
  });
  return {urls, uploadIds};
}

export function getReferencedRichMediaUploadIds(state: EditorState) {
  const history = collectHistoryReferences(state);
  if(!history) return;
  const ids = history.uploadIds;
  state.doc.descendants((node) => {
    if(node.type.name === 'richMedia' && node.attrs.uploadId) ids.add(`${node.attrs.uploadId}`);
  });
  return [...ids];
}

export class RichMediaPreviewHistoryLease {
  private releases = new Map<string, () => void>();

  public sync(state: EditorState) {
    const documentUrls = collectDocumentPreviewUrls(state);
    documentUrls.forEach((url) => {
      if(this.releases.has(url)) return;
      const record = previewUrlLeases.get(url);
      if(record) this.releases.set(url, acquireLease(record));
    });

    const detachedUrls = [...this.releases.keys()].filter((url) => !documentUrls.has(url));
    if(!detachedUrls.length) return;
    const historyUrls = collectHistoryReferences(state)?.urls;
    // If ProseMirror changes its private history representation, retain the
    // existing leases until the editor is reset instead of revoking a URL that
    // may still be reachable through Undo/Redo.
    if(!historyUrls) return;
    detachedUrls.forEach((url) => {
      if(historyUrls.has(url)) return;
      this.releases.get(url)!();
      this.releases.delete(url);
    });
  }

  public clear() {
    this.releases.forEach((release) => release());
    this.releases.clear();
  }
}
