import {toastNew} from '@components/toast';
import {Photo, Document} from '@layer';
import rootScope from '@lib/rootScope';
import {ObjectURLScope} from '@helpers/objectUrlScope';
import {MediaEditorProps} from '@components/mediaEditor/mediaEditor';
import {MAX_EDITABLE_VIDEO_SIZE, supportsVideoEncoding} from '@components/mediaEditor/support';
import {Middleware} from '@helpers/middleware';
import {ChatInputEditor} from '@components/chat/inputEditor';
import {RichMediaItemEditAction, RichMediaItemInsertAction} from '@components/chat/inputEditor/mediaPaste';
import {
  createImageSource,
  createVideoSource,
  getOpenMediaPhotoPayload,
  getOpenMediaVideoPayload,
  getSourceSize
} from '@components/chat/editMessageMedia';
import appDownloadManager from '@lib/appDownloadManager';
import type {ChatInputEditorSelection} from '@components/chat/inputEditor/types';

type EditRichMediaOptions = {
  editor: ChatInputEditor,
  middleware: Middleware,
  isCurrent: () => boolean,
  insert: (files: File[], selection: ChatInputEditorSelection, action: RichMediaItemInsertAction) => Promise<boolean>
};

export default async function editRichMediaItem(
  action: RichMediaItemEditAction,
  options: EditRichMediaOptions
): Promise<void> {
  const editor = options.editor;
  if(!editor || !options.isCurrent() || !options.middleware()) return;
  const contextMiddleware = options.middleware;
  const isPhoto = action.media._ === 'photo';
  const mediaType: MediaEditorProps['mediaType'] = isPhoto ? 'image' : 'video';
  const payload = isPhoto ?
    getOpenMediaPhotoPayload(action.media as Photo.photo) :
    getOpenMediaVideoPayload(action.media as Document.document);
  if(!payload && !action.previewUrl) return;

  const target = editor.captureSelection();
  const isCurrent = () => options.isCurrent() && editor.captureSelection().revision === target.revision;
  target.from = action.from;
  target.to = action.to;
  target.type = 'node';
  const middlewareHelper = contextMiddleware.create();
  const middleware = middlewareHelper.get();
  const canOpen = () => middleware() && isCurrent();
  const objectURLs = new ObjectURLScope();
  const cleanup = () => {
    middlewareHelper.destroy();
    objectURLs.dispose();
  };
  let mediaBlob: Blob | undefined;
  try {
    if(action.previewUrl && (
      !payload ||
      /^(blob:|data:)/.test(action.previewUrl)
    )) {
      try {
        mediaBlob = await fetch(action.previewUrl).then((response) => (
          response.ok ? response.blob() : undefined
        ));
      } catch{}
    }
    if(!canOpen()) {
      cleanup();
      return;
    }
    if(!mediaBlob && payload) mediaBlob = await appDownloadManager.downloadMedia(payload.downloadOptions);
  } catch(error) {
    cleanup();
    console.error('rich message media editor download error', error);
    return;
  }
  if(!mediaBlob || !canOpen()) {
    cleanup();
    return;
  }
  if(mediaType === 'video') {
    let supported = mediaBlob.size <= MAX_EDITABLE_VIDEO_SIZE;
    try {
      supported &&= await supportsVideoEncoding();
    } catch{
      supported = false;
    }
    if(!canOpen()) {
      cleanup();
      return;
    }
    if(!supported) {
      cleanup();
      toastNew({langPackKey: 'RichMessage.Error.UnsupportedContent'});
      return;
    }
  }

  const mediaUrl = objectURLs.create(mediaBlob);
  let source = action.sourceElement;
  let size = source && getSourceSize(source);
  let rect = source?.getBoundingClientRect();
  try {
    if(
      !source?.isConnected ||
      !size?.every((value) => value > 0) ||
      !rect?.width ||
      !rect.height
    ) {
      source = await (payload?.createCanvasSource || (
        mediaType === 'image' ? createImageSource : createVideoSource
      ))(mediaUrl, middleware);
      size = getSourceSize(source);
      rect = undefined;
    }
  } catch(error) {
    cleanup();
    console.error('rich message media editor source error', error);
    return;
  }
  if(!canOpen() || !source || !size?.every((value) => value > 0)) {
    cleanup();
    return;
  }

  let mediaEditor: typeof import('@components/mediaEditor');
  try {
    mediaEditor = await import('@components/mediaEditor');
  } catch(error) {
    cleanup();
    console.error('rich message media editor import error', error);
    return;
  }
  if(!canOpen()) {
    cleanup();
    return;
  }
  const fileName = payload?.fileName || (
    mediaType === 'image' ? 'edited-media.jpg' : 'edited-media.mp4'
  );
  const editorOptions = {
    animatedCanvasSize: size,
    canImageResultInGIF: !action.grouped,
    getMediaBlob: () => Promise.resolve(mediaBlob),
    managers: rootScope.managers,
    mediaSrc: mediaUrl,
    mediaType,
    onClose: cleanup,
    onEditFinish: async(result: Parameters<MediaEditorProps['onEditFinish']>[0]) => {
      if(!isCurrent()) return;
      try {
        const {blob} = await result.getResult();
        if(!isCurrent()) return;
        const file = new File([blob], fileName, {
          type: blob.type || mediaBlob.type
        });
        await options.insert([file], target, {
          action: 'replace',
          activeIndex: action.activeIndex,
          from: action.from,
          to: action.to
        });
      } catch(error) {
        console.error('rich message media editor result error', error);
      }
    },
    source
  };
  try {
    if(rect) {
      mediaEditor.openMediaEditorFromMedia({...editorOptions, rect});
    } else {
      mediaEditor.openMediaEditorFromMediaNoAnimation(editorOptions);
    }
  } catch(error) {
    cleanup();
    console.error('rich message media editor open error', error);
  }
}
