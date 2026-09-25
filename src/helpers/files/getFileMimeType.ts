import {EXTENSION_MIME_TYPE_MAP, MIME_TYPE_ALIASES} from '@environment/mimeTypeMap';

type FileWithMimeType = Blob | {
  mime_type?: string,
  file_name?: string
};

export default function getFileMimeType(file: FileWithMimeType): string {
  const rawMimeType = 'mime_type' in file ? file.mime_type : (file as Blob).type;
  const mimeType = (rawMimeType || '').toLowerCase();
  const normalizedMimeType = MIME_TYPE_ALIASES[mimeType] || mimeType;

  const fileName = 'name' in file ? (file as File).name : (file as {file_name?: string}).file_name;
  const extension = fileName?.split('.').pop()?.toLowerCase() as MTFileExtension;
  const inferredMimeType = EXTENSION_MIME_TYPE_MAP[extension];
  // Ogg is a container for both audio and video. A generic container MIME alone
  // must not relabel video as audio; use its known extension when available.
  if(mimeType === 'application/ogg' || mimeType === 'application/x-ogg') {
    return inferredMimeType === 'audio/ogg' || inferredMimeType === 'video/ogg' ? inferredMimeType : mimeType;
  }
  if(normalizedMimeType && normalizedMimeType !== 'application/octet-stream') {
    return normalizedMimeType;
  }
  return inferredMimeType || normalizedMimeType;
}

export function normalizeFileMimeType(file: File): File {
  const mimeType = getFileMimeType(file);
  if(!mimeType || mimeType === file.type) {
    return file;
  }

  return new File([file], file.name, {
    type: mimeType,
    lastModified: file.lastModified
  });
}
