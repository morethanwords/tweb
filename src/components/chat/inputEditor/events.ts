import type {ChatInputRichMediaUploadItem} from '@components/chat/inputEditor/types';

export const CHAT_INPUT_EDITOR_SELECTION_UPDATE_EVENT =
  'chat-input-editor-selection-update';

export const CHAT_INPUT_RICH_MEDIA_UPLOAD_UPDATE_EVENT =
  'chat-input-rich-media-upload-update';

export const CHAT_INPUT_MATH_MODE_REQUEST_EVENT =
  'chat-input-math-mode-request';

export type ChatInputMathModeRequestEvent = CustomEvent<{
  accepted: boolean,
  apply: boolean,
  inline: boolean,
  source: string
}>;

export type ChatInputRichMediaUploadUpdateEvent = CustomEvent<{
  items: ChatInputRichMediaUploadItem[],
  uploadId: string
}>;
