import {TextWithEntities} from '@layer';
import {createContext, useContext} from 'solid-js';

export interface AiEditorPopupContextValue {
  text: TextWithEntities.textWithEntities;
  peerId: PeerId;
};

export const AiEditorPopupContext = createContext<AiEditorPopupContextValue>();

export const useAiEditorPopupContext = () => {
  return useContext(AiEditorPopupContext);
};
