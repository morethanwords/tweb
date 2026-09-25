import {usePopupContext} from '@components/popups/indexTsx';
import type {AiEditorPopupProps} from '@components/popups/aiEditorPopup/aiEditorPopup';
import {AiEditorPopupContext, createAiEditorPopupContextValue} from '@components/popups/aiEditorPopup/context';
import {useHotReloadGuard} from '@lib/solidjs/hotReloadGuard';
import {type ParentProps, splitProps} from 'solid-js';

export default function AiEditorPopupProvider(props: ParentProps<AiEditorPopupProps>) {
  const [local, contextProps] = splitProps(props, ['children']);
  const popup = usePopupContext();
  const {toastNew} = useHotReloadGuard();
  const middleware = popup.middlewareHelper.get();
  const value = createAiEditorPopupContextValue(contextProps, popup.hide, {
    isActive: () => !popup.destroyed && middleware(),
    onError: () => toastNew({langPackKey: 'Error.AnError'})
  });
  return <AiEditorPopupContext.Provider value={value}>{local.children}</AiEditorPopupContext.Provider>;
}
