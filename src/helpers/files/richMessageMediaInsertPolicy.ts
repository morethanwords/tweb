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

export type RichMessageMediaFileType = 'audio' | 'photo' | 'video';
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

export function getRichMessageMediaFileType(
  mimeType: string,
  fileName?: string
): RichMessageMediaFileType | undefined {
  mimeType = normalizedMimeType(mimeType);
  if(isRichMessageAudioMimeType(mimeType)) return 'audio';
  if(mimeType === 'image/gif' || isVideoMimeType(mimeType) ||
    mimeType === 'video/quicktime') {
    return 'video';
  }
  if(IMAGE_MIME_TYPES_SUPPORTED.has(mimeType)) return 'photo';
  if(isAudioRichMessageMimeType(mimeType, fileName)) return 'audio';
}

export function isRichMessageMediaMimeType(
  mimeType: string,
  fileName?: string
) {
  return getRichMessageMediaFileType(mimeType, fileName) !== undefined;
}

export function getRichMessageMediaRequiredRight(
  mimeType: string,
  fileName?: string
): ChatRights | undefined {
  const type = getRichMessageMediaFileType(mimeType, fileName);
  if(type === 'audio') return 'send_audios';
  if(type === 'photo') return 'send_photos';
  if(type === 'video') {
    return normalizedMimeType(mimeType) === 'image/gif' ?
      'send_gifs' :
      'send_videos';
  }
}

export function groupRichMessageMediaEntries<T extends {
  type: RichMessageMediaFileType
}>(entries: T[]) {
  const groups: T[][] = [];
  entries.forEach((entry) => {
    const previous = groups[groups.length - 1];
    if(
      entry.type !== 'audio' &&
      previous &&
      previous.length < MESSAGES_ALBUM_MAX_SIZE &&
      previous.every(({type}) => type !== 'audio')
    ) {
      previous.push(entry);
    } else {
      groups.push([entry]);
    }
  });
  return groups;
}
