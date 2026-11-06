import {RichMessage, TextWithEntities} from '@layer';
import {LangPackKey} from '@lib/langPack';
import {Accessor, createComputed, createContext, createSignal, onCleanup, Setter, useContext} from 'solid-js';
import type {AiEditorActionResult, AiEditorPopupProps} from '@components/popups/aiEditorPopup/aiEditorPopup';
import type {ComposeMessageWithAiArgs} from '@appManagers/aiTonesManager';
import type {AiSendStyle} from '@components/chat/aiSendStyles';

export type AiEditorPrimaryAction = {
  disabled: Accessor<boolean>;
  langKey: LangPackKey;
  onClick: () => void;
};

export type AiEditorPopupContextValue = AiEditorPopupProps & {
  actionPending: Accessor<boolean>;
  promptTextSignal: [Accessor<string>, Setter<string>];
  primaryActionSignal: [Accessor<AiEditorPrimaryAction>, Setter<AiEditorPrimaryAction>];
  resultTextSignal: [Accessor<TextWithEntities>, Setter<TextWithEntities>];
  resultRichMessageSignal: [Accessor<RichMessage>, Setter<RichMessage>];
  /** What the editor's tab asks for now, its result shown or not: what a chat keeps to be made on sending */
  requestSignal: [Accessor<ComposeMessageWithAiArgs>, Setter<ComposeMessageWithAiArgs>];
  /** The saved request is yet to be shown by the tab it is of (`takeSavedSendStyle`) */
  showSavedSendStyle: boolean;
};

/** What a tab asks for, for as long as it is shown */
export function useAiEditorRequest(context: AiEditorPopupContextValue, args: () => ComposeMessageWithAiArgs) {
  const [, setRequest] = context.requestSignal;
  createComputed(() => {
    setRequest(args());
    onCleanup(() => setRequest());
  });
}

/** The request saved for the chat, to the tab it is of when it asks first: the popup opens showing it made */
export function takeSavedSendStyle(context: AiEditorPopupContextValue, isOfTab: (style: AiSendStyle) => boolean) {
  const style = context.savedSendStyle;
  if(!style || !context.showSavedSendStyle || !isOfTab(style)) return;
  context.showSavedSendStyle = false;
  return style;
}

export function createAiEditorPopupContextValue(
  props: AiEditorPopupProps,
  close: VoidFunction,
  lifecycle: {isActive: () => boolean, onError: (error: unknown) => void}
): AiEditorPopupContextValue {
  const [actionPending, setActionPending] = createSignal(false);
  const wrapAction = <T extends unknown[]>(action: (...args: T) => AiEditorActionResult) => action && (async(...args: T) => {
    if(!lifecycle.isActive() || actionPending()) return false;
    setActionPending(true);
    try {
      const applied = await action(...args);
      if(!lifecycle.isActive()) return false;
      if(applied === false) return false;
      close();
      return true;
    } catch(error) {
      if(lifecycle.isActive()) lifecycle.onError(error);
      return false;
    } finally {
      setActionPending(false);
    }
  });

  return {
    ...props,
    actionPending,
    /** Will get overriden if undefined once the tones are fetched */
    initialTones: props.initialTones,
    onApply: wrapAction(props.onApply),
    onApplyRichMessage: wrapAction(props.onApplyRichMessage),
    onSend: wrapAction(props.onSend),
    onSendRichMessage: wrapAction(props.onSendRichMessage),
    promptTextSignal: createSignal(''),
    primaryActionSignal: createSignal<AiEditorPrimaryAction>(),
    resultTextSignal: createSignal<TextWithEntities>(),
    resultRichMessageSignal: createSignal<RichMessage>(),
    requestSignal: createSignal<ComposeMessageWithAiArgs>(),
    showSavedSendStyle: true
  };
}

export const AiEditorPopupContext = createContext<AiEditorPopupContextValue>();

export const useAiEditorPopupContext = () => {
  return useContext(AiEditorPopupContext);
};
