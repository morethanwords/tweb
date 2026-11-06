import Button from '@components/buttonTsx';
import I18n from '@lib/langPack';
import createAiEditorIcon from '@components/chat/createAiEditorIcon';
import type InputField from '@components/inputField';
import {observeResize} from '@components/resizeObserver';
import classNames from '@helpers/string/classNames';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {resolveFirst} from '@solid-primitives/refs';
import {LocalTextWithEntities} from '@types';
import {Accessor, createEffect, createMemo, createSignal, onCleanup} from 'solid-js';
import type {AiEditorContext} from '@components/richMessageInput/aiContext';
import namedPromises from '@helpers/namedPromises';
import {
  richMessageToTiptap,
  tiptapToRichMessage
} from '@components/chat/inputEditor/richMessage';
import {getChatInputEditor} from '@components/chat/inputEditor/registry';
import captureInputContent from '@components/chat/inputEditor/captureInputContent';
import type {AiEditorSendOptions} from '@components/popups/aiEditorPopup/aiEditorPopup';
import {flattenRichMessageSummary} from '@lib/richMessage';
import shouldOpenCreateWithAi from '@components/chat/inputState/shouldOpenCreateWithAi';
import getAiEditorRequest from '@components/richMessageInput/aiRequest';

export const defaultShouldShowFromHeight = 72;

type UseAiEditorButtonArgs = {
  context: AiEditorContext;
  class?: string;
  container: Accessor<HTMLDivElement>;
  appendTo: () => HTMLDivElement;
  inputField: () => InputField;
  onApply?: (text: LocalTextWithEntities) => void;
  canSend: boolean;
  shouldShowFromHeight?: Accessor<number>;
  forceHidden?: Accessor<boolean>;
};

export function useAiEditorButton({
  context,
  inputField,
  onApply,
  class: className,
  container,
  appendTo,
  canSend,
  shouldShowFromHeight = () => defaultShouldShowFromHeight,
  forceHidden = () => false
}: UseAiEditorButtonArgs) {
  const [containerHeight, setContainerHeight] = createSignal(0);
  const hasMinimumHeight = createMemo(() => containerHeight() >= shouldShowFromHeight());
  const canShowButton = createMemo(() => hasMinimumHeight() && !forceHidden());

  createEffect(() => {
    if(!container()) return;

    const unobserve = observeResize(container(), (entry) => {
      setContainerHeight(entry.contentRect.height);
    });

    onCleanup(() => unobserve());
  });

  createEffect(() => {
    const target = appendTo();
    const field = inputField();
    if(!target || !field) return;

    // * it stays while the field is too short for it, and comes and goes where it stands
    const button = createAiEditorButton({
      context,
      appendTo: target,
      inputField: field,
      onApply,
      class: className,
      canSend
    });
    createEffect(() => {
      const visible = canShowButton();
      target.classList.toggle('has-ai-editor-button', visible);
      button.classList.toggle('is-shown', visible);
    });
    onCleanup(() => target.classList.remove('has-ai-editor-button'));
  });
}

type CreateAiEditorButtonArgs = {
  context: AiEditorContext;
  appendTo: HTMLDivElement;
  inputField: InputField;
  onApply: (text: LocalTextWithEntities) => void;
  canSend: boolean;
  class?: string;
};

