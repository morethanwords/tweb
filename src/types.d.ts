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
  
  thumb?: MTPhotoSize,
  type?: string,
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

  animated?: boolean
};

export type MTPhotoSize = {
  _: string,
  w?: number,
  h?: number,
  size?: number,
  type?: string, // i, m, x, y, w by asc
  location?: any,
  bytes?: Uint8Array // if type == 'i'
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