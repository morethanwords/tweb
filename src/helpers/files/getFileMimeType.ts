import {EXTENSION_MIME_TYPE_MAP, MIME_TYPE_ALIASES} from '@environment/mimeTypeMap';

type FileWithMimeType = Blob | {
  mime_type?: string,
  file_name?: string
};

export default function getFileMimeType(file: FileWithMimeType): string {
  const rawMimeType = 'mime_type' in file ? file.mime_type : (file as Blob).type;
  const mimeType = (rawMimeType || '').toLowerCase();
  const normalizedMimeType = MIME_TYPE_ALIASES[mimeType] || mimeType;

  if(normalizedMimeType && normalizedMimeType !== 'application/octet-stream') {
    return normalizedMimeType;
  }

  const fileName = 'name' in file ? (file as File).name : (file as {file_name?: string}).file_name;
  const extension = fileName?.split('.').pop()?.toLowerCase() as MTFileExtension;
  return EXTENSION_MIME_TYPE_MAP[extension] || normalizedMimeType;
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