const createAiEditorButton = ({
  context,
  inputField,
  appendTo,
  onApply,
  class: className,
  canSend
}: CreateAiEditorButtonArgs) => {
  const {HotReloadGuard, rootScope, toastNew} = useHotReloadGuard();

  const icon = createAiEditorIcon();

  const getInitialTones = async() => {
    const ackedTones = await rootScope.managers.acknowledged.aiTonesManager.getTones();
    return ackedTones.cached ? ackedTones.result : undefined;
  };

  const button = Button({
    class: classNames('chat-input-ai-editor-button', className, 'btn-icon'),
    'aria-label': I18n.format('Chat.Input.Editor.Toolbar.AI', true),
    children: icon,
    onClick: async() => {
      const editor = getChatInputEditor(inputField.input);
      const canHoldRichMessage = !!editor && !editor.plainOnly;
      const session = context.capture();
      const {peerId} = session;
      const contentIsCurrent = captureInputContent(inputField.input, editor);
      const isCurrent = () => session.isCurrent() && inputField.input.isConnected &&
        contentIsCurrent(getChatInputEditor(inputField.input));
      const canApplyResult = () => {
        if(isCurrent()) return true;
        toastNew({langPackKey: 'AiEditor.MessageChanged'});
        return false;
      };
      const editorSelection = editor?.captureSelection();
      const hasEditorSelection = !!editorSelection &&
        editorSelection.type !== 'cell' &&
        editorSelection.from !== editorSelection.to;
      const shouldCreateRichMessage = canHoldRichMessage && shouldOpenCreateWithAi(
        !!inputField.input.closest('.is-message-input-expanded'),
        editorSelection
      );
      const applyAsSeparateHistoryEvent = (apply: () => boolean | void) => {
        if(!canApplyResult()) return false;
        editor?.separateHistory();
        try {
          return apply() !== false;
        } finally {
          editor?.separateHistory();
        }
      };

      if(shouldCreateRichMessage) {
        const {openCreateWithAiPopup} = await import(
          '@components/popups/aiEditorPopup/createWithAiPopup'
        );
        if(!isCurrent()) return;
        openCreateWithAiPopup({
          peerId,
          onApply: (text) => {
            return applyAsSeparateHistoryEvent(() => {
              return editor.replaceDocumentRange(
                editorSelection.from,
                editorSelection.to,
                text.text,
                text.entities
              );
            });
          },
          onApplyRichMessage: (richMessage) => {
            return applyAsSeparateHistoryEvent(() => {
              return editor.replaceDocumentRangeWithRichMessage(
                editorSelection.from,
                editorSelection.to,
                richMessage
              );
            });
          }
        }, HotReloadGuard);
        return;
      }

      // Rich content is rewritten by the structured compose endpoint, preserving blocks and marks.
      // Create with AI is handled separately above because it has no source.
      const {text: popupText, richMessage: editorRichMessage} = getAiEditorRequest(
        inputField.input,
        editor,
        hasEditorSelection
      );

      const {module: {openAiEditorPopup}, initialTones} = await namedPromises({
        module: import('@components/popups/aiEditorPopup'),
        initialTones: getInitialTones()
      });
      if(!isCurrent()) return;

      const canSendResult = canSend && !!session.send;
      // * a paid chat keeps one too: the popup cannot send there, but the composer's own send pays as it goes
      const canKeepSendStyle = canSend && !!session.saveSendStyle;
      const sendResult = async(
        text: LocalTextWithEntities,
        options?: AiEditorSendOptions,
        richMessage?: ReturnType<typeof tiptapToRichMessage>
      ) => {
        if(!canApplyResult()) return false;
        if(!await session.send(text, options, richMessage)) return false;
        if(isCurrent()) session.clear();
        return true;
      };

      openAiEditorPopup({
        peerId,
        text: popupText,
        richMessage: editorRichMessage?.input,
        onApply: (text) => {
          return applyAsSeparateHistoryEvent(() => {
            if(hasEditorSelection) {
              return editor.replaceDocumentRange(
                editorSelection.from,
                editorSelection.to,
                text.text,
                text.entities
              );
            }
            if(editor) return editor.replaceAllText(text.text, text.entities);
            onApply?.(text);
          });
        },
        onApplyRichMessage: (richMessage) => {
          return applyAsSeparateHistoryEvent(() => {
            if(hasEditorSelection) {
              return editor.replaceDocumentRangeWithRichMessage(
                editorSelection.from,
                editorSelection.to,
                richMessage
              );
            }
            if(editor) return editor.replaceAllRichMessage(richMessage);
            onApply?.(flattenRichMessageSummary(richMessage));
          });
        },
        canSendWhenOnline: session.canSendWhenOnline,
        isScheduled: session.isScheduled,
        // * only the composer's own button: a caption is sent by its popup, never through the chat's field
        savedSendStyle: canKeepSendStyle ? session.sendStyle : undefined,
        // * of the chat, not of the text: the text it is made on is the one each message has as it goes
        onSaveSendStyle: canKeepSendStyle ? session.saveSendStyle : undefined,
        onSend: canSendResult ? sendResult : undefined,
        onSendRichMessage: canSendResult ? (richMessage, options) => {
          if(!canApplyResult()) return false;
          const payload = tiptapToRichMessage(richMessageToTiptap(richMessage));
          return sendResult(flattenRichMessageSummary(payload.output), options, payload);
        } : undefined,
        initialTones
      }, HotReloadGuard);
    }
  });

  const child = resolveFirst(() => button);
  const element = child() as HTMLElement;

  appendTo.append(element);

  onCleanup(() => {
    element.remove();
  });

  return element;
};
