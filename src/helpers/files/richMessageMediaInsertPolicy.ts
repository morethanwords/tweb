import {
  isRichMessageAudioMimeType,
  RICH_MESSAGE_AUDIO_FILE_EXTENSIONS_SUPPORTED
} from '@environment/audioMimeTypeSupport';
import IMAGE_MIME_TYPES_SUPPORTED from '@environment/imageMimeTypesSupport';
import {MIME_TYPE_ALIASES} from '@environment/mimeTypeMap';
import {isVideoMimeType} from '@environment/videoMimeTypesSupport';
import type {ChatRights} from '@appManagers/appChatsManager';
import {MESSAGES_ALBUM_MAX_SIZE} from '@appManagers/constants';
import getFileMimeType, {normalizeFileMimeType} from '@helpers/files/getFileMimeType';

export type RichMessageMediaFileType = 'audio' | 'document' | 'photo' | 'video';
const RICH_MESSAGE_AUDIO_FILE_EXTENSIONS = new Set<string>(
  RICH_MESSAGE_AUDIO_FILE_EXTENSIONS_SUPPORTED
);

export function canAddMultipleRichMessageMedia(allowMultiple?: boolean) {
  return allowMultiple !== false;
}

function normalizedMimeType(mimeType: string) {
  const lowerCaseMimeType = mimeType.toLowerCase();
  return MIME_TYPE_ALIASES[lowerCaseMimeType as keyof typeof MIME_TYPE_ALIASES] ||
    lowerCaseMimeType;
}

function fileExtension(fileName?: string) {
  const extension = fileName?.match(/(\.[^.]+)$/)?.[1]?.toLowerCase();
  return extension && RICH_MESSAGE_AUDIO_FILE_EXTENSIONS.has(extension) ?
    extension :
    undefined;
}

export function isVisualRichMessageMimeType(mimeType: string) {
  mimeType = normalizedMimeType(mimeType);
  return (
    IMAGE_MIME_TYPES_SUPPORTED.has(mimeType) ||
    isVideoMimeType(mimeType) ||
    mimeType === 'video/quicktime'
  );
}

export function isAudioRichMessageMimeType(
  mimeType: string,
  fileName?: string
) {
  mimeType = normalizedMimeType(mimeType);
  return (
    isRichMessageAudioMimeType(mimeType) ||
    !mimeType.startsWith('video/') && !mimeType.startsWith('image/') && !!fileExtension(fileName)
  );
}

export function normalizeRichMessageMediaFile(inputFile: File) {
  const file = normalizeFileMimeType(inputFile);
  const mimeType = getFileMimeType(file);
  if(
    isRichMessageAudioMimeType(mimeType) ||
    isVisualRichMessageMimeType(mimeType) || mimeType.startsWith('video/') || mimeType.startsWith('image/') ||
    !fileExtension(file.name)
  ) {
    return file;
  }

  const inferredMimeType = getFileMimeType({
    file_name: file.name,
    mime_type: ''
  });
  if(!isRichMessageAudioMimeType(inferredMimeType)) {
    return file;
  }

  return new File([file], file.name, {
    lastModified: file.lastModified,
    type: inferredMimeType
  });
}

/**
 * What a file becomes in a rich message, as the other clients decide it: music is an audio, a photo
 * or a video is media unless it is attached as a file, and anything else is a file block.
 */
export function getRichMessageMediaFileType(
  mimeType: string,
  fileName?: string,
  asFile?: boolean
): RichMessageMediaFileType {
  mimeType = normalizedMimeType(mimeType);
  if(isAudioRichMessageMimeType(mimeType, fileName)) return 'audio';
  if(asFile) return 'document';
  if(mimeType === 'image/gif' || isVideoMimeType(mimeType) ||
    mimeType === 'video/quicktime') {
    return 'video';
  }
  if(IMAGE_MIME_TYPES_SUPPORTED.has(mimeType)) return 'photo';
  return 'document';
}

export function getRichMessageMediaRequiredRight(
  mimeType: string,
  fileName?: string,
  asFile?: boolean
): ChatRights {
  switch(getRichMessageMediaFileType(mimeType, fileName, asFile)) {
    case 'audio': return 'send_audios';
    case 'photo': return 'send_photos';
    case 'video': return normalizedMimeType(mimeType) === 'image/gif' ? 'send_gifs' : 'send_videos';
    default: return 'send_docs';
  }
}

export function groupRichMessageMediaEntries<T extends {
  type: RichMessageMediaFileType
}>(entries: T[]) {
  const groups: T[][] = [];
  // photos and videos make an album; a file and an audio stand alone
  const visual = ({type}: T) => type === 'photo' || type === 'video';
  entries.forEach((entry) => {
    const previous = groups[groups.length - 1];
    if(
      visual(entry) &&
      previous &&
      previous.length < MESSAGES_ALBUM_MAX_SIZE &&
      previous.every(visual)
    ) {
      previous.push(entry);
    } else {
      groups.push([entry]);
    }
  });
  return groups;
}
