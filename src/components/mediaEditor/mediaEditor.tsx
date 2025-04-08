import {createEffect, onCleanup, onMount} from 'solid-js';
import {render} from 'solid-js/web';

import {doubleRaf} from '../../helpers/schedulers';
import type SolidJSHotReloadGuardProvider from '../../lib/solidjs/hotReloadGuardProvider';
import {AppManagers} from '../../lib/appManagers/managers';
import {i18n} from '../../lib/langPack';

import appNavigationController, {NavigationItem} from '../appNavigationController';
import confirmationPopup from '../confirmationPopup';

import {delay} from './utils';
import MediaEditorContext, {createStandaloneContextValue, StandaloneContext} from './context';
import MainCanvas from './canvas/mainCanvas';
import FinishButton from './finishButton';
import {withCurrentOwner} from './utils';
import {createFinalResult, MediaEditorFinalResult} from './finalRender/createFinalResult';
import Toolbar from './toolbar';

export type MediaEditorProps = {
  onClose: (hasGif: boolean) => void;
  managers: AppManagers;
  onEditFinish: (result: MediaEditorFinalResult) => void;
  onCanvasReady: (canvas: HTMLCanvasElement) => Promise<void>;
  onImageRendered: () => void;
  imageURL: string;
  standaloneContext?: StandaloneContext;
};

export function MediaEditor(props: MediaEditorProps) {
  const standaloneContext = props.standaloneContext || createStandaloneContextValue(props);

  const [, setIsReady] = standaloneContext.value.isReady;
  const [, setRenderingPayload] = standaloneContext.value.renderingPayload;
  const [, setCanvasSize] = standaloneContext.value.canvasSize;
  const [, setCurretTab] = standaloneContext.value.currentTab;
  setIsReady(false);
  setRenderingPayload();
  setCanvasSize();
  setCurretTab('adjustments');

  const [imageCanvas] = standaloneContext.value.imageCanvas;
  const [renderingPayload] = standaloneContext.value.renderingPayload;

  let overlay: HTMLDivElement;

  onMount(() => {
    (async() => {
      overlay.classList.add('media-editor__overlay--hidden');
      await doubleRaf();
      overlay.classList.remove('media-editor__overlay--hidden');
    })();

    const navigationItem: NavigationItem = {
      type: 'popup',
      onPop: () => handleClose()
    };
    appNavigationController.pushItem(navigationItem);

    overlay.focus();

    onCleanup(() => {
      appNavigationController.removeItem(navigationItem);
    });
  });

  createEffect(() => {
    if(!imageCanvas()) return;
    props.onCanvasReady(imageCanvas()).then(() => setIsReady(true));
  });

  createEffect(() => {
    if(!renderingPayload()) return;
    props.onImageRendered();
  });

  function handleClose(finished = false, hasGif = false) {
    async function performClose(dispose = false) {
      overlay.classList.add('media-editor__overlay--hidden');
      await delay(200);
      props.onClose(hasGif);
      if(dispose) standaloneContext.dispose();
    }

    if(finished || props.standaloneContext) {
      performClose();
      return;
    }
    if(!standaloneContext.value.history[0]().length) {
      performClose(true);
      return;
    }
    confirmationPopup({
      title: i18n('MediaEditor.DiscardChanges'),
      description: i18n('MediaEditor.DiscardWarning'),
      button: {
        text: i18n('Discard')
      }
    })
    .then(() => {
      performClose(true);
    })
    .catch(() => {});
    return false;
  }

  let isFinishing = false;

  return (
    <MediaEditorContext.Provider value={standaloneContext.value}>
      <div ref={overlay} class="media-editor__overlay night">
        <div class="media-editor__container">
          {(() => {
            // Need to be inside context
            const handleFinish = withCurrentOwner(async() => {
              if(isFinishing) return;
              isFinishing = true;

              const result = await createFinalResult(standaloneContext).finally(() => (isFinishing = false));

              props.onEditFinish(result);
              handleClose(true, result.isGif);
            });

            return (
              <>
                <MainCanvas />
                <Toolbar onClose={handleClose} onFinish={handleFinish} />
                <FinishButton onClick={handleFinish} />
              </>
            );
          })()}
        </div>
      </div>
    </MediaEditorContext.Provider>
  );
}

export function openMediaEditor(props: MediaEditorProps, HotReloadGuardProvider: typeof SolidJSHotReloadGuardProvider) {
  const element = document.createElement('div');
  document.body.append(element);

  const dispose = render(() => (
    <HotReloadGuardProvider>
      <MediaEditor {...props} onClose={onClose} />
    </HotReloadGuardProvider>
  ), element);

  function onClose(hasGif: boolean) {
    props.onClose(hasGif);
    dispose();
  }
}
