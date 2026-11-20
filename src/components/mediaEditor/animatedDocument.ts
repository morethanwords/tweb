import type {Document} from '@layer';
import type {MediaEditorContextValue} from '@components/mediaEditor/context';
import type {StickerFrameByFrameRenderer} from '@components/mediaEditor/finalRender/types';
import StickerType from '@config/stickerType';
import {IS_FIREFOX} from '@environment/userAgent';
import {bindManagersToSession} from '@lib/accounts/bindManagersToAccount';
import {getManagersSession, isSessionLeaving} from '@lib/accounts/getCurrentAccount';
import readVideoSourceInfo, {type VideoSourceInfo} from '@helpers/video/readVideoSourceInfo';
import {supportsVideoEncoding} from '@components/mediaEditor/support';
import {FRAMES_PER_SECOND} from '@components/mediaEditor/finalRender/constants';
import {checkDocumentRendererSource, type DocumentRendererSource} from '@components/mediaEditor/finalRender/documentRendererSource';

export type EditorDocumentKind = {kind: 'static' | 'lottie' | 'webm' | 'mp4-gif'; animated: boolean} |
  {kind: 'unsupported'; animated: false; reason: string};
// Runtime validation only, not a new layer schema or a persistent subtype.
const validated = new WeakMap<Document.document, VideoSourceInfo>();
const unsupported = (reason: string): EditorDocumentKind => ({kind: 'unsupported', animated: false, reason});

export function classifyEditorDocument(doc: Document.document, firefox = IS_FIREFOX): EditorDocumentKind {
  if(!doc) return unsupported('missing-document');
  if(doc.sticker === StickerType.Static) return {kind: 'static', animated: false};
  if(doc.sticker === StickerType.Lottie) return {kind: 'lottie', animated: true};
  if(doc.sticker === StickerType.WebM) return {kind: 'webm', animated: !firefox};
  if(doc.type !== 'gif') return unsupported('unknown-document');
  if(doc.mime_type !== 'video/mp4') return unsupported('unsupported-gif-container');
  if(firefox) return unsupported('frame-seeking-unavailable');
  if(!validated.has(doc)) return unsupported('unvalidated-mp4-gif');
  return {kind: 'mp4-gif', animated: true};
}

export function gifSourceRejection(info: VideoSourceInfo): string | undefined {
  if(![info.codedWidth, info.codedHeight, info.displayWidth, info.displayHeight].every(n => Number.isFinite(n) && n > 0)) return 'missing-dimensions';
  if(!Number.isFinite(info.duration) || info.duration <= 0) return 'missing-duration';
  if(info.duration * FRAMES_PER_SECOND < 2) return 'insufficient-animation-frames';
  if(info.codec !== 'avc') return 'unsupported-codec';
  if(info.rotation !== 0) return 'unsupported-rotation';
  if(info.color?.status !== 'sdr') return 'unknown-or-hdr-color';
  return undefined;
}

export function gifContextRejection(context: Pick<MediaEditorContextValue, 'mediaType' | 'canImageResultInGIF' | 'isEditingForAvatar'>,
  capabilities: {firefox: boolean; encode: boolean; playback: boolean}): string | undefined {
  if(context.isEditingForAvatar || !['image', 'video'].includes(context.mediaType)) return 'unsupported-editor-context';
  if(!context.canImageResultInGIF) return 'animation-disabled';
  if(capabilities.firefox) return 'frame-seeking-unavailable';
  if(!capabilities.encode || !capabilities.playback) return 'video-capability-unavailable';
}

/** Preparation primitive for preview/export and a future importer. Callers must
 * supply their lifetime/generation check; nothing is inserted here. */
type EditorGifManagers = Pick<MediaEditorContextValue['managers'], 'appDocsManager'>;
export type EditorGifContext = Pick<MediaEditorContextValue, 'mediaType' | 'canImageResultInGIF' | 'isEditingForAvatar'> & {
  managers: {[K in keyof EditorGifManagers]: Pick<NonNullable<EditorGifManagers[K]>, 'downloadDoc'>};
};

export async function prepareEditorGif(context: EditorGifContext, doc: Document.document, valid: () => boolean) {
  const managers = bindManagersToSession(context.managers);
  const docsManager = managers?.appDocsManager;
  if(!docsManager) throw new Error('GIF account unavailable');
  const session = managers && getManagersSession(managers);
  const alive = () => valid() && (!session || !isSessionLeaving(session));
  if(!alive()) throw new Error('GIF preparation cancelled');
  if(doc.type !== 'gif' || doc.sticker || doc.mime_type !== 'video/mp4') throw new Error('Unsupported GIF container');
  // Necessary gates, not an authoritative decode/seek probe. A future importer
  // must establish that capability before exposing GIF insertion to the user.
  const rejection = gifContextRejection(context, {firefox: IS_FIREFOX, encode: await supportsVideoEncoding(),
    playback: !!document.createElement('video').canPlayType('video/mp4')});
  if(!alive()) throw new Error('GIF preparation cancelled');
  if(rejection) throw new Error('Unsupported GIF: ' + rejection);
  const blob = await docsManager.downloadDoc(doc);
  if(!alive()) throw new Error('GIF preparation cancelled');
  if(!(blob instanceof Blob)) throw new Error('GIF source unavailable');
  // MIME is not evidence of the container. Only the MP4 path is prepared here.
  const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if(String.fromCharCode(...header.slice(4, 8)) !== 'ftyp') throw new Error('Unsupported GIF container');
  const info = await readVideoSourceInfo(blob, {fpsProbePacketCount: 2});
  if(!alive()) throw new Error('GIF preparation cancelled');
  const reason = gifSourceRejection(info);
  if(reason) throw new Error('Unsupported GIF: ' + reason);
  validated.set(doc, info);
  return blob;
}

/** Both exporters share this dispatch, including legacy sticker semantics. */
export async function createEditorDocumentRenderer(doc: Document.document, gifBlob?: Blob, owner?: DocumentRendererSource): Promise<StickerFrameByFrameRenderer> {
  checkDocumentRendererSource(owner);
  const source = classifyEditorDocument(doc);
  if(source.kind === 'unsupported') throw new Error('Unsupported editor document: ' + source.reason);
  if(source.kind === 'mp4-gif' && !gifBlob) throw new Error('Validated GIF blob required');
  if(source.kind === 'static') {
    const {default: Renderer} = await import('@components/mediaEditor/finalRender/imageStickerFrameByFrameRenderer');
    checkDocumentRendererSource(owner);
    return new Renderer(owner);
  }
  if(source.kind === 'lottie') {
    const {default: Renderer} = await import('@components/mediaEditor/finalRender/lottieStickerFrameByFrameRenderer');
    checkDocumentRendererSource(owner);
    return new Renderer(owner);
  }
  const {default: Renderer} = await import('@components/mediaEditor/finalRender/videoStickerFrameByFrameRenderer');
  checkDocumentRendererSource(owner);
  return new Renderer(source.kind === 'mp4-gif' ? gifBlob : undefined, owner);
}
