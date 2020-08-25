export type MTDocument = {
  _: 'document' | 'documentEmpty',
  pFlags: any,
  flags: number,
  id: string,
  access_hash: string,
  file_reference: Uint8Array | number[],
  date: number,
  mime_type: string,
  size: number,
  thumbs: MTPhotoSize[],
  dc_id: number,
  attributes: any[],
  
  type?: 'gif' | 'sticker' | 'audio' | 'voice' | 'video' | 'round' | 'photo',
  h?: number,
  w?: number,
  file_name?: string,
  file?: File,
  duration?: number,
  downloaded?: boolean,
  url?: string,

  audioTitle?: string,
  audioPerformer?: string,

  sticker?: number,
  stickerEmoji?: string,
  stickerEmojiRaw?: string,
  stickerSetInput?: any,
  stickerThumbConverted?: true,

  animated?: boolean,
  supportsStreaming?: boolean
};

export type MTPhotoSize = {
  _: string,
  w?: number,
  h?: number,
  size?: number,
  type?: string, // i, m, x, y, w by asc
  location?: FileLocation,
  bytes?: Uint8Array, // if type == 'i',

  url?: string
};

export type InvokeApiOptions = Partial<{
  dcID: number,
  timeout: number,
  noErrorBox: boolean,
  fileUpload: boolean,
  ignoreErrors: boolean,
  fileDownload: boolean,
  createNetworker: boolean,
  singleInRequest: boolean,
  startMaxLength: number,

  afterMessageID: string,
  resultType: boolean,
  
  waitTime: number,
  stopTime: number,
  rawError: any
}>;

type Algo = {
  salt1: Uint8Array,
  salt2: Uint8Array,
  p: Uint8Array,
  g: number
};

export type AccountPassword = {
  _?: 'accont.password',
  flags?: number,
  pFlags?: Partial<{
    has_recovery: true,
    has_secure_values: true,
    has_password: true
  }>,
  current_algo: Algo,
  new_algo?: Algo,
  new_secure_algo?: Algo,
  hint?: string,
  email_unconfirmed_pattern?: string,
  srp_B?: Uint8Array,
  srp_id?: string,
  secure_random: Uint8Array,
};

export type storageFileType = 'storage.fileUnknown' | 'storage.filePartial' | 'storage.fileJpeg' | 
  'storage.fileGif' | 'storage.filePng' | 'storage.filePdf' | 'storage.fileMp3' | 'storage.fileMov' | 
  'storage.fileMp4' | 'storage.fileWebp';

export type UploadFile = {
  _: 'upload.file',
  type: storageFileType,
  mtime: number,
  bytes: Uint8Array
};

export type FileLocation = {
  _: 'fileLocationToBeDeprecated',
  volume_id: string,
  local_id: number
};

export type inputFileLocation = {
  _: 'inputFileLocation',
  volume_id: string,
  local_id: number,
  secret: string,
  file_reference: Uint8Array | number[]
};

export type inputDocumentFileLocation = {
  _: 'inputDocumentFileLocation',
  id: string,
  access_hash: string,
  file_reference: Uint8Array | number[],
  thumb_size: string
};

export type inputPhotoFileLocation = Omit<inputDocumentFileLocation, '_'> & {_: 'inputPhotoFileLocation'};

export type inputPeerPhotoFileLocation = {
  _: 'inputPeerPhotoFileLocation',
  flags: number,
  big?: true,
  peer: any,
  volume_id: string,
  local_id: number
};

export type inputStickerSetThumb = {
  _: 'inputStickerSetThumb',
  stickerset: any,
  volume_id: string,
  local_id: number
};

export type InputFileLocation = inputFileLocation | inputDocumentFileLocation | inputPhotoFileLocation | inputPeerPhotoFileLocation | inputStickerSetThumb;