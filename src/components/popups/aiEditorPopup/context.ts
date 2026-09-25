import {RichMessage, TextWithEntities} from '@layer';
import {LangPackKey} from '@lib/langPack';
import {Accessor, createContext, createSignal, Setter, useContext} from 'solid-js';
import type {AiEditorActionResult, AiEditorPopupProps} from '@components/popups/aiEditorPopup/aiEditorPopup';

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
};

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
    resultRichMessageSignal: createSignal<RichMessage>()
  };
}

export const AiEditorPopupContext = createContext<AiEditorPopupContextValue>();

export const useAiEditorPopupContext = () => {
  return useContext(AiEditorPopupContext);
};
