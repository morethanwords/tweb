import {OverlayedIcon} from '@components/icon';

export default function createAiEditorIcon() {
  return OverlayedIcon([
    'ai_letters_plain',
    {icon: 'ai_star1', className: 'chat-input-ai-editor-button__star-1'},
    {icon: 'ai_star2', className: 'chat-input-ai-editor-button__star-2'}
  ], 'chat-input-ai-editor-button__icon');
}
