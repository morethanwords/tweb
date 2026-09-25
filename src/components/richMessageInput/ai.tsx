import Button from '@components/buttonTsx';
import I18n from '@lib/langPack';
import createAiEditorIcon from '@components/chat/createAiEditorIcon';
import type InputField from '@components/inputField';
import {observeResize} from '@components/resizeObserver';
import getRichValueWithCaret from '@helpers/dom/getRichValueWithCaret';
import track from '@helpers/solid/track';
import classNames from '@helpers/string/classNames';
import trimRichText from '@lib/richTextProcessor/trimRichText';
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
    track(canShowButton); // appendTo might not be reactive
    const target = appendTo();
    const field = inputField();
    const available = !!target && !!field;
    const visible = available && canShowButton();
    target?.classList.toggle('has-ai-editor-button', visible);
    onCleanup(() => target?.classList.remove('has-ai-editor-button'));
    if(!target || !field) return;

    createAiEditorButton({
      context,
      appendTo: target,
      inputField: field,
      onApply,
      class: className,
      canSend,
      hidden: !visible
    });
  });
}

type CreateAiEditorButtonArgs = {
  context: AiEditorContext;
  appendTo: HTMLDivElement;
  inputField: InputField;
  onApply: (text: LocalTextWithEntities) => void;
  canSend: boolean;
  class?: string;
  hidden?: boolean;
};

const createAiEditorButton = ({
  context,
  inputField,
  appendTo,
  onApply,
  class: className,
  canSend,
  hidden
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
      const shouldCreateRichMessage = !!editor && shouldOpenCreateWithAi(
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

      const {value, entities} = getRichValueWithCaret(inputField.input, true, false);
      const selectedRichMessage = hasEditorSelection ? editor.getSelectedRichMessage() : undefined;
      // Rewriting rich-editor content always uses the structured compose endpoint, preserving
      // blocks and marks. Create with AI is handled separately above because it has no source.
      const editorRichMessage = selectedRichMessage || editor?.getRichMessage();
      const popupText = editorRichMessage ?
        flattenRichMessageSummary(editorRichMessage.output, 0) :
        {
          _: 'textWithEntities' as const,
          ...trimRichText(value, entities)
        };

      const {module: {openAiEditorPopup}, initialTones} = await namedPromises({
        module: import('@components/popups/aiEditorPopup'),
        initialTones: getInitialTones()
      });
      if(!isCurrent()) return;

      const canSendResult = canSend && !!session.send;
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
            onApply?.(flattenRichMessageSummary(richMessage, 0));
          });
        },
        canSendWhenOnline: session.canSendWhenOnline,
        isScheduled: session.isScheduled,
        onSend: canSendResult ? sendResult : undefined,
        onSendRichMessage: canSendResult ? (richMessage, options) => {
          if(!canApplyResult()) return false;
          const payload = tiptapToRichMessage(richMessageToTiptap(richMessage));
          return sendResult(flattenRichMessageSummary(payload.output, 0), options, payload);
        } : undefined,
        initialTones
      }, HotReloadGuard);
    }
  });

  const child = resolveFirst(() => button);
  const element = child() as HTMLElement;

  element.hidden = !!hidden;
  appendTo.append(element);

  onCleanup(() => {
    element.remove();
  });
};
