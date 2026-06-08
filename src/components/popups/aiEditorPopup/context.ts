import {Accessor, createContext, Setter, useContext} from 'solid-js';
import {AiEditorPopupProps} from './aiEditorPopup';
import {TextWithEntities} from '@layer';

export type AiEditorPopupContextValue = AiEditorPopupProps & {
  resultTextSignal: [Accessor<TextWithEntities>, Setter<TextWithEntities>];
};

export const AiEditorPopupContext = createContext<AiEditorPopupContextValue>();

export const useAiEditorPopupContext = () => {
  return useContext(AiEditorPopupContext);
};
