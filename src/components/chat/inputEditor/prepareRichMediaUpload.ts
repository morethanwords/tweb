import type {SendFileDetails} from '@appManagers/appMessagesManager';
import {MAX_EDITABLE_VIDEO_SIZE} from '@components/mediaEditor/support';
import {IS_MOV_SUPPORTED} from '@environment/videoSupport';
import scaleMediaElement from '@helpers/canvas/scaleMediaElement';
import photoUploadPreparation from '@helpers/canvas/photoUploadPreparation';
import getFileMimeType from '@helpers/files/getFileMimeType';
import getGifDuration from '@helpers/getGifDuration';
import gifToVideo, {canConvertGifToVideo} from '@helpers/gifToVideo';
import movToVideo, {isConvertibleMov} from '@helpers/movToVideo';
import {ObjectURLScope} from '@helpers/objectUrlScope';
import onMediaLoad from '@helpers/onMediaLoad';
import {renderImageFromUrlPromise} from '@helpers/dom/renderImageFromUrl';
import {
  getRichMessageMediaFileType,
  isVisualRichMessageMimeType,
  normalizeRichMessageMediaFile
} from '@helpers/files/richMessageMediaInsertPolicy';

function convertedVideoFile(file: File, blob: Blob) {
  const name = file.name.replace(/\.[^.]+$/, '') || 'video';
  return new File([blob], `${name}.mp4`, {
    lastModified: file.lastModified,
    type: 'video/mp4'
  });
}

async function prepareGif(file: File): Promise<SendFileDetails> {
  if(file.size <= MAX_EDITABLE_VIDEO_SIZE && await canConvertGifToVideo()) {
    const converted = await gifToVideo(file);
    return {
      file: convertedVideoFile(file, converted.blob),
      duration: Math.ceil(converted.duration),
      height: converted.height,
      isAnimated: true,
      width: converted.width
    };
  }

  const objectURLs = new ObjectURLScope();
  const objectUrl = objectURLs.create(file);
  const image = new Image();
  try {
    await renderImageFromUrlPromise(image, objectUrl);
    return {
      file,
      duration: Math.ceil(await getGifDuration(image)),
      height: image.naturalHeight,
      isAnimated: true,
      width: image.naturalWidth
    };
  } finally {
    objectURLs.dispose();
  }
}

async function prepareVideo(file: File): Promise<SendFileDetails> {
  if(getFileMimeType(file) === 'video/quicktime' && isConvertibleMov(file)) {
    try {
      const converted = await movToVideo(file);
      return {
        file: convertedVideoFile(file, converted.blob),
        duration: Math.ceil(converted.duration),
        height: converted.height,
        width: converted.width
      };
    } catch(err) {
      if(!IS_MOV_SUPPORTED) throw err;
    }
  }

  const objectURLs = new ObjectURLScope();
  const objectUrl = objectURLs.create(file);
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;
  try {
    await onMediaLoad(video);
    return {
      file,
      duration: Math.floor(video.duration),
      height: video.videoHeight,
      width: video.videoWidth
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    objectURLs.dispose();
  }
}

async function prepareAudio(file: File): Promise<SendFileDetails> {
  const objectURLs = new ObjectURLScope();
  const objectUrl = objectURLs.create(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = objectUrl;
  try {
    await new Promise<void>((resolve) => {
      if(audio.readyState >= audio.HAVE_METADATA) {
        resolve();
        return;
      }
      const finish = () => {
        audio.removeEventListener('loadedmetadata', finish);
        audio.removeEventListener('error', finish);
        resolve();
      };
      audio.addEventListener('loadedmetadata', finish, {once: true});
      // A browser may not decode every audio format accepted by Telegram.
      // Upload it anyway; duration is optional in that case.
      audio.addEventListener('error', finish, {once: true});
    });
    return {
      file,
      duration: Number.isFinite(audio.duration) ?
        Math.max(0, Math.floor(audio.duration)) :
        0
    };
  } finally {
    audio.removeAttribute('src');
    audio.load();
    objectURLs.dispose();
  }
}

async function prepareImage(file: File): Promise<SendFileDetails> {
  const objectURLs = new ObjectURLScope();
  const objectUrl = objectURLs.create(file);
  const image = new Image();
  try {
    await renderImageFromUrlPromise(image, objectUrl);
    const mimeType = getFileMimeType(file) as MTMimeType;
    const preparation = photoUploadPreparation(image.naturalWidth, image.naturalHeight, mimeType, file.size, true);
    let uploadFile: File | Blob = file;
    let width = image.naturalWidth;
    let height = image.naturalHeight;

    if(preparation) {
      const scaled = await scaleMediaElement({
        ...preparation,
        media: image,
        mimeType: 'image/jpeg'
      });
      uploadFile = scaled.blob;
      width = scaled.size.width;
      height = scaled.size.height;
    }

    return {
      file: uploadFile,
      height,
      width
    };
  } finally {
    objectURLs.dispose();
  }
}

export default async function prepareRichMediaUpload(
  inputFile: File
): Promise<SendFileDetails> {
  const file = normalizeRichMessageMediaFile(inputFile);
  const mimeType = getFileMimeType(file);
  if(getRichMessageMediaFileType(mimeType, file.name) === 'audio') {
    return prepareAudio(file);
  }
  if(!isVisualRichMessageMimeType(mimeType)) {
    throw new Error('RICH_MESSAGE_MEDIA_TYPE_UNSUPPORTED');
  }

  if(mimeType === 'image/gif') return prepareGif(file);
  if(mimeType.startsWith('video/')) return prepareVideo(file);
  return prepareImage(file);
}
